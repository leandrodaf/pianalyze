package store

import (
	"sync"
	"testing"
)

func TestAddNote_NoDuplicates(t *testing.T) {
	s := NewPipelineState()
	s.AddNote(60)
	s.AddNote(64)
	s.AddNote(60) // duplicate — should be ignored

	notes := s.GetPressedNotes()
	if len(notes) != 2 {
		t.Errorf("expected 2 notes, got %d: %v", len(notes), notes)
	}
}

func TestRemoveNote(t *testing.T) {
	s := NewPipelineState()
	s.AddNote(60)
	s.AddNote(64)
	s.RemoveNote(60)

	notes := s.GetPressedNotes()
	if len(notes) != 1 || notes[0] != 64 {
		t.Errorf("expected [64], got %v", notes)
	}
}

func TestRemoveNote_NotPresent(t *testing.T) {
	s := NewPipelineState()
	s.AddNote(60)
	s.RemoveNote(99) // not in list — should be a no-op

	notes := s.GetPressedNotes()
	if len(notes) != 1 {
		t.Errorf("expected 1 note, got %d", len(notes))
	}
}

func TestGetPressedNotes_ReturnsCopy(t *testing.T) {
	s := NewPipelineState()
	s.AddNote(60)

	notes := s.GetPressedNotes()
	notes[0] = 99 // mutate the copy

	original := s.GetPressedNotes()
	if original[0] != 60 {
		t.Error("GetPressedNotes should return a copy, not a reference")
	}
}

func TestUpdateAndGetLastNoteTime(t *testing.T) {
	s := NewPipelineState()
	s.UpdateLastNoteTime(12345)
	if got := s.GetLastNoteTime(); got != 12345 {
		t.Errorf("GetLastNoteTime() = %d, want 12345", got)
	}
}

func TestState_ConcurrentAccess(t *testing.T) {
	s := NewPipelineState()
	var wg sync.WaitGroup

	for i := range 50 {
		wg.Add(2)
		go func(n int) {
			defer wg.Done()
			s.AddNote(n)
		}(i)
		go func(n int) {
			defer wg.Done()
			s.GetPressedNotes()
		}(i)
	}
	wg.Wait()
}
