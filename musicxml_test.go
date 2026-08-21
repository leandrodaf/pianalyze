package main

import (
	"fmt"
	"strings"
	"testing"

	"go.uber.org/zap"
)

// ── helpers ────────────────────────────────────────────────────────────────────

var testLogger = zap.NewNop()

// score wraps parts in a minimal score-partwise document.
func score(parts ...string) []byte {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	sb.WriteString(`<score-partwise version="3.1">`)
	sb.WriteString(`<part-list>`)
	for i := range parts {
		fmt.Fprintf(&sb, `<score-part id="P%d"><part-name>Part %d</part-name></score-part>`, i+1, i+1)
	}
	sb.WriteString(`</part-list>`)
	for i, p := range parts {
		fmt.Fprintf(&sb, `<part id="P%d">%s</part>`, i+1, p)
	}
	sb.WriteString(`</score-partwise>`)
	return []byte(sb.String())
}

// attrs builds a standard <attributes> block.
func attrs(divisions, fifths int, mode, beats, beatType string) string {
	return fmt.Sprintf(`<attributes>
		<divisions>%d</divisions>
		<key><fifths>%d</fifths><mode>%s</mode></key>
		<time><beats>%s</beats><beat-type>%s</beat-type></time>
		<clef><sign>G</sign><line>2</line></clef>
	</attributes>`, divisions, fifths, mode, beats, beatType)
}

// note builds a plain <note> element (no notations).
func note(step string, octave, duration int) string {
	return fmt.Sprintf(`<note>
		<pitch><step>%s</step><octave>%d</octave></pitch>
		<duration>%d</duration>
		<type>quarter</type>
	</note>`, step, octave, duration)
}

// noteWith builds a <note> element with arbitrary extra XML inside.
func noteWith(step string, octave, duration int, extra string) string {
	return fmt.Sprintf(`<note>
		<pitch><step>%s</step><octave>%d</octave></pitch>
		<duration>%d</duration>
		<type>quarter</type>
		%s
	</note>`, step, octave, duration, extra)
}

// measure wraps content in a numbered measure.
func measure(number int, content string) string {
	return fmt.Sprintf(`<measure number="%d">%s</measure>`, number, content)
}

func mustConvert(t *testing.T, xml []byte) *Recording {
	t.Helper()
	r, err := convertMusicXML(xml, "test.xml", testLogger)
	if err != nil {
		t.Fatalf("convertMusicXML: %v", err)
	}
	return r
}

// ── mxFifthsToKey ─────────────────────────────────────────────────────────────

func TestMxFifthsToKey(t *testing.T) {
	cases := []struct {
		fifths int
		mode   string
		want   string
	}{
		{0, "major", "C"}, {1, "major", "G"}, {2, "major", "D"},
		{3, "major", "A"}, {4, "major", "E"}, {5, "major", "B"},
		{6, "major", "F#"}, {7, "major", "C#"},
		{-1, "major", "F"}, {-2, "major", "Bb"}, {-3, "major", "Eb"},
		{-4, "major", "Ab"}, {-5, "major", "Db"}, {-6, "major", "Gb"},
		{-7, "major", "Cb"},
		{0, "minor", "Am"}, {1, "minor", "Em"}, {2, "minor", "Bm"},
		{3, "minor", "F#m"}, {4, "minor", "C#m"}, {-1, "minor", "Dm"},
		{-2, "minor", "Gm"}, {-3, "minor", "Cm"}, {-4, "minor", "Fm"},
		{-5, "minor", "Bbm"},
		// Unknown fifths → fall back to "C"
		{99, "major", "C"},
	}
	for _, c := range cases {
		got := mxFifthsToKey(c.fifths, c.mode)
		if got != c.want {
			t.Errorf("mxFifthsToKey(%d, %q) = %q, want %q", c.fifths, c.mode, got, c.want)
		}
	}
}

// ── mxPitchToMidi ─────────────────────────────────────────────────────────────

func TestMxPitchToMidi(t *testing.T) {
	cases := []struct {
		step   string
		alter  float64
		octave int
		want   int
	}{
		{"C", 0, 4, 60}, // middle C
		{"D", 0, 4, 62},
		{"E", 0, 4, 64},
		{"F", 0, 4, 65},
		{"G", 0, 4, 67},
		{"A", 0, 4, 69},
		{"B", 0, 4, 71},
		{"C", 0, 5, 72},
		{"C", 1, 4, 61},  // C#4
		{"E", -1, 4, 63}, // Eb4
		{"C", 0, 0, 12},  // C0
		{"B", 0, 8, 119},
	}
	for _, c := range cases {
		got := mxPitchToMidi(mxPitch{Step: c.step, Alter: c.alter, Octave: c.octave})
		if got != c.want {
			t.Errorf("mxPitchToMidi(%s%+.0f%d) = %d, want %d", c.step, c.alter, c.octave, got, c.want)
		}
	}
}

