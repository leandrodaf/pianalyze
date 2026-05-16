package main

import (
	"sync"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// MenuState is sent by the frontend on startup and after every settings change
// so the native menu can reflect the correct radio / checkbox selections.
type MenuState struct {
	Language   string `json:"language"`   // "pt-BR" | "en" | "es" | "zh-CN"
	ChordMode  string `json:"chordMode"`  // "full" | "short"
	SkillLevel string `json:"skillLevel"` // "beginner" | "intermediate" | "advanced" | ""
}

var menuMu sync.RWMutex

// SyncMenuState is called by the frontend after every settings change to keep
// the native menu radio / checkbox items in sync with the current state.
func (a *App) SyncMenuState(state MenuState) {
	menuMu.Lock()
	a.menuState = state
	menuMu.Unlock()
	if a.ctx != nil {
		runtime.MenuSetApplicationMenu(a.ctx, a.buildMenu())
	}
}

// buildMenu constructs the full application menu from the current MenuState.
// It is safe to call before ctx is set (initial build in main.go).
func (a *App) buildMenu() *menu.Menu {
	menuMu.RLock()
	s := a.menuState
	menuMu.RUnlock()

	// Default language to pt-BR on first build (before frontend syncs).
	if s.Language == "" {
		s.Language = "pt-BR"
	}
	if s.ChordMode == "" {
		s.ChordMode = "full"
	}

	m := menu.NewMenu()

	// ── macOS standard app menu (About, Services, Hide, Quit…) ───────────────
	m.Append(menu.AppMenu())

	// ── Arquivo ──────────────────────────────────────────────────────────────
	file := m.AddSubmenu("Arquivo")
	file.AddText("Importar arquivo…", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:import-file")
	})
	file.AddSeparator()
	file.AddText("Escolher pasta de gravações…", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:pick-save-dir")
	})

	// ── Preferências ─────────────────────────────────────────────────────────
	prefs := m.AddSubmenu("Preferências")

	// Language submenu — radio items reflect the current locale.
	lang := prefs.AddSubmenu("Idioma")
	for _, opt := range []struct{ code, label string }{
		{"pt-BR", "🇧🇷 Português (Brasil)"},
		{"en", "🇺🇸 English"},
		{"es", "🇪🇸 Español"},
		{"zh-CN", "🇨🇳 中文 (简体)"},
	} {
		code := opt.code
		label := opt.label
		lang.AddRadio(label, s.Language == code, nil, func(_ *menu.CallbackData) {
			runtime.EventsEmit(a.ctx, "menu:set-language", code)
		})
	}

	prefs.AddSeparator()

	// Chord display mode — radio items.
	chord := prefs.AddSubmenu("Modo de exibição de acordes")
	chord.AddRadio("Completo", s.ChordMode == "full", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:set-chord-mode", "full")
	})
	chord.AddRadio("Curto", s.ChordMode == "short", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:set-chord-mode", "short")
	})

	prefs.AddSeparator()

	// Skill level submenu — radio items.
	skill := prefs.AddSubmenu("Nível de habilidade")
	for _, opt := range []struct{ key, label string }{
		{"beginner", "🌱 Iniciante (50%)"},
		{"intermediate", "🎹 Intermediário (75%)"},
		{"advanced", "🌟 Avançado (100%)"},
	} {
		k := opt.key
		label := opt.label
		skill.AddRadio(label, s.SkillLevel == k, nil, func(_ *menu.CallbackData) {
			runtime.EventsEmit(a.ctx, "menu:set-skill-level", k)
		})
	}
	skill.AddSeparator()
	skill.AddText("Sem preferência", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:set-skill-level", "")
	})

	prefs.AddSeparator()
	prefs.AddText("Configurações…", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:open-settings")
	})

	// ── Janela ───────────────────────────────────────────────────────────────
	// WindowMenu provides platform-native items: Minimizar, Zoom, Tela Cheia…
	m.Append(menu.WindowMenu())

	return m
}
