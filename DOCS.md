# Pianalyze — Documentação Técnica

> Documento vivo. Atualizar sempre que arquitetura, formato de dados ou comportamento mudar.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Stack tecnológica](#2-stack-tecnológica)
3. [Estrutura de pastas](#3-estrutura-de-pastas)
4. [Formato de gravação (.pia)](#4-formato-de-gravação-pia)
5. [Sistema de exercícios](#5-sistema-de-exercícios)
6. [Módulos do frontend](#6-módulos-do-frontend)
7. [Stores Svelte](#7-stores-svelte)
8. [Componentes visuais](#8-componentes-visuais)
9. [Sistema de grading](#9-sistema-de-grading)
10. [Pipeline de análise musical (Go)](#10-pipeline-de-análise-musical-go)
11. [Telas da aplicação](#11-telas-da-aplicação)
12. [Roadmap visual](#12-roadmap-visual)

---

## 1. Visão geral

**Pianalyze** é um app desktop de aprendizado de piano. O aluno conecta um teclado MIDI, carrega um exercício, e vê as notas viajando na tela em direção a uma linha dourada. Quando a nota chega na linha, é hora de tocar. O app compara o que o aluno tocou com a partitura e dá feedback visual imediato (Perfect / Good / OK / Miss / Wrong).

Além da prática guiada, o app suporta modo ao vivo (tocar livre com análise de acordes em tempo real) e importação de gravações `.pia`.

---

## 2. Stack tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Desktop shell | [Wails v2](https://wails.io/) — Go + WebView nativo |
| Backend | Go 1.23+ |
| Frontend | Svelte 4 + TypeScript (sem framework CSS) |
| Build | Vite (frontend), `wails build` (app final) |
| MIDI | `github.com/leandrodaf/midi/v2` |
| Renderização | Canvas 2D (sem WebGL, sem libs de canvas) |
| i18n | Sistema próprio em `src/lib/i18n/` (pt-BR, en, es, zh-CN) |

**Comandos principais:**

```bash
# Dev (hot-reload)
wails dev -tags webkit2_41

# Build
wails build -tags webkit2_41

# Testes Go
go test -race -tags webkit2_41 ./...

# Lint
golangci-lint run --build-tags webkit2_41 ./...
```

---

## 3. Estrutura de pastas

```
pianalyze/
├── cmd/                        # Orquestração Go
│   ├── mid-listen.go           # Event loop principal, graceful shutdown
│   └── setup.go                # Seleção de dispositivo, init do logger
├── internal/
│   ├── pipeline/               # Engine genérica de stages
│   │   ├── pipelinectx/        # PipelineContext — carrega o evento + análise acumulada
│   │   ├── store/              # State — mutex para notas pressionadas + timestamp atômico
│   │   └── stages/             # 5 implementações concretas de Stage
│   ├── midi/                   # Teoria musical: 128 notas, 80+ acordes, velocity→dynamic
│   └── constants/              # Constantes e erros sentinela compartilhados
├── frontend/
│   └── src/
│       ├── lib/
│       │   ├── recording-types.ts     # Recording, RecordedEvent, NoteInterval, Finger, Hand, Section
│       │   ├── exercise-types.ts      # Exercise, LibraryManifest, BundledManifest
│       │   ├── waterfall-layout.ts    # Matemática pura do waterfall (testável)
│       │   ├── waterfall-canvas.ts    # Orquestração: estado, RAF loop, API pública
│       │   ├── timeline-canvas.ts     # Canvas da mini timeline
│       │   ├── piano-canvas.ts        # Canvas do teclado de 88 teclas
│       │   ├── finger-colors.ts       # Cores fixas por dedo (1–5)
│       │   ├── note-colors.ts         # Cor por nota MIDI
│       │   ├── midi-types.ts          # Tipos MIDI compartilhados
│       │   └── i18n/                  # Sistema de tradução
│       ├── stores/
│       │   ├── playback.ts            # Engine de playback + prática + grading
│       │   ├── midi.ts                # Estado MIDI ao vivo (notas, acordes, dinâmica)
│       │   └── exercises.ts           # Lista de exercícios + loadFromUrl()
│       ├── components/
│       │   ├── HomeScreen.svelte      # Tela inicial completa
│       │   ├── NoteWaterfall.svelte   # Wrapper canvas + sincronização com stores
│       │   ├── Piano.svelte           # Wrapper canvas do teclado + finger hints
│       │   ├── Timeline.svelte        # Wrapper canvas da mini timeline + interações
│       │   ├── ControlsBar.svelte     # Transporte, velocidade, loop
│       │   ├── Toast.svelte           # Notificações temporárias (hot-plug MIDI)
│       │   └── ...                    # Outros componentes de análise
│       ├── data/
│       │   ├── builtin-manifest.json  # Manifesto dos exercícios embutidos
│       │   └── exercises/
│       │       └── scales/            # Arquivos .pia das escalas
│       └── App.svelte                 # Roteamento home ↔ playing
└── DESIGN.md / DOCS.md / CLAUDE.md   # Documentação
```

---

## 4. Formato de gravação (.pia)

Arquivos `.pia` são JSON que descrevem uma sequência de eventos MIDI com metadados musicais e pedagógicos.

### 4.1 Schema completo

```typescript
interface Recording {
  version: 1                     // sempre 1 por enquanto
  recordedAt: string             // ISO 8601 UTC

  // Metadados musicais (opcionais, mas fortemente recomendados em exercícios)
  bpm?: number                   // tempo alvo em BPM, ex: 96
  timeSignature?: string         // ex: "4/4", "3/4", "6/8"
  keySignature?: string          // ex: "C", "G", "Dm", "Am"

  // Seções nomeadas para navegação e loop rápido
  sections?: Section[]           // ordenadas por startMs crescente

  events: RecordedEvent[]
}

interface Section {
  name: string                   // ex: "Subida", "Descida", "Intro", "Refrão"
  startMs: number                // ms desde o início da gravação
}

interface RecordedEvent {
  t: number                      // ms desde o início
  cmd: number                    // 0x90 = NoteOn (vel>0 = on, vel=0 = off)
  note: number                   // MIDI 0–127
  vel: number                    // velocidade 0–127 (0 = note-off independente do cmd)
  finger?: Finger                // apenas em note-on (opcional)
  hand?: Hand                    // apenas em note-on (opcional)
}

type Finger = 1 | 2 | 3 | 4 | 5   // 1 = polegar … 5 = mínimo (igual para ambas as mãos)
type Hand   = 'left' | 'right'
```

### 4.2 NoteInterval (derivado em runtime)

`buildIntervals()` em `playback.ts` converte eventos em pares note-on/off:

```typescript
interface NoteInterval {
  note: number
  startMs: number
  endMs: number
  finger?: Finger    // herdado do note-on correspondente
  hand?: Hand        // herdado do note-on correspondente
}
```

### 4.3 Dedilhado (finger)

Convenção universal (igual para ambas as mãos):

| Número | Dedo | Cor |
|--------|------|-----|
| 1 | Polegar | `#ff4757` vermelho |
| 2 | Indicador | `#ffd32a` amarelo |
| 3 | Médio | `#2ed573` verde |
| 4 | Anelar | `#1e90ff` azul |
| 5 | Mínimo | `#cd84f1` roxo |

Quando `finger` está presente numa nota:
- **Waterfall**: exibe o número do dedo em círculo colorido sobre a barra
- **Piano**: tecla acende com a cor do dedo ao ser pressionada; mostra hint colorido suave nos próximos 1500ms antes da nota chegar

### 4.4 Convenções de dedilhado por tipo de escala

**Escalas diatônicas (Dó maior, Sol maior, Ré maior, Lá menor) — mão direita:**
- Subida: `1 2 3 | 1 2 3 4 5` (polegar passa por baixo no 4º grau)
- Descida: `5 4 3 2 1 | 3 2 1` (dedo 3 cruza por cima no 5º grau)

**Escala cromática — mão direita:**
- Subida: `1 3 1 3 2 1 3 1 3 1 3 2 1`
- Descida: `1 2 3 1 3 1 3 1 2 3 1 3 1`

### 4.5 Seções

Marcadores nomeados para navegação e loop rápido. Exemplo das escalas:

```json
"sections": [
  { "name": "Subida",  "startMs": 0    },
  { "name": "Descida", "startMs": 5000 }
]
```

O `startMs` do último exercício define onde começa a seção anterior (implicitamente). A UI pode usar esses marcadores para:
- Exibir divisórias na mini timeline
- Permitir clique-para-ir-para-seção
- Auto-definir região de loop ao clicar num botão de seção

### 4.6 Compatibilidade

Todos os campos novos (`bpm`, `timeSignature`, `keySignature`, `sections`, `finger`, `hand`) são **opcionais**. Arquivos `.pia` sem esses campos continuam funcionando normalmente — o app faz graceful fallback para comportamento sem metadados.

---

## 5. Sistema de exercícios

### 5.1 Interface Exercise

```typescript
interface Exercise {
  id: string               // slug kebab-case único, ex: "c-major-scale"
  title: string
  subtitle: string         // uma linha: notas, progressão, etc.
  description: string      // 1–3 frases explicando o que o aluno vai praticar
  author: ExerciseAuthor
  category: 'scales' | 'chords' | 'pieces'
  difficulty: 1 | 2 | 3 | 4 | 5
  tags: string[]
  style: {
    gradient: [string, string]   // cores para o card
    icon: string                 // emoji ou símbolo unicode
    coverImage?: string          // URL opcional de imagem de capa
  }
  stats: {
    durationSec: number
    bpm?: number
    timeSignature?: string
    hands?: 'left' | 'right' | 'both'
  }
  comingSoon?: boolean     // placeholder sem dados ainda
  data?: Recording         // undefined = não carregado / sem dados
}
```

### 5.2 Níveis de dificuldade

| Nível | Label | Cor |
|-------|-------|-----|
| 1 | Iniciante | `#4ade80` verde |
| 2 | Básico | `#86efac` verde claro |
| 3 | Intermediário | `#fb923c` laranja |
| 4 | Avançado | `#f87171` vermelho |
| 5 | Expert | `#a78bfa` roxo |

### 5.3 Fontes de exercícios

**Built-in (compilado no app):**
- `src/data/builtin-manifest.json` + arquivos em `src/data/exercises/**/*.json`
- Carregados via `import.meta.glob` na inicialização — disponíveis offline

**Remoto (URL de manifesto):**
- O aluno cola uma URL no sidebar da Home
- O app faz fetch do `LibraryManifest` JSON e resolve os `dataUrl` relativos
- Exercícios remotos são mesclados com os built-in (ID duplicado = remoto substitui)

### 5.4 Exercícios disponíveis (v0.0.4)

| ID | Título | Categoria | Dificuldade | Status |
|----|--------|-----------|-------------|--------|
| `c-major-scale` | Escala de Dó Maior | Escalas | 1 | ✅ |
| `g-major-scale` | Escala de Sol Maior | Escalas | 1 | ✅ |
| `a-minor-scale` | Escala de Lá Menor | Escalas | 1 | ✅ |
| `d-major-scale` | Escala de Ré Maior | Escalas | 2 | ✅ |
| `chromatic-scale` | Escala Cromática | Escalas | 2 | ✅ |
| `i-iv-v-i` | Progressão I–IV–V–I | Acordes | 1 | 🔜 |
| `minor-progression` | Progressão Menor | Acordes | 1 | 🔜 |
| `seventh-chords` | Acordes de Sétima | Acordes | 3 | 🔜 |
| `inversions` | Inversões de Acorde | Acordes | 3 | 🔜 |
| `jazz-voicings` | Voicings de Jazz | Acordes | 5 | 🔜 |
| `twinkle` | Twinkle Twinkle | Peças | 1 | 🔜 |
| `fur-elise` | Für Elise | Peças | 3 | 🔜 |
| `ode-to-joy` | Ode à Alegria | Peças | 1 | 🔜 |
| `happy-birthday` | Parabéns pra Você | Peças | 1 | 🔜 |
| `jingle-bells` | Jingle Bells | Peças | 1 | 🔜 |

---

## 6. Módulos do frontend

### 6.1 `waterfall-layout.ts` — matemática pura

Sem efeitos colaterais. Todas as funções recebem dados e retornam valores — testáveis unitariamente sem canvas.

```typescript
// Constantes exportadas
MIDI_MIN = 21, MIDI_MAX = 108
HAND_SPLIT = 60          // C4: >= treble / mão direita, < bass / mão esquerda
TOTAL_WHITE = 52         // teclas brancas do piano de 88 teclas
C4_WHITE_IDX = 23        // índice da tecla branca C4
DEFAULT_LEAD_TIME_SEC = 4
LINE_X_RATIO = 0.15      // posição da linha dourada (15% da área útil)
LIVE_SCROLL_PX_PER_SEC = 120

// Interface do layout computado
interface WaterfallLayout {
  W, H: number
  bottomPad: number
  wKeyH: number               // pixels por slot de tecla branca
  barHwhite, barHblack: number
  handGapPx: number           // separação visual entre as zonas das mãos
  nowX, judgeX: number        // X da linha dourada
  practiceScrollPxPerSec: number
}

// Funções exportadas
computeLayout(W, H, leadTimeSec): WaterfallLayout
pitchY(midi, layout): number       // Y do centro de uma nota MIDI
idxY(whiteIdx, layout): number     // Y de um slot de tecla branca
barH(midi, layout): number         // altura da barra (menor para sustenidos/bemóis)
ledgerSlots(midi): number[]        // índices onde desenhar linhas suplementares
```

**Separação visual de mãos:** `HAND_GAP_EXTRA_SLOTS = 7` — insere 7 alturas de tecla branca de espaço entre a zona bass e treble. Notas com `midi >= HAND_SPLIT` são deslocadas para cima por `handGapPx`.

### 6.2 `waterfall-canvas.ts` — orquestração

Importa tudo de `waterfall-layout.ts`. Gerencia estado interno + RAF loop.

**API pública:**
```typescript
interface WaterfallCanvas {
  noteOn(note, velocity): void
  noteOff(note): void
  setSpeed(multiplier): void
  setPracticeTime(ms): void
  enablePractice(intervals): void
  disablePractice(): void
  showGrade(note, grade): void
  getLeadTime(): number
  resize(w, h): void
  destroy(): void
}
```

**Prioridade de cor das barras (modo prática):**
1. Após grading: cor do resultado (perfect=dourado, good=verde, etc.)
2. `fingerColor(iv.finger)` — cor do dedo se definido
3. `noteColor(iv.note)` — cor cromática por nota MIDI (fallback)

### 6.3 `piano-canvas.ts` — teclado de 88 teclas

Renderiza as 88 teclas (MIDI 21–108) com dirty-key diffing: só repinta teclas cujo estado mudou.

**API pública:**
```typescript
interface PianoCanvas {
  updateKeys(pressed: number[], velocity: number): void
  setFingerMap(map: Map<number, Finger>): void
  redraw(): void
  resize(w, h): void
}
```

**Comportamento por estado da tecla:**

| Estado | Tecla branca | Tecla preta |
|--------|-------------|-------------|
| Normal | Creme `rgb(255,253,240)` | Gradiente escuro |
| Pressionada (sem finger) | `noteColor` brilhante | `noteColor` brilhante |
| Pressionada (com finger) | `FINGER_COLORS[finger]` brilhante | `FINGER_COLORS[finger]` brilhante |
| Hint (sem pressionar, com finger) | `hintTint()` suave 72% branco + 28% cor | Glow 33% opacidade + círculo numerado |

`hintTint(hex)`: mistura 28% da cor do dedo com 72% do creme da tecla branca.

### 6.4 `timeline-canvas.ts` — mini timeline

Visão comprimida da gravação inteira. Dois trilhos (mão direita/esquerda), régua de tempo adaptativa, needle de posição, região de loop A–B.

**Trilhos:**
- Mão direita (topo): notas `RIGHT_MIN=60` a `RIGHT_MAX=108` — cor `rgba(123,95,240,0.75)`
- Mão esquerda (baixo): notas `LEFT_MIN=21` a `LEFT_MAX=59` — cor `rgba(240,138,91,0.75)`
- Divisão atual: por range MIDI (TODO: usar campo `hand` quando disponível)

**Janela deslizante:** retângulo que espelha o intervalo visível do waterfall `[positionMs - PAST_MS, positionMs + LEAD_MS]`.

### 6.5 `finger-colors.ts`

```typescript
const FINGER_COLORS: Record<Finger, string> = {
  1: '#ff4757',  // polegar  — vermelho
  2: '#ffd32a',  // indicador — amarelo
  3: '#2ed573',  // médio    — verde
  4: '#1e90ff',  // anelar   — azul
  5: '#cd84f1',  // mínimo   — roxo
}
```

Cores consistentes em todo o app: waterfall, piano, hints.

---

## 7. Stores Svelte

### 7.1 `playback.ts`

Engine central de playback. Dois modos: **REVIEW** (injeta eventos no `midiStore`) e **PRACTICE** (não injeta — o teclado MIDI do aluno é o único input).

```typescript
interface PlaybackState {
  status: 'idle' | 'playing' | 'paused'
  positionMs: number
  durationMs: number
  recording: Recording | null
  practice: boolean
  speedMultiplier: number
  loopEnabled: boolean
  loopStart: number | null   // em positionMs (inclui lead time offset)
  loopEnd: number | null
}
```

**API pública:**
```typescript
loadRecording(recording): void
setPractice(on): void
play(): void
pause(): void
stop(): void
setSpeed(x): void
seekTo(ms): void
rewind(): void
setLoop(start, end): void
clearLoop(): void
toggleLoop(): void
gradeInput(note, currentMs): GradeResult
formatMs(ms): string
```

**Stores derivados:**
- `noteIntervals`: `NoteInterval[]` — pares note-on/off pré-processados para grading
- `playbackStore`: estado reativo completo

**Offset de lead time:** `positionMs` inclui o tempo de antecedência. Para comparar com timestamps da gravação (tempo musical), subtrair `DEFAULT_LEAD_TIME_SEC * 1000`:
```typescript
const musicMs = positionMs - DEFAULT_LEAD_TIME_SEC * 1000
```

### 7.2 `midi.ts`

Estado do teclado MIDI conectado ao vivo:

```typescript
interface MidiState {
  pressedNotes: number[]
  velocity: number
  chord: string
  inversion: string
  triad: string
  dynamic: string    // "pp" | "p" | "mp" | "mf" | "f" | "ff" | ""
}
```

Atualizado via bridge Wails a cada evento MIDI recebido pelo Go backend.

---

## 8. Componentes visuais

### 8.1 Layout da tela de tocar

```
┌──────────────────────────────────────────────────────┐
│ top-bar (38px)                                       │
│ ← Início   🎵 Escala de Dó Maior · C D E F G A B C  │
├──────────────────────────────────────────────────────┤
│                                                      │
│               waterfall  (flex: 1)                  │
│    [HUD: acorde / inversão / dinâmica]               │
│                                                      │
├──────────────────────────────────────────────────────┤
│  timeline  (60px)                                    │
│  MÃO DIREITA ░░▓▓░░░░▓░░▓▓▓░░░░░ ▓ loop region ▓   │
│  MÃO ESQ.   ░░░░▓▓░░░░░░▓▓░░░░░░               │
├──────────────────────────────────────────────────────┤
│  controls-bar (44px)                                 │
│  ⏮  ▶/⏸  ⏹  │  0.25x…2x  │  🔁                    │
├──────────────────────────────────────────────────────┤
│  piano  (clamp 120–200px)                            │
└──────────────────────────────────────────────────────┘
```

### 8.2 Waterfall — eixos

**Eixo Y (pitch):**
- Espelha as 52 teclas brancas (A0 → C8)
- Teclas pretas ficam no ponto médio entre as brancas vizinhas
- Linha tracejada especial em C4 (Middle C)
- Gap visual entre mão esquerda (bass) e mão direita (treble): 7 alturas de tecla

**Eixo X (tempo):**
- Linha dourada em ~15% da área útil (posição fixa)
- Direita da linha = futuro (notas que vão chegar)
- Esquerda da linha = passado (histórico)

**Cores padrão:**
- Mão direita (MIDI ≥ 60): roxo `#7b5ff0`
- Mão esquerda (MIDI < 60): laranja `#f08a5b`
- Nota pressionada com finger: `FINGER_COLORS[finger]`
- Nota pressionada sem finger: `noteColor(midi)` (gradiente cromático)

### 8.3 Piano — finger hints

O componente `Piano.svelte` calcula hints a cada tick do `playbackStore`:

```typescript
const HINT_WINDOW_MS = 1500  // mostra dica 1.5s antes da nota chegar

// Em modo prática playing:
const practiceMs = positionMs - DEFAULT_LEAD_TIME_SEC * 1000
// Para cada NoteInterval com finger definido dentro da janela:
if (iv.startMs >= practiceMs && iv.startMs <= practiceMs + HINT_WINDOW_MS)
  hints.set(iv.note, iv.finger)  // nota mais próxima por pitch vence
```

### 8.4 Timeline — interações

| Ação | Resultado |
|------|-----------|
| Click numa posição | `seekTo(ms)` — needle pula para aquela posição |
| Drag (> 5px) | Define região de loop A–B + `seekTo(A)` |
| Double-click | `clearLoop()` |

**Conversão de tempo:** a timeline opera em "tempo musical" (sem lead time offset). Toda conversão para `positionMs` adiciona `LEAD_MS` antes de chamar funções do store.

---

## 9. Sistema de grading

### 9.1 Fluxo

1. Aluno pressiona tecla no MIDI
2. `NoteWaterfall.svelte` detecta o evento via `midiStore`
3. Chama `gradeInput(note, positionMs - leadTimeMs)`
4. `gradeInput` busca em `noteIntervals` o intervalo mais próximo para aquela nota dentro de `GRADE_TOLERANCE_MS`
5. Atribui grade e `waterfall.showGrade(note, grade)` exibe badge animado

### 9.2 Grades

| Grade | Delta | Cor |
|-------|-------|-----|
| `perfect` | < 70ms | Dourado |
| `good` | 70–150ms | Verde |
| `ok` | 150–300ms | Laranja |
| `miss` | Nota esperada passou sem ser tocada | Vermelho |
| `wrong` | Nota tocada sem correspondência | Vermelho |

`GRADE_TOLERANCE_MS = 300` — janela máxima de aceitação.

---

## 10. Pipeline de análise musical (Go)

Roda a cada evento MIDI recebido. Stages executados em sequência:

```
MIDI event
  → NoteStateUpdaterStage   → atualiza pressedNotes, velocity, dynamic
  → IntervalCalculatorStage → microsegundos desde evento anterior
  → NoteIdentifierStage     → nome da nota ("C3", "F#4", …)
  → ChordIdentifierStage    → acorde, inversão, se é tríade
  → FinalStage              → log / placeholder para sistema de lições
```

### 10.1 Detecção de acordes

- Lookup table `[1<<12][]chordEntry` populada em `init()`
- Bitmask de 12 bits das classes de pitch → array de candidatos
- Verifica qual candidato tem o intervalo correto com a nota mais grave → inversão
- **Performance:** ~19–26 ns/op, 0 allocs/op

### 10.2 Dinâmica

Array `[256]DynamicLevel` pré-computado. O compilador elimina bounds check.

| Velocity | DynamicLevel | Label |
|----------|-------------|-------|
| 0 | `DynamicNone` | `""` |
| 1–21 | `DynamicPP` | `"pp"` |
| 22–42 | `DynamicP` | `"p"` |
| 43–63 | `DynamicMP` | `"mp"` |
| 64–84 | `DynamicMF` | `"mf"` |
| 85–105 | `DynamicF` | `"f"` |
| 106–127 | `DynamicFF` | `"ff"` |

---

## 11. Telas da aplicação

### 11.1 Home

- **Sidebar:** logo, navegação, seleção de dispositivo MIDI (pills, pill verde pulsante = conectado), campo de URL para biblioteca remota
- **Área principal:** saudação contextual (bom dia/tarde/noite), quick pills (▶ Continuar, 🎲 Aleatório, ⭐ Desafio do dia), seções de exercícios em grid responsivo
- **Cards:** gradiente + ícone, título, autor, dificuldade, duração; hover mostra ▶; click abre modal de detalhes
- **Modal:** cabeçalho com gradiente, stats grid (BPM, duração, compasso, mãos), botão "Praticar agora"

**Regra:** sem MIDI conectado o aluno pode navegar normalmente. O dispositivo é necessário apenas para input ao vivo durante a prática.

### 11.2 Tela de tocar

**Modos de operação:**

| Modo | Quando | Comportamento |
|------|--------|---------------|
| Prática | Exercício com dados carregado | Notas do exercício aparecem do lado direito; aluno é gradado |
| Ao Vivo | Sem exercício / Tocar Livre | Nota aparece na linha ao pressionar, histórico vai para a esquerda; sem grading |

**Transições:**
- "Praticar agora" → modo prática, aguarda ▶ para iniciar
- "Tocar Livre" → modo ao vivo imediato
- "← Início" → limpa estado, volta para Home

---

## 12. Roadmap visual

Features planejadas que aproveitam os novos campos do `.pia`:

### P1 — Alta prioridade

| Feature | Descrição | Campos usados |
|---------|-----------|---------------|
| **Chips de metadados no top bar** | Mostrar `4/4 · 96 BPM · C maior` ao lado do título | `bpm`, `timeSignature`, `keySignature` |
| **Seções na timeline** | Divisórias verticais com label ("Subida", "Descida") na régua; clique para seek | `sections` |
| **Botões de seção na ControlsBar** | Chips clicáveis que fazem seek + auto-loop da seção | `sections` |
| **Timeline usar campo `hand`** | Substituir split MIDI < 60 pelo campo explícito | `hand` |

### P2 — Prioridade média

| Feature | Descrição |
|---------|-----------|
| **Labels MD/ME no waterfall** | Texto flutuante no gap entre as zonas de mão |
| **Dinâmica prescrita** | Campo `dynamic` nos eventos indicando o que deveria ser tocado |
| **Articulação** | Campo `articulation` (legato, staccato, tenuto) nos eventos |

### P3 — Features avançadas

| Feature | Descrição |
|---------|-----------|
| **BPM ao vivo** | Calcular BPM do aluno comparando timing real vs. `bpm` do arquivo; mostrar desvio |
| **Relatório de sessão** | Ao final de um exercício, mostrar % de acerto, notas mais erradas, BPM médio |
| **Modo duas mãos** | Grading independente por mão usando campo `hand` |
| **Exercícios com partitura** | Renderizar pauta acima do waterfall sincronizada com a posição atual |
