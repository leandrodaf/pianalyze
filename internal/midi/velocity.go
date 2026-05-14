package midi

// DynamicLevel represents the musical dynamic derived from a MIDI velocity value.
// Stored as a single byte in PipelineContext: zero allocations, O(1) lookup, no branching.
type DynamicLevel byte

// Dynamic levels ordered from softest to loudest, following standard musical notation.
const (
	DynamicNone DynamicLevel = iota // velocity 0 — NoteOff or absent
	DynamicPP                       // pianissimo  (1–21)
	DynamicP                        // piano       (22–42)
	DynamicMP                       // mezzo-piano (43–63)
	DynamicMF                       // mezzo-forte (64–84)
	DynamicF                        // forte       (85–105)
	DynamicFF                       // fortissimo  (106–127)
)

var dynamicLabels = [7]string{"", "pp", "p", "mp", "mf", "f", "ff"}
var dynamicNames = [7]string{"", "pianissimo", "piano", "mezzo-piano", "mezzo-forte", "forte", "fortissimo"}

// Label returns the standard musical symbol (e.g. "mf"). Static array access, zero allocs.
func (d DynamicLevel) Label() string { return dynamicLabels[d] }

// Name returns the full musical term (e.g. "mezzo-forte"). Static array access, zero allocs.
func (d DynamicLevel) Name() string { return dynamicNames[d] }

// velocityLookup maps every possible byte value (0–255) to a DynamicLevel.
// A [256]array guarantees the compiler eliminates bounds checks — pure O(1) lookup.
var velocityLookup [256]DynamicLevel

func init() {
	for v := 1; v <= 21; v++ {
		velocityLookup[v] = DynamicPP
	}
	for v := 22; v <= 42; v++ {
		velocityLookup[v] = DynamicP
	}
	for v := 43; v <= 63; v++ {
		velocityLookup[v] = DynamicMP
	}
	for v := 64; v <= 84; v++ {
		velocityLookup[v] = DynamicMF
	}
	for v := 85; v <= 105; v++ {
		velocityLookup[v] = DynamicF
	}
	for v := 106; v <= 255; v++ {
		velocityLookup[v] = DynamicFF
	}
}

// VelocityToDynamic converts a MIDI velocity byte to a DynamicLevel via O(1) lookup table.
// Velocity 0 (NoteOff per MIDI spec) returns DynamicNone.
func VelocityToDynamic(v byte) DynamicLevel {
	return velocityLookup[v]
}