// ── Basic note conversion ──────────────────────────────────────────────────────

// TestBasicNote verifies that a single C4 quarter note at 120 BPM produces
// one NoteOn at t=0 and one NoteOff at t=500ms with the correct note number.
func TestBasicNote(t *testing.T) {
	// divisions=4, BPM=120 → 1 quarter (4 divs) = 500ms
	xml := score(measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4)))
	r := mustConvert(t, xml)

	if len(r.Events) < 2 {
		t.Fatalf("want ≥2 events, got %d", len(r.Events))
	}
	on := r.Events[0]
	off := r.Events[1]
	if on.Cmd != 0x90 || on.Note != 60 || on.T != 0 {
		t.Errorf("NoteOn: cmd=%02X note=%d t=%d, want cmd=90 note=60 t=0", on.Cmd, on.Note, on.T)
	}
	if off.Cmd != 0x80 || off.Note != 60 || off.T != 500 {
		t.Errorf("NoteOff: cmd=%02X note=%d t=%d, want cmd=80 note=60 t=500", off.Cmd, off.Note, off.T)
	}
}

// TestTempoMap verifies the default tempo map entry.
func TestTempoMap(t *testing.T) {
	xml := score(measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4)))
	r := mustConvert(t, xml)

	if len(r.TempoMap) == 0 {
		t.Fatal("tempoMap is empty")
	}
	if r.TempoMap[0].AtMs != 0 || r.TempoMap[0].BPM != 120 {
		t.Errorf("tempoMap[0] = {AtMs:%d BPM:%.1f}, want {0 120}", r.TempoMap[0].AtMs, r.TempoMap[0].BPM)
	}
}

