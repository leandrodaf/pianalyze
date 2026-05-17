import type { Recording } from './recording-types'

// ── Enums / constants ─────────────────────────────────────────────────────────

export type Category = 'scales' | 'chords' | 'triads' | 'pieces'

/** 1 = Iniciante … 5 = Expert */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5

export const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = {
  1: 'Iniciante',
  2: 'Básico',
  3: 'Intermediário',
  4: 'Avançado',
  5: 'Expert',
}

export const DIFFICULTY_COLOR: Record<DifficultyLevel, string> = {
  1: '#4ade80',   // green
  2: '#86efac',   // light green
  3: '#fb923c',   // orange
  4: '#f87171',   // red-ish
  5: '#a78bfa',   // purple (mastery)
}

export const CATEGORY_LABEL: Record<Category, string> = {
  scales: 'Escalas',
  chords: 'Acordes',
  triads: 'Tríades',
  pieces: 'Peças',
}

export const HANDS_LABEL: Record<string, string> = {
  left:  'Mão esquerda',
  right: 'Mão direita',
  both:  'Ambas as mãos',
}

// ── Sub-types ──────────────────────────────────────────────────────────────────

export interface AuthorLink {
  /** Display label, e.g. "YouTube", "Instagram", "Site" */
  label: string
  url: string
}

export interface ExerciseAuthor {
  name: string
  /** Main website, GitHub profile, or portfolio */
  url?: string
  /** Short bio shown in the exercise detail card */
  bio?: string
  /** Public contact — email address or @handle (Twitter, etc.) */
  contact?: string
  /** Extra links: YouTube channel, Instagram, school page, etc. */
  links?: AuthorLink[]
}

/** Visual identity — what the card & modal look like. */
export interface ExerciseStyle {
  /** CSS gradient stops, e.g. ["#7c3aed","#2563eb"] */
  gradient: readonly [string, string]
  /** Single emoji or unicode symbol shown on the card cover */
  icon: string
  /**
   * Optional cover image URL (absolute, relative to the app, or bundled path).
   * The gradient is applied as a semi-transparent overlay on top of the image,
   * preserving readability. Fallback to gradient-only when omitted.
   * Examples: "/images/chopin.jpg", "https://…/cover.webp"
   */
  coverImage?: string
}

export interface ExerciseStats {
  /** Approximate duration in seconds */
  durationSec: number
  /** Tempo in BPM, if applicable */
  bpm?: number
  /** e.g. "4/4" */
  timeSignature?: string
  /** Which hands are used */
  hands?: 'left' | 'right' | 'both'
}

// ── Core exercise ──────────────────────────────────────────────────────────────

/**
 * The canonical exercise schema.
 * This is the structure used both in-app and in remote manifests.
 * Keep it serialisable to JSON (no functions, no circular refs).
 */
export interface Exercise {
  /** Unique slug. Use kebab-case, e.g. "c-major-scale" */
  id: string

  title: string

  /** Short one-liner shown under the title (key, progression, etc.) */
  subtitle: string

  /** 1–3 sentence description explaining what the student will practice */
  description: string

  author: ExerciseAuthor

  category: Category

  /** 1 (Iniciante) → 5 (Expert) */
  difficulty: DifficultyLevel

  /** Free-form searchable tags, e.g. ["escalas","dó maior","fundamentals"] */
  tags: string[]

  style: ExerciseStyle

  stats: ExerciseStats

  /** Set to true for placeholder exercises not yet shipping with data */
  comingSoon?: boolean

  /**
   * Locale-specific overrides for display text.
   * Keys are locale codes (e.g. "en", "es", "zh-CN").
   * Falls back to the base `title`/`subtitle`/`description` fields (pt-BR).
   */
  i18n?: Record<string, { title?: string; subtitle?: string; description?: string }>

  /** Loaded recording data — undefined if not yet fetched / builtin placeholder */
  data?: Recording
}

// ── Remote manifest ────────────────────────────────────────────────────────────

/**
 * Shape of the JSON file served at a remote URL.
 * An exercise entry inside a manifest mirrors Exercise exactly,
 * but replaces `data` with a `dataUrl` (relative or absolute path to a .pia file).
 */
export type ManifestExerciseEntry = Omit<Exercise, 'data' | 'comingSoon'> & {
  /** URL (relative to the manifest) or absolute URL pointing to a .pia JSON file */
  dataUrl: string
}

export interface LibraryManifest {
  /** Schema version — currently "1" */
  version: string

  /** Human-readable library name */
  name: string

  description?: string

  /** Library-level author / organisation */
  author?: ExerciseAuthor

  /** SPDX license identifier, e.g. "CC-BY-4.0" */
  license?: string

  /** Link to the library's homepage or repository */
  website?: string

  exercises: ManifestExerciseEntry[]
}

// ── Bundled (built-in) manifest ───────────────────────────────────────────────

/**
 * Exercise entry used inside the bundled manifest shipped with the app.
 * `dataUrl` is a path relative to `src/data/` resolved at build time via
 * import.meta.glob — no runtime fetch needed.
 * `comingSoon` marks exercises not yet available.
 */
export type BundledExerciseEntry = Omit<Exercise, 'data'> & {
  /** Path relative to src/data/, e.g. "exercises/scales/c-major-scale.json" */
  dataUrl?: string
}

export interface BundledManifest {
  version: string
  name: string
  description?: string
  author?: ExerciseAuthor
  license?: string
  website?: string
  exercises: BundledExerciseEntry[]
}
