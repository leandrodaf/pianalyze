package main

// musicxml.go — MusicXML → .pia v2 converter.
//
// Supported input formats
//   .xml / .musicxml   Plain MusicXML (score-partwise)
//   .mxl               ZIP-compressed MusicXML (MXL container)
//
// What is extracted and where it ends up in the Recording struct
//
//   Work title / movement title     → Meta.Title
//   Composer, lyricist, arranger    → Meta.Composer  (composer); others ignored
//   <rights>                        → Meta.Copyright
//   <tempo> / <metronome>           → TempoMap  (incl. dotted-beat metronomes)
//   <time>                          → TimeSignatureMap
//   <key>                           → KeySignature  (first one found; changes tracked)
//   <measure number=…>              → MeasureMap
//   <wedge> hairpins                → Hairpins
//   <repeat>                        → Repeats  (open / close)
//   <coda> / <segno> directions     → Repeats  (coda / segno)
//   <dal-segno> / <da-capo> words   → Repeats  (ds / dc)
//   Rehearsal marks                 → Sections  (type="rehearsal")
//   Tempo-expression words          → Sections  (type="tempo-text")
//   <dynamics> ppp/pp/p/mp/mf/f/ff/fff → RecordedEvent.Dynamic + velocity
//   <sound dynamics=…>              → velocity override for subsequent notes
//   Note pitch + <transpose>        → RecordedEvent.Note  (concert pitch)
//   Grace notes                     → RecordedEvent.Grace = true  (60 ms visual)
//   Ties (start/stop/continue)      → merged NoteOn+NoteOff pair
//   Staff number                    → RecordedEvent.Hand  ("right" / "left")
//   Voice number                    → RecordedEvent.Voice
//   Fingering                       → RecordedEvent.Finger
//   Articulations                   → RecordedEvent.Articulation
//   Ornaments (trill, mordent …)    → RecordedEvent.Articulation
//   Slurs                           → RecordedEvent.Slur
//   Fermata                         → RecordedEvent.Fermata
//   <lyric> text                    → RecordedEvent.Tip  (first lyric line only)
//   <pedal type=start/stop>         → CC 64 (sustain) NoteOn/Off events
//
// Limitations
//   • score-timewise format not supported (very rare)
//   • Repeats are stored as metadata only (not unrolled into events)

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
	"golang.org/x/text/encoding/unicode"
	"golang.org/x/text/transform"
)

// ── MusicXML XML types ────────────────────────────────────────────────────────

type mxScore struct {
	XMLName         xml.Name    `xml:"score-partwise"`
	MovementNumber  string      `xml:"movement-number"`
	MovementTitle   string      `xml:"movement-title"`
	Work            mxWork      `xml:"work"`
	Identification  mxIdentify  `xml:"identification"`
	Credits         []mxCredit  `xml:"credit"`
	PartList        mxPartList  `xml:"part-list"`
	Parts           []mxPart    `xml:"part"`
}

type mxCredit struct {
	Page  int             `xml:"page,attr"`
	Words []mxCreditWord `xml:"credit-words"`
}

type mxCreditWord struct {
	FontSize string `xml:"font-size,attr"`
	Value    string `xml:",chardata"`
}

type mxWork struct {
	Number string `xml:"work-number"`
	Title  string `xml:"work-title"`
}

type mxIdentify struct {
	Creators []mxCreator `xml:"creator"`
	Rights   []string    `xml:"rights"`
}

type mxCreator struct {
	Type  string `xml:"type,attr"`
	Value string `xml:",chardata"`
}

type mxPartList struct {
	ScoreParts []mxScorePart `xml:"score-part"`
}

type mxScorePart struct {
	ID   string `xml:"id,attr"`
	Name string `xml:"part-name"`
}

type mxPart struct {
	ID       string      `xml:"id,attr"`
	Measures []mxMeasure `xml:"measure"`
}

// mxMeasure must use a custom decoder to preserve element order — critical for
// correct time tracking (backup/forward, tempo-before-note, etc.).
type mxMeasure struct {
	Number string
	Items  []mxItem
}

func (m *mxMeasure) UnmarshalXML(d *xml.Decoder, start xml.StartElement) error {
	for _, attr := range start.Attr {
		if attr.Name.Local == "number" {
			m.Number = attr.Value
		}
	}
	for {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		switch t := tok.(type) {
		case xml.EndElement:
			return nil
		case xml.StartElement:
			item := mxItem{Kind: t.Name.Local}
			switch t.Name.Local {
			case "note":
				item.Note = new(mxNote)
				if err := d.DecodeElement(item.Note, &t); err != nil {
					return err
				}
			case "direction":
				item.Direction = new(mxDirection)
				if err := d.DecodeElement(item.Direction, &t); err != nil {
					return err
				}
			case "attributes":
				item.Attributes = new(mxAttributes)
				if err := d.DecodeElement(item.Attributes, &t); err != nil {
					return err
				}
			case "backup", "forward":
				var dur struct {
					Duration int `xml:"duration"`
				}
				if err := d.DecodeElement(&dur, &t); err != nil {
					return err
				}
				item.Duration = dur.Duration
			case "barline":
				item.Barline = new(mxBarline)
				if err := d.DecodeElement(item.Barline, &t); err != nil {
					return err
				}
			default:
				if err := d.Skip(); err != nil {
					return err
				}
			}
			m.Items = append(m.Items, item)
		}
	}
}

