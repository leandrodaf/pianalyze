// Chromatic pitch-class colors (C=0 … B=11).
// Same palette used by the waterfall and the piano keyboard.
export const PITCH_COLORS: readonly string[] = [
  '#ef4444', // C  – red
  '#f97316', // C# – orange
  '#f59e0b', // D  – amber
  '#eab308', // D# – yellow
  '#84cc16', // E  – lime
  '#22c55e', // F  – green
  '#10b981', // F# – emerald
  '#06b6d4', // G  – cyan
  '#3b82f6', // G# – blue
  '#8b5cf6', // A  – violet
  '#a855f7', // A# – purple
  '#ec4899', // B  – pink
]

export function noteColor(midiNote: number): string {
  return PITCH_COLORS[midiNote % 12]
}
