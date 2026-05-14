# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run
go run main.go

# Build
go build

# Tests (with race detector)
go test -race ./...

# Single package test
go test -race ./internal/midi/

# Benchmarks
go test -bench=. -benchmem ./internal/midi/

# Lint
golangci-lint run ./...

# Generate (required before release builds)
go generate ./...

# Update dependencies
go mod tidy

# Release (requires git tag, runs via .github/workflows/goreleaser.yml)
goreleaser release
```

## Architecture

**Pianalyze** is a real-time MIDI capture and analysis tool, built as the foundation for a piano learning application. It captures events from a physical MIDI device, processes them through a pipeline of stages, and identifies notes, chords, inversions, and dynamics.

### Data flow

```
MIDI Device
    ↓
midiClient.StartCapture(ctx) → <-chan contracts.MIDI  (read-only, managed by lib)
    ↓
Event loop goroutine
    ↓
NewPipelineContext(ctx, event)
    ↓
pipelineProcessor.Process()
    ├─ NoteStateUpdaterStage    → updates PressedNotes in State; sets Velocity + Dynamic on NoteOn
    ├─ IntervalCalculatorStage  → computes microseconds since previous event (Interval)
    ├─ NoteIdentifierStage      → resolves note name (CurrentKey)
    ├─ ChordIdentifierStage     → detects chord name, inversion, and whether it is a triad
    └─ FinalStage               → logs the full analysis (placeholder for future server/lesson system)
```

### Key packages

- **`cmd/`** — Orchestration: `mid-listen.go` (event loop, graceful shutdown), `setup.go` (interactive device selection, logger init)
- **`internal/pipeline/`** — Generic `Stage[TContext, TState]` interface + `Processor` that runs stages in order
- **`internal/pipeline/pipelinectx/`** — `PipelineContext`: carries the MIDI event and all analysis accumulated across stages
- **`internal/pipeline/store/`** — `State`: mutex-protected pressed-notes slice + atomic timestamp
- **`internal/pipeline/stages/`** — Five concrete Stage implementations
- **`internal/midi/`** — Music theory: 128-note name map, 80+ chord types via pitch-class bitmask lookup, velocity→dynamic conversion
- **`internal/constants/`** — Shared string constants and sentinel errors

### PipelineContext fields

| Field | Type | Set by | Purpose |
|---|---|---|---|
| `MIDIEvent` | `contracts.MIDI` | `NewPipelineContext` | Raw MIDI event (Command, Note, Velocity, Timestamp) |
| `Interval` | `uint64` | `IntervalCalculatorStage` | Microseconds since previous event |
| `CurrentKey` | `string` | `NoteIdentifierStage` | Name of the last pressed note (e.g. `"C3"`) |
| `Velocity` | `byte` | `NoteStateUpdaterStage` | MIDI velocity of the triggering NoteOn (0 on NoteOff) |
| `Dynamic` | `midi.DynamicLevel` | `NoteStateUpdaterStage` | Musical dynamic derived from velocity (pp→ff) |
| `Chord` | `string` | `ChordIdentifierStage` | Detected chord name (e.g. `"Major 7th"`) |
| `Inversion` | `string` | `ChordIdentifierStage` | `"Root position"`, `"1st inversion"`, `"2nd inversion"` |
| `Triad` | `string` | `ChordIdentifierStage` | Chord name if it is a triad, else `constants.NonTriad` |
| `PressedNotes` | `[]int` | `NoteStateUpdaterStage` | Snapshot of all currently pressed MIDI note numbers |

### Key interfaces

```go
// Extensible pipeline with generics
type Stage[TContext any, TState any] interface {
    Process(ctx *TContext, state *TState) error
}

// MIDI client contract (github.com/leandrodaf/midi/v2)
type ClientMIDI interface {
    ListDevices() ([]DeviceInfo, error)
    SelectDevice(deviceID int) error
    StartCapture(ctx context.Context) (<-chan MIDI, error)
    Stop() error
}
```

### Concurrency model

Two goroutines, no done channel or sync.Once needed:
1. **Event loop** — `for event := range eventChannel` driven by `wg.Go`; exits when the lib closes the channel
2. **Signal handler** — inline `<-signalChan` in `Start()`; calls `midiClient.Stop()` + `cancel()`, which closes the channel and unblocks the event loop

`wg.Wait()` after the signal ensures all in-flight events finish processing before exit.

### Chord detection (`internal/midi/chord.go`)

Pre-built lookup table `[1<<12][]chordEntry` populated in `init()`. Per event:
1. Build a 12-bit pitch-class bitmask from pressed notes (mod 12)
2. Single array lookup → list of matching chord entries
3. Check which entry's interval matches the bass note (lowest MIDI number) → inversion label

**Result: ~19-26 ns/op, 0 allocs/op.**

### Dynamic levels (`internal/midi/velocity.go`)

`VelocityToDynamic(v byte) DynamicLevel` uses a pre-built `[256]DynamicLevel` array. The compiler eliminates bounds checks — pure O(1) with no branching. `DynamicLevel` is a `byte`, occupying 1 byte in `PipelineContext`.

| Velocity | DynamicLevel | Label | Name |
|---|---|---|---|
| 0 | `DynamicNone` | `""` | (NoteOff) |
| 1–21 | `DynamicPP` | `"pp"` | pianissimo |
| 22–42 | `DynamicP` | `"p"` | piano |
| 43–63 | `DynamicMP` | `"mp"` | mezzo-piano |
| 64–84 | `DynamicMF` | `"mf"` | mezzo-forte |
| 85–105 | `DynamicF` | `"f"` | forte |
| 106–127 | `DynamicFF` | `"ff"` | fortissimo |

### Build mode / Logger

`BuildMode` (set at compile time via `-ldflags`) controls the Zap logger:
- `"production"` → structured JSON
- any other value → human-readable development format

### CI

`.github/workflows/ci.yml` runs on every push/PR to `main`:
- **Test** matrix: Ubuntu, macOS, Windows — `go mod verify`, `go build`, `go vet`, `go test -race`, benchmark smoke
- **Lint**: golangci-lint v2 installed via `go install` (compiled with the project's Go version to avoid version mismatch)