type mxItem struct {
	Kind       string
	Attributes *mxAttributes
	Direction  *mxDirection
	Note       *mxNote
	Duration   int // backup / forward only
	Barline    *mxBarline
}

type mxAttributes struct {
	Divisions int          `xml:"divisions"`
	Keys      []mxKey      `xml:"key"`
	Times     []mxTime     `xml:"time"`
	Staves    int          `xml:"staves"`
	Transpose *mxTranspose `xml:"transpose"`
}

type mxKey struct {
	Fifths int    `xml:"fifths"`
	Mode   string `xml:"mode"`
}

type mxTime struct {
	Beats    int `xml:"beats"`
	BeatType int `xml:"beat-type"`
}

type mxTranspose struct {
	Diatonic     int `xml:"diatonic"`
	Chromatic    int `xml:"chromatic"`
	OctaveChange int `xml:"octave-change"`
}

type mxDirection struct {
	Staff int        `xml:"staff"`
	Types []mxDirType `xml:"direction-type"`
	Sound *mxSound   `xml:"sound"`
}

type mxDirType struct {
	Dynamics    *mxDynamics  `xml:"dynamics"`
	Metronome   *mxMetronome `xml:"metronome"`
	Wedge       *mxWedge     `xml:"wedge"`
	Words       string       `xml:"words"`
	Rehearsal   string       `xml:"rehearsal"`
	Pedal       *mxPedal     `xml:"pedal"`
	Coda        *struct{}    `xml:"coda"`
	Segno       *struct{}    `xml:"segno"`
	DalSegno    *struct{}    `xml:"dal-segno"`
	DaCapo      *struct{}    `xml:"da-capo"`
}

type mxDynamics struct {
	PPP *struct{} `xml:"ppp"`
	PP  *struct{} `xml:"pp"`
	P   *struct{} `xml:"p"`
	MP  *struct{} `xml:"mp"`
	MF  *struct{} `xml:"mf"`
	F   *struct{} `xml:"f"`
	FF  *struct{} `xml:"ff"`
	FFF *struct{} `xml:"fff"`
	SFZ *struct{} `xml:"sfz"`
	FP  *struct{} `xml:"fp"`
}

type mxMetronome struct {
	BeatUnit    string    `xml:"beat-unit"`
	BeatUnitDot *struct{} `xml:"beat-unit-dot"`
	PerMinute   string    `xml:"per-minute"`
}

type mxWedge struct {
	Type   string `xml:"type,attr"`
	Number int    `xml:"number,attr"`
}

type mxPedal struct {
	Type string `xml:"type,attr"` // "start"|"stop"|"change"|"continue"
}

type mxSound struct {
	Tempo    string `xml:"tempo,attr"`
	Dynamics string `xml:"dynamics,attr"`
}

type mxNote struct {
	Grace     *struct{}    `xml:"grace"`
	Chord     *struct{}    `xml:"chord"`
	Rest      *struct{}    `xml:"rest"`
	Pitch     *mxPitch     `xml:"pitch"`
	Duration  int          `xml:"duration"`
	Ties      []mxTie      `xml:"tie"`
	Voice     string       `xml:"voice"`
	Staff     int          `xml:"staff"`
	Notations *mxNotations `xml:"notations"`
	Lyrics    []mxLyric    `xml:"lyric"`
}

type mxPitch struct {
	Step   string  `xml:"step"`
	Alter  float64 `xml:"alter"`
	Octave int     `xml:"octave"`
}

type mxTie struct {
	Type string `xml:"type,attr"` // "start" | "stop"
}

type mxLyric struct {
	Number   string `xml:"number,attr"`
	Syllabic string `xml:"syllabic"` // "begin"|"middle"|"end"|"single"
	Text     string `xml:"text"`
}

type mxNotations struct {
	Tied          []mxTiedSlur     `xml:"tied"`
	Slur          []mxTiedSlur     `xml:"slur"`
	Articulations *mxArticulations `xml:"articulations"`
	Technical     *mxTechnical     `xml:"technical"`
	Ornaments     *mxOrnaments     `xml:"ornaments"`
	Fermata       *struct{}        `xml:"fermata"`
	Dynamics      *mxDynamics      `xml:"dynamics"`
	Arpeggiate    *struct{}        `xml:"arpeggiate"`
}

type mxTiedSlur struct {
	Type   string `xml:"type,attr"`
	Number int    `xml:"number,attr"`
}

type mxArticulations struct {
	Staccato      *struct{} `xml:"staccato"`
	Tenuto        *struct{} `xml:"tenuto"`
	Accent        *struct{} `xml:"accent"`
	StrongAccent  *struct{} `xml:"strong-accent"`
	Staccatissimo *struct{} `xml:"staccatissimo"`
	Spiccato      *struct{} `xml:"spiccato"`
}

type mxTechnical struct {
	Fingering []mxFingering `xml:"fingering"`
}

type mxFingering struct {
	Value string `xml:",chardata"`
}

