// Package stages contains the concrete Stage implementations for the pianalyze pipeline.
package stages

import (
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/midi"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/leandrodaf/pianalyze/internal/pipeline/store"
	"go.uber.org/zap"
)

// ChordIdentifierStage identifies the chord and triad based on the currently pressed notes.
type ChordIdentifierStage struct {
	logger *zap.Logger
}

// NewChordIdentifierStage creates a new ChordIdentifierStage.
func NewChordIdentifierStage(logger *zap.Logger) *ChordIdentifierStage {
	return &ChordIdentifierStage{logger: logger}
}

// Process identifies the current chord and triad. Unidentified chords are common during live
// performance (e.g., while a chord is still being formed), so they produce no warning.
func (s *ChordIdentifierStage) Process(ctx *pipelinectx.PipelineContext, _ *store.State) error {
	chordName, inversionName, rootClass, chordFound := midi.GetChordName(ctx.PressedNotes)
	if chordFound {
		ctx.Chord = chordName
		ctx.Inversion = inversionName
		ctx.ChordRoot = rootClass
		s.logger.Info(constants.MsgChordAndInversionDetected,
			zap.String("chord", chordName),
			zap.String("inversion", inversionName))

		if midi.IsTriad(chordName) {
			ctx.Triad = chordName
			s.logger.Info(constants.MsgTriadIdentified, zap.String("triad", chordName))
		} else {
			ctx.Triad = constants.NonTriad
			s.logger.Debug(constants.MsgNotTriad)
		}
	} else {
		ctx.Chord = constants.UnknownChord
		ctx.Inversion = ""
		ctx.ChordRoot = -1
		ctx.Triad = constants.UnknownTriad
		s.logger.Debug(constants.MsgUnknownChord)
	}
	return nil
}
