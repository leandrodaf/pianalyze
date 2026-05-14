// Package midi provides music-theory utilities: note names, chord detection, and inversion analysis.
package midi

// chordDefinitions maps each chord name to its interval pattern (semitones from root).
// Intervals above 11 span multiple octaves; comparison is performed mod 12.
var chordDefinitions = map[string][]int{
	// Tríades básicas
	"Major":         {0, 4, 7},
	"Minor":         {0, 3, 7},
	"Augmented":     {0, 4, 8},
	"Diminished":    {0, 3, 6},
	"Suspended 2nd": {0, 2, 7},
	"Suspended 4th": {0, 5, 7},

	// 6ª e 7ª
	"Major 6th":           {0, 4, 7, 9},
	"Minor 6th":           {0, 3, 7, 9},
	"Major 7th":           {0, 4, 7, 11},
	"Minor 7th":           {0, 3, 7, 10},
	"Dominant 7th":        {0, 4, 7, 10},
	"Augmented 7th":       {0, 4, 8, 10},
	"Augmented Major 7th": {0, 4, 8, 11},
	"Diminished 7th":      {0, 3, 6, 9},
	"Half-diminished":     {0, 3, 6, 10},
	"Minor Major 7th":     {0, 3, 7, 11},

	// 9ª
	"Major 9th":            {0, 4, 7, 11, 14},
	"Minor 9th":            {0, 3, 7, 10, 14},
	"Dominant 9th":         {0, 4, 7, 10, 14},
	"Dominant 7th flat 9":  {0, 4, 7, 10, 13},
	"Dominant 7th sharp 9": {0, 4, 7, 10, 15},
	"Dominant 9th flat 5":  {0, 4, 6, 10, 14},
	"Dominant 9th sharp 5": {0, 4, 8, 10, 14},
	"Minor Major 9th":      {0, 3, 7, 11, 14},

	// 11ª
	"Major 11th":            {0, 4, 7, 11, 14, 17},
	"Minor 11th":            {0, 3, 7, 10, 14, 17},
	"Dominant 11th":         {0, 4, 7, 10, 14, 17},
	"Dominant 7th sharp 11": {0, 4, 7, 10, 18},
	"Minor 11th flat 5":     {0, 3, 6, 10, 17},
	"Minor 11th sharp 5":    {0, 3, 8, 10, 17},

	// 13ª
	"Major 13th":            {0, 4, 7, 11, 14, 17, 21},
	"Minor 13th":            {0, 3, 7, 10, 14, 17, 21},
	"Dominant 13th":         {0, 4, 7, 10, 14, 17, 21},
	"Dominant 13th flat 9":  {0, 4, 7, 10, 13, 17, 21},
	"Dominant 13th sharp 9": {0, 4, 7, 10, 15, 17, 21},

	// Tensões adicionais e variações
	"Minor 6/9":                     {0, 3, 7, 9, 14},
	"6/9":                           {0, 4, 7, 9, 14},
	"Minor 7th flat 5":              {0, 3, 6, 10},
	"Major 7th sharp 5":             {0, 4, 8, 11},
	"Dominant 7th flat 9 flat 5":    {0, 4, 6, 10, 13},
	"Dominant 7th sharp 9 sharp 5":  {0, 4, 8, 10, 15},
	"Suspended 4th add 9":           {0, 5, 7, 14},
	"Minor 9th flat 13":             {0, 3, 7, 10, 13, 20},
	"Dominant 7th flat 13":          {0, 4, 7, 10, 20},
	"Add 9":                         {0, 4, 7, 14},
	"Minor Add 9":                   {0, 3, 7, 14},
	"Dominant 9th flat 13":          {0, 4, 7, 10, 14, 20},
	"Major 9th add 13":              {0, 4, 7, 11, 14, 21},
	"Minor 9th flat 11":             {0, 3, 7, 10, 13, 17},
	"Minor 13th sharp 11":           {0, 3, 7, 10, 14, 18},
	"Dominant 9th add sharp 11":     {0, 4, 7, 10, 14, 18},
	"Dominant 11th sharp 9":         {0, 4, 7, 10, 15, 17},
	"Suspended 4th add 13":          {0, 5, 7, 21},
	"Minor 9th add 13":              {0, 3, 7, 10, 14, 21},
	"Add 9 sharp 11":                {0, 4, 7, 14, 18},
	"Minor Add 9 sharp 11":          {0, 3, 7, 14, 18},
	"Dominant 7th flat 9 sharp 11":  {0, 4, 7, 10, 13, 18},
	"Dominant 7th sharp 9 sharp 11": {0, 4, 7, 10, 15, 18},
	"Dominant 13th sharp 9 flat 11": {0, 4, 7, 10, 15, 16, 21},
	"Minor 13th add flat 9":         {0, 3, 7, 10, 13, 21},
	"Minor 13th sharp 9":            {0, 3, 7, 10, 15, 21},
	"Major 9th sharp 13":            {0, 4, 7, 11, 14, 22},
	"Major 13th sharp 11":           {0, 4, 7, 11, 14, 18, 21},
	"Dominant 7th flat 9 sharp 13":  {0, 4, 7, 10, 13, 22},
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
	for name, intervals := range chordDefinitions {
		for root := range 12 {
			var mask uint16
			for _, iv := range intervals {
				mask |= uint16(1) << uint((root+iv)%12)
			}
			chordLookup[mask] = append(chordLookup[mask], chordEntry{name, intervals, root})
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
func GetChordName(notes []int) (string, string, int, bool) {
	if len(notes) < 3 {
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

	for _, entry := range chordLookup[mask] {
		for i, iv := range entry.intervals {
			if (entry.rootClass+iv)%12 == bassClass {
				return entry.name, inversionLabel(i), entry.rootClass, true
			}
		}
	}
	return "", "", -1, false
}

// IsTriad returns true if the named chord has exactly 3 notes in its definition.
func IsTriad(chordName string) bool {
	intervals, ok := chordDefinitions[chordName]
	return ok && len(intervals) == 3
}
