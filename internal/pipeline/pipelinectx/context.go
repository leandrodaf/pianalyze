package pipelinectx

import (
	"context"

	"github.com/leandrodaf/midi/sdk/contracts"
)

// PipelineContext carries a MIDI event and the musical analysis accumulated by each stage.
// String fields use empty string to signal "not determined yet".
type PipelineContext struct {
	context.Context
	MIDIEvent  contracts.MIDI
	Interval   uint64
	CurrentKey string
	Triad      string
	Chord      string
	Inversion  string
}

// NewPipelineContext creates a PipelineContext wrapping the given parent context and MIDI event.
func NewPipelineContext(ctx context.Context, event contracts.MIDI) *PipelineContext {
	return &PipelineContext{
		Context:   ctx,
		MIDIEvent: event,
	}
}
