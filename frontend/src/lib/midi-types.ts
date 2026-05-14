/** Mirrors the Go MIDIState struct emitted on every pipeline cycle. */
export interface MIDIState {
  pressedNotes: number[];
  currentKey: string;
  chord: string;
  inversion: string;
  triad: string;
  velocity: number;
  dynamic: string;
  interval: number;
}

export type DynamicLabel = '' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
