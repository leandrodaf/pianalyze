// Package main implements the Wails application bindings for Pianalyze.
package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
	"github.com/leandrodaf/midi/v2/sdk/midi"
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/grading"
	"github.com/leandrodaf/pianalyze/internal/pipeline"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.uber.org/zap"
)

// midiCC is the raw MIDI command byte for Control Change events (E5).
const midiCC byte = 0xB0

// ── Recording types ──────────────────────────────────────────────────────────

// RecordedEvent is one MIDI event captured during a recording session.
// cmd = 0x90 NoteOn, 0x80 NoteOff, 0xB0 Control Change (pedal).
type RecordedEvent struct {
	T            int64  `json:"t"`                      // wall-clock offset in ms from recording start
	Cmd          byte   `json:"cmd"`                    // raw MIDI command byte
	Note         byte   `json:"note"`                   // MIDI note 0–127 or CC controller number
	Vel          byte   `json:"vel"`                    // velocity / CC value 0–127
	Finger       *byte  `json:"finger,omitempty"`       // 1–5 (optional)
	Hand         string `json:"hand,omitempty"`         // "left" | "right" (optional)
	Dynamic      string `json:"dynamic,omitempty"`      // "pp"|"p"|"mp"|"mf"|"f"|"ff" (optional)
	Articulation string `json:"articulation,omitempty"` // "legato"|"staccato"|"tenuto"|"accent"
	Grace        bool   `json:"grace,omitempty"`        // true = grace note (E4)
	Tip          string `json:"tip,omitempty"`          // pedagogical tip (G5)
	Voice        *byte  `json:"voice,omitempty"`        // voice within staff 1–4 (E7)
}

// RecordingMeta holds title, composer, and provenance metadata (M1, M2).
type RecordingMeta struct {
	Title     string           `json:"title,omitempty"`
	Composer  string           `json:"composer,omitempty"`
	Copyright string           `json:"copyright,omitempty"`
	Source    *RecordingSource `json:"source,omitempty"`
}

// RecordingSource describes the origin of an imported recording (M2).
type RecordingSource struct {
	Format     string `json:"format"`               // "musicxml"|"mscz"|"midi"|"manual"
	Filename   string `json:"filename,omitempty"`
	ImportedAt string `json:"importedAt,omitempty"` // ISO 8601
}

// TempoEvent is one entry in the tempo map (T1, T2, T4).
type TempoEvent struct {
	AtMs     int64    `json:"atMs"`
	BPM      float64  `json:"bpm"`
	BeatUnit string   `json:"beatUnit,omitempty"` // "quarter"|"half"|"eighth"|"dotted-quarter"
	ToMs     *int64   `json:"toMs,omitempty"`     // end of linear ramp
	ToBPM    *float64 `json:"toBpm,omitempty"`    // BPM at end of ramp
	Label    string   `json:"label,omitempty"`
}

// TimeSigEvent is one entry in the time-signature map (T3).
type TimeSigEvent struct {
	AtMs  int64  `json:"atMs"`
	Value string `json:"value"` // "4/4", "3/4", "6/8", etc.
}

// MeasureEntry records where a bar starts (F2).
type MeasureEntry struct {
	Measure int   `json:"measure"` // 1-indexed; anacrusis = 0
	AtMs    int64 `json:"atMs"`
}

// Hairpin is a dynamic crescendo / decrescendo (E3).
type Hairpin struct {
	StartMs int64  `json:"startMs"`
	EndMs   int64  `json:"endMs"`
	From    string `json:"from"` // Dynamic
	To      string `json:"to"`   // Dynamic
}

// Section is a named region within a recording.
type Section struct {
	Name    string `json:"name"`
	StartMs int64  `json:"startMs"`
	Type    string `json:"type,omitempty"` // "intro"|"verse"|"chorus"|"bridge"|"coda"|"rehearsal"|"free"
}

// Recording is the serialisable container for a captured performance (.pia v2).
type Recording struct {
	Version    int    `json:"version"`
	RecordedAt string `json:"recordedAt,omitempty"` // RFC3339 UTC (optional in v2 — M3)

	Meta *RecordingMeta `json:"meta,omitempty"`

	TempoMap         []TempoEvent   `json:"tempoMap,omitempty"`
	BPM              *float64       `json:"bpm,omitempty"`           // deprecated v1 compat
	TimeSignatureMap []TimeSigEvent `json:"timeSignatureMap,omitempty"`
	TimeSignature    string         `json:"timeSignature,omitempty"` // deprecated v1 compat
	KeySignature     string         `json:"keySignature,omitempty"`
	Pickup           bool           `json:"pickup,omitempty"`

	Sections   []Section      `json:"sections,omitempty"`
	MeasureMap []MeasureEntry `json:"measureMap,omitempty"`
	Hairpins   []Hairpin      `json:"hairpins,omitempty"`

	GradingProfile *grading.Profile `json:"gradingProfile,omitempty"`

	Events []RecordedEvent `json:"events"`
}

