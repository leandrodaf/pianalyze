package store

import (
	"slices"
	"sync"
	"sync/atomic"
)

// State mantém o estado compartilhado do pipeline.
// PressedNotes é protegido por mutex (slice não é atomicamente atualizável).
// LastNoteTime usa atomic.Uint64 para acesso sem lock — é uma escrita/leitura de uint64 puro.
type State struct {
	mu           sync.RWMutex
	PressedNotes []int
	lastNoteTime atomic.Uint64
}

// NewPipelineState inicializa o estado com capacidade pré-alocada para 10 notas simultâneas.
func NewPipelineState() *State {
	return &State{PressedNotes: make([]int, 0, 10)}
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

// UpdateLastNoteTime atualiza o timestamp da última nota via operação atômica.
func (ps *State) UpdateLastNoteTime(timestamp uint64) {
	ps.lastNoteTime.Store(timestamp)
}

// GetLastNoteTime retorna o timestamp da última nota via operação atômica.
func (ps *State) GetLastNoteTime() uint64 {
	return ps.lastNoteTime.Load()
}
