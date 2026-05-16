package main

import (
	"os"
	"strings"
	"testing"

	"github.com/leandrodaf/midi/v2/sdk/contracts"
)

// ── deviceNamesEqual ──────────────────────────────────────────────────────────

func TestDeviceNamesEqual_SameSlices(t *testing.T) {
	if !deviceNamesEqual([]string{"Piano", "Guitar"}, []string{"Piano", "Guitar"}) {
		t.Error("identical slices should be equal")
	}
}

func TestDeviceNamesEqual_DifferentOrder(t *testing.T) {
	if deviceNamesEqual([]string{"Piano", "Guitar"}, []string{"Guitar", "Piano"}) {
		t.Error("different order should not be equal (order-sensitive)")
	}
}

func TestDeviceNamesEqual_DifferentLengths(t *testing.T) {
	if deviceNamesEqual([]string{"Piano"}, []string{"Piano", "Guitar"}) {
		t.Error("different lengths should not be equal")
	}
}

func TestDeviceNamesEqual_BothEmpty(t *testing.T) {
	if !deviceNamesEqual(nil, nil) {
		t.Error("both nil should be equal")
	}
	if !deviceNamesEqual([]string{}, []string{}) {
		t.Error("both empty should be equal")
	}
}

func TestDeviceNamesEqual_DifferentValues(t *testing.T) {
	if deviceNamesEqual([]string{"Piano"}, []string{"Guitar"}) {
		t.Error("different names should not be equal")
	}
}

// ── ListDevices ───────────────────────────────────────────────────────────────

func makeApp(listFunc func() ([]contracts.DeviceInfo, error)) *App {
	return &App{
		midiClient: &contracts.MockMIDIClient{
			ListDevicesFunc: listFunc,
		},
	}
}

func TestListDevices_FiltersSubDevicesKeepsPort0(t *testing.T) {
	app := makeApp(func() ([]contracts.DeviceInfo, error) {
		return []contracts.DeviceInfo{
			{Name: "Yamaha P-45", Manufacturer: "Yamaha,0"},
			{Name: "Yamaha P-45 sub", Manufacturer: "Yamaha,1"}, // filtered out
		}, nil
	})

	devices, err := app.ListDevices()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(devices) != 1 {
		t.Errorf("expected 1 device after filtering, got %d: %v", len(devices), devices)
	}
	if devices[0].Name != "Yamaha P-45" {
		t.Errorf("wrong device: %+v", devices[0])
	}
}

func TestListDevices_IncludesDeviceWithoutCommaInManufacturer(t *testing.T) {
	app := makeApp(func() ([]contracts.DeviceInfo, error) {
		return []contracts.DeviceInfo{
			{Name: "Korg", Manufacturer: "Korg"},
		}, nil
	})

	devices, err := app.ListDevices()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(devices) != 1 || devices[0].Name != "Korg" {
		t.Errorf("expected Korg device, got %v", devices)
	}
}

func TestListDevices_FiltersGhostEmptyNameEntries(t *testing.T) {
	app := makeApp(func() ([]contracts.DeviceInfo, error) {
		return []contracts.DeviceInfo{
			{Name: "  ", Manufacturer: "Ghost,0"},  // ghost — empty after trim
			{Name: "Real", Manufacturer: "Real,0"},
		}, nil
	})

	devices, err := app.ListDevices()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(devices) != 1 || devices[0].Name != "Real" {
		t.Errorf("expected only Real device, got %v", devices)
	}
}

func TestListDevices_FallbackWhenNoPort0Match(t *testing.T) {
	// All manufacturers have a comma but not ",0" — falls back to include all non-empty.
	app := makeApp(func() ([]contracts.DeviceInfo, error) {
		return []contracts.DeviceInfo{
			{Name: "DevA", Manufacturer: "Mfr,1"},
			{Name: "DevB", Manufacturer: "Mfr,2"},
		}, nil
	})

	devices, err := app.ListDevices()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(devices) != 2 {
		t.Errorf("fallback should include all non-empty devices; got %d", len(devices))
	}
}

func TestListDevices_NoDevices_ReturnsError(t *testing.T) {
	app := makeApp(func() ([]contracts.DeviceInfo, error) {
		return []contracts.DeviceInfo{}, nil
	})

	_, err := app.ListDevices()
	if err == nil {
		t.Error("expected error when no devices found")
	}
}

func TestListDevices_AllGhosts_ReturnsError(t *testing.T) {
	app := makeApp(func() ([]contracts.DeviceInfo, error) {
		return []contracts.DeviceInfo{
			{Name: "", Manufacturer: "X,0"},
			{Name: "   ", Manufacturer: "Y,0"},
		}, nil
	})

	_, err := app.ListDevices()
	if err == nil {
		t.Error("all-ghost list should return error")
	}
}

// ── GetDefaultSavePath ────────────────────────────────────────────────────────

func TestGetDefaultSavePath_ReturnsNonEmpty(t *testing.T) {
	app := &App{}
	path := app.GetDefaultSavePath()
	if strings.TrimSpace(path) == "" {
		t.Error("GetDefaultSavePath returned empty string")
	}
}

func TestGetDefaultSavePath_DirectoryExists(t *testing.T) {
	app := &App{}
	path := app.GetDefaultSavePath()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("directory does not exist: %v", err)
	}
	if !info.IsDir() {
		t.Errorf("%q is not a directory", path)
	}
}