// MIDIState is the per-event snapshot pushed to the frontend on every pipeline cycle.
type MIDIState struct {
	PressedNotes []int  `json:"pressedNotes"`
	CurrentKey   string `json:"currentKey"`
	Chord        string `json:"chord"`
	Inversion    string `json:"inversion"`
	Triad        string `json:"triad"`
	Velocity     uint8  `json:"velocity"`
	Dynamic      string `json:"dynamic"`
	Interval     uint64 `json:"interval"`
}

// DeviceInfo is a frontend-safe representation of a MIDI device.
type DeviceInfo struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	Manufacturer string `json:"manufacturer"`
}

// App owns the MIDI client, the pipeline lifecycle, and the Wails event emitter.
type App struct {
	ctx        context.Context
	logger     *zap.Logger
	midiClient contracts.ClientMIDI

	mu        sync.Mutex
	capturing bool
	stopFn    context.CancelFunc

	// recording state — protected by recMu
	recMu    sync.Mutex
	isRec    bool
	recStart time.Time
	recBuf   []RecordedEvent

	grader *grading.Grader
}

// NewApp creates a new App instance.
func NewApp() *App {
	logger := initLogger()

	client, err := midi.NewMIDIClient(
		contracts.WithLogLevel(contracts.InfoLevel),
		contracts.WithChannelBufferSize(constants.MIDIChannelBufferSize),
		contracts.WithMIDIEventFilter(contracts.MIDIEventFilter{
			Commands: []contracts.MIDICommand{
				contracts.NoteOn,
				contracts.NoteOff,
				contracts.MIDICommand(midiCC), // Control Change — pedals (E5)
			},
		}),
	)
	if err != nil {
		logger.Error(constants.MsgMIDIClientSetupError, zap.Error(err))
	} else {
		logger.Info(constants.MsgMIDIClientSetupSuccess)
	}

	return &App{
		logger:     logger,
		midiClient: client,
		recBuf:     make([]RecordedEvent, 0, 2048),
		grader:     grading.New(),
	}
}

// startup is called by Wails when the application is ready.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if a.midiClient == nil {
		runtime.EventsEmit(ctx, "app:error", constants.MsgMIDIClientSetupError)
	}

	go a.watchMIDIDevices(ctx)
}

// watchMIDIDevices subscribes to MIDI device hot-plug events and forwards them
// to the frontend as "devices:changed" Wails events. The event payload is a
// slice of DeviceInfo reflecting the current device list at the time of the
// change.
func (a *App) watchMIDIDevices(ctx context.Context) {
	evCh, err := a.midiClient.WatchDevices(ctx)
	if err != nil {
		a.logger.Warn("WatchDevices not available", zap.Error(err))
		return
	}
	for range evCh {
		devices, err := a.ListDevices()
		if err != nil {
			a.logger.Warn("Failed to list devices after hot-plug event", zap.Error(err))
			devices = []DeviceInfo{}
		}
		runtime.EventsEmit(a.ctx, "devices:changed", devices)
		a.logger.Info("MIDI devices changed", zap.Int("count", len(devices)))
	}
}

// shutdown is called by Wails when the application is closing.
func (a *App) shutdown(_ context.Context) {
	_ = a.StopCapture()
}

// ListDevices returns available MIDI input devices, filtered to subdevice 0 of
// each physical port (manufacturer ends with ",0" or contains no ",") to avoid
// listing every sub-device of the same hardware card. Falls back to the full
// list when nothing matches the filter.
func (a *App) ListDevices() ([]DeviceInfo, error) {
	devices, err := a.midiClient.ListDevices()
	if err != nil {
		return nil, err
	}

	type indexed struct {
		originalIdx int
		d           contracts.DeviceInfo
	}

	var visible []indexed
	for i, d := range devices {
		if strings.HasSuffix(d.Manufacturer, ",0") || !strings.Contains(d.Manufacturer, ",") {
			visible = append(visible, indexed{i, d})
		}
	}
	if len(visible) == 0 {
		visible = make([]indexed, len(devices))
		for i, d := range devices {
			visible[i] = indexed{i, d}
		}
	}

	result := make([]DeviceInfo, len(visible))
	for i, v := range visible {
		result[i] = DeviceInfo{ID: v.originalIdx, Name: v.d.Name, Manufacturer: v.d.Manufacturer}
	}
	return result, nil
}

