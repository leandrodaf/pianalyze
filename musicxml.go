package main

// MusicXML → .pia converter.
//
// Supports score-partwise MusicXML documents (.xml / .musicxml) and their ZIP-
// compressed variant (.mxl).  All parts are merged into a single event timeline.
// The converter faithfully maps:
//   - Note pitches     → MIDI note numbers (0–127)
//   - Dynamics         → velocity + Dynamic field
//   - Tempo / metronome directions → TempoMap
//   - Time-signature changes → TimeSignatureMap
//   - Key signatures   → KeySignature (first one found)
//   - Measure offsets  → MeasureMap
//   - Fingering        → Finger field
//   - Hand (staff)     → Hand field ("right" = staff 1, "left" = staff 2)
//   - Articulations    → Articulation field (staccato / tenuto / accent)
//   - Slurs            → Slur field ("start" / "end")
//   - Fermata          → Fermata flag
//   - Grace notes      → Grace flag (emit as 60-ms visual note)
//   - Ties             → merged into a single NoteOn+NoteOff pair
//   - Repeat barlines  → Repeats metadata (informational; not unrolled)
//   - Rehearsal marks  → Sections
//   - Hairpins         → Hairpins
//
// Limitations:
//   - score-timewise format not supported (rare in practice)
//   - Multi-voice polyphony in the same staff is preserved via Voice field
//   - Pickup (anacrusis) measures are treated normally (no special timing offset)

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
)

// ── MusicXML XML structs ──────────────────────────────────────────────────────

type mxScore struct {
	XMLName        xml.Name    `xml:"score-partwise"`
	Work           mxWork      `xml:"work"`
	Identification mxIdentify  `xml:"identification"`
	PartList       mxPartList  `xml:"part-list"`
	Parts          []mxPart    `xml:"part"`
}

type mxWork struct {
	Number string `xml:"work-number"`
	Title  string `xml:"work-title"`
}

