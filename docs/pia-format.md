# `.pia` Format — Complete Specification

> **Current schema version:** 2  
> **Legacy version supported:** 1 (automatic migration)

---

## What is `.pia`

`.pia` is Pianalyze's native format for storing piano performances and exercises.
It is designed to be simultaneously:

- **Simple** — pure JSON, human-readable, no external dependencies
- **Complete** — represents everything a pedagogical score needs: timing, expression, fingering, chords, sections, repeats, grading criteria
- **Compact** — supports transparent gzip compression (`.pia.gz`), reducing size by ~70–80%
- **Evolvable** — explicit `version` field + automatic migration pipeline; old files never break
- **Platform-independent** — JSON is supported by any language, any operating system

---

## Extensions and encoding

| Extension | Content | When to use |
|---|---|---|
| `.pia` | Pure UTF-8 JSON | Manually edited files, debugging |
| `.pia.gz` | gzip-compressed JSON | Distribution, built-in library |
| `.json` | Pure JSON (accepted alias) | Compatibility with generic tools |

The app **automatically detects** whether a file is compressed by the magic bytes `0x1F 0x8B`
(gzip header) — the extension does not matter for detection.

---

## Root structure

```jsonc
{
  "version": 2,           // required — schema version
  "recordedAt": "...",    // optional — ISO 8601 UTC timestamp of the recording

  "meta": { ... },        // optional — title, composer, provenance
  "tempoMap": [ ... ],    // optional — tempo map (replaces "bpm")
  "timeSignatureMap": [ ... ], // optional — time signature map (replaces "timeSignature")
  "keySignature": "...",  // optional — initial key signature
  "keySignatureMap": [ ... ], // optional — key-signature changes mid-piece
  "pickup": false,        // optional — true if the first measure is a pickup (anacrusis)

  "sections": [ ... ],    // optional — named sections (intro, verse, chorus…)
  "measureMap": [ ... ],  // optional — start position of each measure
  "hairpins": [ ... ],    // optional — crescendos and decrescendos
  "repeats": [ ... ],     // optional — repeat markers and navigation
  "endings": [ ... ],     // optional — volta brackets (1st/2nd endings)

  "gradingProfile": { ... }, // optional — custom grading tolerances

  "events": [ ... ]       // required — array of MIDI events
}
```

---

## `version` field

| Value | Meaning |
|---|---|
| `1` | Legacy schema — `bpm` and `timeSignature` are scalar fields |
| `2` | Current schema — `tempoMap` and `timeSignatureMap` are arrays |

The `v1 → v2` migration happens automatically when loading the file:
- `bpm: 120` → `tempoMap: [{ atMs: 0, bpm: 120 }]`
- `timeSignature: "4/4"` → `timeSignatureMap: [{ atMs: 0, value: "4/4" }]`

The `bpm` and `timeSignature` fields are kept in v2 only for compatibility —
they must never be written by new tools.

---

## Metadata — `meta`

```jsonc
{
  "title": "Invention No. 1 in C Major",
  "composer": "J.S. Bach",
  "copyright": "Public domain",
  "coverUrl": "https://...",     // cover image URL (optional)
  "difficulty": 3,               // 1–5: 1=beginner, 5=expert
  "tags": ["baroque", "bach", "beginner"],
  "source": {
    "format": "musicxml",        // "musicxml" | "mscz" | "midi" | "manual"
    "filename": "bach_bwv772.xml",
    "importedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

## Timing

### `tempoMap` — Tempo map

Array of tempo events sorted by `atMs`.

```jsonc
[
  { "atMs": 0,    "bpm": 120, "beatUnit": "quarter", "label": "Allegro" },
  { "atMs": 8000, "bpm": 100, "toMs": 10000, "toBpm": 80, "label": "rit." },
  { "atMs": 10000, "bpm": 80 }
]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `atMs` | `number` | ✅ | Tempo change start position (ms) |
| `bpm` | `number` | ✅ | BPM at `atMs` |
| `beatUnit` | `string` | — | Beat unit: `"quarter"` (default), `"half"`, `"eighth"`, `"dotted-quarter"` |
| `toMs` | `number` | — | End of linear ramp (ms). Required together with `toBpm` |
| `toBpm` | `number` | — | BPM at the end of the ramp — models rit./accel. |
| `label` | `string` | — | Human-readable label: `"Allegro"`, `"rit."`, `"a tempo"` |