type mxOrnaments struct {
	Trill      *struct{}  `xml:"trill-mark"`
	Mordent    *struct{}  `xml:"mordent"`
	InvMordent *struct{}  `xml:"inverted-mordent"`
	Turn       *struct{}  `xml:"turn"`
	InvTurn    *struct{}  `xml:"inverted-turn"`
	Tremolo    *mxTremolo `xml:"tremolo"`
}

type mxTremolo struct {
	Type  string `xml:"type,attr"` // "start"|"stop"|"single"
	Marks string `xml:",chardata"` // number of slashes
}

type mxBarline struct {
	Location string    `xml:"location,attr"`
	Repeat   *mxRepeat `xml:"repeat"`
	Ending   *mxEnding `xml:"ending"`
	Coda     *struct{} `xml:"coda"`
	Segno    *struct{} `xml:"segno"`
}

type mxRepeat struct {
	Direction string `xml:"direction,attr"` // "forward" | "backward"
	Times     int    `xml:"times,attr"`
}

type mxEnding struct {
	Number string `xml:"number,attr"`
	Type   string `xml:"type,attr"` // "start"|"stop"|"discontinue"
}

// ── Music-theory helpers ──────────────────────────────────────────────────────

var mxStepSemi = map[string]int{
	"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11,
}

func mxPitchToMidi(p mxPitch) int {
	base := (p.Octave+1)*12 + mxStepSemi[p.Step]
	return base + int(math.Round(p.Alter))
}

// mxFifthsToKey converts a (fifths, mode) pair to a key name like "D", "Am", "Bb".
func mxFifthsToKey(fifths int, mode string) string {
	major := map[int]string{
		0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
		-1: "F", -2: "Bb", -3: "Eb", -4: "Ab", -5: "Db", -6: "Gb", -7: "Cb",
	}
	minor := map[int]string{
		0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m", 7: "A#m",
		-1: "Dm", -2: "Gm", -3: "Cm", -4: "Fm", -5: "Bbm", -6: "Ebm", -7: "Abm",
	}
	if strings.EqualFold(mode, "minor") {
		if k, ok := minor[fifths]; ok {
			return k
		}
	}
	if k, ok := major[fifths]; ok {
		return k
	}
	return "C"
}

// mxDynLabel returns the standard dynamic label from an mxDynamics element.
func mxDynLabel(d *mxDynamics) string {
	if d == nil {
		return ""
	}
	switch {
	case d.PPP != nil:
		return "ppp"
	case d.PP != nil:
		return "pp"
	case d.P != nil:
		return "p"
	case d.MP != nil:
		return "mp"
	case d.MF != nil:
		return "mf"
	case d.FFF != nil:
		return "fff"
	case d.FF != nil:
		return "ff"
	case d.F != nil:
		return "f"
	case d.SFZ != nil:
		return "fff"
	case d.FP != nil:
		return "f"
	}
	return ""
}

// mxDynVelocity maps a dynamic label to a MIDI velocity.
func mxDynVelocity(dyn string) byte {
	switch dyn {
	case "ppp":
		return 10
	case "pp":
		return 25
	case "p":
		return 45
	case "mp":
		return 62
	case "mf":
		return 80
	case "f":
		return 95
	case "ff":
		return 110
	case "fff":
		return 120
	}
	return 64 // default mf
}

// mxSoundDynToLabel converts a <sound dynamics="N"> raw value (1–127) to a label.
func mxSoundDynToLabel(raw string) (string, byte) {
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || v <= 0 {
		return "", 0
	}
	vel := byte(math.Min(127, math.Max(1, v)))
	switch {
	case vel <= 10:
		return "ppp", vel
	case vel <= 21:
		return "pp", vel
	case vel <= 42:
		return "p", vel
	case vel <= 63:
		return "mp", vel
	case vel <= 84:
		return "mf", vel
	case vel <= 105:
		return "f", vel
	case vel <= 115:
		return "ff", vel
	default:
		return "fff", vel
	}
}

// mxMetronomeBPM calculates the actual quarter-note BPM from a metronome
// element, honouring dotted beat-unit values (e.g. dotted-quarter = 90 BPM
// means 90 * 1.5 = 135 quarter-note BPMs).
func mxMetronomeBPM(m *mxMetronome) (float64, string) {
	pm, err := strconv.ParseFloat(strings.TrimSpace(m.PerMinute), 64)
	if err != nil || pm <= 0 {
		return 0, ""
	}
	// Convert beat-unit denominator to quarter-note multiplier.
	mult := 1.0
	switch strings.ToLower(m.BeatUnit) {
	case "whole":
		mult = 4.0
	case "half":
		mult = 2.0
	case "quarter":
		mult = 1.0
	case "eighth":
		mult = 0.5
	case "16th":
		mult = 0.25
	case "dotted-quarter":
		mult = 1.5
	}
	if m.BeatUnitDot != nil {
		mult *= 1.5
	}
	return pm * mult, m.BeatUnit
}

// ── MXL (compressed MusicXML) extraction ─────────────────────────────────────

