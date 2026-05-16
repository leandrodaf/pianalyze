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

// menuStrings holds all translatable labels used in the native menu.
type menuStrings struct {
	File        string
	Import      string
	ChooseSave  string
	Prefs       string
	Language    string
	ChordMode   string
	ChordFull   string
	ChordShort  string
	SkillLevel  string
	Beginner    string
	Intermediate string
	Advanced    string
	NoPreference string
	Settings    string
	Window      string
}

// menuI18n contains translations for all supported locales.
var menuI18n = map[string]menuStrings{
	"pt-BR": {
		File:         "Arquivo",
		Import:       "Importar arquivo…",
		ChooseSave:   "Escolher pasta de gravações…",
		Prefs:        "Preferências",
		Language:     "Idioma",
		ChordMode:    "Modo de exibição de acordes",
		ChordFull:    "Completo",
		ChordShort:   "Curto",
		SkillLevel:   "Nível de habilidade",
		Beginner:     "🌱 Iniciante (50%)",
		Intermediate: "🎹 Intermediário (75%)",
		Advanced:     "🌟 Avançado (100%)",
		NoPreference: "Sem preferência",
		Settings:     "Configurações…",
		Window:       "Janela",
	},
	"en": {
		File:         "File",
		Import:       "Import file…",
		ChooseSave:   "Choose recordings folder…",
		Prefs:        "Preferences",
		Language:     "Language",
		ChordMode:    "Chord display mode",
		ChordFull:    "Full",
		ChordShort:   "Short",
		SkillLevel:   "Skill level",
		Beginner:     "🌱 Beginner (50%)",
		Intermediate: "🎹 Intermediate (75%)",
		Advanced:     "🌟 Advanced (100%)",
		NoPreference: "No preference",
		Settings:     "Settings…",
		Window:       "Window",
	},
	"es": {
		File:         "Archivo",
		Import:       "Importar archivo…",
		ChooseSave:   "Elegir carpeta de grabaciones…",
		Prefs:        "Preferencias",
		Language:     "Idioma",
		ChordMode:    "Modo de visualización de acordes",
		ChordFull:    "Completo",
		ChordShort:   "Corto",
		SkillLevel:   "Nivel de habilidad",
		Beginner:     "🌱 Principiante (50%)",
		Intermediate: "🎹 Intermedio (75%)",
		Advanced:     "🌟 Avanzado (100%)",
		NoPreference: "Sin preferencia",
		Settings:     "Configuración…",
		Window:       "Ventana",
	},
	"zh-CN": {
		File:         "文件",
		Import:       "导入文件…",
		ChooseSave:   "选择录音文件夹…",
		Prefs:        "偏好设置",
		Language:     "语言",
		ChordMode:    "和弦显示模式",
		ChordFull:    "完整",
		ChordShort:   "简短",
		SkillLevel:   "技能等级",
		Beginner:     "🌱 初学者 (50%)",
		Intermediate: "🎹 中级 (75%)",
		Advanced:     "🌟 高级 (100%)",
		NoPreference: "无偏好",
		Settings:     "设置…",
		Window:       "窗口",
	},
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

	if s.Language == "" {
		s.Language = "pt-BR"
	}
	if s.ChordMode == "" {
		s.ChordMode = "full"
	}

	i18n, ok := menuI18n[s.Language]
	if !ok {
		i18n = menuI18n["en"]
	}

	m := menu.NewMenu()

	// ── macOS standard app menu (About, Services, Hide, Quit…) ───────────────
	m.Append(menu.AppMenu())

	// ── File ─────────────────────────────────────────────────────────────────
	file := m.AddSubmenu(i18n.File)
	file.AddText(i18n.Import, keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:import-file")
	})
	file.AddSeparator()
	file.AddText(i18n.ChooseSave, nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:pick-save-dir")
	})

	// ── Preferences ──────────────────────────────────────────────────────────
	prefs := m.AddSubmenu(i18n.Prefs)

	// Language submenu — radio items reflect the current locale.
	lang := prefs.AddSubmenu(i18n.Language)
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
	chord := prefs.AddSubmenu(i18n.ChordMode)
	chord.AddRadio(i18n.ChordFull, s.ChordMode == "full", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:set-chord-mode", "full")
	})
	chord.AddRadio(i18n.ChordShort, s.ChordMode == "short", nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:set-chord-mode", "short")
	})

	prefs.AddSeparator()

	// Skill level submenu — radio items.
	skill := prefs.AddSubmenu(i18n.SkillLevel)
	for _, opt := range []struct{ key, label string }{
		{"beginner", i18n.Beginner},
		{"intermediate", i18n.Intermediate},
		{"advanced", i18n.Advanced},
	} {
		k := opt.key
		label := opt.label
		skill.AddRadio(label, s.SkillLevel == k, nil, func(_ *menu.CallbackData) {
			runtime.EventsEmit(a.ctx, "menu:set-skill-level", k)
		})
	}
	skill.AddSeparator()
	skill.AddText(i18n.NoPreference, nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:set-skill-level", "")
	})

	prefs.AddSeparator()
	prefs.AddText(i18n.Settings, keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:open-settings")
	})

	// ── Window ───────────────────────────────────────────────────────────────
	m.Append(menu.WindowMenu())

	return m
}