// TestTempoChange verifies a metronome marking mid-piece.
func TestTempoChange(t *testing.T) {
	// First measure at 120 BPM, second with metronome marking for 100 BPM.
	tempoDir := `<direction>
		<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type>
		<sound tempo="100"/>
	</direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4))
	m2 := measure(2, tempoDir+note("D", 4, 4))
	r := mustConvert(t, score(m1+m2))

	if len(r.TempoMap) < 2 {
		t.Fatalf("want ≥2 tempo entries, got %d", len(r.TempoMap))
	}
	last := r.TempoMap[len(r.TempoMap)-1]
	if last.BPM != 100 {
		t.Errorf("last tempo = %.1f BPM, want 100", last.BPM)
	}
}

// TestTimeSigMap verifies the time-signature map.
func TestTimeSigMap(t *testing.T) {
	xml := score(measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4)))
	r := mustConvert(t, xml)

	if len(r.TimeSignatureMap) == 0 {
		t.Fatal("timeSignatureMap is empty")
	}
	if r.TimeSignatureMap[0].Value != "4/4" || r.TimeSignatureMap[0].AtMs != 0 {
		t.Errorf("timeSignatureMap[0] = %+v, want {0 4/4}", r.TimeSignatureMap[0])
	}
}

// TestTimeSigChange verifies that a time-signature change mid-piece is recorded.
func TestTimeSigChange(t *testing.T) {
	// 4/4 first measure, 3/4 second measure
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4))
	newTS := `<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>`
	m2 := measure(2, newTS+note("D", 4, 4))
	r := mustConvert(t, score(m1+m2))

	if len(r.TimeSignatureMap) < 2 {
		t.Fatalf("want ≥2 timeSig entries, got %d", len(r.TimeSignatureMap))
	}
	last := r.TimeSignatureMap[len(r.TimeSignatureMap)-1]
	if last.Value != "3/4" {
		t.Errorf("last timeSig = %q, want 3/4", last.Value)
	}
	if last.AtMs == 0 {
		t.Error("timeSig change AtMs should be >0, got 0")
	}
}

// ── Key signature ──────────────────────────────────────────────────────────────

// TestKeySignatureMajor verifies G major key signature extraction.
func TestKeySignatureMajor(t *testing.T) {
	xml := score(measure(1, attrs(4, 1, "major", "4", "4")+note("G", 4, 4)))
	r := mustConvert(t, xml)

	if r.KeySignature != "G" {
		t.Errorf("KeySignature = %q, want G", r.KeySignature)
	}
	if len(r.KeySignatureMap) == 0 || r.KeySignatureMap[0].Value != "G" {
		t.Errorf("KeySignatureMap[0] = %+v, want {0 G}", r.KeySignatureMap)
	}
}

// TestKeySignatureMinor verifies A-minor key signature extraction.
func TestKeySignatureMinor(t *testing.T) {
	xml := score(measure(1, attrs(4, 0, "minor", "4", "4")+note("A", 4, 4)))
	r := mustConvert(t, xml)

	if r.KeySignature != "Am" {
		t.Errorf("KeySignature = %q, want Am", r.KeySignature)
	}
}

// TestKeySignatureChange verifies that a mid-piece key change is stored in
// KeySignatureMap. This was previously silently discarded.
func TestKeySignatureChange(t *testing.T) {
	// measure 1: C major, measure 2: G major (1 sharp)
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4))
	m2 := measure(2, `<attributes><key><fifths>1</fifths><mode>major</mode></key></attributes>`+note("G", 4, 4))
	r := mustConvert(t, score(m1+m2))

	if r.KeySignature != "C" {
		t.Errorf("KeySignature = %q, want C", r.KeySignature)
	}
	if len(r.KeySignatureMap) < 2 {
		t.Fatalf("want ≥2 keySig entries (C then G), got %d: %v", len(r.KeySignatureMap), r.KeySignatureMap)
	}
	last := r.KeySignatureMap[len(r.KeySignatureMap)-1]
	if last.Value != "G" {
		t.Errorf("last keySig = %q, want G", last.Value)
	}
	if last.AtMs == 0 {
		t.Error("key change AtMs should be >0 (i.e. in measure 2)")
	}
}

// TestKeySignatureNoChange verifies that a repeated identical key does not
// produce duplicate entries.
func TestKeySignatureNoChange(t *testing.T) {
	// Same key repeated in measure 2 (common in multi-staff scores)
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4))
	m2 := measure(2, `<attributes><key><fifths>0</fifths><mode>major</mode></key></attributes>`+note("E", 4, 4))
	r := mustConvert(t, score(m1+m2))

	if len(r.KeySignatureMap) != 1 {
		t.Errorf("KeySignatureMap should have 1 entry (no duplicate C), got %d", len(r.KeySignatureMap))
	}
}

// ── Pickup (anacrusis) ─────────────────────────────────────────────────────────

// TestPickupMeasure verifies that a measure numbered 0 sets Recording.Pickup = true.
func TestPickupMeasure(t *testing.T) {
	m0 := measure(0, attrs(4, 0, "major", "4", "4")+note("C", 4, 2)) // half measure
	m1 := measure(1, note("C", 4, 4))
	r := mustConvert(t, score(m0+m1))

	if !r.Pickup {
		t.Error("Pickup should be true for anacrusis score (measure 0 present)")
	}
	// Verify measure 0 is in the map
	var found bool
	for _, m := range r.MeasureMap {
		if m.Measure == 0 {
			found = true
		}
	}
	if !found {
		t.Error("MeasureMap should contain measure 0")
	}
}

// TestNoPickup verifies that a score starting at measure 1 does NOT set Pickup.
func TestNoPickup(t *testing.T) {
	xml := score(measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4)))
	r := mustConvert(t, xml)

	if r.Pickup {
		t.Error("Pickup should be false when score starts at measure 1")
	}
}

// ── Repeats ────────────────────────────────────────────────────────────────────

// TestRepeatOpenClose verifies forward and backward repeat barlines.
func TestRepeatOpenClose(t *testing.T) {
	barOpen := `<barline location="left"><repeat direction="forward"/></barline>`
	barClose := `<barline location="right"><repeat direction="backward"/></barline>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+barOpen+note("C", 4, 4)+barClose)
	r := mustConvert(t, score(m1))

	var open, closed bool
	for _, rep := range r.Repeats {
		if rep.Type == "repeat-open" {
			open = true
		}
		if rep.Type == "repeat-close" {
			closed = true
		}
	}
	if !open {
		t.Error("repeat-open not found in Repeats")
	}
	if !closed {
		t.Error("repeat-close not found in Repeats")
	}
}

// TestRepeatTimes verifies that the times attribute is stored on the Repeat.
func TestRepeatTimes(t *testing.T) {
	barClose := `<barline location="right"><repeat direction="backward" times="3"/></barline>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4)+barClose)
	r := mustConvert(t, score(m1))

	var found bool
	for _, rep := range r.Repeats {
		if rep.Type == "repeat-close" {
			found = true
			if rep.Times != 3 {
				t.Errorf("repeat-close Times = %d, want 3", rep.Times)
			}
		}
	}
	if !found {
		t.Error("repeat-close not found in Repeats")
	}
}

// TestRepeatTimesDefault verifies that a repeat with no times attribute has Times=0
// (meaning default, i.e. the player repeats once = 2 total plays).
func TestRepeatTimesDefault(t *testing.T) {
	barClose := `<barline location="right"><repeat direction="backward"/></barline>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4)+barClose)
	r := mustConvert(t, score(m1))

	for _, rep := range r.Repeats {
		if rep.Type == "repeat-close" && rep.Times != 0 {
			t.Errorf("repeat-close without times= should have Times=0, got %d", rep.Times)
		}
	}
}

// ── Volta brackets (endings) ───────────────────────────────────────────────────