**Linear ramp:** when `toMs` and `toBpm` are present, the tempo interpolates linearly
from `bpm` to `toBpm` over the interval `atMs → toMs`. This models rallentandi and
accelerandi with millisecond precision.

### `timeSignatureMap` — Time signature map

```jsonc
[
  { "atMs": 0,    "value": "4/4" },
  { "atMs": 12000, "value": "3/4" }
]
```

Typical values: `"4/4"`, `"3/4"`, `"6/8"`, `"5/4"`, `"7/8"`, `"12/8"`.

### `measureMap` — Measure start positions

Allows the app to position the metronome and navigate by measure number.

```jsonc
[
  { "measure": 0, "atMs": 0 },    // measure 0 = pickup (when "pickup": true)
  { "measure": 1, "atMs": 500 },
  { "measure": 2, "atMs": 2500 }
]
```

- `measure: 0` represents the pickup measure when `pickup: true`.
- Measures are indexed starting from 1.

### `keySignature`

Initial key signature in compact notation: `"C"`, `"G"`, `"D"`, `"F"`, `"Bb"`, `"Am"`, `"Dm"`.
Informational only — does not affect MIDI playback.

### `keySignatureMap` — Key-signature changes

Array of key-signature changes sorted by `atMs`. The first entry always has `atMs: 0`
and matches `keySignature`; use it to look up mid-piece modulations.

```jsonc
[
  { "atMs": 0,     "value": "C" },
  { "atMs": 16000, "value": "G" }
]
```

| Field | Type | Description |
|---|---|---|
| `atMs` | `number` | Recording position where this key signature takes effect (ms) |
| `value` | `string` | Key name, e.g. `"C"`, `"G"`, `"Dm"`, `"Bb"` |

### `pickup`

`true` when the first measure is a pickup (anacrusis). The `measureMap` must have `measure: 0`
for the pickup in this case.

---

## Musical structure

### `sections` — Named sections

```jsonc
[
  {
    "name": "Theme A",
    "startMs": 0,
    "type": "verse",
    "rehearsalMark": "A",
    "difficulty": 2
  },
  {
    "name": "Coda",
    "startMs": 32000,
    "type": "coda"
  }
]
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Name displayed in the UI |
| `startMs` | `number` | Section start in ms |
| `type` | `string` | Structural role: `"intro"`, `"verse"`, `"chorus"`, `"bridge"`, `"coda"`, `"rehearsal"`, `"free"` |
| `rehearsalMark` | `string` | Rehearsal letter/number shown on the score: `"A"`, `"B"`, `"1"` |
| `difficulty` | `number` | Section difficulty: 1–5 |

### `repeats` — Repeats and navigation

Repeat markers preserved as metadata when the converter has already unrolled the repeats into
the `events` array. The app always plays `events` linearly.

```jsonc
[
  { "type": "repeat-open",  "atMs": 4000 },
  { "type": "repeat-close", "atMs": 24000, "targetAtMs": 4000 },
  { "type": "segno",        "atMs": 0 },
  { "type": "ds-coda",      "atMs": 48000 },
  { "type": "coda",         "atMs": 52000 }
]
```

| `type` | Symbol | Meaning |
|---|---|---|
| `"repeat-open"` | `‖:` | Start of repeat bracket |
| `"repeat-close"` | `:‖` | End of bracket — jump back to `repeat-open` |
| `"segno"` | `𝄋` | Dal Segno target |
| `"coda"` | `𝄌` | Coda target |
| `"fine"` | Fine | End of piece in D.C./D.S. |
| `"ds"` | D.S. | Dal Segno — jump to `segno` |
| `"dc"` | D.C. | Da Capo — jump to beginning |
| `"ds-coda"` | D.S. al Coda | Jump to segno, then to coda |
| `"dc-coda"` | D.C. al Coda | Jump to beginning, then to coda |

### `hairpins` — Gradual dynamics

Crescendo and decrescendo between two points.

```jsonc
[
  { "startMs": 4000,  "endMs": 8000,  "from": "mp", "to": "f" },
  { "startMs": 16000, "endMs": 20000, "from": "f",  "to": "p" }
]
```

### `endings` — Volta brackets (1st/2nd endings)

Sorted by `startMs` ascending. Each entry spans a first/second (or further) ending
bracket in the score, matching the MusicXML `<ending number="…">` attribute.

```jsonc
[
  { "number": "1", "startMs": 20000, "endMs": 24000 },
  { "number": "2", "startMs": 24000, "endMs": 28000 }
]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `number` | `string` | ✅ | Ending label, e.g. `"1"`, `"2"`, `"1,2"` |
| `startMs` | `number` | ✅ | Start of the bracket (ms) |
| `endMs` | `number` | — | End of the bracket (ms). Absent/0 = open-ended (malformed input) |

