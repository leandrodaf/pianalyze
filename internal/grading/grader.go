// Package grading computes timing grades for practice notes using wall-clock
// precision from the Go side, avoiding JavaScript's timer imprecision.
package grading

import (
	"math"
	"sync"
	"time"
)

// Timing constants (milliseconds).
const (
	earlyToleranceMs = 500  // student may press up to 500 ms early
	lateToleranceMs  = 300  // student may press up to 300 ms late
	perfectMs        = 90   // delta < 90 ms → perfect
	goodMs           = 200  // delta < 200 ms → good
	leadMs           = 4000 // DEFAULT_LEAD_TIME_SEC * 1000 — must match waterfall-layout.ts
)

// Grade labels match the frontend GradeResult type.
type Grade string

const (
	GradePerfect Grade = "perfect"
	GradeGood    Grade = "good"
	GradeOK      Grade = "ok"
)

// Interval is the serialised form of a frontend NoteInterval (subset of fields
// that the grader actually needs).
type Interval struct {
	Note    int   `json:"note"`
	StartMs int64 `json:"startMs"`
	EndMs   int64 `json:"endMs"`
}

// NoteGrade is emitted as the "grade:result" event payload.
type NoteGrade struct {
	Note    int   `json:"note"`
	Grade   Grade `json:"grade"`
	DeltaMs int64 `json:"deltaMs"` // signed: positive = late, negative = early
}

// HoldResult is emitted as the "grade:hold" event payload.
type HoldResult struct {
	Note         int     `json:"note"`
	HoldFraction float64 `json:"holdFraction"` // 1.0 = full duration held
}

// Grader holds practice session state and grades incoming MIDI events.
// All public methods are safe for concurrent use.
type Grader struct {
	mu        sync.Mutex
	intervals []Interval

	active    bool
	fromMs    int64
	speedMult float64
	playStart time.Time

	// note → practiceMs at press time
	heldNotes map[int]int64
}

// New returns a zeroed Grader ready for use.
func New() *Grader {
	return &Grader{heldNotes: make(map[int]int64)}
}

// Load replaces the set of expected note intervals.
func (g *Grader) Load(ivs []Interval) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.intervals = ivs
}

// Start marks the beginning of playback. fromMs is the recording position where
// playback started; speedMult is the current speed multiplier.
func (g *Grader) Start(fromMs int64, speedMult float64) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.fromMs = fromMs
	g.speedMult = speedMult
	g.playStart = time.Now()
	g.active = true
	clear(g.heldNotes)
}

// Pause records the current position and deactivates grading until Start is
// called again.
func (g *Grader) Pause(posMs int64) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.active = false
	g.fromMs = posMs
	clear(g.heldNotes)
}

// Stop deactivates grading.
func (g *Grader) Stop() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.active = false
	clear(g.heldNotes)
}

// NoteOn grades a note-on event. ok is false when grading is inactive or no
// intervals are loaded.
func (g *Grader) NoteOn(note int) (NoteGrade, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if !g.active || len(g.intervals) == 0 {
		return NoteGrade{}, false
	}

	now := g.practiceMs()
	g.heldNotes[note] = now

	var best *Interval
	var bestAbs int64 = math.MaxInt64
	for i := range g.intervals {
		iv := &g.intervals[i]
		if iv.Note != note {
			continue
		}
		delta := iv.StartMs - now // positive = student pressed early
		earlyDelta := delta       // how many ms early (positive = early)
		lateDelta := -delta       // how many ms late  (positive = late)
		if earlyDelta > earlyToleranceMs || lateDelta > lateToleranceMs {
			continue
		}
		abs := delta
		if abs < 0 {
			abs = -abs
		}
		if abs < bestAbs {
			bestAbs = abs
			best = iv
		}
	}

	if best == nil {
		// Outside tolerance — don't penalise, just ignore
		return NoteGrade{}, false
	}

	delta := best.StartMs - now
	var grade Grade
	switch {
	case bestAbs < perfectMs:
		grade = GradePerfect
	case bestAbs < goodMs:
		grade = GradeGood
	default:
		grade = GradeOK
	}
	return NoteGrade{Note: note, Grade: grade, DeltaMs: delta}, true
}

// NoteOff computes the hold fraction for a note-off event. ok is false when
// the note was not tracked (e.g. pressed before practice started).
func (g *Grader) NoteOff(note int) (HoldResult, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	pressMs, held := g.heldNotes[note]
	if !held {
		return HoldResult{}, false
	}
	delete(g.heldNotes, note)

	now := g.practiceMs()
	heldDuration := now - pressMs

	// Match the interval closest to when the note was pressed
	var best *Interval
	var bestAbs int64 = math.MaxInt64
	for i := range g.intervals {
		iv := &g.intervals[i]
		if iv.Note != note {
			continue
		}
		abs := iv.StartMs - pressMs
		if abs < 0 {
			abs = -abs
		}
		if abs < bestAbs {
			bestAbs = abs
			best = iv
		}
	}

	if best == nil {
		return HoldResult{}, false
	}

	expectedDuration := best.EndMs - best.StartMs
	if expectedDuration <= 0 {
		return HoldResult{}, false
	}

	fraction := float64(heldDuration) / float64(expectedDuration)
	if fraction > 1 {
		fraction = 1
	}
	if fraction < 0 {
		fraction = 0
	}

	return HoldResult{Note: note, HoldFraction: fraction}, true
}

// practiceMs computes the current recording-time position. Must be called with
// mu held.
func (g *Grader) practiceMs() int64 {
	if !g.active {
		return g.fromMs - leadMs
	}
	elapsed := time.Since(g.playStart).Milliseconds()
	return g.fromMs + int64(float64(elapsed)*g.speedMult) - leadMs
}
