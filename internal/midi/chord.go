// Package midi provides music-theory utilities: note names, chord detection, and inversion analysis.
package midi

// chordDef pairs a chord/interval name with its semitone intervals from the root.
// Using a slice (not a map) allows multiple entries with the same name — for example
// "Minor 7th" exists both as a 2-note interval {0,10} and as a 4-note chord {0,3,7,10}.
// Intervals above 11 span multiple octaves; comparison is performed mod 12.
type chordDef struct {
	name      string
	intervals []int
}

var chordDefinitions = []chordDef{
	// ── Intervals (2 notes) ────────────────────────────────────────────────────
	// Each of the 11 non-unison intervals within an octave. These fire when exactly
	// two notes whose pitch classes differ are pressed simultaneously.
	{"Minor 2nd",   []int{0, 1}},
	{"Major 2nd",   []int{0, 2}},
	{"Minor 3rd",   []int{0, 3}},
	{"Major 3rd",   []int{0, 4}},
	{"Perfect 4th", []int{0, 5}},
	{"Tritone",     []int{0, 6}},
	{"Power Chord", []int{0, 7}},
	{"Minor 6th",   []int{0, 8}},  // same name as the 4-note chord; different bitmask
	{"Major 6th",   []int{0, 9}},  // same name as the 4-note chord; different bitmask
	{"Minor 7th",   []int{0, 10}}, // same name as the 4-note chord; different bitmask
	{"Major 7th",   []int{0, 11}}, // same name as the 4-note chord; different bitmask

	// ── Triads ─────────────────────────────────────────────────────────────────
	{"Major",         []int{0, 4, 7}},
	{"Minor",         []int{0, 3, 7}},
	{"Augmented",     []int{0, 4, 8}},
	{"Diminished",    []int{0, 3, 6}},
	{"Suspended 2nd", []int{0, 2, 7}},
	{"Suspended 4th", []int{0, 5, 7}},

	// ── 6th / 7th ──────────────────────────────────────────────────────────────
	{"Major 6th",           []int{0, 4, 7, 9}},
	{"Minor 6th",           []int{0, 3, 7, 9}},
	{"Major 7th",           []int{0, 4, 7, 11}},
	{"Minor 7th",           []int{0, 3, 7, 10}},
	{"Dominant 7th",        []int{0, 4, 7, 10}},
	{"Augmented 7th",       []int{0, 4, 8, 10}},
	{"Augmented Major 7th", []int{0, 4, 8, 11}},
	{"Diminished 7th",      []int{0, 3, 6, 9}},
	{"Half-diminished",     []int{0, 3, 6, 10}},
	{"Minor Major 7th",     []int{0, 3, 7, 11}},

	// ── Shell voicings (7th chords without 5th, common in jazz/pop) ───────────
	{"Major 7th no 5th",    []int{0, 4, 11}},
	{"Dominant 7th no 5th", []int{0, 4, 10}},
	{"Minor 7th no 5th",    []int{0, 3, 10}},

	// ── 9th ────────────────────────────────────────────────────────────────────
	{"Major 9th",            []int{0, 4, 7, 11, 14}},
	{"Minor 9th",            []int{0, 3, 7, 10, 14}},
	{"Dominant 9th",         []int{0, 4, 7, 10, 14}},
	{"Dominant 7th flat 9",  []int{0, 4, 7, 10, 13}},
	{"Dominant 7th sharp 9", []int{0, 4, 7, 10, 15}},
	{"Dominant 9th flat 5",  []int{0, 4, 6, 10, 14}},
	{"Dominant 9th sharp 5", []int{0, 4, 8, 10, 14}},
	{"Minor Major 9th",      []int{0, 3, 7, 11, 14}},

	// ── 11th ───────────────────────────────────────────────────────────────────
	{"Major 11th",            []int{0, 4, 7, 11, 14, 17}},
	{"Minor 11th",            []int{0, 3, 7, 10, 14, 17}},
	{"Dominant 11th",         []int{0, 4, 7, 10, 14, 17}},
	{"Dominant 7th sharp 11", []int{0, 4, 7, 10, 18}},
	{"Minor 11th flat 5",     []int{0, 3, 6, 10, 17}},
	{"Minor 11th sharp 5",    []int{0, 3, 8, 10, 17}},

	// ── 13th ───────────────────────────────────────────────────────────────────
	{"Major 13th",            []int{0, 4, 7, 11, 14, 17, 21}},
	{"Minor 13th",            []int{0, 3, 7, 10, 14, 17, 21}},
	{"Dominant 13th",         []int{0, 4, 7, 10, 14, 17, 21}},
	{"Dominant 13th flat 9",  []int{0, 4, 7, 10, 13, 17, 21}},
	{"Dominant 13th sharp 9", []int{0, 4, 7, 10, 15, 17, 21}},

	// ── Extended voicings and alterations ─────────────────────────────────────
	{"Minor 6/9",                     []int{0, 3, 7, 9, 14}},
	{"6/9",                           []int{0, 4, 7, 9, 14}},
	{"Minor 7th flat 5",              []int{0, 3, 6, 10}},
	{"Major 7th sharp 5",             []int{0, 4, 8, 11}},
	{"Dominant 7th flat 9 flat 5",    []int{0, 4, 6, 10, 13}},
	{"Dominant 7th sharp 9 sharp 5",  []int{0, 4, 8, 10, 15}},
	{"Suspended 4th add 9",           []int{0, 5, 7, 14}},
	{"Minor 9th flat 13",             []int{0, 3, 7, 10, 13, 20}},
	{"Dominant 7th flat 13",          []int{0, 4, 7, 10, 20}},
	{"Add 9",                         []int{0, 4, 7, 14}},
	{"Minor Add 9",                   []int{0, 3, 7, 14}},
	{"Dominant 9th flat 13",          []int{0, 4, 7, 10, 14, 20}},
	{"Major 9th add 13",              []int{0, 4, 7, 11, 14, 21}},
	{"Minor 9th flat 11",             []int{0, 3, 7, 10, 13, 17}},
	{"Minor 13th sharp 11",           []int{0, 3, 7, 10, 14, 18}},
	{"Dominant 9th add sharp 11",     []int{0, 4, 7, 10, 14, 18}},
	{"Dominant 11th sharp 9",         []int{0, 4, 7, 10, 15, 17}},
	{"Suspended 4th add 13",          []int{0, 5, 7, 21}},
	{"Minor 9th add 13",              []int{0, 3, 7, 10, 14, 21}},
	{"Add 9 sharp 11",                []int{0, 4, 7, 14, 18}},
	{"Minor Add 9 sharp 11",          []int{0, 3, 7, 14, 18}},
	{"Dominant 7th flat 9 sharp 11",  []int{0, 4, 7, 10, 13, 18}},
	{"Dominant 7th sharp 9 sharp 11", []int{0, 4, 7, 10, 15, 18}},
	{"Dominant 13th sharp 9 flat 11", []int{0, 4, 7, 10, 15, 16, 21}},
	{"Minor 13th add flat 9",         []int{0, 3, 7, 10, 13, 21}},
	{"Minor 13th sharp 9",            []int{0, 3, 7, 10, 15, 21}},
	{"Major 9th sharp 13",            []int{0, 4, 7, 11, 14, 22}},
	{"Major 13th sharp 11",           []int{0, 4, 7, 11, 14, 18, 21}},
	{"Dominant 7th flat 9 sharp 13",  []int{0, 4, 7, 10, 13, 22}},
}

