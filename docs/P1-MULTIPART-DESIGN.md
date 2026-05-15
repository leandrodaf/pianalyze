# P1 — Múltiplas Partes / Instrumentos
## Por que não foi implementado e o que precisaria mudar

> **Status:** gap intencional — implementar exige refatoração arquitetural em pelo menos 7 camadas.  
> Este documento explica o que é P1, por que foi deixado de lado, o que precisaria mudar,  
> e apresenta uma proposta de design concreta para quando o projeto decidir avançar.

---

## O que é P1

P1 é a capacidade do formato `.pia` de representar **mais de um fluxo de notas independente**
dentro de um único arquivo — cada fluxo com seu próprio instrumento, clave, canal MIDI e papel
(tocar automaticamente vs. gravar o estudante).

Casos de uso imediatos no contexto de aprendizado de piano:

| Cenário | Partes |
|---------|--------|
| **Mão direita isolada** | MO + ME como partes separadas — "pratique só a MD" |
| **Aula a 4 mãos** | Professor toca no canal 1, aluno no canal 0 — ambos no mesmo teclado |
| **Play-along** | Acompanhamento harmônico toca automaticamente enquanto aluno pratica a melodia |
| **Piano + Voz** | Partitura de canção: piano em dois pautas + linha vocal separada |
| **Dueto** | Dois pianistas em dispositivos diferentes, arquivo descreve as duas vozes |

---

## Por que não foi implementado agora

### 1. A suposição de stream único está em toda a base de código

O `.pia` atual é um **array plano de eventos** (`events[]`) sem nenhuma noção de parte.
Toda a arquitetura foi construída sobre isso:

```
events[] ──► buildIntervals() ──► practiceBars[] ──► canvas
         ──► scheduleFrom()  ──► midiStore ──► MIDI output
         ──► grader.go       ──► grade:result events
```

Adicionar `parts[]` exige mudar **todas as setas** acima — não é uma adição, é uma pivot.

### 2. O layout visual é hardcoded para 1 grande pauta de piano

`waterfall-layout.ts` define:

```typescript
const TREBLE_TOP_IDX = ...  // índice do Dó agudo
const BASS_BOT_IDX   = ...  // índice do Dó grave
```

Toda a geometria do canvas — altura de cada nota, posição vertical das barras,
posição dos pautas, posição dos hairpins — assume **dois pautas fixos** (clave de sol + clave de fá)
para um único instrumento de 88 teclas.

Renderizar um segundo instrumento exigiria um terceiro pauta, ou uma segunda "faixa" visual,
ou separação por cor — cada uma delas uma mudança de design não trivial.

### 3. O grader só entende um stream de expectativas

`grader.go` compara a entrada do estudante contra uma sequência linear de `RecordedEvent`.
Ele não tem conceito de "essa nota pertence à parte A" ou "ignore a parte B ao gravar".

Num dueto, o grader precisaria saber que o aluno toca apenas a parte 0 enquanto a parte 1
toca automaticamente — e nunca penalizar o aluno por notas da parte automática.

### 4. O `midiStore` não separa por canal

`midiStore.pressedNotes: number[]` é uma lista plana de MIDI note numbers **sem canal**.
Dois instrumentos no mesmo arquivo que compartilham notas teriam colisões.

### 5. Custo/benefício no escopo atual

O Pianalyze é hoje um app de piano solo. A funcionalidade core funciona 100% sem P1.
Implementar P1 adicionaria semanas de trabalho sem entregar nenhuma feature visível
para o usuário atual.

---

## O que precisaria mudar — camada por camada

### Camada 1 — Schema (`recording-types.ts` + `app.go`)

Adicionar a interface `Part`:

