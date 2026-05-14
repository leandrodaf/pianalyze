package midi

import "testing"

func TestVelocityToDynamic(t *testing.T) {
	cases := []struct {
		velocity byte
		label    string
	}{
		{0, ""},    // NoteOff / zero value
		{1, "pp"},
		{21, "pp"},
		{22, "p"},
		{42, "p"},
		{43, "mp"},
		{63, "mp"},
		{64, "mf"},
		{84, "mf"},
		{85, "f"},
		{105, "f"},
		{106, "ff"},
		{127, "ff"},
		{255, "ff"}, // fora do range MIDI mas deve ser seguro
	}
	for _, c := range cases {
		got := VelocityToDynamic(c.velocity)
		if got.Label() != c.label {
			t.Errorf("VelocityToDynamic(%d).Label() = %q, want %q", c.velocity, got.Label(), c.label)
		}
	}
}

func BenchmarkVelocityToDynamic(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		VelocityToDynamic(85)
	}
}