type mxIdentify struct {
	Creators []mxCreator `xml:"creator"`
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

// mxMeasure uses a custom UnmarshalXML so items retain their document order —
// essential for correct time tracking across backup/forward and tempo changes.
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

// mxItem is one child element of a <measure>, in document order.
type mxItem struct {
	Kind       string // "note"|"direction"|"attributes"|"backup"|"forward"|"barline"
	Attributes *mxAttributes
	Direction  *mxDirection
	Note       *mxNote
	Duration   int // for backup/forward only
	Barline    *mxBarline
}

type mxAttributes struct {
	Divisions int      `xml:"divisions"`
	Keys      []mxKey  `xml:"key"`
	Times     []mxTime `xml:"time"`
	Staves    int      `xml:"staves"`
}

type mxKey struct {
	Fifths int    `xml:"fifths"`
	Mode   string `xml:"mode"`
}

type mxTime struct {
	Beats    int `xml:"beats"`
	BeatType int `xml:"beat-type"`
}

type mxDirection struct {
	Types []mxDirType `xml:"direction-type"`
	Sound *mxSound    `xml:"sound"`
}

type mxDirType struct {
	Dynamics  *mxDynamics  `xml:"dynamics"`
	Metronome *mxMetronome `xml:"metronome"`
	Wedge     *mxWedge     `xml:"wedge"`
	Words     string       `xml:"words"`
	Rehearsal string       `xml:"rehearsal"`
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
}

type mxMetronome struct {
	BeatUnit  string `xml:"beat-unit"`
	PerMinute string `xml:"per-minute"`
}

type mxWedge struct {
	Type   string `xml:"type,attr"`
	Number int    `xml:"number,attr"`
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
	Dynamics  *mxDynamics  `xml:"dynamics"`
}

type mxPitch struct {
	Step   string  `xml:"step"`
	Alter  float64 `xml:"alter"`
	Octave int     `xml:"octave"`
}

type mxTie struct {
	Type string `xml:"type,attr"` // "start" | "stop"
}

type mxNotations struct {
	Tied          []mxTiedSlur     `xml:"tied"`
	Slur          []mxTiedSlur     `xml:"slur"`
	Articulations *mxArticulations `xml:"articulations"`
	Technical     *mxTechnical     `xml:"technical"`
	Fermata       *struct{}        `xml:"fermata"`
	Dynamics      *mxDynamics      `xml:"dynamics"`
}

type mxTiedSlur struct {
	Type   string `xml:"type,attr"`
	Number int    `xml:"number,attr"`
}

type mxArticulations struct {
	Staccato *struct{} `xml:"staccato"`
	Tenuto   *struct{} `xml:"tenuto"`
	Accent   *struct{} `xml:"accent"`
}

type mxTechnical struct {
	Fingering []mxFingering `xml:"fingering"`
}

type mxFingering struct {
	Value string `xml:",chardata"`
}

type mxBarline struct {
	Location string    `xml:"location,attr"`
	Repeat   *mxRepeat `xml:"repeat"`
	Ending   *mxEnding `xml:"ending"`
}

type mxRepeat struct {
	Direction string `xml:"direction,attr"` // "forward" | "backward"
}

type mxEnding struct {
	Number string `xml:"number,attr"`
	Type   string `xml:"type,attr"`
}

// ── Music-theory helpers ──────────────────────────────────────────────────────

var mxStepSemi = map[string]int{
	"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11,
}

// mxPitchToMidi converts a MusicXML pitch to a MIDI note number.
func mxPitchToMidi(p mxPitch) int {
	base := (p.Octave+1)*12 + mxStepSemi[p.Step]
	return base + int(math.Round(p.Alter))
}

// mxFifthsToKey converts MusicXML (fifths, mode) to a key-name string.
func mxFifthsToKey(fifths int, mode string) string {
	major := map[int]string{
		0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#",
		-1: "F", -2: "Bb", -3: "Eb", -4: "Ab", -5: "Db", -6: "Gb",
	}
	minor := map[int]string{
		0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m",
		-1: "Dm", -2: "Gm", -3: "Cm", -4: "Fm", -5: "Bbm", -6: "Ebm",
	}
	if mode == "minor" {
		if k, ok := minor[fifths]; ok {
			return k
		}
	}
	if k, ok := major[fifths]; ok {
		return k
	}
	return "C"
}

// mxDynLabel returns the dynamic label from an mxDynamics element.
func mxDynLabel(d *mxDynamics) string {
	if d == nil {
		return ""
	}
	switch {
	case d.PPP != nil:
		return "pp"
	case d.PP != nil:
		return "pp"
	case d.P != nil:
		return "p"
	case d.MP != nil:
		return "mp"
	case d.MF != nil:
		return "mf"
	case d.F != nil:
		return "f"
	case d.FF != nil:
		return "ff"
	case d.FFF != nil:
		return "ff"
	}
	return ""
}

// mxDynVelocity maps a dynamic label to an approximate MIDI velocity.
func mxDynVelocity(dyn string) byte {
	switch dyn {
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
	}
	return 64 // default = mf
}

// ── MXL (compressed MusicXML) extraction ─────────────────────────────────────

// extractMXL unpacks a .mxl ZIP archive and returns the raw MusicXML bytes.
// It honours META-INF/container.xml when present; otherwise falls back to the
// first non-META-INF .xml file in the archive.
func extractMXL(data []byte) ([]byte, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("open MXL: %w", err)
	}

	// Try to find the root file via META-INF/container.xml.
	rootfile := ""
	for _, f := range r.File {
		if f.Name == "META-INF/container.xml" {
			rc, err := f.Open()
			if err != nil {
				break
			}
			var container struct {
				Rootfiles []struct {
					FullPath string `xml:"full-path,attr"`
				} `xml:"rootfiles>rootfile"`
			}
			if err := xml.NewDecoder(rc).Decode(&container); err == nil && len(container.Rootfiles) > 0 {
				rootfile = container.Rootfiles[0].FullPath
			}
			rc.Close()
			break
		}
	}

	// Open by explicit rootfile path or fall back to first .xml file.
	for _, f := range r.File {
		name := f.Name
		if rootfile != "" && name != rootfile {
			continue
		}
		if rootfile == "" && (!strings.HasSuffix(strings.ToLower(name), ".xml") || strings.HasPrefix(name, "META-INF")) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, fmt.Errorf("read MXL entry %q: %w", name, err)
		}
		defer rc.Close()
		return io.ReadAll(rc)
	}
	return nil, fmt.Errorf("no MusicXML content found in MXL archive")
}

