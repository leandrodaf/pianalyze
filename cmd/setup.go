package cmd

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
	"github.com/leandrodaf/pianalyze/internal/constants"
	"go.uber.org/zap"
)

// SetupDevice lists available MIDI devices and prompts the user to select one.
// Devices are filtered to show only subdevice 0 of each physical port, avoiding
// duplicate entries from multi-subdevice virtual/hardware MIDI cards.
func SetupDevice(ctx context.Context, adapter contracts.ClientMIDI) (int, error) {
	devices, err := adapter.ListDevices()
	if err != nil {
		return 0, err
	}
	if len(devices) == 0 {
		return 0, constants.ErrNoMIDIDevices
	}

	// Filter to subdevice 0 only (hw:card,device,0) to avoid listing every
	// subdevice of the same port. Fall back to the full list if none match.
	type entry struct {
		originalIdx int
		info        contracts.DeviceInfo
	}
	var visible []entry
	for i, d := range devices {
		if strings.HasSuffix(d.Manufacturer, ",0") || !strings.Contains(d.Manufacturer, ",") {
			visible = append(visible, entry{i, d})
		}
	}
	if len(visible) == 0 {
		visible = make([]entry, len(devices))
		for i, d := range devices {
			visible[i] = entry{i, d}
		}
	}

	fmt.Println("Available MIDI devices:")
	for i, e := range visible {
		fmt.Printf("[%d] %s  (%s)\n", i, e.info.Name, e.info.Manufacturer)
	}

	// Buffered para que a goroutine possa sair mesmo se o contexto for cancelado antes da leitura.
	inputChan := make(chan int, 1)
	errorChan := make(chan error, 1)

	go func() {
		var choice int
		fmt.Print("Choose a MIDI device: ")
		_, err := fmt.Scanf("%d", &choice)
		if err != nil {
			errorChan <- err
			return
		}
		inputChan <- choice
	}()

	select {
	case <-ctx.Done():
		return 0, fmt.Errorf("selection canceled: %w", ctx.Err())
	case err := <-errorChan:
		return 0, err
	case choice := <-inputChan:
		if choice < 0 || choice >= len(visible) {
			return choice, constants.ErrInvalidDeviceID
		}
		originalIdx := visible[choice].originalIdx
		if err := adapter.SelectDevice(originalIdx); err != nil {
			return originalIdx, err
		}
		return originalIdx, nil
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