---

## MIDI events — `events`

The heart of the format. A flat array of events sorted by `t` (ms since recording start).

### Event types

| `cmd` (hex) | `cmd` (decimal) | Type | Usage |
|---|---|---|---|
| `0x90` | `144` | **NoteOn** | Key pressed. `vel > 0` = press; `vel = 0` = release (equivalent to NoteOff) |
| `0x80` | `128` | **NoteOff** | Key released |
| `0xB0` | `176` | **Control Change** | Sustain pedal (CC 64), sostenuto (CC 66), una corda (CC 67) |

### Event fields

```jsonc
{
  // ── Core (required) ────────────────────────────────────────────────
  "t":    1250,    // ms since recording start (integer recommended, float accepted)
  "cmd":  144,     // MIDI command byte (0x90, 0x80 or 0xB0)
  "note": 60,      // MIDI note 0–127 (NoteOn/Off) or CC number (0xB0)
  "vel":  80,      // velocity 0–127 (vel=0 on NoteOn is equivalent to NoteOff)

  // ── Pedals (CC events only) ─────────────────────────────────────────
  // note=64 → sustain, 66 → sostenuto, 67 → una corda
  // vel >= 64 = pedal down; vel < 64 = pedal up

  // ── Pedagogy (NoteOn only) ──────────────────────────────────────────
  "finger":       3,           // finger: 1=thumb … 5=pinky
  "hand":         "right",     // "left" | "right"
  "dynamic":      "mf",        // score-prescribed dynamic (≠ playback velocity)
  "articulation": "staccato",  // "legato" | "staccato" | "tenuto" | "accent"
  "grace":        true,        // true = grace note (acciaccatura / appoggiatura)
  "voice":        1,           // staff voice: 1=melody … 4
  "fermata":      false,       // true = fermata over this note
  "slur":         "start",     // slur: "start" | "continue" | "end"
  "tip":          "cross thumb here",   // pedagogical hint shown on the judgment line
  "handPosition": "Middle C",           // hand position on the keyboard
  "tuplet":       { "actualNotes": 3, "normalNotes": 2 }  // tuplet ratio for notation display
}
```

> **Note:** `tuplet` is display-only metadata — `actualNotes` notes occupy the
> space normally taken by `normalNotes` (e.g. a triplet is `{3, 2}`). The
> event's `t`/duration already reflect the compressed timing, so playback is
> unaffected; this field only drives notation grouping in the Sheet Music view.

### MIDI note reference

| Note | MIDI | Note | MIDI |
|---|---|---|---|
| C0 | 12 | C4 (Middle C) | 60 |
| A0 (lowest key) | 21 | A4 (440 Hz) | 69 |
| C8 (highest key) | 108 | — | — |

