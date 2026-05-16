package stages_test

import (
	"context"
	"testing"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/stages"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// nopLogger returns a no-op Zap logger to keep test output clean.
func nopLogger() *zap.Logger { return zap.NewNop() }

// newCtx builds a minimal PipelineContext with the given MIDI event fields.
func newCtx(cmd contracts.MIDICommand, note, velocity byte, ts uint64) *pipelinectx.PipelineContext {
	return pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{
		Command:   byte(cmd),
		Note:      note,
		Velocity:  velocity,
		Timestamp: ts,
	})
}

// ── NoteStateUpdaterStage ──────────────────────────────────────────────────────

func TestNoteStateUpdater_NoteOn_AddsNote(t *testing.T) {
	s := stages.NewNoteStateUpdaterStage(nopLogger())
	state := store.NewPipelineState()
	ctx := newCtx(contracts.NoteOn, 60, 80, 0)

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}

	if len(ctx.PressedNotes) != 1 || ctx.PressedNotes[0] != 60 {
		t.Errorf("PressedNotes = %v, want [60]", ctx.PressedNotes)
	}
	if ctx.Velocity != 80 {
		t.Errorf("Velocity = %d, want 80", ctx.Velocity)
	}
	if ctx.Dynamic.Label() == "" {
		t.Error("Dynamic should be non-empty for NoteOn with velocity > 0")
	}
}

func TestNoteStateUpdater_NoteOn_Velocity0_RemovesNote(t *testing.T) {
	s := stages.NewNoteStateUpdaterStage(nopLogger())
	state := store.NewPipelineState()
	state.AddNote(60)

	ctx := newCtx(contracts.NoteOn, 60, 0, 0)
	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}

	if len(ctx.PressedNotes) != 0 {
		t.Errorf("NoteOn vel=0 should act as NoteOff; PressedNotes = %v", ctx.PressedNotes)
	}
	if ctx.Velocity != 0 {
		t.Errorf("Velocity should be 0 for NoteOn vel=0, got %d", ctx.Velocity)
	}
}

func TestNoteStateUpdater_NoteOff_RemovesNote(t *testing.T) {
	s := stages.NewNoteStateUpdaterStage(nopLogger())
	state := store.NewPipelineState()
	state.AddNote(60)
	state.AddNote(64)

	ctx := newCtx(contracts.NoteOff, 60, 0, 0)
	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}

	if len(ctx.PressedNotes) != 1 || ctx.PressedNotes[0] != 64 {
		t.Errorf("PressedNotes = %v, want [64]", ctx.PressedNotes)
	}
}

func TestNoteStateUpdater_MultipleNotes_Snapshot(t *testing.T) {
	s := stages.NewNoteStateUpdaterStage(nopLogger())
	state := store.NewPipelineState()

	for _, note := range []byte{60, 64, 67} {
		ctx := newCtx(contracts.NoteOn, note, 64, 0)
		if err := s.Process(ctx, state); err != nil {
			t.Fatalf("Process returned error: %v", err)
		}
	}

	ctx := newCtx(contracts.NoteOn, 71, 64, 0)
	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if len(ctx.PressedNotes) != 4 {
		t.Errorf("expected 4 pressed notes, got %d: %v", len(ctx.PressedNotes), ctx.PressedNotes)
	}
}

func TestNoteStateUpdater_ControlChange_NoNoteChange(t *testing.T) {
	s := stages.NewNoteStateUpdaterStage(nopLogger())
	state := store.NewPipelineState()
	state.AddNote(60)

	ctx := newCtx(contracts.MIDICommand(0xB0), 64, 127, 0)
	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if len(ctx.PressedNotes) != 1 {
		t.Errorf("CC should not change pressed notes; got %v", ctx.PressedNotes)
	}
}

// ── IntervalCalculatorStage ───────────────────────────────────────────────────

func TestIntervalCalculator_FirstEvent_ZeroInterval(t *testing.T) {
	s := stages.NewIntervalCalculatorStage(nopLogger())
	state := store.NewPipelineState()
	ctx := newCtx(contracts.NoteOn, 60, 80, 1000)

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if ctx.Interval != 0 {
		t.Errorf("first event interval = %d, want 0", ctx.Interval)
	}
}

func TestIntervalCalculator_SecondEvent_ComputesDelta(t *testing.T) {
	s := stages.NewIntervalCalculatorStage(nopLogger())
	state := store.NewPipelineState()

	ctx1 := newCtx(contracts.NoteOn, 60, 80, 1000)
	if err := s.Process(ctx1, state); err != nil {
		t.Fatalf("first Process: %v", err)
	}

	ctx2 := newCtx(contracts.NoteOn, 64, 80, 1500)
	if err := s.Process(ctx2, state); err != nil {
		t.Fatalf("second Process: %v", err)
	}

	if ctx2.Interval != 500 {
		t.Errorf("interval = %d, want 500", ctx2.Interval)
	}
}