// SelectDevice sets the active MIDI device by its list index.
func (a *App) SelectDevice(id int) error {
	return a.midiClient.SelectDevice(id)
}

// StartCapture begins MIDI capture and drives the processing pipeline.
// Each completed pipeline cycle emits a "midi:state" event to the frontend.
func (a *App) StartCapture() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.capturing {
		return nil
	}

	captureCtx, cancel := context.WithCancel(a.ctx)

	eventChannel, err := a.midiClient.StartCapture(captureCtx)
	if err != nil {
		cancel()
		return err
	}

	a.capturing = true
	a.stopFn = cancel

	processor := pipeline.NewProcessorWithEmitter(a.logger, a.handleEvent)

	go func() {
		defer func() {
			a.mu.Lock()
			a.capturing = false
			a.mu.Unlock()
		}()
		for event := range eventChannel {
			pCtx := pipelinectx.NewPipelineContext(captureCtx, event)
			if err := processor.Process(pCtx); err != nil {
				a.logger.Error(constants.MsgMIDIProcessingError, zap.Error(err))
			}
		}
	}()

	return nil
}

// StartRecording begins capturing MIDI events with wall-clock timestamps.
// Safe to call multiple times; a second call resets the buffer.
func (a *App) StartRecording() error {
	a.recMu.Lock()
	defer a.recMu.Unlock()
	a.recStart = time.Now()
	a.recBuf = a.recBuf[:0]
	a.isRec = true
	return nil
}

