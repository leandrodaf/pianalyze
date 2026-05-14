package cmd

import (
	"context"
	"fmt"
	"log"

	"github.com/leandrodaf/midi/sdk/contracts"
	"github.com/leandrodaf/pianalyze/internal/constants"
	"go.uber.org/zap"
)

// SetupDevice lists available MIDI devices and prompts the user to select one.
func SetupDevice(ctx context.Context, adapter contracts.ClientMIDI) (int, error) {
	devices, err := adapter.ListDevices()
	if err != nil {
		return 0, err
	}
	if len(devices) == 0 {
		return 0, constants.ErrNoMIDIDevices
	}

	fmt.Println("Available MIDI devices:")
	for i, device := range devices {
		fmt.Printf("[%d] %s\n", i, device.Name)
	}

	// Buffered para que a goroutine possa sair mesmo se o contexto for cancelado antes da leitura.
	inputChan := make(chan int, 1)
	errorChan := make(chan error, 1)

	go func() {
		var deviceID int
		fmt.Print("Choose a MIDI device: ")
		_, err := fmt.Scanf("%d", &deviceID)
		if err != nil {
			errorChan <- err
			return
		}
		inputChan <- deviceID
	}()

	select {
	case <-ctx.Done():
		return 0, fmt.Errorf("selection canceled: %w", ctx.Err())
	case err := <-errorChan:
		return 0, err
	case deviceID := <-inputChan:
		if deviceID < 0 || deviceID >= len(devices) {
			return deviceID, constants.ErrInvalidDeviceID
		}
		if err := adapter.SelectDevice(deviceID); err != nil {
			return deviceID, err
		}
		return deviceID, nil
	}
}

// BuildMode is set at compile time via -ldflags to select the logging format.
var BuildMode string

// InitLogger creates a Zap logger. Production mode emits JSON; development mode is human-readable.
func InitLogger() *zap.Logger {
	var (
		logger *zap.Logger
		err    error
	)

	if BuildMode == constants.BuildModeProduction {
		logger, err = zap.NewProduction()
	} else {
		logger, err = zap.NewDevelopment()
	}

	if err != nil {
		log.Fatalf("%s: %v", constants.ErrLoggerInitialization, err)
	}

	return logger
}
