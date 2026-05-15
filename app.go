// Package main implements the Wails application bindings for Pianalyze.
package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
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
	HandPosition string `json:"handPosition,omitempty"` // keyboard position hint (G5)
	Voice        *byte  `json:"voice,omitempty"`        // voice within staff 1–4 (E7)
	Fermata      bool   `json:"fermata,omitempty"`      // fermata over this note (T5)
	Slur         string `json:"slur,omitempty"`         // "start"|"end"|"continue" — slur boundary (E4)
	Channel      *byte  `json:"channel,omitempty"`      // MIDI channel 0–15 (P2)
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
	Name         string `json:"name"`
	StartMs      int64  `json:"startMs"`
	Type         string `json:"type,omitempty"`         // "intro"|"verse"|"chorus"|"bridge"|"coda"|"rehearsal"|"free"
	RehearsalMark string `json:"rehearsalMark,omitempty"` // e.g. "A", "B", "1" (F4)
	Difficulty   int    `json:"difficulty,omitempty"`   // 1–5 per-section difficulty (G3)
}

// RepeatType is the kind of repeat / navigation marker in the score (F1).
type RepeatType = string

// Repeat is a repeat or navigation marker at a specific recording position (F1).
// When the converter pre-unrolls repeats into the events array, this field is
// retained as informational metadata and the app plays events linearly.
type Repeat struct {
	Type       RepeatType `json:"type"`                 // "repeat-open"|"repeat-close"|"segno"|"coda"|"fine"|"ds"|"dc"|"ds-coda"|"dc-coda"
	AtMs       int64      `json:"atMs"`                 // position of this marker in the recording (ms)
	TargetAtMs *int64     `json:"targetAtMs,omitempty"` // jump target for ds/dc/coda/repeat-close
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
	// Repeats are retained as metadata after a converter unrolls them into Events (F1).
	Repeats []Repeat `json:"repeats,omitempty"`

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
	ChordRoot    int    `json:"chordRoot"`
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

	// Ensure the default recordings directory exists at startup so dialogs
	// and auto-save never encounter a missing path on first run.
	a.GetDefaultSavePath()

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

// SaveRecording opens a native OS save-file dialog, pre-positioned at
// defaultDir (use empty string to leave it up to the OS), and writes the
// JSON recording (plain text) to the path chosen by the user.
// Returns nil if the user cancels.
func (a *App) SaveRecording(jsonData, defaultFilename, defaultDir string) error {
	opts := runtime.SaveDialogOptions{
		Title:           "Save Pianalyze Recording",
		DefaultFilename: defaultFilename,
		Filters: []runtime.FileFilter{
			{DisplayName: "Pianalyze Recording (*.pia)", Pattern: "*.pia"},
			{DisplayName: "JSON (*.json)", Pattern: "*.json"},
		},
	}
	if defaultDir != "" {
		// Ensure the directory exists; dialogs reject a missing DefaultDirectory.
		if err := os.MkdirAll(defaultDir, 0o755); err == nil {
			opts.DefaultDirectory = defaultDir
		}
	}
	path, err := runtime.SaveFileDialog(a.ctx, opts)
	if err != nil || path == "" {
		return err
	}
	return os.WriteFile(path, []byte(jsonData), 0o644)
}

// GetDefaultSavePath returns the default recordings directory
// (~/Documents/pianalyze) and ensures it exists on disk.
func (a *App) GetDefaultSavePath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		home = "."
	}
	p := filepath.Join(home, "Documents", "pianalyze")
	// Create the tree so dialogs and auto-save never fail on a fresh install.
	if mkErr := os.MkdirAll(p, 0o755); mkErr != nil {
		a.logger.Warn("could not create default save path", zap.String("path", p), zap.Error(mkErr))
	}
	return p
}

// PickSaveDirectory opens a native directory-picker dialog and returns the
// chosen path. title is the dialog window title, supplied by the frontend so
// it can be localised. Returns ("", nil) if the user cancels.
func (a *App) PickSaveDirectory(title string) (string, error) {
	defaultDir := a.GetDefaultSavePath() // creates the directory if missing
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            title,
		DefaultDirectory: defaultDir,
	})
	if err != nil || dir == "" {
		return "", err
	}
	return dir, nil
}

// AutoSaveRecording saves a recording JSON directly to dir/filename,
// creating the directory tree if needed. Returns the absolute saved path.
func (a *App) AutoSaveRecording(jsonData, dir, filename string) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	p := filepath.Join(dir, filename)
	return p, os.WriteFile(p, []byte(jsonData), 0o644)
}

// PauseRecording suspends event buffering without clearing the buffer.
func (a *App) PauseRecording() {
	a.recMu.Lock()
	a.isRec = false
	a.recMu.Unlock()
}

// ResumeRecording resumes event buffering after a pause.
func (a *App) ResumeRecording() {
	a.recMu.Lock()
	a.isRec = true
	a.recMu.Unlock()
}

// ── Recordings library ───────────────────────────────────────────────────────

// RecordingSummary is a lightweight summary of a .pia file for the library UI.
type RecordingSummary struct {
	Path       string `json:"path"`
	Filename   string `json:"filename"`
	Title      string `json:"title"`
	Composer   string `json:"composer"`
	Copyright  string `json:"copyright"`
	RecordedAt string `json:"recordedAt"`
	DurationMs int64  `json:"durationMs"`
	EventCount int    `json:"eventCount"`
	FileSizeB  int64  `json:"fileSizeB"`
}

