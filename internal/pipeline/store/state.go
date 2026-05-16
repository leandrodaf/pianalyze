// Package store holds the shared mutable state that persists across pipeline events.
package store

import (
	"slices"
	"sync"
	"sync/atomic"
)

// State holds the shared pipeline state.
// PressedNotes is protected by a mutex (slices cannot be updated atomically).
// lastNoteTime uses atomic.Uint64 — a single primitive read/write needs no lock.
type State struct {
	mu           sync.RWMutex
	PressedNotes []int
	lastNoteTime atomic.Uint64
}

// NewPipelineState initialises State with capacity pre-allocated for 10 simultaneous notes.
func NewPipelineState() *State {
	return &State{PressedNotes: make([]int, 0, 10)}
}

// AddNote adds a note to the pressed set; duplicate notes are ignored.
func (ps *State) AddNote(note int) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	if !slices.Contains(ps.PressedNotes, note) {
		ps.PressedNotes = append(ps.PressedNotes, note)
	}
}

// RemoveNote removes a released note, preserving the order of the remaining ones.
func (ps *State) RemoveNote(note int) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	for i, n := range ps.PressedNotes {
		if n == note {
			ps.PressedNotes = append(ps.PressedNotes[:i], ps.PressedNotes[i+1:]...)
			return
		}
	}
}

// GetPressedNotes returns a snapshot copy of the currently pressed notes.
func (ps *State) GetPressedNotes() []int {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	out := make([]int, len(ps.PressedNotes))
	copy(out, ps.PressedNotes)
	return out
}

// CopyPressedNotes copies the pressed notes into dst (reusing its backing array
// when capacity allows) and returns the result. Prefer this over GetPressedNotes
// in hot paths to avoid a heap allocation on every pipeline event.
func (ps *State) CopyPressedNotes(dst []int) []int {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	return append(dst[:0], ps.PressedNotes...)
}

// UpdateLastNoteTime stores the timestamp of the last note event atomically.
func (ps *State) UpdateLastNoteTime(timestamp uint64) {
	ps.lastNoteTime.Store(timestamp)
}

// GetLastNoteTime returns the timestamp of the last note event atomically.
func (ps *State) GetLastNoteTime() uint64 {
	return ps.lastNoteTime.Load()
}