// TestVoltaBrackets verifies that 1st and 2nd endings are stored in Endings.
func TestVoltaBrackets(t *testing.T) {
	// Pattern: repeat open, 1st ending, repeat close/discontinue, 2nd ending, stop
	barRepOpen := `<barline location="left"><repeat direction="forward"/></barline>`
	end1start := `<barline location="left"><ending number="1" type="start">1.</ending></barline>`
	end1stop := `<barline location="right"><repeat direction="backward"/><ending number="1" type="stop"/></barline>`
	end2start := `<barline location="left"><ending number="2" type="start">2.</ending></barline>`
	end2stop := `<barline location="right"><ending number="2" type="discontinue"/></barline>`

	m1 := measure(1, attrs(4, 0, "major", "4", "4")+barRepOpen+note("C", 4, 4))
	m2 := measure(2, end1start+note("E", 4, 4)+end1stop)
	m3 := measure(3, end2start+note("G", 4, 4)+end2stop)

	r := mustConvert(t, score(m1+m2+m3))

	if len(r.Endings) < 2 {
		t.Fatalf("want ≥2 endings, got %d: %v", len(r.Endings), r.Endings)
	}

	var e1, e2 *Ending
	for i := range r.Endings {
		switch r.Endings[i].Number {
		case "1":
			e1 = &r.Endings[i]
		case "2":
			e2 = &r.Endings[i]
		}
	}
	if e1 == nil {
		t.Error("ending number=1 not found")
	} else if e1.EndMs == 0 {
		t.Error("ending 1 EndMs should be >0")
	}
	if e2 == nil {
		t.Error("ending number=2 not found")
	} else if e2.EndMs == 0 {
		t.Error("ending 2 EndMs should be >0")
	}
	// 2nd ending must start later than 1st
	if e1 != nil && e2 != nil && e2.StartMs <= e1.StartMs {
		t.Errorf("ending 2 startMs (%d) should be after ending 1 startMs (%d)", e2.StartMs, e1.StartMs)
	}
}

// ── Barline coda/segno ─────────────────────────────────────────────────────────

// TestBarlineCoda verifies that a coda sign in a barline is stored as a Repeat.
func TestBarlineCoda(t *testing.T) {
	barCoda := `<barline location="right"><coda/></barline>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4)+barCoda)
	r := mustConvert(t, score(m1))

	var found bool
	for _, rep := range r.Repeats {
		if rep.Type == "coda" {
			found = true
		}
	}
	if !found {
		t.Error("barline coda not stored in Repeats (was previously silently dropped)")
	}
}

// TestBarlineSegno verifies that a segno sign in a barline is stored as a Repeat.
func TestBarlineSegno(t *testing.T) {
	barSegno := `<barline location="left"><segno/></barline>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+barSegno+note("C", 4, 4))
	r := mustConvert(t, score(m1))

	var found bool
	for _, rep := range r.Repeats {
		if rep.Type == "segno" {
			found = true
		}
	}
	if !found {
		t.Error("barline segno not stored in Repeats (was previously silently dropped)")
	}
}

// ── Articulations ─────────────────────────────────────────────────────────────

func TestArticulationStaccato(t *testing.T) {
	notations := `<notations><articulations><staccato/></articulations></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Articulation != "staccato" {
		t.Errorf("Articulation = %q, want staccato", ev.Articulation)
	}
}

func TestArticulationTenuto(t *testing.T) {
	notations := `<notations><articulations><tenuto/></articulations></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Articulation != "tenuto" {
		t.Errorf("Articulation = %q, want tenuto", ev.Articulation)
	}
}

func TestArticulationAccent(t *testing.T) {
	notations := `<notations><articulations><accent/></articulations></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Articulation != "accent" {
		t.Errorf("Articulation = %q, want accent", ev.Articulation)
	}
}

func TestArticulationStaccatissimo(t *testing.T) {
	// staccatissimo and spiccato both collapse to "staccato"
	notations := `<notations><articulations><staccatissimo/></articulations></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Articulation != "staccato" {
		t.Errorf("Articulation = %q, want staccato (staccatissimo→staccato)", ev.Articulation)
	}
}

// ── Ornaments ─────────────────────────────────────────────────────────────────

func TestOrnamentTrill(t *testing.T) {
	notations := `<notations><ornaments><trill-mark/></ornaments></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Articulation != "trill" {
		t.Errorf("Articulation = %q, want trill", ev.Articulation)
	}
}

func TestOrnamentMordent(t *testing.T) {
	notations := `<notations><ornaments><mordent/></ornaments></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Articulation != "mordent" {
		t.Errorf("Articulation = %q, want mordent", ev.Articulation)
	}
}

func TestOrnamentInvertedMordent(t *testing.T) {
	notations := `<notations><ornaments><inverted-mordent/></ornaments></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Articulation != "inverted-mordent" {
		t.Errorf("Articulation = %q, want inverted-mordent", ev.Articulation)
	}
}

func TestOrnamentTurn(t *testing.T) {
	notations := `<notations><ornaments><turn/></ornaments></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Articulation != "turn" {
		t.Errorf("Articulation = %q, want turn", ev.Articulation)
	}
}

// ── Fermata ────────────────────────────────────────────────────────────────────

