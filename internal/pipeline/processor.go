package pipeline

import (
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/stages"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// Processor manages the execution of the MIDI event pipeline.
type Processor struct {
	pipeline *Pipeline[pipelinectx.PipelineContext, store.State]
}

// NewProcessor initializes a Processor with the five analysis stages in the required order.
func NewProcessor(logger *zap.Logger) *Processor {
	return newProcessor(logger, stages.NewFinalStage(logger))
}

// NewProcessorWithEmitter creates a Processor whose FinalStage calls emitter after each event.
// Used by the Wails app to push MIDIState to the frontend.
func NewProcessorWithEmitter(logger *zap.Logger, emitter func(ctx *pipelinectx.PipelineContext)) *Processor {
	return newProcessor(logger, stages.NewFinalStageWithEmitter(logger, emitter))
}

func newProcessor(logger *zap.Logger, finalStage *stages.FinalStage) *Processor {
	state := store.NewPipelineState()
	p := NewPipeline[pipelinectx.PipelineContext, store.State](state)

	// Order matters: state must be updated before intervals and chords are computed.
	p.AddStage(stages.NewNoteStateUpdaterStage(logger))
	p.AddStage(stages.NewIntervalCalculatorStage(logger))
	p.AddStage(stages.NewNoteIdentifierStage(logger))
	p.AddStage(stages.NewChordIdentifierStage(logger))
	p.AddStage(finalStage)

	return &Processor{pipeline: p}
}

// Process runs the pipeline for the given MIDI event context.
func (proc *Processor) Process(ctx *pipelinectx.PipelineContext) error {
	return proc.pipeline.Process(ctx)
}
