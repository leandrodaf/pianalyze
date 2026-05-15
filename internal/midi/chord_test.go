package midi

import (
	"testing"
)

func BenchmarkGetChordName_Major(b *testing.B) {
	notes := []int{60, 64, 67} // C major root position
	b.ReportAllocs()
	for b.Loop() {
		GetChordName(notes)
	}
}

func BenchmarkGetChordName_MajorInversion(b *testing.B) {
	notes := []int{64, 67, 72} // C major 1st inversion
	b.ReportAllocs()
	for b.Loop() {
		GetChordName(notes)
	}
}

func BenchmarkGetChordName_Dominant9th(b *testing.B) {
	notes := []int{67, 71, 74, 77, 81} // G dominant 9th
	b.ReportAllocs()
	for b.Loop() {
		GetChordName(notes)
	}
}

func BenchmarkGetChordName_NoMatch(b *testing.B) {
	notes := []int{60, 61, 62} // chromatic cluster, not a chord
	b.ReportAllocs()
	for b.Loop() {
		GetChordName(notes)
	}
}

func TestGetChordName_MajorRootPosition(t *testing.T) {
	name, inversion, root, found := GetChordName([]int{60, 64, 67}) // C4, E4, G4
	if !found {
		t.Fatal("expected chord to be found")
	}
	if name != "Major" {
		t.Errorf("name: got %q, want %q", name, "Major")
	}
	if inversion != "Root position" {
		t.Errorf("inversion: got %q, want %q", inversion, "Root position")
	}
	if root != 0 {
		t.Errorf("root: got %d, want 0 (C)", root)
	}
}

func TestGetChordName_MajorFirstInversion(t *testing.T) {
	// E4=64, G4=67, C5=72 — C major, 1st inversion (3rd in bass)
	name, inversion, root, found := GetChordName([]int{64, 67, 72})
	if !found {
		t.Fatal("expected chord to be found")
	}
	if name != "Major" {
		t.Errorf("name: got %q, want %q", name, "Major")
	}
	if inversion != "1st inversion" {
		t.Errorf("inversion: got %q, want %q", inversion, "1st inversion")
	}
	if root != 0 {
		t.Errorf("root: got %d, want 0 (C)", root)
	}
}

func TestGetChordName_MajorSecondInversion(t *testing.T) {
	// G4=67, C5=72, E5=76 — C major, 2nd inversion (5th in bass)
	name, inversion, root, found := GetChordName([]int{67, 72, 76})
	if !found {
		t.Fatal("expected chord to be found")
	}
	if name != "Major" {
		t.Errorf("name: got %q, want %q", name, "Major")
	}
	if inversion != "2nd inversion" {
		t.Errorf("inversion: got %q, want %q", inversion, "2nd inversion")
	}
	if root != 0 {
		t.Errorf("root: got %d, want 0 (C)", root)
	}
}

func TestGetChordName_MinorRootPosition(t *testing.T) {
	// A3=57, C4=60, E4=64 — A minor root position
	name, inversion, root, found := GetChordName([]int{57, 60, 64})
	if !found {
		t.Fatal("expected chord to be found")
	}
	if name != "Minor" {
		t.Errorf("name: got %q, want %q", name, "Minor")
	}
	if inversion != "Root position" {
		t.Errorf("inversion: got %q, want %q", inversion, "Root position")
	}
	if root != 9 {
		t.Errorf("root: got %d, want 9 (A)", root)
	}
}

func TestGetChordName_Dominant9th(t *testing.T) {
	// G4=67, B4=71, D5=74, F5=77, A5=81 — G dominant 9th
	_, _, _, found := GetChordName([]int{67, 71, 74, 77, 81})
	if !found {
		t.Fatal("expected dominant 9th to be found (extended chord detection)")
	}
}

func TestGetChordName_TooFewNotes(t *testing.T) {
	// C + E = major third; not a recognized 2-note chord (only power chords are)
	_, _, _, found := GetChordName([]int{60, 64})
	if found {
		t.Error("expected no chord for unrecognized 2-note interval")
	}
}

func TestGetChordName_PowerChord(t *testing.T) {
	// C4=60, G4=67 — C power chord (root + perfect 5th)
	name, inversion, root, found := GetChordName([]int{60, 67})
	if !found {
		t.Fatal("expected power chord to be found")
	}
	if name != "Power Chord" {
		t.Errorf("name: got %q, want %q", name, "Power Chord")
	}
	if inversion != "Root position" {
		t.Errorf("inversion: got %q, want %q", inversion, "Root position")
	}
	if root != 0 {
		t.Errorf("root: got %d, want 0 (C)", root)
	}
}

func TestGetChordName_DominantShellVoicing(t *testing.T) {
	// G4=67, B4=71, F5=77 — G dominant 7th without 5th (shell voicing)
	name, _, root, found := GetChordName([]int{67, 71, 77})
	if !found {
		t.Fatal("expected dominant 7th (no 5th) to be found")
	}
	if name != "Dominant 7th no 5th" {
		t.Errorf("name: got %q, want %q", name, "Dominant 7th no 5th")
	}
	if root != 7 {
		t.Errorf("root: got %d, want 7 (G)", root)
	}
}

func TestGetChordName_MajorShellVoicing(t *testing.T) {
	// C4=60, E4=64, B4=71 — C major 7th without 5th
	name, _, root, found := GetChordName([]int{60, 64, 71})
	if !found {
		t.Fatal("expected major 7th (no 5th) to be found")
	}
	if name != "Major 7th no 5th" {
		t.Errorf("name: got %q, want %q", name, "Major 7th no 5th")
	}
	if root != 0 {
		t.Errorf("root: got %d, want 0 (C)", root)
	}
}

func TestGetChordName_MinorShellVoicing(t *testing.T) {
	// A3=57, C4=60, G4=67 — A minor 7th without 5th
	name, _, root, found := GetChordName([]int{57, 60, 67})
	if !found {
		t.Fatal("expected minor 7th (no 5th) to be found")
	}
	if name != "Minor 7th no 5th" {
		t.Errorf("name: got %q, want %q", name, "Minor 7th no 5th")
	}
	if root != 9 {
		t.Errorf("root: got %d, want 9 (A)", root)
	}
}

func TestGetChordName_EmptyInput(t *testing.T) {
	_, _, _, found := GetChordName([]int{})
	if found {
		t.Error("expected no chord for empty input")
	}
}

func TestGetChordName_NotAChord(t *testing.T) {
	// C, C#, D — chromatic cluster, not a chord
	_, _, _, found := GetChordName([]int{60, 61, 62})
	if found {
		t.Error("expected no chord for chromatic cluster")
	}
}

func TestIsTriad(t *testing.T) {
	cases := []struct {
		name string
		want bool
	}{
		{"Major", true},
		{"Minor", true},
		{"Augmented", true},
		{"Diminished", true},
		{"Major 7th", false},
		{"Dominant 7th", false},
		{"Dominant 9th", false},
		{"Major 13th", false},
		{"NonExistent", false},
	}
	for _, c := range cases {
		got := IsTriad(c.name)
		if got != c.want {
			t.Errorf("IsTriad(%q) = %v, want %v", c.name, got, c.want)
		}
	}
}
