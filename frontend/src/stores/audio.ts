import * as Tone from 'tone'
import { writable, get } from 'svelte/store'

export interface AudioState {
  status: 'unloaded' | 'loading' | 'ready' | 'error'
  volume: number  // 0–100
  muted: boolean
}

// Salamander Grand Piano subset — covers full 88-key range with ~minor-third intervals.
// Files named with 's' instead of '#' (e.g. D#1 → Ds1.mp3).
const SAMPLE_URLS: Record<string, string> = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
  A7: 'A7.mp3', C8: 'C8.mp3',
}

const STORAGE_KEY = 'pianalyze.audio'

let sampler: Tone.Sampler | null = null
let volNode: Tone.Volume | null = null

function loadPersisted(): Pick<AudioState, 'volume' | 'muted'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<AudioState>
      return { volume: p.volume ?? 80, muted: p.muted ?? false }
    }
  } catch { /* ignore */ }
  return { volume: 80, muted: false }
}

function savePersisted(s: AudioState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: s.volume, muted: s.muted })) }
  catch { /* ignore */ }
}

export const audioStore = writable<AudioState>({
  status: 'unloaded',
  ...loadPersisted(),
})

// Logarithmic volume curve: 0% → -∞ dB, 100% → 0 dB
function volToDb(vol: number): number {
  if (vol <= 0) return -Infinity
  return Tone.gainToDb(vol / 100)
}

export async function initAudio(): Promise<void> {
  const state = get(audioStore)
  if (state.status === 'loading' || state.status === 'ready') return
  audioStore.update(s => ({ ...s, status: 'loading' }))

  try {
    await Tone.start()

    volNode = new Tone.Volume(volToDb(state.muted ? 0 : state.volume)).toDestination()

    sampler = new Tone.Sampler({
      urls: SAMPLE_URLS,
      baseUrl: '/audio/salamander/',
      onload: () => audioStore.update(s => ({ ...s, status: 'ready' })),
      onerror: (err) => {
        console.error('[audio] sampler error', err)
        audioStore.update(s => ({ ...s, status: 'error' }))
      },
    }).connect(volNode)

  } catch (err) {
    console.error('[audio] init failed', err)
    audioStore.update(s => ({ ...s, status: 'error' }))
  }
}

function midiToNote(midiNote: number): string {
  return Tone.Frequency(midiNote, 'midi').toNote()
}

export function playNote(midiNote: number, velocity: number): void {
  if (!sampler || get(audioStore).status !== 'ready') return
  try {
    sampler.triggerAttack(midiToNote(midiNote), Tone.now() + 0.005, Math.max(0, Math.min(1, velocity / 127)))
  } catch { /* note may already be releasing */ }
}

export function stopNote(midiNote: number): void {
  if (!sampler || get(audioStore).status !== 'ready') return
  try {
    sampler.triggerRelease(midiToNote(midiNote), Tone.now() + 0.005)
  } catch { /* ignore */ }
}

export function stopAllNotes(): void {
  if (!sampler) return
  try { sampler.releaseAll() } catch { /* ignore */ }
}

export function setVolume(vol: number): void {
  const clamped = Math.max(0, Math.min(100, vol))
  audioStore.update(s => {
    const next: AudioState = { ...s, volume: clamped, muted: false }
    savePersisted(next)
    if (volNode) volNode.volume.value = volToDb(clamped)
    return next
  })
}

export function toggleMute(): void {
  audioStore.update(s => {
    const next: AudioState = { ...s, muted: !s.muted }
    savePersisted(next)
    if (volNode) volNode.volume.value = volToDb(next.muted ? 0 : next.volume)
    return next
  })
}
