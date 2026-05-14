package stages

import (
	"github.com/leandrodaf/midi/sdk/contracts"
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/midi"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// NoteStateUpdaterStage updates the set of pressed notes based on incoming MIDI events.
type NoteStateUpdaterStage struct {
	logger *zap.Logger
}

func NewNoteStateUpdaterStage(logger *zap.Logger) *NoteStateUpdaterStage {
	return &NoteStateUpdaterStage{logger: logger}
}

func (s *NoteStateUpdaterStage) Process(ctx *pipelinectx.PipelineContext, state *store.State) error {
	event := ctx.MIDIEvent

	switch event.Command {
	case byte(contracts.NoteOn):
		if event.Velocity > 0 {
			state.AddNote(int(event.Note))
			s.logger.Info(constants.MsgNoteOnDetected,
				zap.String("note", midi.GetNoteName(int(event.Note))),
				zap.Int("velocity", int(event.Velocity)),
				zap.Int("command", int(event.Command)))
		} else {
			// NoteOn with velocity 0 is treated as NoteOff per the MIDI spec.
			state.RemoveNote(int(event.Note))
			s.logger.Debug(constants.MsgNoteOffViaVelocity0,
				zap.String("note", midi.GetNoteName(int(event.Note))),
				zap.Int("command", int(event.Command)))
		}
	case byte(contracts.NoteOff):
		state.RemoveNote(int(event.Note))
		s.logger.Info(constants.MsgNoteOffDetected,
			zap.String("note", midi.GetNoteName(int(event.Note))),
			zap.Int("command", int(event.Command)))
	default:
		s.logger.Debug(constants.MsgPipelineContextMIDI,
			zap.Int("command", int(event.Command)),
			zap.String("note", midi.GetNoteName(int(event.Note))),
			zap.Int("velocity", int(event.Velocity)))
	}

	return nil
}
