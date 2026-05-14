package stages

import (
	"github.com/leandrodaf/midi/sdk/contracts"
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/midi"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// NoteStateUpdaterStage updates the set of pressed notes and captures a snapshot into the
// context so all subsequent stages share one consistent copy without extra copies.
type NoteStateUpdaterStage struct {
	logger *zap.Logger
}

// NewNoteStateUpdaterStage creates a new NoteStateUpdaterStage.
func NewNoteStateUpdaterStage(logger *zap.Logger) *NoteStateUpdaterStage {
	return &NoteStateUpdaterStage{logger: logger}
}

// Process implements Stage.
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

	// Snapshot taken once here; NoteIdentifier, ChordIdentifier and FinalStage read this
	// field directly instead of calling GetPressedNotes() again.
	ctx.PressedNotes = state.GetPressedNotes()
	return nil
}
