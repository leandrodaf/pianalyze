package grading_test

import (
	"sync"
	"testing"
	"time"

	"github.com/leandrodaf/pianalyze/internal/grading"
)

// ptr returns a pointer to an int64 literal.
func ptr(v int64) *int64 { return &v }

// defaultIntervals returns a simple set of non-overlapping note intervals,
// all starting near zero so tests can call Start(leadMs, 1.0) and immediately
// call NoteOn with minimal elapsed time.
//
// leadMs = 4000, so practiceMs ≈ 0 right after Start(4000, 1.0).
const testLeadMs int64 = 4000

func singleInterval(note int, startMs, endMs int64) []grading.Interval {
	return []grading.Interval{{Note: note, StartMs: startMs, EndMs: endMs}}
}

// startGrader starts a grader with fromMs=leadMs so practiceMs≈0 at the moment
// of the call, which matches notes at StartMs=0.
func startGrader(g *grading.Grader) {
	g.Start(testLeadMs, 1.0)
}

// ── Inactive grader ──────────────────────────────────────────────────────────

func TestNoteOn_InactiveGrader_ReturnsFalse(t *testing.T) {
	g := grading.New()
	g.Load(singleInterval(60, 0, 500))
	_, ok := g.NoteOn(60, 80)
	if ok {
		t.Error("inactive grader should return ok=false")
	}
}

func TestNoteOff_InactiveGrader_ReturnsFalse(t *testing.T) {
	g := grading.New()
	g.Load(singleInterval(60, 0, 500))
	startGrader(g)
	g.Stop()
	_, ok := g.NoteOff(60)
	if ok {
		t.Error("stopped grader should return ok=false for NoteOff")
	}
}

func TestNoteOn_EmptyIntervals_ReturnsFalse(t *testing.T) {
	g := grading.New()
	startGrader(g)
	_, ok := g.NoteOn(60, 80)
	if ok {
		t.Error("empty intervals: NoteOn should return ok=false")
	}
}

// ── Grade thresholds ─────────────────────────────────────────────────────────

// startWithIntervals loads a note at the given startMs, starts grading at the
// corresponding fromMs so that practiceMs ≈ startMs right at the time of call,
// and returns the grader ready for an immediate NoteOn.
//
// Because NoteOn runs with µs latency, this is reliable for startMs near 0.
func TestNoteOn_PerfectGrade(t *testing.T) {
	g := grading.New()
	// Note at startMs=0; practiceMs≈0 right after Start(leadMs,1.0)
	g.Load(singleInterval(60, 0, 500))
	startGrader(g)

	result, ok := g.NoteOn(60, 64)
	if !ok {
		t.Fatal("NoteOn should match note at startMs=0")
	}
	if result.Grade != grading.GradePerfect {
		t.Errorf("expected Perfect within <%dms of startMs, got %s (delta %dms)", 90, result.Grade, result.DeltaMs)
	}
}

func TestNoteOn_GoodGrade(t *testing.T) {
	g := grading.New()
	// Note at startMs=120: within Good (200ms) but outside Perfect (90ms)
	g.Load(singleInterval(60, 120, 600))
	startGrader(g) // practiceMs ≈ 0, so delta ≈ 120ms

	result, ok := g.NoteOn(60, 64)
	if !ok {
		t.Fatal("NoteOn should match note at startMs=120 from practiceMs≈0 (early)")
	}
	if result.Grade != grading.GradeGood {
		t.Errorf("expected Good for delta≈120ms, got %s", result.Grade)
	}
}

func TestNoteOn_OKGrade(t *testing.T) {
	g := grading.New()
	// Note at startMs=250: within OK (>200ms, <earlyTolerance 500ms) but outside Good
	g.Load(singleInterval(60, 250, 800))
	startGrader(g)

	result, ok := g.NoteOn(60, 64)
	if !ok {
		t.Fatal("NoteOn should match note at startMs=250 from practiceMs≈0")
	}
	if result.Grade != grading.GradeOK {
		t.Errorf("expected OK for delta≈250ms, got %s", result.Grade)
	}
}

func TestNoteOn_OutsideTolerance_ReturnsFalse(t *testing.T) {
	g := grading.New()
	// Note at startMs=1000: well outside earlyTolerance (500ms) + lateToleranceMs (300ms)
	g.Load(singleInterval(60, 1000, 1500))
	startGrader(g)

	_, ok := g.NoteOn(60, 64)
	if ok {
		t.Error("note at startMs=1000 from practiceMs≈0 should be outside tolerance")
	}
}

// ── Velocity / dynamic check (G2) ────────────────────────────────────────────

func TestNoteOn_VelocityDemotion_PerfectToGood(t *testing.T) {
	g := grading.New()
	g.Load([]grading.Interval{{Note: 60, StartMs: 0, EndMs: 500, ExpectedVel: 64}})
	g.LoadProfile(grading.Profile{
		CheckVelocity:     true,
		VelocityTolerance: ptr(15),
	})
	startGrader(g)

	// vel=20 vs expected=64 → diff=44 > tol=15 → demote Perfect → Good
	result, ok := g.NoteOn(60, 20)
	if !ok {
		t.Fatal("NoteOn should match")
	}
	if result.Grade != grading.GradeGood {
		t.Errorf("velocity demote: expected Good, got %s", result.Grade)
	}
}

func TestNoteOn_VelocityWithinTolerance_KeepsPerfect(t *testing.T) {
	g := grading.New()
	g.Load([]grading.Interval{{Note: 60, StartMs: 0, EndMs: 500, ExpectedVel: 64}})
	g.LoadProfile(grading.Profile{
		CheckVelocity:     true,
		VelocityTolerance: ptr(30),
	})
	startGrader(g)

	result, ok := g.NoteOn(60, 60) // diff=4, within 30
	if !ok {
		t.Fatal("NoteOn should match")
	}
	if result.Grade != grading.GradePerfect {
		t.Errorf("within velocity tolerance: expected Perfect, got %s", result.Grade)
	}
}

