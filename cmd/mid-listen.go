package cmd

import (
	"context"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/leandrodaf/midi/sdk/contracts"
	"github.com/leandrodaf/midi/sdk/midi"
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
	done := make(chan struct{})
	closeOnce := sync.Once{}

	stopCapture := func(reason string) {
		logger.Info(reason)
		if err := midiClient.Stop(); err != nil {
			logger.Error("Error stopping MIDI capture", zap.Error(err))
		}
		cancel()
		closeOnce.Do(func() { close(done) })
	}

	deviceID, err := SetupDevice(ctx, midiClient)
	if err != nil {
		logger.Fatal(constants.MsgDeviceSelectionError, zap.Error(err))
		return
	}
	logger.Info(constants.MsgMIDIClientSetupSuccess, zap.Int("deviceID", deviceID))

	eventChannel := make(chan contracts.MIDI, constants.MIDIChannelBufferSize)
	midiClient.StartCapture(eventChannel)

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

	go func() {
		<-signalChan
		stopCapture("Received shutdown signal, stopping capture...")
	}()

	<-done
	close(eventChannel)
	wg.Wait()

	logger.Info("Shutdown complete")
}