// ListRecordings returns a summary of every .pia file in dir.
// If dir is empty, the default save path is used.
func (a *App) ListRecordings(dir string) ([]RecordingSummary, error) {
	if dir == "" {
		dir = a.GetDefaultSavePath()
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []RecordingSummary{}, nil
		}
		return nil, err
	}

	var out []RecordingSummary
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".pia") {
			continue
		}
		p := filepath.Join(dir, e.Name())
		fi, err := e.Info()
		if err != nil {
			continue
		}
		sum := RecordingSummary{
			Path:      p,
			Filename:  e.Name(),
			FileSizeB: fi.Size(),
		}
		// Read and parse minimal JSON to extract meta + timing.
		raw, err := os.ReadFile(p)
		if err == nil {
			if decompressed, err := gunzip(raw); err == nil {
				raw = decompressed
			}
			var partial struct {
				Meta struct {
					Title     string `json:"title"`
					Composer  string `json:"composer"`
					Copyright string `json:"copyright"`
				} `json:"meta"`
				RecordedAt string `json:"recordedAt"`
				Events     []struct {
					T int64 `json:"t"`
				} `json:"events"`
			}
			if json.Unmarshal(raw, &partial) == nil {
				sum.Title = partial.Meta.Title
				sum.Composer = partial.Meta.Composer
				sum.Copyright = partial.Meta.Copyright
				sum.RecordedAt = partial.RecordedAt
				sum.EventCount = len(partial.Events)
				if len(partial.Events) > 0 {
					sum.DurationMs = partial.Events[len(partial.Events)-1].T
				}
			}
		}
		out = append(out, sum)
	}
	// Newest first (by filename — ISO-date prefix ensures correct order).
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// UpdateRecordingMeta rewrites the meta block of a .pia file in-place.
func (a *App) UpdateRecordingMeta(path, title, composer, copyright string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if decompressed, e := gunzip(raw); e == nil {
		raw = decompressed
	}
	var rec map[string]any
	if err := json.Unmarshal(raw, &rec); err != nil {
		return err
	}
	meta, ok := rec["meta"].(map[string]any)
	if !ok {
		meta = map[string]any{}
	}
	meta["title"] = title
	meta["composer"] = composer
	meta["copyright"] = copyright
	rec["meta"] = meta
	updated, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return os.WriteFile(path, updated, 0o644)
}

// DeleteRecording permanently removes a .pia file.
func (a *App) DeleteRecording(path string) error {
	return os.Remove(path)
}

// OpenRecordingFolder reveals the recording's directory in the OS file manager.
func (a *App) OpenRecordingFolder(path string) {
	dir := filepath.Dir(path)
	runtime.BrowserOpenURL(a.ctx, "file://"+filepath.ToSlash(dir))
}

// ReadRecordingByPath reads a .pia file by its absolute path (plain JSON or
// gzip-compressed), applies v1→v2 migration, and returns the JSON string.
func (a *App) ReadRecordingByPath(recPath string) (string, error) {
	raw, err := os.ReadFile(recPath)
	if err != nil {
		return "", err
	}
	if dec, err := gunzip(raw); err == nil {
		raw = dec
	}
	var rec map[string]any
	if err := json.Unmarshal(raw, &rec); err != nil {
		return "", err
	}
	migrateRecordingMap(rec)
	out, err := json.Marshal(rec)
	if err != nil {
		return "", err
	}
	return string(out), nil
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

// ImportScoreFile opens a file dialog for MusicXML / MXL files, converts the
// selected score to a Recording v2, saves it as a .pia file in the default
// recordings library, and returns the saved file path.
func (a *App) ImportScoreFile() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import Score File",
		Filters: []runtime.FileFilter{
			{DisplayName: "MusicXML / MXL (*.xml;*.musicxml;*.mxl)", Pattern: "*.xml;*.musicxml;*.mxl"},
		},
	})
	if err != nil || filePath == "" {
		return "", err
	}

	raw, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("read file: %w", err)
	}

	xmlData := raw
	ext := strings.ToLower(filepath.Ext(filePath))
	if ext == ".mxl" {
		xmlData, err = extractMXL(raw)
		if err != nil {
			return "", fmt.Errorf("extract MXL: %w", err)
		}
	}

	rec, err := convertMusicXML(xmlData, filePath)
	if err != nil {
		return "", err
	}

	if len(rec.Events) == 0 {
		return "", fmt.Errorf("score contains no playable notes")
	}

	out, err := json.Marshal(rec)
	if err != nil {
		return "", err
	}

	// Save directly to the recordings library
	title := ""
	if rec.Meta != nil {
		title = rec.Meta.Title
	}
	filename := scoreFilename(title)
	dir := a.GetDefaultSavePath()
	savedPath := filepath.Join(dir, filename)
	if err := os.WriteFile(savedPath, out, 0o644); err != nil {
		return "", fmt.Errorf("save to library: %w", err)
	}
	return savedPath, nil
}

// scoreFilename generates a safe, unique .pia filename from a score title.
func scoreFilename(title string) string {
	if strings.TrimSpace(title) == "" {
		title = "imported-score"
	}
	var sb strings.Builder
	for _, r := range title {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			sb.WriteRune(r)
		case r == ' ', r == '_', r == '-', r == '.':
			sb.WriteRune('_')
		}
	}
	safe := strings.Trim(sb.String(), "_")
	if safe == "" {
		safe = "imported-score"
	}
	if len(safe) > 60 {
		safe = safe[:60]
	}
	return safe + "_" + time.Now().UTC().Format("20060102_150405") + ".pia"
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
		ChordRoot:    pCtx.ChordRoot,
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