// ── Chord completion (G3) ─────────────────────────────────────────────────────

func TestNoteOn_ChordCompletion(t *testing.T) {
	g := grading.New()
	// Three notes in the same chord window (startMs within 50ms of each other)
	g.Load([]grading.Interval{
		{Note: 60, StartMs: 0, EndMs: 500},
		{Note: 64, StartMs: 10, EndMs: 500},
		{Note: 67, StartMs: 20, EndMs: 500},
	})
	startGrader(g)

	r1, ok1 := g.NoteOn(60, 80)
	r2, ok2 := g.NoteOn(64, 80)
	r3, ok3 := g.NoteOn(67, 80)

	if !ok1 || !ok2 || !ok3 {
		t.Fatal("all chord notes should be graded")
	}

	// Third note should complete the chord
	if r3.ChordTotal != 3 {
		t.Errorf("ChordTotal = %d, want 3", r3.ChordTotal)
	}
	if !r3.ChordDone {
		t.Error("ChordDone should be true after all three notes hit")
	}
	if r3.ChordFrac != 1.0 {
		t.Errorf("ChordFrac = %f, want 1.0", r3.ChordFrac)
	}

	_ = r1
	_ = r2
}

func TestNoteOn_PartialChord(t *testing.T) {
	g := grading.New()
	g.Load([]grading.Interval{
		{Note: 60, StartMs: 0, EndMs: 500},
		{Note: 64, StartMs: 10, EndMs: 500},
		{Note: 67, StartMs: 20, EndMs: 500},
	})
	startGrader(g)

	r1, ok := g.NoteOn(60, 80)
	if !ok {
		t.Fatal("first chord note should match")
	}
	if r1.ChordTotal != 3 {
		t.Errorf("ChordTotal = %d, want 3", r1.ChordTotal)
	}
	if r1.ChordDone {
		t.Error("ChordDone should be false after only first note")
	}
	if r1.ChordFrac >= 1.0 {
		t.Errorf("ChordFrac = %f, should be < 1.0", r1.ChordFrac)
	}
}

// ── NoteOff hold fraction ─────────────────────────────────────────────────────

func TestNoteOff_FullHold(t *testing.T) {
	g := grading.New()
	g.Load(singleInterval(60, 0, 200))
	startGrader(g)

	g.NoteOn(60, 80) //nolint:errcheck
	time.Sleep(220 * time.Millisecond) // hold beyond expected duration

	result, ok := g.NoteOff(60)
	if !ok {
		t.Fatal("NoteOff should return ok for a tracked note")
	}
	if result.HoldFraction != 1.0 {
		t.Errorf("HoldFraction = %f, want 1.0 (clamped)", result.HoldFraction)
	}
}

func TestNoteOff_PartialHold(t *testing.T) {
	g := grading.New()
	// Interval: 200ms. We hold ~100ms → fraction ≈ 0.5
	g.Load(singleInterval(60, 0, 200))
	startGrader(g)

	g.NoteOn(60, 80) //nolint:errcheck
	time.Sleep(100 * time.Millisecond)

	result, ok := g.NoteOff(60)
	if !ok {
		t.Fatal("NoteOff should return ok")
	}
	// Allow ±30ms jitter → fraction in [0.35, 0.65]
	if result.HoldFraction < 0.35 || result.HoldFraction > 0.85 {
		t.Errorf("HoldFraction = %f, expected ~0.5 with ±30ms tolerance", result.HoldFraction)
	}
}

func TestNoteOff_UntrackedNote_ReturnsFalse(t *testing.T) {
	g := grading.New()
	g.Load(singleInterval(60, 0, 500))
	startGrader(g)

	_, ok := g.NoteOff(64) // 64 was never pressed
	if ok {
		t.Error("NoteOff on untracked note should return false")
	}
}

// ── Pause / Stop / Start lifecycle ───────────────────────────────────────────

func TestPause_DeactivatesGrading(t *testing.T) {
	g := grading.New()
	g.Load(singleInterval(60, 0, 500))
	startGrader(g)
	g.Pause(0)

	_, ok := g.NoteOn(60, 80)
	if ok {
		t.Error("Pause should deactivate grading")
	}
}

func TestStop_DeactivatesGrading(t *testing.T) {
	g := grading.New()
	g.Load(singleInterval(60, 0, 500))
	startGrader(g)
	g.Stop()

	_, ok := g.NoteOn(60, 80)
	if ok {
		t.Error("Stop should deactivate grading")
	}
}

func TestStart_AfterPause_Reactivates(t *testing.T) {
	g := grading.New()
	g.Load(singleInterval(60, 0, 500))
	startGrader(g)
	g.Pause(0)
	startGrader(g) // resume

	_, ok := g.NoteOn(60, 80)
	if !ok {
		t.Error("Start after Pause should reactivate grading")
	}
}

// ── Concurrency ───────────────────────────────────────────────────────────────

func TestGrader_ConcurrentNoteOn(_ *testing.T) {
	g := grading.New()
	ivs := make([]grading.Interval, 50)
	for i := range ivs {
		ivs[i] = grading.Interval{Note: i, StartMs: 0, EndMs: 500}
	}
	g.Load(ivs)
	startGrader(g)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(note int) {
			defer wg.Done()
			g.NoteOn(note, 80) //nolint:errcheck
		}(i)
	}
	wg.Wait()
}
