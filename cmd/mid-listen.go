// Package cmd implements the CLI commands for pianalyze.
package cmd

import (
	"context"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
	"github.com/leandrodaf/midi/v2/sdk/midi"
	"github.com/leandrodaf/pianalyze/internal/constants"
	"github.com/leandrodaf/pianalyze/internal/pipeline"
	"github.com/leandrodaf/pianalyze/internal/pipeline/pipelinectx"
	"go.uber.org/zap"
)

// Start initializes MIDI event capture and runs the processing pipeline until interrupted.
func Start() {
	logger := InitLogger()
	defer logger.Sync() //nolint:errcheck

	midiClient, err := midi.NewMIDIClient(
		contracts.WithLogLevel(contracts.InfoLevel),
		contracts.WithChannelBufferSize(constants.MIDIChannelBufferSize),
		contracts.WithMIDIEventFilter(contracts.MIDIEventFilter{
			Commands: []contracts.MIDICommand{contracts.NoteOn, contracts.NoteOff},
		}),
	)
	if err != nil {
		logger.Error(constants.MsgMIDIClientSetupError, zap.Error(err))
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signalChan)

	deviceID, err := SetupDevice(ctx, midiClient)
	if err != nil {
		logger.Fatal(constants.MsgDeviceSelectionError, zap.Error(err))
		return
	}
	logger.Info(constants.MsgMIDIClientSetupSuccess, zap.Int("deviceID", deviceID))

	// v2: StartCapture devolve canal read-only; a lib fecha-o quando Stop() ou cancel() são chamados.
	eventChannel, err := midiClient.StartCapture(ctx)
	if err != nil {
		logger.Error("Failed to start MIDI capture", zap.Error(err))
		return
	}

	pipelineProcessor := pipeline.NewProcessor(logger)

	var wg sync.WaitGroup
	wg.Go(func() {
		for event := range eventChannel {
			pipelineCtx := pipelinectx.NewPipelineContext(ctx, event)
			if err := pipelineProcessor.Process(pipelineCtx); err != nil {
				logger.Error(constants.MsgMIDIProcessingError, zap.Error(err))
			}
		}
	})

	logger.Info(constants.MsgMIDIEventCaptureStarted)

	<-signalChan
	logger.Info("Received shutdown signal, stopping capture...")
	if err := midiClient.Stop(); err != nil {
		logger.Error("Error stopping MIDI capture", zap.Error(err))
	}
	cancel()

	wg.Wait()
	logger.Info("Shutdown complete")
}