// StopRecording stops the current recording and returns its contents as a JSON string.
// The returned JSON matches the Recording v2 schema expected by the frontend.
func (a *App) StopRecording() (string, error) {
	a.recMu.Lock()
	a.isRec = false
	events := make([]RecordedEvent, len(a.recBuf))
	copy(events, a.recBuf)
	start := a.recStart
	a.recMu.Unlock()

	rec := Recording{
		Version:    2,
		RecordedAt: start.UTC().Format(time.RFC3339),
		Events:     events,
	}
	data, err := json.Marshal(rec)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// SaveRecording opens a native OS save-file dialog and writes the gzip-compressed
// JSON recording to the path chosen by the user. Returns nil if the user cancels.
func (a *App) SaveRecording(jsonData string) error {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save Pianalyze Recording",
		DefaultFilename: "recording.pia",
		Filters: []runtime.FileFilter{
			{DisplayName: "Pianalyze Recording (*.pia)", Pattern: "*.pia"},
			{DisplayName: "JSON (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil || path == "" {
		return err
	}
	return writeGzip(path, []byte(jsonData))
}

// LoadRecordingFile opens a native OS open-file dialog, reads the file (plain
// JSON or gzip-compressed), applies v1→v2 migration, and returns the JSON string.
// Returns ("", nil) if the user cancels.
func (a *App) LoadRecordingFile() (string, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Pianalyze Recording",
		Filters: []runtime.FileFilter{
			{DisplayName: "Pianalyze Recording (*.pia)", Pattern: "*.pia"},
			{DisplayName: "JSON (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil || path == "" {
		return "", err
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	// Detect gzip magic bytes and decompress if needed (V3).
	data := raw
	if len(raw) >= 2 && raw[0] == 0x1f && raw[1] == 0x8b {
		data, err = gunzip(raw)
		if err != nil {
			return "", err
		}
	}

	// Parse JSON, apply v1 → v2 migration, re-serialise (V1).
	var rec map[string]any
	if err := json.Unmarshal(data, &rec); err != nil {
		return "", err
	}
	migrateRecordingMap(rec)

	out, err := json.Marshal(rec)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// ── Grading API (called by frontend practice engine) ─────────────────────────

// LoadPracticeIntervals replaces the set of expected note intervals used for
// grading. Call this once when a recording is loaded for practice.
func (a *App) LoadPracticeIntervals(intervals []grading.Interval) {
	a.grader.Load(intervals)
}

// LoadGradingProfile updates the active grading tolerances (G1, G2).
// Pass nil to reset to defaults.
func (a *App) LoadGradingProfile(profile *grading.Profile) {
	if profile == nil {
		a.grader.LoadProfile(grading.Profile{})
		return
	}
	a.grader.LoadProfile(*profile)
}

// StartPractice activates grading from a given recording position and speed.
// fromMs is the positionMs at which playback starts; speedMult is the current
// playback speed (1.0 = normal).
func (a *App) StartPractice(fromMs int64, speedMult float64) {
	a.grader.Start(fromMs, speedMult)
}

// PausePractice records the current position and pauses grading.
func (a *App) PausePractice(posMs int64) {
	a.grader.Pause(posMs)
}

// StopPractice deactivates grading entirely.
func (a *App) StopPractice() {
	a.grader.Stop()
}

// handleEvent is the pipeline emit callback. It pushes MIDI state to the
// frontend, grades incoming notes, and appends to the recording buffer when
// a recording session is active.
func (a *App) handleEvent(pCtx *pipelinectx.PipelineContext) {
	runtime.EventsEmit(a.ctx, "midi:state", MIDIState{
		PressedNotes: pCtx.PressedNotes,
		CurrentKey:   pCtx.CurrentKey,
		Chord:        pCtx.Chord,
		Inversion:    pCtx.Inversion,
		Triad:        pCtx.Triad,
		Velocity:     pCtx.Velocity,
		Dynamic:      pCtx.Dynamic.Label(),
		Interval:     pCtx.Interval,
	})
	a.gradeEvent(pCtx)
	a.bufferEvent(pCtx)
}

// gradeEvent grades a single MIDI event with Go-side precision and emits the
// result to the frontend via "grade:result" (note-on) or "grade:hold" (note-off).
// CC events (pedals) are skipped — they don't need grading.
func (a *App) gradeEvent(pCtx *pipelinectx.PipelineContext) {
	if pCtx.MIDIEvent.Command == midiCC {
		return // CC / pedal events are not graded
	}
	note := int(pCtx.MIDIEvent.Note)
	if pCtx.MIDIEvent.Velocity > 0 {
		if res, ok := a.grader.NoteOn(note, pCtx.MIDIEvent.Velocity); ok {
			runtime.EventsEmit(a.ctx, "grade:result", res)
		}
	} else {
		if res, ok := a.grader.NoteOff(note); ok {
			runtime.EventsEmit(a.ctx, "grade:hold", res)
		}
	}
}

// bufferEvent appends the event to the in-memory recording buffer when a
// recording session is active. Includes CC events (pedals) so they are
// preserved in the .pia file (E5).
func (a *App) bufferEvent(pCtx *pipelinectx.PipelineContext) {
	a.recMu.Lock()
	defer a.recMu.Unlock()
	if !a.isRec {
		return
	}
	a.recBuf = append(a.recBuf, RecordedEvent{
		T:    time.Since(a.recStart).Milliseconds(),
		Cmd:  byte(pCtx.MIDIEvent.Command),
		Note: pCtx.MIDIEvent.Note,
		Vel:  pCtx.MIDIEvent.Velocity,
	})
}

// StopCapture halts MIDI capture and tears down the pipeline goroutine.
func (a *App) StopCapture() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.capturing {
		return nil
	}
	if a.stopFn != nil {
		a.stopFn()
		a.stopFn = nil
	}
	return a.midiClient.Stop()
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// writeGzip compresses data with gzip and writes it to path (V3).
func writeGzip(path string, data []byte) error {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(data); err != nil {
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o644)
}

// gunzip decompresses gzip-encoded data (V3).
func gunzip(data []byte) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

// migrateRecordingMap upgrades a parsed v1 Recording map to v2 in-place (V1).
func migrateRecordingMap(rec map[string]any) {
	ver, _ := rec["version"].(float64)
	if ver >= 2 {
		return
	}
	rec["version"] = 2
	// Promote bpm → tempoMap
	if bpm, ok := rec["bpm"]; ok && rec["tempoMap"] == nil {
		rec["tempoMap"] = []any{map[string]any{"atMs": 0, "bpm": bpm}}
	}
	// Promote timeSignature → timeSignatureMap
	if ts, ok := rec["timeSignature"]; ok && rec["timeSignatureMap"] == nil {
		rec["timeSignatureMap"] = []any{map[string]any{"atMs": 0, "value": ts}}
	}
}
