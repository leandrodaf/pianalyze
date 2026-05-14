package store

import (
	"slices"
	"sync"
)

// State mantém o estado compartilhado do pipeline.
type State struct {
	mu           sync.RWMutex
	PressedNotes []int
	LastNoteTime uint64
}

// NewPipelineState inicializa o estado do pipeline.
func NewPipelineState() *State {
	return &State{PressedNotes: []int{}}
}

// AddNote adiciona uma nota ao conjunto de notas pressionadas, ignorando duplicatas.
func (ps *State) AddNote(note int) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	if !slices.Contains(ps.PressedNotes, note) {
		ps.PressedNotes = append(ps.PressedNotes, note)
	}
}

// RemoveNote remove uma nota solta, preservando a ordem das demais.
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

// GetPressedNotes retorna uma cópia das notas atualmente pressionadas.
func (ps *State) GetPressedNotes() []int {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	out := make([]int, len(ps.PressedNotes))
	copy(out, ps.PressedNotes)
	return out
}

// UpdateLastNoteTime atualiza o timestamp da última nota.
func (ps *State) UpdateLastNoteTime(timestamp uint64) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	ps.LastNoteTime = timestamp
}

// GetLastNoteTime retorna o timestamp da última nota.
func (ps *State) GetLastNoteTime() uint64 {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	return ps.LastNoteTime
}
