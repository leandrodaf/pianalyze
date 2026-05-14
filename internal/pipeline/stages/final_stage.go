package stages

import (
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// FinalStage logs the fully processed pipeline state and serves as the integration point
// for future server communication.
type FinalStage struct {
	logger *zap.Logger
}

func NewFinalStage(logger *zap.Logger) *FinalStage {
	return &FinalStage{logger: logger}
}

func (s *FinalStage) Process(ctx *pipelinectx.PipelineContext, state *store.State) error {
	s.logger.Info(constants.MsgPipelineContextMIDI,
		zap.Int("command", int(ctx.MIDIEvent.Command)),
		zap.Int("note", int(ctx.MIDIEvent.Note)),
		zap.Int("velocity", int(ctx.MIDIEvent.Velocity)),
		zap.Uint64("timestamp", ctx.MIDIEvent.Timestamp))

	s.logger.Debug(constants.MsgPipelineAdditionalDetails,
		zap.Uint64("interval", ctx.Interval),
		zap.String("currentKey", ctx.CurrentKey),
		zap.String("triad", ctx.Triad),
		zap.String("chord", ctx.Chord),
		zap.String("inversion", ctx.Inversion))

	s.logger.Info(constants.MsgStatePressedNotes, zap.Any("pressedNotes", state.GetPressedNotes()))
	s.logger.Debug(constants.MsgStateLastNoteTime, zap.Uint64("lastNoteTime", state.GetLastNoteTime()))

	return nil
}