func TestIntervalCalculator_UpdatesLastTime(t *testing.T) {
	s := stages.NewIntervalCalculatorStage(nopLogger())
	state := store.NewPipelineState()

	s.Process(newCtx(contracts.NoteOn, 60, 80, 100), state) //nolint:errcheck
	s.Process(newCtx(contracts.NoteOn, 64, 80, 200), state) //nolint:errcheck

	ctx := newCtx(contracts.NoteOn, 67, 80, 350)
	s.Process(ctx, state) //nolint:errcheck

	if ctx.Interval != 150 {
		t.Errorf("interval = %d, want 150 (350-200)", ctx.Interval)
	}
}

// ── NoteIdentifierStage ───────────────────────────────────────────────────────

func TestNoteIdentifier_WithPressedNotes_SetsCurrentKey(t *testing.T) {
	s := stages.NewNoteIdentifierStage(nopLogger())
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	ctx.PressedNotes = []int{60} // C4

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if ctx.CurrentKey == "" {
		t.Error("CurrentKey should be set when PressedNotes is non-empty")
	}
}

func TestNoteIdentifier_NoPressedNotes_EmptyCurrentKey(t *testing.T) {
	s := stages.NewNoteIdentifierStage(nopLogger())
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	ctx.PressedNotes = nil

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if ctx.CurrentKey != "" {
		t.Errorf("CurrentKey = %q, want empty when no notes pressed", ctx.CurrentKey)
	}
}

func TestNoteIdentifier_UsesLastPressedNote(t *testing.T) {
	s := stages.NewNoteIdentifierStage(nopLogger())
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	ctx.PressedNotes = []int{60, 64, 67} // last = G4

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	// GetNoteName(67) should be "G4"
	if ctx.CurrentKey != "G4" {
		t.Errorf("CurrentKey = %q, want G4 (MIDI 67)", ctx.CurrentKey)
	}
}

// ── ChordIdentifierStage ─────────────────────────────────────────────────────

func TestChordIdentifier_NoPressedNotes_UnknownChord(t *testing.T) {
	s := stages.NewChordIdentifierStage(nopLogger())
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	ctx.PressedNotes = nil

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if ctx.Chord != constants.UnknownChord {
		t.Errorf("Chord = %q, want %q", ctx.Chord, constants.UnknownChord)
	}
	if ctx.ChordRoot != -1 {
		t.Errorf("ChordRoot = %d, want -1 when no chord", ctx.ChordRoot)
	}
}

func TestChordIdentifier_MajorTriad_Detected(t *testing.T) {
	s := stages.NewChordIdentifierStage(nopLogger())
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	ctx.PressedNotes = []int{60, 64, 67} // C4, E4, G4 — C Major

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if ctx.Chord == constants.UnknownChord {
		t.Error("C-E-G should be identified as a chord")
	}
	if ctx.Triad == constants.UnknownTriad || ctx.Triad == constants.NonTriad {
		t.Errorf("C major triad should have Triad set; got %q", ctx.Triad)
	}
	if ctx.Inversion == "" {
		t.Error("Inversion should be non-empty for a detected chord")
	}
}

func TestChordIdentifier_7thChord_NotTriad(t *testing.T) {
	s := stages.NewChordIdentifierStage(nopLogger())
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	ctx.PressedNotes = []int{60, 64, 67, 70} // C-E-G-Bb — C dominant 7th

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if ctx.Chord == constants.UnknownChord {
		t.Error("C7 should be identified as a chord")
	}
	if ctx.Triad != constants.NonTriad {
		t.Errorf("7th chord Triad = %q, want NonTriad", ctx.Triad)
	}
}

func TestChordIdentifier_SingleNote_UnknownChord(t *testing.T) {
	s := stages.NewChordIdentifierStage(nopLogger())
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	ctx.PressedNotes = []int{60}

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("Process returned error: %v", err)
	}
	if ctx.Chord != constants.UnknownChord {
		t.Errorf("single note Chord = %q, want %q", ctx.Chord, constants.UnknownChord)
	}
}

// ── FinalStage ───────────────────────────────────────────────────────────────

func TestFinalStage_WithoutEmitter_NoError(t *testing.T) {
	s := stages.NewFinalStage(nopLogger())
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("FinalStage.Process returned error: %v", err)
	}
}

func TestFinalStage_WithEmitter_Called(t *testing.T) {
	called := false
	s := stages.NewFinalStageWithEmitter(nopLogger(), func(ctx *pipelinectx.PipelineContext) {
		called = true
	})
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})

	if err := s.Process(ctx, state); err != nil {
		t.Fatalf("FinalStage.Process returned error: %v", err)
	}
	if !called {
		t.Error("emitter was not called")
	}
}

func TestFinalStage_WithEmitter_ReceivesContext(t *testing.T) {
	var got *pipelinectx.PipelineContext
	s := stages.NewFinalStageWithEmitter(nopLogger(), func(ctx *pipelinectx.PipelineContext) {
		got = ctx
	})
	state := store.NewPipelineState()
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{Note: 60})
	ctx.Chord = "Major"

	s.Process(ctx, state) //nolint:errcheck

	if got == nil || got.Chord != "Major" || got.MIDIEvent.Note != 60 {
		t.Errorf("emitter received wrong context: %+v", got)
	}
}