func TestFermata(t *testing.T) {
	notations := `<notations><fermata/></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if !ev.Fermata {
		t.Error("Fermata should be true")
	}
}

// ── Slur ───────────────────────────────────────────────────────────────────────

func TestSlurStartEnd(t *testing.T) {
	n1 := noteWith("C", 4, 4, `<notations><slur type="start" number="1"/></notations>`)
	n2 := noteWith("E", 4, 4, `<notations><slur type="stop" number="1"/></notations>`)
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+n1+n2)
	r := mustConvert(t, score(m1))

	noteOns := noteOnEvents(r)
	if len(noteOns) < 2 {
		t.Fatalf("want ≥2 NoteOn events, got %d", len(noteOns))
	}
	if noteOns[0].Slur != "start" {
		t.Errorf("first note Slur = %q, want start", noteOns[0].Slur)
	}
	if noteOns[1].Slur != "end" {
		t.Errorf("second note Slur = %q, want end", noteOns[1].Slur)
	}
}

// ── Grace notes ────────────────────────────────────────────────────────────────

func TestGraceNote(t *testing.T) {
	grace := `<note><grace/><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+grace+note("C", 4, 4))
	r := mustConvert(t, score(m1))

	var found bool
	for _, ev := range r.Events {
		if ev.Cmd == 0x90 && ev.Note == 62 { // D4
			found = true
			if !ev.Grace {
				t.Error("grace note event should have Grace=true")
			}
			// Duration is fixed at 60ms for grace notes
			// Find its NoteOff
			for _, off := range r.Events {
				if off.Cmd == 0x80 && off.Note == 62 {
					dur := off.T - ev.T
					if dur != 60 {
						t.Errorf("grace note duration = %dms, want 60ms", dur)
					}
				}
			}
		}
	}
	if !found {
		t.Error("D4 grace note NoteOn not found in events")
	}
}

// ── Ties ───────────────────────────────────────────────────────────────────────

// TestTie verifies that two tied C4 quarter notes produce a single NoteOn
// spanning both durations (2 beats = 1000ms at 120 BPM, divisions=4).
func TestTie(t *testing.T) {
	// Two quarter notes tied together → one note of duration 1000ms
	n1 := `<note>
		<pitch><step>C</step><octave>4</octave></pitch>
		<duration>4</duration><type>quarter</type>
		<tie type="start"/>
		<notations><tied type="start"/></notations>
	</note>`
	n2 := `<note>
		<pitch><step>C</step><octave>4</octave></pitch>
		<duration>4</duration><type>quarter</type>
		<tie type="stop"/>
		<notations><tied type="stop"/></notations>
	</note>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+n1+n2)
	r := mustConvert(t, score(m1))

	// Should have exactly one NoteOn and one NoteOff for C4
	var ons, offs []RecordedEvent
	for _, ev := range r.Events {
		if ev.Note == 60 {
			switch ev.Cmd {
			case 0x90:
				ons = append(ons, ev)
			case 0x80:
				offs = append(offs, ev)
			}
		}
	}
	if len(ons) != 1 {
		t.Errorf("tied note: want 1 NoteOn, got %d", len(ons))
	}
	if len(offs) != 1 {
		t.Errorf("tied note: want 1 NoteOff, got %d", len(offs))
	}
	if len(ons) == 1 && len(offs) == 1 {
		dur := offs[0].T - ons[0].T
		if dur != 1000 {
			t.Errorf("tied duration = %dms, want 1000ms (2 quarters at 120 BPM)", dur)
		}
	}
}

// ── Transposition ─────────────────────────────────────────────────────────────

// TestTranspose verifies that notes are converted to concert pitch.
// A +2 chromatic transposition means written C4 (MIDI 60) → concert D4 (MIDI 62).
func TestTranspose(t *testing.T) {
	transposeAttr := `<attributes>
		<divisions>4</divisions>
		<key><fifths>0</fifths><mode>major</mode></key>
		<time><beats>4</beats><beat-type>4</beat-type></time>
		<transpose><diatonic>1</diatonic><chromatic>2</chromatic></transpose>
	</attributes>`
	m1 := measure(1, transposeAttr+note("C", 4, 4))
	r := mustConvert(t, score(m1))

	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if int(ev.Note) != 62 { // D4 = 62
		t.Errorf("transposed note = %d, want 62 (D4 = concert pitch of C4+2)", ev.Note)
	}
}

// ── Dynamics ───────────────────────────────────────────────────────────────────

func TestDynamicMF(t *testing.T) {
	dynDir := `<direction><direction-type><dynamics><mf/></dynamics></direction-type></direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+dynDir+note("C", 4, 4))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Dynamic != "mf" {
		t.Errorf("Dynamic = %q, want mf", ev.Dynamic)
	}
}

