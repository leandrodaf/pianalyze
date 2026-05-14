package stages

import (
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// FinalStage logs the fully-processed analysis and optionally calls an emitter
// that pushes state to the frontend (used in Wails mode).
type FinalStage struct {
	logger  *zap.Logger
	emitter func(ctx *pipelinectx.PipelineContext)
}

// NewFinalStage creates a FinalStage that only logs (CLI / test mode).
func NewFinalStage(logger *zap.Logger) *FinalStage {
	return &FinalStage{logger: logger}
}

// NewFinalStageWithEmitter creates a FinalStage that logs and calls emitter after each event.
func NewFinalStageWithEmitter(logger *zap.Logger, emitter func(ctx *pipelinectx.PipelineContext)) *FinalStage {
	return &FinalStage{logger: logger, emitter: emitter}
}

// Process implements Stage.
func (s *FinalStage) Process(ctx *pipelinectx.PipelineContext, _ *store.State) error {
	s.logger.Debug(constants.MsgPipelineAdditionalDetails,
		zap.Uint64("interval", ctx.Interval),
		zap.String("currentKey", ctx.CurrentKey),
		zap.Uint8("velocity", ctx.Velocity),
		zap.String("dynamic", ctx.Dynamic.Label()),
		zap.String("triad", ctx.Triad),
		zap.String("chord", ctx.Chord),
		zap.String("inversion", ctx.Inversion),
		zap.Any("pressedNotes", ctx.PressedNotes))

	if s.emitter != nil {
		s.emitter(ctx)
	}

	return nil
}
