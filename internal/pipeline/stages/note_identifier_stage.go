package stages

import (
	"go.uber.org/zap"

	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/midi"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
)

// NoteIdentifierStage resolves the name of the most recently pressed note.
type NoteIdentifierStage struct {
	logger *zap.Logger
}

func NewNoteIdentifierStage(logger *zap.Logger) *NoteIdentifierStage {
	return &NoteIdentifierStage{logger: logger}
}

func (s *NoteIdentifierStage) Process(ctx *pipelinectx.PipelineContext, _ *store.State) error {
	if len(ctx.PressedNotes) > 0 {
		ctx.CurrentKey = midi.GetNoteName(ctx.PressedNotes[len(ctx.PressedNotes)-1])
		s.logger.Info(constants.MsgStatePressedNotes, zap.String("note", ctx.CurrentKey))
	} else {
		ctx.CurrentKey = ""
		s.logger.Debug(constants.MsgNoNotesPressed)
	}
	return nil
}