// triadNames is the authoritative set of chord names that are triads (exactly 3 notes).
// Using a separate set avoids an O(n) scan of chordDefinitions on every event.
var triadNames = map[string]bool{
	"Major": true, "Minor": true, "Augmented": true,
	"Diminished": true, "Suspended 2nd": true, "Suspended 4th": true,
}

// chordEntry holds a chord name, its intervals, and the root pitch class for a pre-computed match.
type chordEntry struct {
	name      string
	intervals []int
	rootClass int
}

// chordLookup is indexed by 12-bit pitch-class bitmask (0–4095).
// Populated once at init; GetChordName uses it with zero per-event allocations.
var chordLookup [1 << 12][]chordEntry

func init() {
	for _, cd := range chordDefinitions {
		for root := range 12 {
			var mask uint16
			for _, iv := range cd.intervals {
				mask |= uint16(1) << uint((root+iv)%12)
			}
			chordLookup[mask] = append(chordLookup[mask], chordEntry{cd.name, cd.intervals, root})
		}
	}
}

// inversionLabel maps a chord-tone index to a human-readable inversion name.
func inversionLabel(i int) string {
	switch i {
	case 0:
		return "Root position"
	case 1:
		return "1st inversion"
	case 2:
		return "2nd inversion"
	case 3:
		return "3rd inversion"
	default:
		return "Unknown inversion"
	}
}

// GetChordName identifies the chord and inversion for a set of MIDI notes.
// Returns the chord name, inversion name, root pitch class (0–11), and whether a match was found.
// Uses a pre-built bitmask lookup table — zero allocations in the hot path.
//
// When multiple entries share the same bitmask (e.g. "Power Chord" root=C and "Perfect 4th"
// root=G both map to bits {0,7}), root-position matches (bass note == chord root) are preferred
// over inversion matches so that the lowest note is always treated as the root for 2-note intervals.
func GetChordName(notes []int) (string, string, int, bool) {
	if len(notes) < 2 {
		return "", "", -1, false
	}

	var mask uint16
	bassNote := notes[0]
	for _, n := range notes {
		pc := ((n % 12) + 12) % 12
		mask |= uint16(1) << uint(pc)
		if n < bassNote {
			bassNote = n
		}
	}
	bassClass := ((bassNote % 12) + 12) % 12

	// First pass: look for a root-position match (bass note is the chord root).
	// This disambiguates enharmonic interpretations — e.g. C+G → Power Chord (root C)
	// rather than Perfect 4th (root G, 1st inversion).
	for _, entry := range chordLookup[mask] {
		if (entry.rootClass+entry.intervals[0])%12 == bassClass {
			return entry.name, inversionLabel(0), entry.rootClass, true
		}
	}

	// Second pass: accept any inversion match.
	for _, entry := range chordLookup[mask] {
		for i, iv := range entry.intervals {
			if (entry.rootClass+iv)%12 == bassClass {
				return entry.name, inversionLabel(i), entry.rootClass, true
			}
		}
	}
	return "", "", -1, false
}

// IsTriad returns true if the named chord is a triad (exactly 3 notes in root position).
func IsTriad(chordName string) bool { return triadNames[chordName] }