### Dynamic reference (`dynamic`)

| Value | Name | Reference `vel` |
|---|---|---|
| `"ppp"` | pianississimo | ~10 |
| `"pp"` | pianissimo | ~20 |
| `"p"` | piano | ~40 |
| `"mp"` | mezzo-piano | ~55 |
| `"mf"` | mezzo-forte | ~72 |
| `"f"` | forte | ~90 |
| `"ff"` | fortissimo | ~110 |
| `"fff"` | fortississimo | ~120 |

> **Note:** `dynamic` is the score-**prescribed** dynamic (pedagogy).
> `vel` is the **MIDI playback** velocity. They are independent fields —
> an exercise can prescribe `"f"` but play at 72 to soften the sound.

### Pedal events (CC)

```jsonc
{ "t": 5000, "cmd": 176, "note": 64, "vel": 127 }  // sustain ON
{ "t": 7500, "cmd": 176, "note": 64, "vel": 0 }    // sustain OFF
```

| `note` (CC #) | Pedal |
|---|---|
| `64` | Sustain (damper) |
| `66` | Sostenuto |
| `67` | Una corda (soft) |

---

## Grading profile — `gradingProfile`

Tolerances for the grading engine. All fields are optional —
default values are used when absent.

```jsonc
{
  "earlyToleranceMs": 500,   // max ms of early arrival allowed (default: 500)
  "lateToleranceMs":  300,   // max ms of late arrival allowed (default: 300)
  "perfectMs":        90,    // max delta for "perfect" (default: 90)
  "goodMs":           200,   // max delta for "good" (default: 200)
  "checkVelocity":    false,  // penalise velocity differences (default: false)
  "velocityTolerance": 30,   // acceptable vel difference when checkVelocity=true
  "checkArticulation": false  // penalise wrong articulation (default: false)
}
```

### How grading works

The engine compares each note pressed by the student with the nearest `NoteInterval`
in the reference recording. The per-note result is:

| Result | Condition |
|---|---|
| **perfect** | `|delta| ≤ perfectMs` |
| **good** | `|delta| ≤ goodMs` |
| **ok** | within the `earlyToleranceMs / lateToleranceMs` window |
| **miss** | outside the tolerance window |

---

## gzip compression

For distribution and the built-in library, files can be compressed:

```sh
gzip -9 recording.pia          # produces recording.pia.gz
```

Pianalyze detects gzip by the first two bytes (`0x1F 0x8B`) regardless of the file extension.
Files in the internal library are always distributed as `.pia.gz`.

---

## v1 → v2 migration

v1 files have `"version": 1` (or no field at all) and scalar fields:

```jsonc
// v1 (legacy)
{ "version": 1, "bpm": 120, "timeSignature": "4/4", "events": [ ... ] }
```

On load, the migration pipeline automatically transforms them:

```jsonc
// v2 (migration result)
{
  "version": 2,
  "tempoMap": [{ "atMs": 0, "bpm": 120 }],
  "timeSignatureMap": [{ "atMs": 0, "value": "4/4" }],
  "events": [ ... ]
}
```

Migration runs in both the Go backend and the TypeScript frontend —
v1 files work at every entry point of the app.

---

## Minimal complete example

```jsonc
{
  "version": 2,
  "recordedAt": "2024-06-01T14:30:00Z",
  "meta": {
    "title": "C Major Scale",
    "composer": "Exercise",
    "difficulty": 1,
    "tags": ["beginner", "scale", "c-major"]
  },
  "tempoMap": [
    { "atMs": 0, "bpm": 80, "beatUnit": "quarter", "label": "Andante" }
  ],
  "timeSignatureMap": [
    { "atMs": 0, "value": "4/4" }
  ],
  "keySignature": "C",
  "measureMap": [
    { "measure": 1, "atMs": 0 },
    { "measure": 2, "atMs": 3000 },
    { "measure": 3, "atMs": 6000 }
  ],
  "gradingProfile": {
    "earlyToleranceMs": 600,
    "lateToleranceMs": 400
  },
  "events": [
    { "t": 0,    "cmd": 144, "note": 60, "vel": 72, "finger": 1, "hand": "right" },
    { "t": 750,  "cmd": 128, "note": 60, "vel": 0 },
    { "t": 750,  "cmd": 144, "note": 62, "vel": 70, "finger": 2, "hand": "right" },
    { "t": 1500, "cmd": 128, "note": 62, "vel": 0 },
    { "t": 1500, "cmd": 144, "note": 64, "vel": 68, "finger": 3, "hand": "right" },
    { "t": 2250, "cmd": 128, "note": 64, "vel": 0 }
  ]
}
```

---

## Advanced example

```jsonc
{
  "version": 2,
  "recordedAt": "2024-06-15T09:00:00Z",
  "meta": {
    "title": "Nocturne Op. 9 No. 2 (fragment)",
    "composer": "F. Chopin",
    "difficulty": 4,
    "tags": ["romantic", "chopin", "nocturne"],
    "source": { "format": "musicxml", "filename": "chopin_op9_no2.xml" }
  },
  "tempoMap": [
    { "atMs": 0,     "bpm": 66,  "beatUnit": "quarter", "label": "Andante" },
    { "atMs": 24000, "bpm": 66,  "toMs": 28000, "toBpm": 50, "label": "rit." },
    { "atMs": 28000, "bpm": 66,  "label": "a tempo" }
  ],
  "timeSignatureMap": [
    { "atMs": 0, "value": "12/8" }
  ],
  "keySignature": "Bb",
  "measureMap": [
    { "measure": 1, "atMs": 0 },
    { "measure": 2, "atMs": 3636 }
  ],
  "sections": [
    { "name": "Phrase A", "startMs": 0,     "type": "verse",  "rehearsalMark": "A" },
    { "name": "Phrase B", "startMs": 14000, "type": "chorus", "rehearsalMark": "B" }
  ],
  "hairpins": [
    { "startMs": 0,    "endMs": 4000,  "from": "p",  "to": "mf" },
    { "startMs": 8000, "endMs": 12000, "from": "mf", "to": "p"  }
  ],
  "gradingProfile": {
    "earlyToleranceMs": 350,
    "lateToleranceMs": 200,
    "perfectMs": 60,
    "goodMs": 130,
    "checkVelocity": true,
    "velocityTolerance": 25
  },
  "events": [
    { "t": 0,   "cmd": 144, "note": 62, "vel": 40,  "finger": 2, "hand": "right", "dynamic": "p", "slur": "start" },
    { "t": 303, "cmd": 144, "note": 65, "vel": 38,  "finger": 3, "hand": "right", "dynamic": "p", "slur": "continue" },
    { "t": 606, "cmd": 144, "note": 67, "vel": 55,  "finger": 4, "hand": "right", "dynamic": "mp", "slur": "end" },
    { "t": 0,   "cmd": 144, "note": 46, "vel": 55,  "finger": 5, "hand": "left",  "dynamic": "p" },
    { "t": 0,   "cmd": 176, "note": 64, "vel": 127 },
    { "t": 3000,"cmd": 176, "note": 64, "vel": 0 }
  ]
}
```

---

## Why `.pia` is good

### 1. JSON + gzip: the best of both worlds

Pure JSON is readable, debuggable and supported by any language without extra libraries.
gzip compresses structured text well — a 500-note piece typically occupies **15–25 KB**
compressed versus 80–120 KB in raw JSON. The app detects compression automatically, no config needed.

### 2. Millisecond timeline

All timestamps are integer `ms` from the start — no measure fractions, no resolution-dependent
MIDI ticks, no rounding ambiguity.
Calculating note duration is `tOff - tOn`. Calculating playback position is a subtraction.

### 3. Evolvable schema without breaking changes

The `version` field + migration pipeline ensures **no old file ever breaks**.
A tool that writes v1 works with an app that reads v2 with zero configuration.
New features are added as optional fields — backwards and forwards compatible.

### 4. Two layers of time: playback and pedagogy

`vel` (MIDI velocity) controls how the note **sounds**.
`dynamic` (prescribed dynamic) says what the **score demands**.
They are distinct fields: an exercise can soften playback (`vel=72`) while teaching
the student to play forte (`dynamic="f"`). No other simple format does this.

### 5. Grading profile embedded in the file

`gradingProfile` allows each exercise to carry its own grading criteria —
a beginner piece accepts 600 ms tolerance, an advanced piece requires 60 ms.
There is no global configuration that leaks between exercises.

### 6. Tempo map with linear ramps

`tempoMap` supports **linear interpolation** (`toMs` + `toBpm`) to model continuous
rallentandi and accelerandi. A single field covers all cases: constant tempo,
abrupt change and gradual change.

### 7. Structured pedagogy inside the event

Finger, hand, articulation, slur, fermata, text hint and hand position live **in the event
itself** — not in separate tables. This avoids joins, simplifies serialisation and ensures
pedagogical data never goes out of sync with the note.

### 8. Pedals in the same stream

CC events (sustain, sostenuto, una corda) live in the same `events` array with the same
timestamp `t`. There is no need for a separate control stream — everything is in chronological
order in a single read pass.

---

## Quick field reference

### Root

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | `number` | ✅ | Schema version: `1` or `2` |
| `recordedAt` | `string` | — | ISO 8601 UTC recording timestamp |
| `meta` | `object` | — | Title, composer, tags, provenance |
| `tempoMap` | `array` | — | Tempo map with ramp support |
| `timeSignatureMap` | `array` | — | Time signature changes |
| `keySignature` | `string` | — | Initial key signature: `"C"`, `"G"`, `"Am"` etc. |
| `keySignatureMap` | `array` | — | Key-signature changes mid-piece |
| `pickup` | `boolean` | — | `true` if the first measure is a pickup |
| `sections` | `array` | — | Named sections with structural roles |
| `measureMap` | `array` | — | Start position of each measure |
| `hairpins` | `array` | — | Crescendos and decrescendos |
| `repeats` | `array` | — | Repeat markers (post-unroll metadata) |
| `endings` | `array` | — | Volta brackets (1st/2nd endings) |
| `gradingProfile` | `object` | — | Custom grading tolerances |
| `events` | `array` | ✅ | MIDI events in chronological order |
| `bpm` | `number` | — | ⚠️ Legacy v1 — use `tempoMap` |
| `timeSignature` | `string` | — | ⚠️ Legacy v1 — use `timeSignatureMap` |

### Event (`RecordedEvent`)

| Field | Type | Required | Description |
|---|---|---|---|
| `t` | `number` | ✅ | Timestamp in ms from the start |
| `cmd` | `number` | ✅ | `144`=NoteOn, `128`=NoteOff, `176`=CC |
| `note` | `number` | ✅ | MIDI note 0–127 or CC number |
| `vel` | `number` | ✅ | Velocity 0–127 or CC value |
| `finger` | `number` | — | Finger: 1=thumb … 5=pinky |
| `hand` | `string` | — | `"left"` or `"right"` |
| `dynamic` | `string` | — | Prescribed dynamic: `"pp"` … `"fff"` |
| `articulation` | `string` | — | `"legato"`, `"staccato"`, `"tenuto"`, `"accent"` |
| `grace` | `boolean` | — | `true` = grace note |
| `voice` | `number` | — | Staff voice: 1–4 |
| `fermata` | `boolean` | — | `true` = fermata over the note |
| `slur` | `string` | — | `"start"`, `"continue"`, `"end"` |
| `tip` | `string` | — | Pedagogical hint shown on the judgment line |
| `handPosition` | `string` | — | Hand position on the keyboard |
| `tuplet` | `object` | — | `{ actualNotes, normalNotes }` tuplet ratio for notation display |