// extractMXL unpacks an MXL archive and returns the raw MusicXML bytes.
// Follows META-INF/container.xml when present; falls back to the first
// non-META-INF .xml entry in the archive.
func extractMXL(data []byte) ([]byte, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("open MXL: %w", err)
	}

	rootFile := ""
	for _, f := range r.File {
		if f.Name != "META-INF/container.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			break
		}
		var c struct {
			Rootfiles []struct {
				FullPath string `xml:"full-path,attr"`
			} `xml:"rootfiles>rootfile"`
		}
		if err := xml.NewDecoder(rc).Decode(&c); err == nil && len(c.Rootfiles) > 0 {
			rootFile = c.Rootfiles[0].FullPath
		}
		rc.Close() //nolint:errcheck,gosec // best-effort close; read already completed
	}

	for _, f := range r.File {
		name := f.Name
		isXML := strings.HasSuffix(strings.ToLower(name), ".xml") ||
			strings.HasSuffix(strings.ToLower(name), ".musicxml")
		if rootFile != "" {
			if name != rootFile {
				continue
			}
		} else {
			if !isXML || strings.HasPrefix(name, "META-INF") {
				continue
			}
		}
		rc, err := f.Open()
		if err != nil {
			return nil, fmt.Errorf("read MXL entry %q: %w", name, err)
		}
		defer rc.Close() //nolint:errcheck
		raw, err := io.ReadAll(rc)
		if err != nil {
			return nil, fmt.Errorf("read MXL entry %q: %w", name, err)
		}
		return transcodeToUTF8(raw)
	}
	return nil, fmt.Errorf("no MusicXML content found in MXL archive")
}

// transcodeToUTF8 converts UTF-16 LE/BE (with or without BOM) XML to UTF-8.
// UTF-8 data (with or without BOM) is returned as-is after stripping the BOM.
// The XML declaration encoding attribute is rewritten to "UTF-8" when present.
func transcodeToUTF8(data []byte) ([]byte, error) {
	var out []byte
	if len(data) < 2 {
		return data, nil
	}
	switch {
	case data[0] == 0xff && data[1] == 0xfe: // UTF-16 LE BOM
		var err error
		out, _, err = transform.Bytes(unicode.UTF16(unicode.LittleEndian, unicode.UseBOM).NewDecoder(), data)
		if err != nil {
			return nil, err
		}
	case data[0] == 0xfe && data[1] == 0xff: // UTF-16 BE BOM
		var err error
		out, _, err = transform.Bytes(unicode.UTF16(unicode.BigEndian, unicode.UseBOM).NewDecoder(), data)
		if err != nil {
			return nil, err
		}
	case len(data) >= 3 && data[0] == 0xef && data[1] == 0xbb && data[2] == 0xbf: // UTF-8 BOM
		return data[3:], nil
	default:
		return data, nil
	}
	// Rewrite encoding declaration so Go's XML parser accepts the now-UTF-8 bytes.
	out = rewriteXMLEncoding(out)
	return out, nil
}

// rewriteXMLEncoding replaces the encoding attribute in the XML prolog with "UTF-8".
func rewriteXMLEncoding(data []byte) []byte {
	// Only scan the first 200 bytes where the prolog lives.
	limit := 200
	if len(data) < limit {
		limit = len(data)
	}
	head := string(data[:limit])
	// Replace encoding='UTF-16' or encoding="UTF-16" (case-insensitive variants).
	for _, old := range []string{`encoding='UTF-16'`, `encoding="UTF-16"`, `encoding='utf-16'`, `encoding="utf-16"`} {
		if idx := strings.Index(head, old); idx >= 0 {
			return append([]byte(head[:idx]+`encoding="UTF-8"`+head[idx+len(old):]), data[limit:]...)
		}
	}
	return data
}

// ── Part converter ────────────────────────────────────────────────────────────

type mxWedgeState struct {
	from    string
	startMs int64
}

