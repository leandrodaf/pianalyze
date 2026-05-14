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
	state := store.NewPipelineState()
	p := NewPipeline[pipelinectx.PipelineContext, store.State](state)

	// Order matters: state must be updated before intervals and chords are computed.
	p.AddStage(stages.NewNoteStateUpdaterStage(logger))
	p.AddStage(stages.NewIntervalCalculatorStage(logger))
	p.AddStage(stages.NewNoteIdentifierStage(logger))
	p.AddStage(stages.NewChordIdentifierStage(logger))
	p.AddStage(stages.NewFinalStage(logger))

	return &Processor{pipeline: p}
}

// Process runs the pipeline for the given MIDI event context.
func (proc *Processor) Process(ctx *pipelinectx.PipelineContext) error {
	_, err := proc.pipeline.Process(ctx)
	return err
}
