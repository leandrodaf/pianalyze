/** Mirrors the Go MIDIState struct emitted on every pipeline cycle. */
export interface MIDIState {
  pressedNotes: number[];
  currentKey: string;
  chord: string;
  inversion: string;
  triad: string;
  chordRoot: number;   // pitch class 0–11; -1 when no chord detected
  velocity: number;
  dynamic: string;
  interval: number;
}

export type DynamicLabel = '' | 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff';