// convertPart converts a single <part> into events and structural metadata.
func convertPart(part mxPart, logger *zap.Logger) (
	events []RecordedEvent,
	tempoMap []TempoEvent,
	timeSigMap []TimeSigEvent,
	measureMap []MeasureEntry,
	hairpins []Hairpin,
	repeats []Repeat,
	sections []Section,
	keySignature string,
	firstTimeSig string,
) {
	divisions := 1
	bpm := 120.0
	currentDyn := "mf"
	currentVel := byte(64)
	transposeChromatic := 0 // chromatic transposition for this part
	var posMs int64

	// tied-note tracking: key = staff*1_000_000 + voice*1_000 + midiNote → noteOnMs
	tieOnMs := map[int]int64{}

	// active hairpin wedges by wedge-number
	wedges := map[int]*mxWedgeState{}

	ticksToMs := func(ticks int) int64 {
		if divisions <= 0 || bpm <= 0 {
			return 0
		}
		return int64(math.Round(float64(ticks) * 60_000.0 / (bpm * float64(divisions))))
	}

	tieKey := func(staff, voice, note int) int {
		return staff*1_000_000 + voice*1_000 + note
	}

	for _, measure := range part.Measures {
		measureNum := 1
		if n, err := strconv.Atoi(measure.Number); err == nil {
			measureNum = n
		}
		measureStartMs := posMs
		measureMap = append(measureMap, MeasureEntry{Measure: measureNum, AtMs: measureStartMs})

		var maxTick int64
		var tick int64
		var lastNoteTick int64

		var hasForwardRepeat, hasBackwardRepeat bool

		for _, item := range measure.Items {
			switch item.Kind {

			// ── attributes ──────────────────────────────────────────────────
			case "attributes":
				attr := item.Attributes
				if attr.Divisions > 0 {
					divisions = attr.Divisions
				}
				if attr.Transpose != nil {
					transposeChromatic = attr.Transpose.Chromatic + attr.Transpose.OctaveChange*12
				}
				for _, k := range attr.Keys {
					ks := mxFifthsToKey(k.Fifths, k.Mode)
					if keySignature == "" {
						keySignature = ks
					}
				}
				for _, ts := range attr.Times {
					sig := fmt.Sprintf("%d/%d", ts.Beats, ts.BeatType)
					if firstTimeSig == "" {
						firstTimeSig = sig
					}
					tMs := measureStartMs + ticksToMs(int(tick))
					if len(timeSigMap) == 0 || timeSigMap[len(timeSigMap)-1].Value != sig {
						timeSigMap = append(timeSigMap, TimeSigEvent{AtMs: tMs, Value: sig})
					}
				}

			// ── direction ───────────────────────────────────────────────────
			case "direction":
				dir := item.Direction
				dirMs := measureStartMs + ticksToMs(int(tick))

				if dir.Sound != nil {
					if dir.Sound.Tempo != "" {
						if newBPM, err := strconv.ParseFloat(dir.Sound.Tempo, 64); err == nil && newBPM > 0 {
							bpm = newBPM
							if len(tempoMap) == 0 || tempoMap[len(tempoMap)-1].BPM != newBPM {
								tempoMap = append(tempoMap, TempoEvent{AtMs: dirMs, BPM: newBPM})
							}
						}
					}
					if dir.Sound.Dynamics != "" {
						lbl, vel := mxSoundDynToLabel(dir.Sound.Dynamics)
						if lbl != "" {
							currentDyn = lbl
							currentVel = vel
						}
					}
				}

				for _, dt := range dir.Types {
					// Dynamic label
					if lbl := mxDynLabel(dt.Dynamics); lbl != "" {
						currentDyn = lbl
						currentVel = mxDynVelocity(lbl)
					}

					// Metronome
					if dt.Metronome != nil && dt.Metronome.PerMinute != "" {
						if newBPM, beatUnit := mxMetronomeBPM(dt.Metronome); newBPM > 0 {
							bpm = newBPM
							if len(tempoMap) == 0 || tempoMap[len(tempoMap)-1].BPM != newBPM {
								tempoMap = append(tempoMap, TempoEvent{AtMs: dirMs, BPM: newBPM, BeatUnit: beatUnit})
							}
						}
					}

					// Hairpin wedges
					if dt.Wedge != nil {
						wn := dt.Wedge.Number
						if wn == 0 {
							wn = 1
						}
						switch dt.Wedge.Type {
						case "crescendo", "decrescendo", "diminuendo":
							wedges[wn] = &mxWedgeState{from: currentDyn, startMs: dirMs}
						case "stop":
							if w, ok := wedges[wn]; ok {
								toD := currentDyn
								if toD == "" {
									toD = w.from
								}
								hairpins = append(hairpins, Hairpin{
									StartMs: w.startMs, EndMs: dirMs,
									From: w.from, To: toD,
								})
								delete(wedges, wn)
							}
						}
					}

					// Sustain pedal → CC 64
					if dt.Pedal != nil {
						var vel byte
						switch dt.Pedal.Type {
						case "start", "sostenuto":
							vel = 127
						case "stop":
							vel = 0
						case "change":
							// change = stop then start; emit both
							events = append(events,
								RecordedEvent{T: dirMs, Cmd: 0xB0, Note: 64, Vel: 0},
								RecordedEvent{T: dirMs, Cmd: 0xB0, Note: 64, Vel: 127},
							)
							continue
						}
						if dt.Pedal.Type == "start" || dt.Pedal.Type == "stop" || dt.Pedal.Type == "sostenuto" {
							events = append(events, RecordedEvent{T: dirMs, Cmd: 0xB0, Note: 64, Vel: vel})
						}
					}

					// Coda / Segno direction markers
					if dt.Coda != nil {
						repeats = append(repeats, Repeat{Type: "coda", AtMs: dirMs})
					}
					if dt.Segno != nil {
						repeats = append(repeats, Repeat{Type: "segno", AtMs: dirMs})
					}
					if dt.DalSegno != nil {
						repeats = append(repeats, Repeat{Type: "ds", AtMs: dirMs})
					}
					if dt.DaCapo != nil {
						repeats = append(repeats, Repeat{Type: "dc", AtMs: dirMs})
					}

					// Rehearsal marks
					if r := strings.TrimSpace(dt.Rehearsal); r != "" {
						sections = append(sections, Section{
							Name: r, StartMs: dirMs,
							Type: "rehearsal", RehearsalMark: r,
						})
					}

					// Words / tempo-text expressions
					if w := strings.TrimSpace(dt.Words); w != "" {
						sType := classifyWords(w)
						if sType != "" {
							sections = append(sections, Section{Name: w, StartMs: dirMs, Type: sType})
						}
					}
				}

			// ── backup / forward ─────────────────────────────────────────────
			case "backup":
				tick -= int64(item.Duration)
				if tick < 0 {
					tick = 0
				}
				lastNoteTick = tick

			case "forward":
				tick += int64(item.Duration)
				if tick > maxTick {
					maxTick = tick
				}

			// ── barline ─────────────────────────────────────────────────────
			case "barline":
				bl := item.Barline
				if bl == nil {
					break
				}
				if bl.Repeat != nil {
					switch bl.Repeat.Direction {
					case "forward":
						hasForwardRepeat = true
					case "backward":
						hasBackwardRepeat = true
					}
				}
				if bl.Coda != nil {
					// defer until after posMs is computed
					_ = bl.Coda
				}
				if bl.Segno != nil {
					_ = bl.Segno
				}

			// ── note ────────────────────────────────────────────────────────
			case "note":
				note := item.Note
				isChord := note.Chord != nil
				isGrace := note.Grace != nil

				var noteTick int64
				if isChord {
					noteTick = lastNoteTick
				} else {
					noteTick = tick
				}
				noteMs := measureStartMs + ticksToMs(int(noteTick))

				durMs := ticksToMs(note.Duration)
				if isGrace {
					durMs = 60
				}

				if !isChord && !isGrace {
					lastNoteTick = tick
					tick += int64(note.Duration)
					if tick > maxTick {
						maxTick = tick
					}
				}

				// Skip rests and un-pitched notes
				if note.Rest != nil || note.Pitch == nil {
					continue
				}

				midiNote := mxPitchToMidi(*note.Pitch) + transposeChromatic
				if midiNote < 0 || midiNote > 127 {
					logger.Warn("note out of MIDI range after transposition — skipped",
						zap.Int("midiNote", midiNote),
						zap.Int("transposeChromatic", transposeChromatic))
					continue
				}

				voice := 1
				if note.Voice != "" {
					if v, err := strconv.Atoi(note.Voice); err == nil && v > 0 {
						voice = v
					}
				}
				staff := note.Staff
				if staff == 0 {
					staff = 1
				}
				tk := tieKey(staff, voice, midiNote)

				// Tie logic
				hasTieStop, hasTieStart := false, false
				for _, tie := range note.Ties {
					switch tie.Type {
					case "stop":
						hasTieStop = true
					case "start":
						hasTieStart = true
					}
				}

				if hasTieStop {
					if onMs, exists := tieOnMs[tk]; exists {
						if hasTieStart {
							// Middle of tie chain — extend, no NoteOff yet
							_ = onMs
							continue
						}
						// End of tie chain — emit NoteOff and done
						events = append(events, RecordedEvent{
							T: noteMs + durMs, Cmd: 0x80, Note: byte(midiNote), Vel: 0,
						})
						delete(tieOnMs, tk)
						continue
					}
					// Orphan tie-stop → treat as normal note
				}

				// Determine velocity/dynamic for this note
				vel := currentVel
				dyn := currentDyn
				if note.Notations != nil {
					if lbl := mxDynLabel(note.Notations.Dynamics); lbl != "" {
						dyn = lbl
						vel = mxDynVelocity(lbl)
					}
				}

				// Notation properties
				articulation := ""
				slurVal := ""
				var finger *byte
				fermata := false
				tipText := ""

				if n := note.Notations; n != nil {
					// Articulations
					if n.Articulations != nil {
						art := n.Articulations
						switch {
						case art.Staccato != nil, art.Staccatissimo != nil, art.Spiccato != nil:
							articulation = "staccato"
						case art.Tenuto != nil:
							articulation = "tenuto"
						case art.StrongAccent != nil, art.Accent != nil:
							articulation = "accent"
						}
					}
					// Ornaments override articulation only when no articulation set
					if articulation == "" && n.Ornaments != nil {
						orn := n.Ornaments
						switch {
						case orn.Trill != nil:
							articulation = "trill"
						case orn.Mordent != nil:
							articulation = "mordent"
						case orn.InvMordent != nil:
							articulation = "inverted-mordent"
						case orn.Turn != nil, orn.InvTurn != nil:
							articulation = "turn"
						case orn.Tremolo != nil:
							articulation = "tremolo"
						}
					}
					// Slur
					for _, sl := range n.Slur {
						switch sl.Type {
						case "start":
							slurVal = "start"
						case "stop":
							slurVal = "end"
						case "continue":
							slurVal = "continue"
						}
					}
					// Fingering
					if n.Technical != nil && len(n.Technical.Fingering) > 0 {
						raw := strings.TrimSpace(n.Technical.Fingering[0].Value)
						if fv, err := strconv.Atoi(raw); err == nil && fv >= 1 && fv <= 5 {
							fb := byte(fv)
							finger = &fb
						}
					}
					// Fermata
					if n.Fermata != nil {
						fermata = true
					}
				}

				// Lyrics → Tip (first line, first verse only)
				for _, lyric := range note.Lyrics {
					if t := strings.TrimSpace(lyric.Text); t != "" {
						tipText = t
						break
					}
				}

				hand := "right"
				if staff == 2 {
					hand = "left"
				}

				vb := byte(voice)
				ev := RecordedEvent{
					T:            noteMs,
					Cmd:          0x90,
					Note:         byte(midiNote),
					Vel:          vel,
					Hand:         hand,
					Dynamic:      dyn,
					Articulation: articulation,
					Grace:        isGrace,
					Slur:         slurVal,
					Fermata:      fermata,
					Finger:       finger,
					Voice:        &vb,
					Tip:          tipText,
				}
				events = append(events, ev)

				if hasTieStart {
					tieOnMs[tk] = noteMs
				} else {
					events = append(events, RecordedEvent{
						T: noteMs + durMs, Cmd: 0x80, Note: byte(midiNote), Vel: 0,
					})
				}
			}
		}

		// Advance posMs by this measure's duration
		if maxTick > 0 {
			posMs = measureStartMs + ticksToMs(int(maxTick))
		}

		// Emit deferred repeat barline markers
		if hasForwardRepeat {
			repeats = append(repeats, Repeat{Type: "repeat-open", AtMs: measureStartMs})
		}
		if hasBackwardRepeat {
			repeats = append(repeats, Repeat{Type: "repeat-close", AtMs: posMs})
		}
	}

	// Close any dangling tied notes (malformed XML edge case)
	for tk, onMs := range tieOnMs {
		// tk was built by tieKey as staff*1_000_000 + voice*1_000 + note, so
		// tk % 1_000 recovers the original MIDI note (0-127) exactly.
		midiNote := byte(tk % 1_000) //nolint:gosec
		events = append(events, RecordedEvent{
			T: onMs + 500, Cmd: 0x80, Note: midiNote, Vel: 0,
		})
	}

	return
}