```typescript
export type PartRole =
  | 'practice'   // estudante toca — graded, monitorado
  | 'playback'   // tocado automaticamente — sem grading
  | 'reference'  // silencioso, só visual (partitura de referência)

export interface Part {
  id: string              // "rh", "lh", "teacher", "voice1"
  name: string            // "Mão Direita", "Acompanhamento"
  channel: number         // canal MIDI 0–15 que identifica esta parte nos events[]
  clef?: 'treble' | 'bass' | 'alto' | 'none'
  role?: PartRole         // default: "practice"
  instrument?: string     // "piano", "voice", "violin" — para síntese futura
  muted?: boolean         // silenciar na reprodução (e.g. para focar na mão certa)
}
```

`Recording` recebe:

```typescript
parts?: Part[]
// events[] mantém o array plano — cada event com channel: number para identificar a parte
```

**Por que manter `events[]` plano e não criar `events` por parte:**

- Compatibilidade total com v1 e v2 existentes (migration trivial)
- CC events (pedal) afetam todas as partes — faz sentido na timeline global
- `scheduleFrom()` já sabe ignorar eventos por `channel`

### Camada 2 — Playback (`playback.ts`)

`buildIntervals()` precisaria de um parâmetro opcional `channels?: number[]` para filtrar
quais partes renderizar no waterfall:

```typescript
function buildIntervals(events: RecordedEvent[], channels?: number[]): NoteInterval[]
```

`scheduleFrom()` precisaria distinguir:
- Partes com `role: 'playback'` → injeta no midiStore normalmente (são automaticamente tocadas)
- Partes com `role: 'practice'` → não injeta (o estudante vai tocar ao vivo)

Novo estado no `playbackStore`:

```typescript
activeParts: string[]   // ids das partes visíveis no waterfall
mutedParts: string[]    // ids das partes silenciadas
```

### Camada 3 — Canvas (`waterfall-canvas.ts`)

Esta é a camada mais invasiva. Opções:

**Opção A — Color-coding por parte (mais simples)**

Cada parte recebe uma cor diferente na paleta. O canvas continua com o layout atual
de uma grande pauta. As barras de cada parte ficam na mesma região vertical mas com
cor distinta. Funciona para piano a 4 mãos ou MD/ME isolada.

**Opção B — Faixas horizontais por parte (mais correto musicalmente)**

O canvas é dividido em N faixas verticais, uma por parte. Cada faixa tem seu próprio
par de pautas. Necessário para piano + voz ou piano + violino.

**Opção C — Alternável por botão (recomendado)**

Por padrão, opção A. Com um toggle, opção B. O exercício pode declarar qual modo preferir.

Custo estimado: Opção A ≈ 2 dias; Opção B ≈ 1 semana; Opção C ≈ 1,5 semana.

### Camada 4 — Grader (`grader.go`)

O grader precisa de um novo campo de configuração:

```go
type Profile struct {
    // ...
    GradedChannels []int  // quais canais MIDI pertencem ao estudante
}
```

Ao receber uma nota do estudante (via `grade:note` event), o grader compara
apenas contra eventos das partes `practice`. Eventos das partes `playback` são
ignorados na comparação.

Além disso, o grader precisa ser informado de quais notas estão soando
automaticamente para não as considerar como "tocadas pelo estudante".

### Camada 5 — `midiStore`

Atualmente:

```typescript
pressedNotes: number[]  // flat list
```

Com P1:

```typescript
pressedNotesByChannel: Map<number, Set<number>>
// ou
pressedNotes: number[]  // mantém compat — apenas notes do canal do estudante
```

A segunda opção (manter compat) é mais simples: `pressedNotes` continua
com apenas as notas do canal que o estudante está tocando.
O playback automático das outras partes não entra em `pressedNotes`.

### Camada 6 — `NoteWaterfall.svelte`

Precisa:
- Ler `recording.parts[]` e exibir controles de mute/solo por parte
- Passar a lista de `activeParts` para o canvas
- Ao iniciar modo prática, dizer ao grader quais canais são "do estudante"
- Exibir rótulo do instrumento no cabeçalho de cada faixa (opção B)

### Camada 7 — Exercícios (arquivos `.json` + manifest)

Todos os exercícios existentes têm `channel` ausente (assumem canal 0).
Uma migration automática de v2 → v2.1 precisaria:

