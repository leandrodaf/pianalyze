// Package main implements the Wails application bindings for Pianalyze.
package main

import (
	"context"
	"sync"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
	"github.com/leandrodaf/midi/v2/sdk/midi"
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/pipeline"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.uber.org/zap"
)

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
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{}
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
}

// shutdown is called by Wails when the application is closing.
func (a *App) shutdown(_ context.Context) {
	_ = a.StopCapture()
}

// ListDevices returns the available MIDI input devices.
func (a *App) ListDevices() ([]DeviceInfo, error) {
	devices, err := a.midiClient.ListDevices()
	if err != nil {
		return nil, err
	}
	result := make([]DeviceInfo, len(devices))
	for i, d := range devices {
		result[i] = DeviceInfo{ID: i, Name: d.Name, Manufacturer: d.Manufacturer}
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

	// Build the emit callback: assembles MIDIState from the fully-processed context
	// and pushes it to the frontend. Called by FinalStage on every event.
	emit := func(ctx *pipelinectx.PipelineContext) {
		runtime.EventsEmit(a.ctx, "midi:state", MIDIState{
			PressedNotes: ctx.PressedNotes,
			CurrentKey:   ctx.CurrentKey,
			Chord:        ctx.Chord,
			Inversion:    ctx.Inversion,
			Triad:        ctx.Triad,
			Velocity:     ctx.Velocity,
			Dynamic:      ctx.Dynamic.Label(),
			Interval:     ctx.Interval,
		})
	}

	processor := pipeline.NewProcessorWithEmitter(a.logger, emit)

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