// classifyWords maps a tempo/expression text to a Section type, returning ""
// for generic dynamic/expression words that shouldn't become section entries.
func classifyWords(w string) string {
	lower := strings.ToLower(w)
	switch {
	case strings.Contains(lower, "rit") || strings.Contains(lower, "rall") || strings.Contains(lower, "allarg"):
		return "tempo-text"
	case strings.Contains(lower, "accel"):
		return "tempo-text"
	case strings.Contains(lower, "a tempo") || strings.Contains(lower, "tempo primo") || strings.Contains(lower, "tempo i"):
		return "tempo-text"
	case strings.Contains(lower, "fine"):
		return "tempo-text"
	case strings.Contains(lower, "coda"):
		return "coda-text"
	case strings.Contains(lower, "segno"):
		return "segno-text"
	case strings.Contains(lower, "d.s.") || strings.Contains(lower, "dal segno"):
		return "ds-text"
	case strings.Contains(lower, "d.c.") || strings.Contains(lower, "da capo"):
		return "dc-text"
	}
	return "" // not worth recording as a section
}

// ── Top-level converter ───────────────────────────────────────────────────────

// extractMetaFromCredits falls back to <credit-words> elements when the score
// lacks <work-title> or <identification><creator type="composer">. It picks the
// credit-word with the largest font-size on page 1 as the title, and uses a
// heuristic (presence of a year range like "(1810 - 1849)") to identify the
// composer credit block.
func extractMetaFromCredits(credits []mxCredit) (title, composer string) {
	type entry struct {
		size  float64
		value string
	}
	var page1 []entry
	for _, cr := range credits {
		if cr.Page != 0 && cr.Page != 1 {
			continue
		}
		var combined strings.Builder
		var maxSize float64
		for _, w := range cr.Words {
			v := strings.TrimSpace(w.Value)
			if v == "" {
				continue
			}
			combined.WriteString(v)
			combined.WriteRune(' ')
			var s float64
			_, _ = fmt.Sscanf(w.FontSize, "%f", &s)
			if s > maxSize {
				maxSize = s
			}
		}
		text := strings.TrimSpace(combined.String())
		if text != "" {
			page1 = append(page1, entry{maxSize, text})
		}
	}
	if len(page1) == 0 {
		return
	}
	// Largest font → title
	var biggest entry
	for _, e := range page1 {
		if e.size > biggest.size {
			biggest = e
		}
	}
	title = biggest.value

	// Find composer: a credit line that contains a 4-digit year
	yearRe := strings.NewReplacer("(", "", ")", "", "-", "", " ", "")
	for _, e := range page1 {
		if e.value == title {
			continue
		}
		cleaned := yearRe.Replace(e.value)
		hasYear := false
		for i := 0; i+3 < len(cleaned); i++ {
			yr := cleaned[i : i+4]
			if yr >= "1400" && yr <= "2100" {
				hasYear = true
				break
			}
		}
		if hasYear {
			// Remove the year annotation "(YYYY - YYYY)" from the composer name
			if idx := strings.Index(e.value, "("); idx > 0 {
				composer = strings.TrimSpace(e.value[:idx])
			} else {
				composer = strings.TrimSpace(e.value)
			}
			break
		}
	}
	return
}