func TestDynamicFF(t *testing.T) {
	dynDir := `<direction><direction-type><dynamics><ff/></dynamics></direction-type></direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+dynDir+note("C", 4, 4))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Dynamic != "ff" {
		t.Errorf("Dynamic = %q, want ff", ev.Dynamic)
	}
}

func TestDynamicSFZ(t *testing.T) {
	// sfz is approximated as fff
	dynDir := `<direction><direction-type><dynamics><sfz/></dynamics></direction-type></direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+dynDir+note("C", 4, 4))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Dynamic != "fff" {
		t.Errorf("sfz Dynamic = %q, want fff (documented approximation)", ev.Dynamic)
	}
}

// ── Hairpins ───────────────────────────────────────────────────────────────────

func TestHairpinCrescendo(t *testing.T) {
	// mp, crescendo start, note, crescendo stop at f
	dynMP := `<direction><direction-type><dynamics><mp/></dynamics></direction-type></direction>`
	cresc := `<direction><direction-type><wedge type="crescendo" number="1"/></direction-type></direction>`
	dynF := `<direction><direction-type><dynamics><f/></dynamics></direction-type></direction>`
	crescStop := `<direction><direction-type><wedge type="stop" number="1"/></direction-type></direction>`

	m1 := measure(1, attrs(4, 0, "major", "4", "4")+dynMP+cresc+note("C", 4, 4)+dynF+crescStop)
	r := mustConvert(t, score(m1))

	if len(r.Hairpins) == 0 {
		t.Fatal("no hairpins found")
	}
	hp := r.Hairpins[0]
	if hp.From != "mp" {
		t.Errorf("hairpin From = %q, want mp", hp.From)
	}
	if hp.To != "f" {
		t.Errorf("hairpin To = %q, want f", hp.To)
	}
}

// ── Staff / Hand ───────────────────────────────────────────────────────────────

func TestStaffHand(t *testing.T) {
	// Staff 1 → right hand, staff 2 → left hand
	n1 := `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><staff>1</staff></note>`
	n2 := `<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>quarter</type><staff>2</staff></note>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+n1)
	m2 := measure(2, n2)
	r := mustConvert(t, score(m1+m2))

	var rightFound, leftFound bool
	for _, ev := range r.Events {
		if ev.Cmd == 0x90 {
			if ev.Note == 60 && ev.Hand == "right" {
				rightFound = true
			}
			if ev.Note == 48 && ev.Hand == "left" {
				leftFound = true
			}
		}
	}
	if !rightFound {
		t.Error("C4 with staff=1 should have Hand=right")
	}
	if !leftFound {
		t.Error("C3 with staff=2 should have Hand=left")
	}
}

// ── Fingering ─────────────────────────────────────────────────────────────────

func TestFingering(t *testing.T) {
	notations := `<notations><technical><fingering>2</fingering></technical></notations>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, notations))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Finger == nil || *ev.Finger != 2 {
		f := byte(0)
		if ev.Finger != nil {
			f = *ev.Finger
		}
		t.Errorf("Finger = %d, want 2", f)
	}
}

// ── Lyric (tip) ────────────────────────────────────────────────────────────────

func TestLyric(t *testing.T) {
	lyric := `<lyric number="1"><syllabic>single</syllabic><text>hello</text></lyric>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+noteWith("C", 4, 4, lyric))
	r := mustConvert(t, score(m1))
	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Tip != "hello" {
		t.Errorf("Tip = %q, want hello", ev.Tip)
	}
}

// ── Rehearsal mark ─────────────────────────────────────────────────────────────

func TestRehearsalMark(t *testing.T) {
	rehearsal := `<direction><direction-type><rehearsal>A</rehearsal></direction-type></direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+rehearsal+note("C", 4, 4))
	r := mustConvert(t, score(m1))

	var found bool
	for _, s := range r.Sections {
		if s.Type == "rehearsal" && s.RehearsalMark == "A" {
			found = true
		}
	}
	if !found {
		t.Error("rehearsal mark A not found in Sections")
	}
}

// ── Direction coda / segno ─────────────────────────────────────────────────────

func TestDirectionCoda(t *testing.T) {
	codaDir := `<direction><direction-type><coda/></direction-type></direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+codaDir+note("C", 4, 4))
	r := mustConvert(t, score(m1))

	var found bool
	for _, rep := range r.Repeats {
		if rep.Type == "coda" {
			found = true
		}
	}
	if !found {
		t.Error("direction coda not found in Repeats")
	}
}

func TestDirectionSegno(t *testing.T) {
	segnoDir := `<direction><direction-type><segno/></direction-type></direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+segnoDir+note("C", 4, 4))
	r := mustConvert(t, score(m1))

	var found bool
	for _, rep := range r.Repeats {
		if rep.Type == "segno" {
			found = true
		}
	}
	if !found {
		t.Error("direction segno not found in Repeats")
	}
}

// ── Sustain pedal ──────────────────────────────────────────────────────────────

