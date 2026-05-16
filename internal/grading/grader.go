// Package grading computes timing grades for practice notes using wall-clock
// precision from the Go side, avoiding JavaScript's timer imprecision.
package grading

import (
	"math"
	"sort"
	"sync"
	"time"
)

// Default timing constants (milliseconds).
const (
	defaultEarlyToleranceMs int64 = 500
	defaultLateToleranceMs  int64 = 300
	defaultPerfectMs        int64 = 90
	defaultGoodMs           int64 = 200
	defaultVelocityTol      int64 = 30
	// leadMs must stay in sync with DEFAULT_LEAD_TIME_SEC in waterfall-layout.ts.
	leadMs int64 = 4000
	// chordWindowMs — intervals whose startMs differ by less than this are treated
	// as members of the same chord (G3).
	chordWindowMs int64 = 50
)

// Grade labels match the frontend GradeResult type.
type Grade string

// Grade constants returned by Grader.Grade and emitted in the grade:result event.
const (
	GradePerfect Grade = "perfect"
	GradeGood    Grade = "good"
	GradeOK      Grade = "ok"
)

// Profile mirrors the frontend Profile type (G1, G2).
// Nil pointer fields mean "use default".
type Profile struct {
	EarlyToleranceMs  *int64 `json:"earlyToleranceMs,omitempty"`
	LateToleranceMs   *int64 `json:"lateToleranceMs,omitempty"`
	PerfectMs         *int64 `json:"perfectMs,omitempty"`
	GoodMs            *int64 `json:"goodMs,omitempty"`
	CheckVelocity     bool   `json:"checkVelocity"`
	VelocityTolerance *int64 `json:"velocityTolerance,omitempty"`
	CheckArticulation bool   `json:"checkArticulation"`
}

// Interval is the serialised form of a frontend NoteInterval (superset of the
// fields that the grader actually needs).
type Interval struct {
	Note         int    `json:"note"`
	StartMs      int64  `json:"startMs"`
	EndMs        int64  `json:"endMs"`
	Dynamic      string `json:"dynamic,omitempty"`
	Hand         string `json:"hand,omitempty"`
	Articulation string `json:"articulation,omitempty"`
	// ExpectedVel is the MIDI velocity the score prescribes (0 = not specified).
	// Derived from the dynamic marking via dynamicToVelocity on the frontend.
	ExpectedVel int `json:"expectedVel,omitempty"`
}

// NoteGrade is emitted as the "grade:result" event payload.
type NoteGrade struct {
	Note    int   `json:"note"`
	Grade   Grade `json:"grade"`
	DeltaMs int64 `json:"deltaMs"` // positive = late, negative = early

	// Chord info (G3) — only non-zero when the note belongs to a multi-note chord.
	ChordDone  bool    `json:"chordDone,omitempty"`
	ChordFrac  float64 `json:"chordFrac,omitempty"`
	ChordTotal int     `json:"chordTotal,omitempty"`
	ChordHit   int     `json:"chordHit,omitempty"`
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
	profile   Profile

	active    bool
	fromMs    int64
	speedMult float64
	playStart time.Time

	// note → practiceMs at the moment it was pressed
	heldNotes map[int]int64
}

// New returns a zeroed Grader ready for use.
func New() *Grader {
	return &Grader{heldNotes: make(map[int]int64)}
}

// Load replaces the set of expected note intervals. Intervals are sorted by
// StartMs so binary search can be used in hot paths.
func (g *Grader) Load(ivs []Interval) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.intervals = ivs
	sort.Slice(g.intervals, func(i, j int) bool {
		return g.intervals[i].StartMs < g.intervals[j].StartMs
	})
}

// LoadProfile replaces the active grading profile (G1, G2).
// May be called at any time; takes effect on the next event.
func (g *Grader) LoadProfile(p Profile) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.profile = p
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

// Stop deactivates grading entirely.
func (g *Grader) Stop() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.active = false
	clear(g.heldNotes)
}