// Recording v2, ready for JSON marshalling.
func convertMusicXML(xmlData []byte, filename string, logger *zap.Logger) (*Recording, error) {
	var score mxScore
	if err := xml.Unmarshal(xmlData, &score); err != nil {
		return nil, fmt.Errorf("parse MusicXML: %w", err)
	}
	if len(score.Parts) == 0 {
		return nil, fmt.Errorf("MusicXML file contains no parts")
	}

	// ── Metadata ──────────────────────────────────────────────────────────────
	title := strings.TrimSpace(score.Work.Title)
	if title == "" {
		title = strings.TrimSpace(score.MovementTitle)
	}

	// Extract composer from identification creators
	composer, lyricist, arranger := "", "", ""
	for _, c := range score.Identification.Creators {
		val := strings.TrimSpace(c.Value)
		if val == "" {
			continue
		}
		switch strings.ToLower(c.Type) {
		case "composer":
			if composer == "" {
				composer = val
			}
		case "lyricist", "poet", "text":
			if lyricist == "" {
				lyricist = val
			}
		case "arranger":
			if arranger == "" {
				arranger = val
			}
		}
	}

	// Fallback: extract title and composer from <credit-words> when not found above.
	// The largest font-size credit on page 1 is typically the title.
	// A subsequent credit whose text matches a "Name (YYYY - YYYY)" pattern is the composer.
	if title == "" || composer == "" {
		titleFromCredit, composerFromCredit := extractMetaFromCredits(score.Credits)
		if title == "" {
			title = titleFromCredit
		}
		if composer == "" {
			composer = composerFromCredit
		}
	}

	if title == "" && len(score.PartList.ScoreParts) > 0 {
		title = strings.TrimSpace(score.PartList.ScoreParts[0].Name)
	}
	if title == "" {
		base := filepath.Base(filename)
		title = strings.TrimSuffix(base, filepath.Ext(base))
	}

	// Add non-composer credits to composer field for display purposes
	extras := []string{}
	if lyricist != "" {
		extras = append(extras, "Lyrics: "+lyricist)
	}
	if arranger != "" {
		extras = append(extras, "Arr.: "+arranger)
	}
	if len(extras) > 0 && composer == "" {
		composer = strings.Join(extras, "; ")
	}

	copyright := ""
	for _, r := range score.Identification.Rights {
		if v := strings.TrimSpace(r); v != "" {
			copyright = v
			break
		}
	}

	// ── Process all parts ─────────────────────────────────────────────────────
	var allEvents []RecordedEvent
	var tempoMap []TempoEvent
	var timeSigMap []TimeSigEvent
	var measureMap []MeasureEntry
	var hairpins []Hairpin
	var repeats []Repeat
	var sections []Section
	keySignature := ""
	firstTimeSig := ""

	for partIdx, part := range score.Parts {
		pevs, pTempo, pTimeSig, pMeasure, pHairpins, pRepeats, pSections, pKey, pFirstTS :=
			convertPart(part, logger)
		allEvents = append(allEvents, pevs...)
		if partIdx == 0 {
			tempoMap    = pTempo
			timeSigMap  = pTimeSig
			measureMap  = pMeasure
			hairpins    = pHairpins
			repeats     = pRepeats
			sections    = pSections
			keySignature = pKey
			firstTimeSig = pFirstTS
		} else {
			// For additional parts, fill gaps in structural data from part 0
			if keySignature == "" && pKey != "" {
				keySignature = pKey
			}
			if firstTimeSig == "" && pFirstTS != "" {
				firstTimeSig = pFirstTS
			}
			if len(tempoMap) == 0 {
				tempoMap = pTempo
			}
		}
	}

	// ── Ensure default structural entries at t=0 ───────────────────────────
	if len(tempoMap) == 0 || tempoMap[0].AtMs != 0 {
		def := TempoEvent{AtMs: 0, BPM: 120, BeatUnit: "quarter"}
		if len(tempoMap) > 0 {
			def.BPM = tempoMap[0].BPM
			def.BeatUnit = tempoMap[0].BeatUnit
		}
		tempoMap = append([]TempoEvent{def}, tempoMap...)
	}
	if len(timeSigMap) == 0 || timeSigMap[0].AtMs != 0 {
		sig := "4/4"
		if firstTimeSig != "" {
			sig = firstTimeSig
		}
		timeSigMap = append([]TimeSigEvent{{AtMs: 0, Value: sig}}, timeSigMap...)
	}
	if keySignature == "" {
		keySignature = "C"
	}

	// ── Sort events: time ascending; NoteOn before NoteOff at same ms ─────
	sort.SliceStable(allEvents, func(i, j int) bool {
		ti, tj := allEvents[i].T, allEvents[j].T
		if ti != tj {
			return ti < tj
		}
		return allEvents[i].Cmd > allEvents[j].Cmd
	})

	now := time.Now().UTC().Format(time.RFC3339)
	return &Recording{
		Version:    2,
		RecordedAt: now,
		Meta: &RecordingMeta{
			Title:     title,
			Composer:  composer,
			Copyright: copyright,
			Source: &RecordingSource{
				Format:     "musicxml",
				Filename:   filepath.Base(filename),
				ImportedAt: now,
			},
		},
		TempoMap:         tempoMap,
		TimeSignatureMap: timeSigMap,
		KeySignature:     keySignature,
		MeasureMap:       measureMap,
		Hairpins:         hairpins,
		Repeats:          repeats,
		Sections:         sections,
		Events:           allEvents,
	}, nil
}
