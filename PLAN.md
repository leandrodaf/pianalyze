# Pianalyze — Execution Plan

## Vision

A desktop application that runs on macOS and Windows, letting anyone plug in a MIDI piano and get real-time visual feedback: which keys are pressed, which chord is being played, how hard it is being hit — and eventually, structured lessons that validate what the student is playing.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend | **Go + existing pipeline** | All timing-critical work stays in Go; MIDI capture, chord detection and dynamics already run at ~20ns/op with 0 allocs |
| Desktop shell | **Wails v2** | Single binary, no runtime to install, Go backend calls frontend natively via `runtime.EventsEmit` |
| Frontend framework | **Svelte** | No virtual DOM, reactive updates compile to vanilla JS, smallest bundle, fastest DOM mutations for real-time UI |
| Piano rendering | **HTML Canvas** | Smooth per-frame redraw of only the changed keys; DOM elements would be too slow for 88 animated keys |
| Styling | **Plain CSS** | No framework overhead; the piano is canvas-drawn anyway, CSS only handles layout and text |
| Build tooling | **Vite** (bundled with Wails) | Fast HMR during development |

---

## Architecture

### Event flow

```
MIDI Device
    ↓
midiClient.StartCapture(ctx)          [Go — leandrodaf/midi v2]
    ↓
Pipeline goroutine
    ↓  NoteStateUpdaterStage
    ↓  IntervalCalculatorStage
    ↓  NoteIdentifierStage
    ↓  ChordIdentifierStage
    ↓  FinalStage  ──→  runtime.EventsEmit("midi:state", MIDIState)
                                           ↓
                              Svelte store update (reactive)
                                           ↓
                              Canvas redraws only changed keys
```

### Go ↔ Frontend contract

A single `MIDIState` struct is emitted on every pipeline cycle:

```go
type MIDIState struct {
    PressedNotes []int  `json:"pressedNotes"` // MIDI numbers currently held
    CurrentKey   string `json:"currentKey"`   // e.g. "C3"
    Chord        string `json:"chord"`        // e.g. "Major 7th"
    Inversion    string `json:"inversion"`    // e.g. "1st inversion"
    Triad        string `json:"triad"`        // e.g. "Major" or constants.NonTriad
    Velocity     uint8  `json:"velocity"`     // 0–127
    Dynamic      string `json:"dynamic"`      // "pp" | "p" | "mp" | "mf" | "f" | "ff"
    Interval     uint64 `json:"interval"`     // µs since previous event
}
```

Frontend never calls back into Go for MIDI data — it only receives pushed events.
Go-exposed methods are limited to device management:

```go
// Exposed to frontend via Wails bindings
func (a *App) ListDevices() ([]DeviceInfo, error)
func (a *App) SelectDevice(id int) error
func (a *App) StartCapture() error
func (a *App) StopCapture() error
```

---

## Project Structure

```
pianalyze/
├── main.go               # Wails entry point (replaces current CLI main)
├── app.go                # App struct — Wails bindings + pipeline lifecycle
├── internal/
│   ├── midi/             # Music theory (unchanged)
│   ├── pipeline/         # Stage interface + Processor (unchanged)
│   │   ├── pipelinectx/
│   │   ├── stages/
│   │   └── store/
│   └── constants/        # Shared constants (unchanged)
├── frontend/
│   ├── src/
│   │   ├── App.svelte            # Root: device selector → main view
│   │   ├── stores/
│   │   │   └── midi.ts           # Writable Svelte store fed by EventsOn("midi:state")
│   │   ├── components/
│   │   │   ├── DeviceSelector.svelte   # Lists and selects MIDI devices
│   │   │   ├── Piano.svelte            # Mounts the Canvas, handles resize
│   │   │   ├── ChordPanel.svelte       # Chord name + inversion + triad badge
│   │   │   ├── DynamicMeter.svelte     # Velocity bar + dynamic label (pp→ff)
│   │   │   └── IntervalDisplay.svelte  # Timing between notes (for rhythm exercises)
│   │   └── lib/
│   │       ├── piano-canvas.ts   # All 88-key Canvas drawing logic
│   │       └── midi-types.ts     # TypeScript types mirroring MIDIState
│   ├── package.json
│   └── vite.config.ts
├── wails.json
├── PLAN.md               # This file
└── CLAUDE.md
```