// NoteOn grades a note-on event. vel is the student's actual MIDI velocity,
// used when the active Profile has CheckVelocity enabled (G2).
// ok is false when grading is inactive or no matching interval is found.
func (g *Grader) NoteOn(note int, vel byte) (NoteGrade, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if !g.active || len(g.intervals) == 0 {
		return NoteGrade{}, false
	}

	early := derefOr(g.profile.EarlyToleranceMs, defaultEarlyToleranceMs)
	late := derefOr(g.profile.LateToleranceMs, defaultLateToleranceMs)
	perf := derefOr(g.profile.PerfectMs, defaultPerfectMs)
	good := derefOr(g.profile.GoodMs, defaultGoodMs)

	now := g.practiceMs()
	g.heldNotes[note] = now

	var best *Interval
	var bestAbs int64 = math.MaxInt64
	// Intervals are sorted by StartMs; binary search to the candidate window.
	lo := now - late
	hi := now + early
	start := sort.Search(len(g.intervals), func(i int) bool { return g.intervals[i].StartMs >= lo })
	for i := start; i < len(g.intervals) && g.intervals[i].StartMs <= hi; i++ {
		iv := &g.intervals[i]
		if iv.Note != note {
			continue
		}
		abs := absInt64(iv.StartMs - now)
		if abs < bestAbs {
			bestAbs = abs
			best = iv
		}
	}

	if best == nil {
		// Outside tolerance — don't penalise, just ignore.
		return NoteGrade{}, false
	}

	delta := best.StartMs - now

	var grade Grade
	switch {
	case bestAbs < perf:
		grade = GradePerfect
	case bestAbs < good:
		grade = GradeGood
	default:
		grade = GradeOK
	}

	// Velocity / dynamic check (G2): demote perfect → good when velocity is wrong.
	if g.profile.CheckVelocity && best.ExpectedVel > 0 {
		velTol := derefOr(g.profile.VelocityTolerance, defaultVelocityTol)
		diff := absInt64(int64(vel) - int64(best.ExpectedVel))
		if diff > velTol && grade == GradePerfect {
			grade = GradeGood
		}
	}

	ng := NoteGrade{Note: note, Grade: grade, DeltaMs: delta}

	// Chord completion info (G3).
	if total, hit := g.chordInfo(best.StartMs); total > 1 {
		ng.ChordTotal = total
		ng.ChordHit = hit
		ng.ChordDone = hit == total
		ng.ChordFrac = float64(hit) / float64(total)
	}

	return ng, true
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

	var best *Interval
	var bestAbs int64 = math.MaxInt64
	// Intervals are sorted by StartMs; narrow the scan to the press-time window.
	lo := pressMs - defaultEarlyToleranceMs
	hi := pressMs + defaultLateToleranceMs
	startIdx := sort.Search(len(g.intervals), func(i int) bool { return g.intervals[i].StartMs >= lo })
	for i := startIdx; i < len(g.intervals) && g.intervals[i].StartMs <= hi; i++ {
		iv := &g.intervals[i]
		if iv.Note != note {
			continue
		}
		abs := absInt64(iv.StartMs - pressMs)
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

// chordInfo returns (total, hit) for the chord whose representative startMs is
// within chordWindowMs of chordMs. total > 1 indicates the interval belongs to
// a multi-note chord. hit counts how many of those notes are currently in
// heldNotes (i.e. just pressed or still held). Must be called with mu held.
func (g *Grader) chordInfo(chordMs int64) (total, hit int) {
	lo := chordMs - chordWindowMs
	hi := chordMs + chordWindowMs
	start := sort.Search(len(g.intervals), func(i int) bool { return g.intervals[i].StartMs >= lo })
	for i := start; i < len(g.intervals) && g.intervals[i].StartMs <= hi; i++ {
		total++
		if _, ok := g.heldNotes[g.intervals[i].Note]; ok {
			hit++
		}
	}
	return
}

// derefOr returns *p if p is non-nil, otherwise def.
func derefOr(p *int64, def int64) int64 {
	if p != nil {
		return *p
	}
	return def
}

func absInt64(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}
