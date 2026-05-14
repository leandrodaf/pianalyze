package stages

import (
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// FinalStage logs the fully-processed analysis and is the integration point
// for future server communication and the lesson validation system.
type FinalStage struct {
	logger *zap.Logger
}

func NewFinalStage(logger *zap.Logger) *FinalStage {
	return &FinalStage{logger: logger}
}

func (s *FinalStage) Process(ctx *pipelinectx.PipelineContext, _ *store.State) error {
	s.logger.Debug(constants.MsgPipelineAdditionalDetails,
		zap.Uint64("interval", ctx.Interval),
		zap.String("currentKey", ctx.CurrentKey),
		zap.String("triad", ctx.Triad),
		zap.String("chord", ctx.Chord),
		zap.String("inversion", ctx.Inversion),
		zap.Any("pressedNotes", ctx.PressedNotes))

	return nil
}
