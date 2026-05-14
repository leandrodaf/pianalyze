// Package pipelinectx defines the per-event context shared across all pipeline stages.
package pipelinectx

import (
	"context"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
)

// PipelineContext carries a MIDI event and the musical analysis accumulated by each stage.
// String fields use empty string to signal "not determined yet".
// PressedNotes is a snapshot captured once by NoteStateUpdaterStage and shared by all
// subsequent stages — eliminates redundant copies within a single event's pipeline run.
type PipelineContext struct {
	context.Context
	MIDIEvent    contracts.MIDI
	Interval     uint64
	CurrentKey   string
	Triad        string
	Chord        string
	Inversion    string
	PressedNotes []int
}

// NewPipelineContext creates a PipelineContext wrapping the given parent context and MIDI event.
func NewPipelineContext(ctx context.Context, event contracts.MIDI) *PipelineContext {
	return &PipelineContext{
		Context:   ctx,
		MIDIEvent: event,
	}
}
