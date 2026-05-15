import type { Finger } from './recording-types'

/** One vivid color per finger — consistent across waterfall, piano, and any future UI. */
export const FINGER_COLORS: Record<Finger, string> = {
  1: '#ff4757',  // thumb  — red
  2: '#ffd32a',  // index  — yellow
  3: '#2ed573',  // middle — green
  4: '#1e90ff',  // ring   — blue
  5: '#cd84f1',  // pinky  — purple
}

/** Returns the color for a given finger, or null when finger is undefined. */
export function fingerColor(finger: Finger | undefined): string | null {
  return finger != null ? FINGER_COLORS[finger] : null
}
