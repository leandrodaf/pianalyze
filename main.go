// Pianalyze — real-time MIDI capture and analysis desktop application.
package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:            "Pianalyze",
		Width:            1200,
		Height:           700,
		MinWidth:         900,
		MinHeight:        500,
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 18, A: 1},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
		Menu: app.buildMenu(),

		// Disable the browser's default right-click context menu (hides
		// "Inspect Element" and other WebView internals from end users).
		EnableDefaultContextMenu: false,

		// Elements with style="--wails-draggable:drag" become window drag handles.
		CSSDragProperty: "--wails-draggable",
		CSSDragValue:    "drag",

		// ── macOS ─────────────────────────────────────────────────────────────
		Mac: &mac.Options{
			// Transparent titlebar with traffic-light buttons inset; the webview
			// content fills the full window (FullSizeContent: true is implied).
			// The frontend adds a matching draggable top bar to match the height.
			TitleBar: mac.TitleBarHiddenInset(),
			About: &mac.AboutInfo{
				Title:   "Pianalyze",
				Message: "Para estudantes e entusiastas de piano\n\n© Leandro Ferreira",
				Icon:    appIcon,
			},
		},

		// ── Windows ───────────────────────────────────────────────────────────
		Windows: &windows.Options{
			// Follow the OS dark/light theme preference.
			Theme: windows.SystemDefault,
			// Disable trackpad/touch pinch-zoom.
			DisablePinchZoom: true,
			// Resize debounce reduces WebView2 flicker during window resize.
			ResizeDebounceMS: 6,
		},

		// ── Linux ─────────────────────────────────────────────────────────────
		Linux: &linux.Options{
			// Icon shown in the taskbar and window switcher.
			Icon: appIcon,
			// On-demand GPU acceleration is better for audio/MIDI tools; the
			// Wails default (WebviewGpuPolicyNever) causes unnecessary CPU load.
			WebviewGpuPolicy: linux.WebviewGpuPolicyOnDemand,
			// Matches the .desktop file Name so window grouping works correctly.
			ProgramName: "pianalyze",
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
