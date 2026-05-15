// Package main implements the Wails application bindings for Pianalyze.
package main

import (
	"context"
	"encoding/json"
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

// RecordedEvent is one MIDI event captured during a recording session.
type RecordedEvent struct {
	T    int64 `json:"t"`    // wall-clock offset in milliseconds from recording start
	Cmd  byte  `json:"cmd"`  // raw MIDI command byte
	Note byte  `json:"note"` // MIDI note number 0–127
	Vel  byte  `json:"vel"`  // velocity 0–127 (0 = note off)
}

// Recording is the serialisable container for a captured performance.
type Recording struct {
	Version    int             `json:"version"`
	RecordedAt string          `json:"recordedAt"` // RFC3339 UTC
	Events     []RecordedEvent `json:"events"`
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
	return &App{
		recBuf: make([]RecordedEvent, 0, 2048),
		grader: grading.New(),
	}
}

// startup is called by Wails when the application is ready.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.logger = initLogger()

	client, err := midi.NewMIDIClient(
		contracts.WithLogLevel(contracts.InfoLevel),
		contracts.WithChannelBufferSize(constants.MIDIChannelBufferSize),
		contracts.WithMIDIEventFilter(contracts.MIDIEventFilter{
			Commands: []contracts.MIDICommand{contracts.NoteOn, contracts.NoteOff},
		}),
	)
	if err != nil {
		a.logger.Error(constants.MsgMIDIClientSetupError, zap.Error(err))
		runtime.EventsEmit(ctx, "app:error", err.Error())
		return
	}
	a.midiClient = client
	a.logger.Info(constants.MsgMIDIClientSetupSuccess)

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
// The returned JSON matches the Recording type expected by the frontend.
func (a *App) StopRecording() (string, error) {
	a.recMu.Lock()
	a.isRec = false
	events := make([]RecordedEvent, len(a.recBuf))
	copy(events, a.recBuf)
	start := a.recStart
	a.recMu.Unlock()

	rec := Recording{
		Version:    1,
		RecordedAt: start.UTC().Format(time.RFC3339),
		Events:     events,
	}
	data, err := json.Marshal(rec)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// SaveRecording opens a native OS save-file dialog and writes the JSON recording
// to the path chosen by the user. Returns nil if the user cancels.
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
	return os.WriteFile(path, []byte(jsonData), 0o644)
}

// ── Grading API (called by frontend practice engine) ─────────────────────────

// LoadPracticeIntervals replaces the set of expected note intervals used for
// grading. Call this once when a recording is loaded for practice.
func (a *App) LoadPracticeIntervals(intervals []grading.Interval) {
	a.grader.Load(intervals)
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
func (a *App) gradeEvent(pCtx *pipelinectx.PipelineContext) {
	note := int(pCtx.MIDIEvent.Note)
	if pCtx.MIDIEvent.Velocity > 0 {
		if res, ok := a.grader.NoteOn(note); ok {
			runtime.EventsEmit(a.ctx, "grade:result", res)
		}
	} else {
		if res, ok := a.grader.NoteOff(note); ok {
			runtime.EventsEmit(a.ctx, "grade:hold", res)
		}
	}
}

// bufferEvent appends the event to the in-memory recording buffer when a
// recording session is active. Safe to call unconditionally on every event.
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