// ── Part converter ────────────────────────────────────────────────────────────

type mxWedgeState struct {
	from    string
	startMs int64
}

// convertPart processes a single <part> and returns the events and structural
// metadata extracted from it.
func convertPart(part mxPart) (
	events []RecordedEvent,
	tempoMap []TempoEvent,
	timeSigMap []TimeSigEvent,
	measureMap []MeasureEntry,
	hairpins []Hairpin,
	repeats []Repeat,
	keySignature string,
	sections []Section,
) {
	divisions := 1    // ticks per quarter note (default: 1)
	bpm := 120.0      // current tempo (default: 120 BPM)
	currentDyn := ""  // current dynamic level from direction elements
	var posMs int64   // absolute ms position (start of current measure)

	// Tied notes: key = staff*1_000_000 + voice*1_000 + midiNote → noteOnMs
	tieOnMs := map[int]int64{}

	// Active hairpin wedges indexed by wedge number
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

		var maxTick int64 // maximum tick reached (= measure duration in ticks)
		var tick int64    // current tick within measure
		var lastNoteTick int64 // tick where the last non-chord note started (for chords)

		// Deferred repeat markers resolved after measure duration is known
		var hasForwardRepeat, hasBackwardRepeat bool

		for _, item := range measure.Items {
			switch item.Kind {

			case "attributes":
				attr := item.Attributes
				if attr.Divisions > 0 {
					divisions = attr.Divisions
				}
				for _, k := range attr.Keys {
					if keySignature == "" {
						keySignature = mxFifthsToKey(k.Fifths, k.Mode)
					}
				}
				for _, ts := range attr.Times {
					sig := fmt.Sprintf("%d/%d", ts.Beats, ts.BeatType)
					if len(timeSigMap) == 0 || timeSigMap[len(timeSigMap)-1].Value != sig {
						timeSigMap = append(timeSigMap, TimeSigEvent{
							AtMs:  measureStartMs + ticksToMs(int(tick)),
							Value: sig,
						})
					}
				}

			case "direction":
				dir := item.Direction
				dirMs := measureStartMs + ticksToMs(int(tick))
				if dir.Sound != nil && dir.Sound.Tempo != "" {
					if newBpm, err := strconv.ParseFloat(dir.Sound.Tempo, 64); err == nil && newBpm > 0 {
						bpm = newBpm
						// Only add to map if first or changed
						if len(tempoMap) == 0 || tempoMap[len(tempoMap)-1].BPM != newBpm {
							tempoMap = append(tempoMap, TempoEvent{AtMs: dirMs, BPM: newBpm})
						}
					}
				}
				for _, dt := range dir.Types {
					if lbl := mxDynLabel(dt.Dynamics); lbl != "" {
						currentDyn = lbl
					}
					if dt.Metronome != nil && dt.Metronome.PerMinute != "" {
						if newBpm, err := strconv.ParseFloat(dt.Metronome.PerMinute, 64); err == nil && newBpm > 0 {
							bpm = newBpm
							if len(tempoMap) == 0 || tempoMap[len(tempoMap)-1].BPM != newBpm {
								tempoMap = append(tempoMap, TempoEvent{AtMs: dirMs, BPM: newBpm, BeatUnit: dt.Metronome.BeatUnit})
							}
						}
					}
					if dt.Wedge != nil {
						wn := dt.Wedge.Number
						if wn == 0 {
							wn = 1
						}
						wt := dt.Wedge.Type
						switch wt {
						case "crescendo", "decrescendo", "diminuendo":
							wedges[wn] = &mxWedgeState{from: currentDyn, startMs: dirMs}
						case "stop":
							if w, ok := wedges[wn]; ok {
								toD := currentDyn
								if toD == "" {
									toD = w.from
								}
								hairpins = append(hairpins, Hairpin{
									StartMs: w.startMs,
									EndMs:   dirMs,
									From:    w.from,
									To:      toD,
								})
								delete(wedges, wn)
							}
						}
					}
					if r := strings.TrimSpace(dt.Rehearsal); r != "" {
						sections = append(sections, Section{
							Name:          r,
							StartMs:       dirMs,
							Type:          "rehearsal",
							RehearsalMark: r,
						})
					}
				}

			case "backup":
				tick -= int64(item.Duration)
				if tick < 0 {
					tick = 0
				}
				// Reset chord anchor after a backup so the next non-chord note
				// defines a new chord base position.
				lastNoteTick = tick

			case "forward":
				tick += int64(item.Duration)
				if tick > maxTick {
					maxTick = tick
				}

			case "barline":
				bl := item.Barline
				if bl != nil && bl.Repeat != nil {
					switch bl.Repeat.Direction {
					case "forward":
						hasForwardRepeat = true
					case "backward":
						hasBackwardRepeat = true
					}
				}

			case "note":
				note := item.Note
				isChord := note.Chord != nil
				isGrace := note.Grace != nil

				// Tick position for this note
				var noteTick int64
				if isChord {
					noteTick = lastNoteTick
				} else {
					noteTick = tick
				}
				noteMs := measureStartMs + ticksToMs(int(noteTick))

				// Compute duration in ms
				durMs := ticksToMs(note.Duration)
				if isGrace {
					durMs = 60 // minimal visual duration — grace notes don't fill time
				}

				// Advance tick for regular notes (not chord, not grace)
				if !isChord && !isGrace {
					lastNoteTick = tick
					tick += int64(note.Duration)
					if tick > maxTick {
						maxTick = tick
					}
				}

				// Skip rests and notes without a pitch
				if note.Rest != nil || note.Pitch == nil {
					continue
				}

				midiNote := mxPitchToMidi(*note.Pitch)
				if midiNote < 0 || midiNote > 127 {
					continue
				}

				// Voice / staff
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

				// Tie analysis
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
					if _, exists := tieOnMs[tk]; exists {
						if hasTieStart {
							// Middle of a chain — no NoteOff yet, keep going
							continue
						}
						// End of tie chain — emit NoteOff
						events = append(events, RecordedEvent{
							T: noteMs + durMs, Cmd: 0x80, Note: byte(midiNote), Vel: 0,
						})
						delete(tieOnMs, tk)
						continue
					}
					// Orphan tie-stop: treat as a normal note
				}

				// Determine dynamic
				dyn := currentDyn
				if note.Dynamics != nil {
					if dl := mxDynLabel(note.Dynamics); dl != "" {
						dyn = dl
					}
				}
				if note.Notations != nil && note.Notations.Dynamics != nil {
					if dl := mxDynLabel(note.Notations.Dynamics); dl != "" {
						dyn = dl
					}
				}
				vel := mxDynVelocity(dyn)

				// Notation properties
				articulation, slurVal := "", ""
				var finger *byte
				fermata := false

				if n := note.Notations; n != nil {
					if n.Articulations != nil {
						art := n.Articulations
						switch {
						case art.Staccato != nil:
							articulation = "staccato"
						case art.Tenuto != nil:
							articulation = "tenuto"
						case art.Accent != nil:
							articulation = "accent"
						}
					}
					for _, sl := range n.Slur {
						switch sl.Type {
						case "start":
							slurVal = "start"
						case "stop":
							slurVal = "end"
						}
					}
					if n.Technical != nil && len(n.Technical.Fingering) > 0 {
						raw := strings.TrimSpace(n.Technical.Fingering[0].Value)
						if fv, err := strconv.Atoi(raw); err == nil && fv >= 1 && fv <= 5 {
							fb := byte(fv)
							finger = &fb
						}
					}
					if n.Fermata != nil {
						fermata = true
					}
				}

				hand := "right"
				if staff == 2 {
					hand = "left"
				}

				vb := byte(voice)
				events = append(events, RecordedEvent{
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
				})

				if hasTieStart {
					tieOnMs[tk] = noteMs
				} else {
					// Regular note — emit NoteOff at end
					events = append(events, RecordedEvent{
						T: noteMs + durMs, Cmd: 0x80, Note: byte(midiNote), Vel: 0,
					})
				}
			}
		}

		// Advance posMs by the measure duration
		if maxTick > 0 {
			posMs = measureStartMs + ticksToMs(int(maxTick))
		}

		// Emit deferred repeat markers
		if hasForwardRepeat {
			repeats = append(repeats, Repeat{Type: "repeat-open", AtMs: measureStartMs})
		}
		if hasBackwardRepeat {
			repeats = append(repeats, Repeat{Type: "repeat-close", AtMs: posMs})
		}
	}

	// Close any dangling tied notes (shouldn't happen in well-formed XML)
	for tk, onMs := range tieOnMs {
		midiNote := byte(tk % 1_000)
		events = append(events, RecordedEvent{
			T: onMs + 500, Cmd: 0x80, Note: midiNote, Vel: 0,
		})
	}

	return
}