---

## Standards

### Go

- All existing standards apply (see CLAUDE.md)
- `app.go` owns the pipeline lifecycle: creates `Processor`, starts goroutine, emits events
- `MIDIState` is built inside `FinalStage.Process()` and passed to the emitter — no new allocations per field, reuse the context values already computed
- No global state; `App` struct carries everything

### Svelte / TypeScript

- TypeScript throughout — types must mirror the Go `MIDIState` struct exactly
- One Svelte store (`midiStore`) as the single source of truth; components never call Wails directly for MIDI state
- Components are pure display — no business logic, no timing decisions
- Canvas logic lives in `lib/piano-canvas.ts`, not inside the Svelte component — testable in isolation

### Canvas rendering

- 88 keys rendered once on mount and on resize
- On each `midi:state` event, only repaint keys whose pressed state changed (dirty-key diffing)
- White keys: 52 total — standard proportions (width ≈ height/4.7)
- Black keys: 36 total — drawn on top of white keys after white pass
- Pressed highlight: accent colour fill; released: default fill
- Velocity → key highlight intensity (stronger press = brighter highlight)

### Naming conventions

- Go: standard Go conventions (PascalCase exported, camelCase unexported)
- Svelte components: PascalCase filenames (`Piano.svelte`)
- TS files: camelCase filenames (`piano-canvas.ts`, `midi-types.ts`)
- Wails events: `"midi:state"`, `"app:error"` — namespace:action pattern

---

## Execution Phases

### Phase 1 — Wails scaffold + device selection
- Install Wails CLI, run `wails init` targeting Svelte+TS template
- Migrate `main.go` from CLI to Wails entry point
- Implement `App` struct with `ListDevices` / `SelectDevice` / `StartCapture` / `StopCapture`
- `DeviceSelector.svelte`: list devices, user picks one, triggers `StartCapture`

### Phase 2 — Real-time piano keyboard
- Implement `piano-canvas.ts`: draw all 88 keys, expose `updateKeys(pressed: number[])` 
- Wire `midi:state` events into `midiStore`
- `Piano.svelte` subscribes to store, calls `updateKeys` on each update
- Dirty-diffing: only repaint keys that changed between the last and current state

### Phase 3 — Chord and dynamic panels
- `ChordPanel.svelte`: chord name (large), inversion (small), triad badge (if applicable)
- `DynamicMeter.svelte`: vertical velocity bar + dynamic label; animates smoothly between events
- `IntervalDisplay.svelte`: shows beat spacing in ms — foundation for rhythm validation

### Phase 4 — Lesson system (future)
- Define `Lesson` and `Exercise` types in Go
- `LessonStage` added to pipeline: compares `PipelineContext` against expected note/chord/dynamic
- Emit `lesson:result` events (correct / wrong / timing-off) in addition to `midi:state`
- Frontend shows pass/fail overlay on the piano canvas

---

## Performance Constraints

| Concern | Target | How |
|---|---|---|
| MIDI → Go pipeline | < 30 µs | Already achieved (0 allocs, lookup tables) |
| Go → frontend emit | < 1 ms | Single JSON marshal of MIDIState; no reflection at runtime |
| Canvas repaint | < 8 ms (stay under 16ms/frame budget) | Dirty-key diffing; no full clear+redraw |
| Bundle size | < 200 KB gzipped | Svelte compiles away; no heavy UI libraries |
| Binary size | < 30 MB | Wails + Go static binary |
