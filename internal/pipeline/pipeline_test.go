package pipeline_test

import (
	"context"
	"errors"
	"testing"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
	"github.com/leandrodaf/pianalyze/internal/pipeline"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// ── Pipeline generic core ─────────────────────────────────────────────────────

type recordingStage struct {
	order  *[]int
	idx    int
	retErr error
}

func (r *recordingStage) Process(ctx *pipelinectx.PipelineContext, _ *store.State) error {
	*r.order = append(*r.order, r.idx)
	return r.retErr
}

func TestPipeline_EmptyPipeline_NoError(t *testing.T) {
	state := store.NewPipelineState()
	p := pipeline.NewPipeline[pipelinectx.PipelineContext, store.State](state)
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	if err := p.Process(ctx); err != nil {
		t.Fatalf("empty pipeline returned error: %v", err)
	}
}

func TestPipeline_StagesRunInOrder(t *testing.T) {
	state := store.NewPipelineState()
	p := pipeline.NewPipeline[pipelinectx.PipelineContext, store.State](state)
	order := make([]int, 0, 3)
	p.AddStage(&recordingStage{order: &order, idx: 1})
	p.AddStage(&recordingStage{order: &order, idx: 2})
	p.AddStage(&recordingStage{order: &order, idx: 3})

	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	if err := p.Process(ctx); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(order) != 3 || order[0] != 1 || order[1] != 2 || order[2] != 3 {
		t.Errorf("wrong execution order: %v", order)
	}
}

func TestPipeline_FirstErrorStopsPipeline(t *testing.T) {
	state := store.NewPipelineState()
	p := pipeline.NewPipeline[pipelinectx.PipelineContext, store.State](state)
	order := make([]int, 0, 3)
	sentErr := errors.New("stage 2 failed")
	p.AddStage(&recordingStage{order: &order, idx: 1})
	p.AddStage(&recordingStage{order: &order, idx: 2, retErr: sentErr})
	p.AddStage(&recordingStage{order: &order, idx: 3}) // must NOT run

	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	err := p.Process(ctx)
	if !errors.Is(err, sentErr) {
		t.Fatalf("expected sentErr, got %v", err)
	}
	if len(order) != 2 {
		t.Errorf("stage 3 should not have run; order = %v", order)
	}
}

type stateCapturingStage struct {
	got **store.State
}

func (s *stateCapturingStage) Process(_ *pipelinectx.PipelineContext, st *store.State) error {
	*s.got = st
	return nil
}

func TestPipeline_StatePassedToAllStages(t *testing.T) {
	state := store.NewPipelineState()
	p := pipeline.NewPipeline[pipelinectx.PipelineContext, store.State](state)

	var got1, got2, got3 *store.State
	p.AddStage(&stateCapturingStage{got: &got1})
	p.AddStage(&stateCapturingStage{got: &got2})
	p.AddStage(&stateCapturingStage{got: &got3})

	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	if err := p.Process(ctx); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i, got := range []*store.State{got1, got2, got3} {
		if got != state {
			t.Errorf("stage %d received wrong state pointer", i+1)
		}
	}
}

// ── PipelineContext ────────────────────────────────────────────────────────────

func TestNewPipelineContext_WrapsEventAndContext(t *testing.T) {
	event := contracts.MIDI{Note: 60, Velocity: 80, Command: byte(contracts.NoteOn), Timestamp: 12345}
	parent := context.Background()
	ctx := pipelinectx.NewPipelineContext(parent, event)

	if ctx.MIDIEvent != event {
		t.Errorf("MIDIEvent = %+v, want %+v", ctx.MIDIEvent, event)
	}
	if ctx.Context != parent {
		t.Error("PipelineContext should embed the parent context")
	}
}

func TestNewPipelineContext_ZeroValueAnalysisFields(t *testing.T) {
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{})
	if ctx.Interval != 0 {
		t.Errorf("Interval = %d, want 0", ctx.Interval)
	}
	if ctx.CurrentKey != "" {
		t.Errorf("CurrentKey = %q, want empty", ctx.CurrentKey)
	}
	if ctx.Chord != "" {
		t.Errorf("Chord = %q, want empty", ctx.Chord)
	}
	if ctx.Inversion != "" {
		t.Errorf("Inversion = %q, want empty", ctx.Inversion)
	}
	if ctx.PressedNotes != nil {
		t.Errorf("PressedNotes = %v, want nil", ctx.PressedNotes)
	}
	if ctx.ChordRoot != 0 {
		t.Errorf("ChordRoot = %d, want 0 (zero value)", ctx.ChordRoot)
	}
}

// ── Processor ─────────────────────────────────────────────────────────────────

func TestProcessor_ProcessNoteOn(t *testing.T) {
	logger := zap.NewNop()
	proc := pipeline.NewProcessor(logger)
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{
		Command:  byte(contracts.NoteOn),
		Note:     60,
		Velocity: 80,
	})

	if err := proc.Process(ctx); err != nil {
		t.Fatalf("Processor.Process returned error: %v", err)
	}
	if len(ctx.PressedNotes) != 1 || ctx.PressedNotes[0] != 60 {
		t.Errorf("PressedNotes = %v, want [60]", ctx.PressedNotes)
	}
	if ctx.CurrentKey == "" {
		t.Error("CurrentKey should be set after full pipeline")
	}
}

func TestProcessor_WithEmitter_Called(t *testing.T) {
	logger := zap.NewNop()
	var emitted *pipelinectx.PipelineContext
	proc := pipeline.NewProcessorWithEmitter(logger, func(ctx *pipelinectx.PipelineContext) {
		emitted = ctx
	})
	ctx := pipelinectx.NewPipelineContext(context.Background(), contracts.MIDI{
		Command:  byte(contracts.NoteOn),
		Note:     64,
		Velocity: 64,
	})

	if err := proc.Process(ctx); err != nil {
		t.Fatalf("Processor.Process returned error: %v", err)
	}
	if emitted == nil {
		t.Error("emitter was not called by Processor")
	}
}
