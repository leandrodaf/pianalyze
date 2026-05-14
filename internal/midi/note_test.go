package midi

import "testing"

func TestGetNoteName(t *testing.T) {
	cases := []struct {
		note int
		want string
	}{
		{0, "C-1"},
		{60, "C4"},
		{69, "A4"},
		{127, "G9"},
		{-1, "Out of Range"},
		{128, "Out of Range"},
	}
	for _, c := range cases {
		got := GetNoteName(c.note)
		if got != c.want {
			t.Errorf("GetNoteName(%d) = %q, want %q", c.note, got, c.want)
		}
	}
}
