package stages

import (
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// IntervalCalculatorStage computes the time elapsed since the previous MIDI event.
type IntervalCalculatorStage struct {
	logger *zap.Logger
}

// NewIntervalCalculatorStage creates a new IntervalCalculatorStage.
func NewIntervalCalculatorStage(logger *zap.Logger) *IntervalCalculatorStage {
	return &IntervalCalculatorStage{logger: logger}
}

// Process implements Stage.
func (s *IntervalCalculatorStage) Process(ctx *pipelinectx.PipelineContext, state *store.State) error {
	currentTime := ctx.MIDIEvent.Timestamp
	lastTime := state.GetLastNoteTime()

	if lastTime > 0 {
		ctx.Interval = currentTime - lastTime
		s.logger.Info(constants.MsgIntervalCalculated, zap.Uint64("interval", ctx.Interval))
	} else {
		ctx.Interval = 0
		s.logger.Debug(constants.MsgNoPreviousEvent)
	}

	state.UpdateLastNoteTime(currentTime)
	return nil
}