// ── Top-level converter ───────────────────────────────────────────────────────

// convertMusicXML parses a MusicXML document and returns a fully populated
// Recording ready for JSON marshalling.
func convertMusicXML(xmlData []byte, filename string) (*Recording, error) {
	var score mxScore
	if err := xml.Unmarshal(xmlData, &score); err != nil {
		return nil, fmt.Errorf("parse MusicXML: %w", err)
	}
	if len(score.Parts) == 0 {
		return nil, fmt.Errorf("MusicXML file contains no parts")
	}

	// ── Metadata ──────────────────────────────────────────────────────────────
	title := strings.TrimSpace(score.Work.Title)
	composer := ""
	for _, c := range score.Identification.Creators {
		if strings.EqualFold(c.Type, "composer") {
			composer = strings.TrimSpace(c.Value)
			break
		}
	}
	if title == "" && len(score.PartList.ScoreParts) > 0 {
		title = strings.TrimSpace(score.PartList.ScoreParts[0].Name)
	}

	// ── Merge all parts ───────────────────────────────────────────────────────
	var allEvents []RecordedEvent
	var tempoMap []TempoEvent
	var timeSigMap []TimeSigEvent
	var measureMap []MeasureEntry
	var hairpins []Hairpin
	var repeats []Repeat
	var sections []Section
	keySignature := ""

	for partIdx, part := range score.Parts {
		pevs, pTempo, pTimeSig, pMeasure, pHairpins, pRepeats, pKey, pSections := convertPart(part)
		allEvents = append(allEvents, pevs...)
		if partIdx == 0 {
			tempoMap    = pTempo
			timeSigMap  = pTimeSig
			measureMap  = pMeasure
			hairpins    = pHairpins
			repeats     = pRepeats
			keySignature = pKey
			sections    = pSections
		}
	}

	// Sort events: ascending time; NoteOn (0x90) before NoteOff (0x80) at same ms.
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
			Title:    title,
			Composer: composer,
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