1. Se `parts` está ausente → assume parte única implícita (compatível)
2. Se `parts` está presente → cada event usa `channel` para identificar a parte

Os 5 arquivos em `src/data` teriam um bloco `parts` adicionado:

```json
"parts": [
  { "id": "rh", "name": "Mão Direita", "channel": 0, "clef": "treble", "role": "practice" },
  { "id": "lh", "name": "Mão Esquerda", "channel": 1, "clef": "bass",   "role": "practice" }
]
```

(Hoje todos os eventos têm `hand: "right"` sem canal explícito — uma migration automática
poderia mapear `hand: "right"` → `channel: 0`, `hand: "left"` → `channel: 1`.)

---

## Resumo do impacto

| Camada | Arquivo(s) | Custo estimado | Risco de regressão |
|--------|-----------|----------------|-------------------|
| Schema | `recording-types.ts`, `app.go` | Baixo (1h) | Mínimo |
| Playback | `playback.ts` | Médio (4h) | Médio — buildIntervals/scheduleFrom |
| Canvas | `waterfall-canvas.ts` | **Alto (3–7d)** | **Alto** — geometria inteira |
| Grader | `grader.go` | Médio (4h) | Médio — lógica de matching |
| midiStore | `midi.ts` | Baixo (2h) | Baixo |
| Svelte UI | `NoteWaterfall.svelte` | Médio (1d) | Médio |
| Dados | `src/data/**/*.json` | Baixo (1h) | Nenhum |
| **Total** | 7 arquivos core | **~1,5–2 semanas** | **Canvas é o gargalo** |

---

## Proposta de design para implementação futura

### Schema v2.1 — adição não-breaking

```jsonc
{
  "version": 2,
  "parts": [
    { "id": "student", "name": "Aluno",     "channel": 0, "clef": "treble", "role": "practice" },
    { "id": "teacher", "name": "Professor", "channel": 1, "clef": "bass",   "role": "playback" }
  ],
  "events": [
    // MO do professor: channel:1
    { "t": 0,   "cmd": 144, "note": 48, "vel": 60, "hand": "left",  "channel": 1 },
    // MD do aluno: channel:0
    { "t": 125, "cmd": 144, "note": 60, "vel": 72, "hand": "right", "channel": 0 }
  ]
}
```

**Compatibilidade garantida:**
- Arquivo sem `parts` → comportamento atual, sem quebra
- Arquivo com `parts` → novo comportamento

### Ordem de implementação recomendada

1. **Schema** — adicionar `Part` + `parts[]` (sem impacto nos tests)
2. **Grader** — adicionar `gradedChannels` (isolado, testável)
3. **Playback** — filtrar `buildIntervals` e `scheduleFrom` por canal
4. **Canvas opção A** — color-coding por parte (entrega valor rápido)
5. **NoteWaterfall UI** — controles de mute/solo
6. **Dados** — atualizar os 5 arquivos de exercício
7. **Canvas opção B** — faixas por parte (opcional, fase 2)

---

## Veredicto

P1 **deve** ser implementado quando o projeto entrar no ciclo de features
de "exercícios colaborativos" ou "prática de mão isolada com feedback separado".

**Não** foi implementado agora porque:

1. O custo da camada de canvas é desproporcional ao valor entregue hoje (zero usuários precisam disso ainda)
2. Implementar `Part` incompleto (só schema, sem canvas) criaria um schema "morto" — o exato problema que os outros gaps resolveram
3. A única feature de P1 que **já funciona** hoje é a distinção MD/ME via `hand: "right"|"left"`, que o canvas usa para colorir barras — isso cobre 90% do caso de uso de "isolar mãos"

**Pré-condição para implementar:** definir qual dos 3 modos de canvas (A/B/C) é o certo.
Essa decisão de UX bloqueia tudo o mais. Quando for decidida, a implementação pode
seguir a ordem dos 7 passos acima com risco controlado.

---

*Documento criado em 2026-05-15. Rever ao planejar fase de exercícios colaborativos.*