func TestSustainPedal(t *testing.T) {
	pedalOn := `<direction><direction-type><pedal type="start"/></direction-type></direction>`
	pedalOff := `<direction><direction-type><pedal type="stop"/></direction-type></direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+pedalOn+note("C", 4, 4)+pedalOff)
	r := mustConvert(t, score(m1))

	var ccOn, ccOff bool
	for _, ev := range r.Events {
		if ev.Cmd == 0xB0 && ev.Note == 64 {
			if ev.Vel == 127 {
				ccOn = true
			}
			if ev.Vel == 0 {
				ccOff = true
			}
		}
	}
	if !ccOn {
		t.Error("sustain pedal CC 64 vel=127 not found")
	}
	if !ccOff {
		t.Error("sustain pedal CC 64 vel=0 not found")
	}
}

// TestSostenutoPedal verifies that a sostenuto marking is emitted as CC 66,
// not mislabeled as sustain (CC 64) — and that its "stop" correctly closes
// CC 66 rather than CC 64.
func TestSostenutoPedal(t *testing.T) {
	sostOn := `<direction><direction-type><pedal type="sostenuto"/></direction-type></direction>`
	sostOff := `<direction><direction-type><pedal type="stop"/></direction-type></direction>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+sostOn+note("C", 4, 4)+sostOff)
	r := mustConvert(t, score(m1))

	var cc66On, cc66Off, cc64Seen bool
	for _, ev := range r.Events {
		if ev.Cmd != 0xB0 {
			continue
		}
		switch ev.Note {
		case 66:
			if ev.Vel == 127 {
				cc66On = true
			}
			if ev.Vel == 0 {
				cc66Off = true
			}
		case 64:
			cc64Seen = true
		}
	}
	if !cc66On {
		t.Error("sostenuto pedal CC 66 vel=127 not found")
	}
	if !cc66Off {
		t.Error("sostenuto pedal CC 66 vel=0 (stop) not found")
	}
	if cc64Seen {
		t.Error("sostenuto pedal must not be emitted as CC 64 (sustain)")
	}
}

// ── Multi-part ────────────────────────────────────────────────────────────────

// TestMultiPartEvents verifies that notes from both parts are merged and
// the tempo/key/timeSig are taken from part 0.
func TestMultiPartEvents(t *testing.T) {
	p1 := measure(1, attrs(4, 1, "major", "4", "4")+note("G", 4, 4)) // G major
	p2 := measure(1, attrs(4, 1, "major", "4", "4")+note("B", 3, 4)) // same key

	r := mustConvert(t, score(p1, p2))

	// Both G4 (67) and B3 (59) should appear
	notes := make(map[int]bool)
	for _, ev := range r.Events {
		if ev.Cmd == 0x90 {
			notes[int(ev.Note)] = true
		}
	}
	if !notes[67] {
		t.Error("G4 (from part 1) not found in events")
	}
	if !notes[59] {
		t.Error("B3 (from part 2) not found in events")
	}
	if r.KeySignature != "G" {
		t.Errorf("KeySignature = %q, want G (from part 0)", r.KeySignature)
	}
}

// ── Metadata ──────────────────────────────────────────────────────────────────

func TestMetadata(t *testing.T) {
	xml := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Fur Elise</work-title></work>
  <identification>
    <creator type="composer">Ludwig van Beethoven</creator>
    <rights>Public Domain</rights>
  </identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">` + string(measure(1, attrs(4, 0, "major", "4", "4")+note("E", 4, 4))) + `</part>
</score-partwise>`)

	r := mustConvert(t, xml)

	if r.Meta == nil {
		t.Fatal("Meta is nil")
	}
	if r.Meta.Title != "Fur Elise" {
		t.Errorf("Title = %q, want Fur Elise", r.Meta.Title)
	}
	if r.Meta.Composer != "Ludwig van Beethoven" {
		t.Errorf("Composer = %q, want Ludwig van Beethoven", r.Meta.Composer)
	}
	if r.Meta.Copyright != "Public Domain" {
		t.Errorf("Copyright = %q, want Public Domain", r.Meta.Copyright)
	}
	if r.Meta.Source == nil || r.Meta.Source.Format != "musicxml" {
		t.Error("Source.Format should be musicxml")
	}
}

// ── MeasureMap ────────────────────────────────────────────────────────────────

func TestMeasureMap(t *testing.T) {
	// 3 measures at 120 BPM, 4/4, divisions=4
	// Each measure = 16 divisions = 2000ms
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4))
	m2 := measure(2, note("D", 4, 4))
	m3 := measure(3, note("E", 4, 4))
	r := mustConvert(t, score(m1+m2+m3))

	if len(r.MeasureMap) < 3 {
		t.Fatalf("want ≥3 measure entries, got %d", len(r.MeasureMap))
	}
	if r.MeasureMap[0].Measure != 1 || r.MeasureMap[0].AtMs != 0 {
		t.Errorf("measureMap[0] = %+v, want {1 0}", r.MeasureMap[0])
	}
	if r.MeasureMap[1].Measure != 2 || r.MeasureMap[1].AtMs == 0 {
		t.Errorf("measureMap[1] = %+v, want {2 >0}", r.MeasureMap[1])
	}
}

// ── Version / schema ──────────────────────────────────────────────────────────

func TestVersionAndSchema(t *testing.T) {
	xml := score(measure(1, attrs(4, 0, "major", "4", "4")+note("C", 4, 4)))
	r := mustConvert(t, xml)

	if r.Version != 2 {
		t.Errorf("Version = %d, want 2", r.Version)
	}
	if r.RecordedAt == "" {
		t.Error("RecordedAt should not be empty")
	}
	if len(r.Events) == 0 {
		t.Error("Events should not be empty")
	}
}

// ── Chord (simultaneous notes) ────────────────────────────────────────────────

// TestChord verifies that simultaneous notes (using the <chord/> element)
// both produce NoteOn events at the same timestamp.
func TestChord(t *testing.T) {
	// C4 + E4 sounding together
	n1 := note("C", 4, 4)
	n2 := `<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+n1+n2)
	r := mustConvert(t, score(m1))

	var c4, e4 *RecordedEvent
	for i := range r.Events {
		if r.Events[i].Cmd == 0x90 {
			switch r.Events[i].Note {
			case 60:
				c4 = &r.Events[i]
			case 64:
				e4 = &r.Events[i]
			}
		}
	}
	if c4 == nil {
		t.Fatal("C4 NoteOn not found")
	}
	if e4 == nil {
		t.Fatal("E4 NoteOn not found")
	}
	if c4.T != e4.T {
		t.Errorf("chord notes at different times: C4 at %d, E4 at %d — should be simultaneous", c4.T, e4.T)
	}
}

