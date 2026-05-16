// Package pipelinectx defines the per-event context shared across all pipeline stages.
package pipelinectx

import (
	"context"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
	"github.com/leandrodaf/pianalyze/internal/midi"
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
	Velocity byte             // MIDI velocity of the triggering note (0 on NoteOff)
	Dynamic  midi.DynamicLevel // musical dynamic level: 1 byte, zero allocs, O(1) lookup
	Triad        string
	Chord        string
	Inversion    string
	ChordRoot    int   // pitch class of the chord root (0–11); -1 when no chord is detected
	PressedNotes []int
}

// NewPipelineContext creates a PipelineContext wrapping the given parent context and MIDI event.
func NewPipelineContext(ctx context.Context, event contracts.MIDI) *PipelineContext {
	return &PipelineContext{
		Context:   ctx,
		MIDIEvent: event,
	}
}
