# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Executar a aplicação
go run main.go

# Build
go build

# Testes
go test ./...

# Gerar código (antes de builds de release)
go generate ./...

# Atualizar dependências
go mod tidy

# Release multi-plataforma (requer tag git)
# Configurado via .github/workflows/goreleaser.yml
goreleaser release
```

## Arquitetura

**Pianalyze** é uma ferramenta de captura e análise de eventos MIDI em tempo real, construída como base para um aplicativo de aprendizado de piano. Captura eventos de um dispositivo MIDI físico, processa-os por um pipeline de estágios e identifica notas, acordes e inversões musicais.

### Fluxo de dados

```
Dispositivo MIDI
    ↓
midiClient.StartCapture() → eventChannel (buffer 100)
    ↓
Loop de eventos (goroutine)
    ↓
NewPipelineContext(ctx, event)
    ↓
pipelineProcessor.Process()
    ├─ NoteStateUpdaterStage    → atualiza PressedNotes no State
    ├─ IntervalCalculatorStage  → calcula tempo entre eventos
    ├─ NoteIdentifierStage      → resolve nome da nota (CurrentKey)
    ├─ ChordIdentifierStage     → detecta acorde, inversão, tônica
    └─ FinalStage               → loga resultado (placeholder para servidor)
```

### Pacotes principais

- **`cmd/`** — Orquestração: `mid-listen.go` (loop principal, shutdown), `setup.go` (seleção interativa de dispositivo)
- **`internal/pipeline/`** — Interface `Stage[TContext, TState]` genérica + `Processor` que executa os estágios em sequência
- **`internal/pipeline/context/`** — `PipelineContext` carrega o evento MIDI e os resultados acumulados de cada estágio
- **`internal/pipeline/store/`** — `State` com `sync.RWMutex` para notas pressionadas e timestamp da última nota
- **`internal/pipeline/stages/`** — Cinco estágios concretos implementando a interface `Stage`
- **`internal/midi/`** — Teoria musical: mapeamento de 128 notas MIDI, detecção de 80+ tipos de acordes via bitmask de intervalos
- **`internal/constants/`** — Constantes, mensagens de erro e configurações padrão

### Interfaces-chave

```go
// Pipeline extensível com generics
type Stage[TContext any, TState any] interface {
    Process(ctx *TContext, state *TState) error
}

// Contrato do cliente MIDI (via github.com/leandrodaf/midi)
type ClientMIDI interface {
    ListDevices() ([]Device, error)
    SelectDevice(id int) error
    StartCapture(eventChannel chan MIDI)
    Stop() error
}
```

### Concorrência

Três goroutines independentes sincronizadas via `done` channel e `sync.Once`:
1. Loop de processamento de eventos MIDI
2. Handler de sinal (Ctrl+C)
3. Timeout automático de 60 segundos

### Detecção de acordes

`internal/midi/chord.go` usa bitmask de intervalos: normaliza as notas pressionadas módulo 12, calcula o hash de intervalos relativos e busca em um mapa de 80+ acordes pré-definidos. Requer mínimo de 3 notas simultâneas. `detectInversion()` verifica posição fundamental, 1ª e 2ª inversão.

### Build mode / Logger

A variável `BuildMode` (definida em compile-time via `-ldflags`) controla o logger Zap:
- `"production"` → JSON estruturado
- qualquer outro valor → formato legível para desenvolvimento