// ── Voice number ──────────────────────────────────────────────────────────────

func TestVoiceNumber(t *testing.T) {
	n1 := `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><voice>2</voice></note>`
	m1 := measure(1, attrs(4, 0, "major", "4", "4")+n1)
	r := mustConvert(t, score(m1))

	ev := noteOnEvent(r)
	if ev == nil {
		t.Fatal("NoteOn event not found")
	}
	if ev.Voice == nil || *ev.Voice != 2 {
		v := byte(0)
		if ev.Voice != nil {
			v = *ev.Voice
		}
		t.Errorf("Voice = %d, want 2", v)
	}
}

// ── Pitch completeness ────────────────────────────────────────────────────────

// TestAllChromaticNotes verifies that all 12 chromatic pitches in octave 4
// are correctly mapped to MIDI numbers 60–71.
func TestAllChromaticNotes(t *testing.T) {
	cases := []struct {
		step  string
		alter float64
		midi  int
	}{
		{"C", 0, 60}, {"C", 1, 61}, {"D", 0, 62}, {"D", 1, 63},
		{"E", 0, 64}, {"F", 0, 65}, {"F", 1, 66}, {"G", 0, 67},
		{"G", 1, 68}, {"A", 0, 69}, {"A", 1, 70}, {"B", 0, 71},
	}
	for _, c := range cases {
		got := mxPitchToMidi(mxPitch{Step: c.step, Alter: c.alter, Octave: 4})
		if got != c.midi {
			t.Errorf("%s%+.0f4 → MIDI %d, want %d", c.step, c.alter, got, c.midi)
		}
	}
}

// ── Default fallbacks ─────────────────────────────────────────────────────────

// TestDefaultsNoAttributes verifies that a recording without explicit attributes
// still has sensible defaults.
func TestDefaultsNoAttributes(t *testing.T) {
	// Just a bare measure with one note — no <attributes> at all
	xml := score(measure(1, note("C", 4, 4)))
	r := mustConvert(t, xml)

	// Defaults: 120 BPM, 4/4, C major
	if r.KeySignature != "C" {
		t.Errorf("default KeySignature = %q, want C", r.KeySignature)
	}
	if len(r.TempoMap) == 0 || r.TempoMap[0].BPM != 120 {
		t.Errorf("default TempoMap[0].BPM = %.1f, want 120", r.TempoMap[0].BPM)
	}
	if len(r.TimeSignatureMap) == 0 || r.TimeSignatureMap[0].Value != "4/4" {
		t.Errorf("default TimeSignatureMap[0].Value = %q, want 4/4", r.TimeSignatureMap[0].Value)
	}
}

// ── noteOnEvent helpers ────────────────────────────────────────────────────────

// noteOnEvent returns the first NoteOn event from a Recording.
func noteOnEvent(r *Recording) *RecordedEvent {
	for i := range r.Events {
		if r.Events[i].Cmd == 0x90 {
			return &r.Events[i]
		}
	}
	return nil
}

// noteOnEvents returns all NoteOn events from a Recording.
func noteOnEvents(r *Recording) []RecordedEvent {
	var out []RecordedEvent
	for _, ev := range r.Events {
		if ev.Cmd == 0x90 {
			out = append(out, ev)
		}
	}
	return out
}
