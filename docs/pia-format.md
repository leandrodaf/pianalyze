# Formato `.pia` — Especificação Completa

> **Versão do schema atual:** 2  
> **Versão legada suportada:** 1 (migração automática)

---

## O que é o `.pia`

O `.pia` é o formato nativo do Pianalyze para armazenar performances e exercícios de piano.
Ele é projetado para ser simultaneamente:

- **Simples** — JSON puro, legível por humanos, sem dependências externas
- **Completo** — representa tudo que uma partitura pedagógica precisa: timing, expressão, dedilhado, acordes, seções, repetições, critérios de avaliação
- **Compacto** — suporta compressão gzip transparente (`.pia.gz`), reduzindo o tamanho em ~70–80%
- **Evolutivo** — campo `version` explícito + pipeline de migração automática; arquivos antigos nunca quebram
- **Independente de plataforma** — JSON é suportado por qualquer linguagem, qualquer sistema operacional

---

## Extensões e codificação

| Extensão | Conteúdo | Quando usar |
|---|---|---|
| `.pia` | JSON puro UTF-8 | Arquivos editados manualmente, debug |
| `.pia.gz` | JSON comprimido com gzip | Distribuição, biblioteca embutida |
| `.json` | JSON puro (alias aceito) | Compatibilidade com ferramentas genéricas |

O app **detecta automaticamente** se o arquivo está comprimido pelos magic bytes `0x1F 0x8B`
(cabeçalho gzip) — a extensão não importa para a detecção.

---

## Estrutura raiz

```jsonc
{
  "version": 2,           // obrigatório — versão do schema
  "recordedAt": "...",    // opcional — timestamp ISO 8601 UTC da gravação

  "meta": { ... },        // opcional — título, compositor, proveniência
  "tempoMap": [ ... ],    // opcional — mapa de andamento (substitui "bpm")
  "timeSignatureMap": [ ... ], // opcional — mapa de compasso (substitui "timeSignature")
  "keySignature": "...",  // opcional — armadura de clave
  "pickup": false,        // opcional — true se o primeiro compasso é anacruse

  "sections": [ ... ],    // opcional — seções nomeadas (intro, verso, refrão…)
  "measureMap": [ ... ],  // opcional — posição de início de cada compasso
  "hairpins": [ ... ],    // opcional — crescendos e decrescendos
  "repeats": [ ... ],     // opcional — marcadores de repetição e navegação

  "gradingProfile": { ... }, // opcional — tolerâncias de avaliação personalizadas

  "events": [ ... ]       // obrigatório — array de eventos MIDI
}
```

---

## Campo `version`

| Valor | Significado |
|---|---|
| `1` | Schema legado — `bpm` e `timeSignature` são campos escalares |
| `2` | Schema atual — `tempoMap` e `timeSignatureMap` são arrays |

A migração `v1 → v2` acontece automaticamente ao carregar o arquivo:
- `bpm: 120` → `tempoMap: [{ atMs: 0, bpm: 120 }]`
- `timeSignature: "4/4"` → `timeSignatureMap: [{ atMs: 0, value: "4/4" }]`

Os campos `bpm` e `timeSignature` são mantidos no v2 apenas por compatibilidade —
nunca devem ser escritos por ferramentas novas.

---

## Metadados — `meta`

```jsonc
{
  "title": "Invenção a 2 Vozes nº 1",
  "composer": "J.S. Bach",
  "copyright": "Domínio público",
  "coverUrl": "https://...",     // URL de imagem de capa (opcional)
  "difficulty": 3,               // 1–5: 1=iniciante, 5=expert
  "tags": ["baroque", "bach", "beginner"],
  "source": {
    "format": "musicxml",        // "musicxml" | "mscz" | "midi" | "manual"
    "filename": "bach_bwv772.xml",
    "importedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

## Timing

### `tempoMap` — Mapa de andamento (T1, T2, T4)

Array de eventos de andamento ordenado por `atMs`.

```jsonc
[
  { "atMs": 0,    "bpm": 120, "beatUnit": "quarter", "label": "Allegro" },
  { "atMs": 8000, "bpm": 100, "toMs": 10000, "toBpm": 80, "label": "rit." },
  { "atMs": 10000, "bpm": 80 }
]
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `atMs` | `number` | ✅ | Posição de início do andamento (ms) |
| `bpm` | `number` | ✅ | BPM no ponto `atMs` |
| `beatUnit` | `string` | — | Unidade de batida: `"quarter"` (padrão), `"half"`, `"eighth"`, `"dotted-quarter"` |
| `toMs` | `number` | — | Fim do ramp linear (ms). Obrigatório junto com `toBpm` |
| `toBpm` | `number` | — | BPM ao final do ramp — modela rit./accel. |
| `label` | `string` | — | Rótulo legível: `"Allegro"`, `"rit."`, `"a tempo"` |

**Ramp linear:** quando `toMs` e `toBpm` estão presentes, o tempo interpola linearmente
de `bpm` até `toBpm` ao longo do intervalo `atMs → toMs`. Isso modela rallentandi e
accelerandi contínuos com precisão milissegundo.

### `timeSignatureMap` — Mapa de fórmula de compasso (T3)

```jsonc
[
  { "atMs": 0,    "value": "4/4" },
  { "atMs": 12000, "value": "3/4" }
]
```

Valores típicos: `"4/4"`, `"3/4"`, `"6/8"`, `"5/4"`, `"7/8"`, `"12/8"`.

### `measureMap` — Início de compassos (F2)

Permite ao app posicionar o metrônomo e navegar por número de compasso.

```jsonc
[
  { "measure": 0, "atMs": 0 },    // measure 0 = anacruse (se "pickup": true)
  { "measure": 1, "atMs": 500 },
  { "measure": 2, "atMs": 2500 }
]
```

- `measure: 0` representa a anacruse quando `pickup: true`.
- Compassos são indexados a partir de 1.

### `keySignature`

Armadura de clave em notação compacta: `"C"`, `"G"`, `"D"`, `"F"`, `"Bb"`, `"Am"`, `"Dm"`.
Apenas informativo — não afeta a reprodução MIDI.

### `pickup`

`true` quando o primeiro compasso é uma anacruse. O `measureMap` deve ter `measure: 0`
para a anacruse nesse caso.

---

## Estrutura musical

### `sections` — Seções nomeadas (F3, F4, G3)

```jsonc
[
  {
    "name": "Tema A",
    "startMs": 0,
    "type": "verse",
    "rehearsalMark": "A",
    "difficulty": 2
  },
  {
    "name": "Coda",
    "startMs": 32000,
    "type": "coda"
  }
]
```

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | `string` | Nome exibido na UI |
| `startMs` | `number` | Início da seção em ms |
| `type` | `string` | Papel estrutural: `"intro"`, `"verse"`, `"chorus"`, `"bridge"`, `"coda"`, `"rehearsal"`, `"free"` |
| `rehearsalMark` | `string` | Letra/número de ensaio mostrado na partitura: `"A"`, `"B"`, `"1"` |
| `difficulty` | `number` | Dificuldade desta seção: 1–5 |

### `repeats` — Repetições e navegação (F1)

Marcadores de repetição preservados como metadado quando o conversor já pré-desenrolou
as repetições no array `events`. O app sempre toca `events` linearmente.

```jsonc
[
  { "type": "repeat-open",  "atMs": 4000 },
  { "type": "repeat-close", "atMs": 24000, "targetAtMs": 4000 },
  { "type": "segno",        "atMs": 0 },
  { "type": "ds-coda",      "atMs": 48000 },
  { "type": "coda",         "atMs": 52000 }
]
```

| `type` | Símbolo | Significado |
|---|---|---|
| `"repeat-open"` | `‖:` | Início de colchete de repetição |
| `"repeat-close"` | `:‖` | Fim de colchete — volta ao `repeat-open` |
| `"segno"` | `𝄋` | Alvo de Dal Segno |
| `"coda"` | `𝄌` | Alvo de Coda |
| `"fine"` | Fine | Fim da peça em D.C./D.S. |
| `"ds"` | D.S. | Dal Segno — vai para `segno` |
| `"dc"` | D.C. | Da Capo — vai ao início |
| `"ds-coda"` | D.S. al Coda | Vai ao segno, depois à coda |
| `"dc-coda"` | D.C. al Coda | Vai ao início, depois à coda |

### `hairpins` — Dinâmicas graduais (E3)

Crescendo e decrescendo entre dois pontos.

```jsonc
[
  { "startMs": 4000,  "endMs": 8000,  "from": "mp", "to": "f" },
  { "startMs": 16000, "endMs": 20000, "from": "f",  "to": "p" }
]
```

---

## Eventos MIDI — `events`

O coração do formato. Array plano de eventos ordenado por `t` (ms desde o início da gravação).

### Tipos de evento

| `cmd` (hex) | `cmd` (decimal) | Tipo | Uso |
|---|---|---|---|
| `0x90` | `144` | **NoteOn** | Tecla pressionada. `vel > 0` = pressionar; `vel = 0` = soltar (equivalente a NoteOff) |
| `0x80` | `128` | **NoteOff** | Tecla liberada |
| `0xB0` | `176` | **Control Change** | Pedal sustain (CC 64), sostenuto (CC 66), una corda (CC 67) |

### Campos de um evento

```jsonc
{
  // ── Core (obrigatório) ──────────────────────────────────────────────
  "t":    1250,    // ms desde o início da gravação (inteiro recomendado, float aceito)
  "cmd":  144,     // byte de comando MIDI (0x90, 0x80 ou 0xB0)
  "note": 60,      // MIDI note 0–127 (NoteOn/Off) ou número do CC (0xB0)
  "vel":  80,      // velocidade 0–127 (vel=0 em NoteOn equivale a NoteOff)

  // ── Pedais (apenas eventos CC) ──────────────────────────────────────
  // note=64 → sustain, 66 → sostenuto, 67 → una corda
  // vel >= 64 = pedal pressionado; vel < 64 = pedal liberado

  // ── Pedagogia (apenas NoteOn) ───────────────────────────────────────
  "finger":       3,           // dedo: 1=polegar … 5=mínimo
  "hand":         "right",     // "left" | "right"
  "dynamic":      "mf",        // dinâmica prescrita pela partitura (≠ vel de reprodução)
  "articulation": "staccato",  // "legato" | "staccato" | "tenuto" | "accent"
  "grace":        true,        // true = acciaccatura / appoggiatura
  "voice":        1,           // voz no pauta: 1=melodia … 4
  "fermata":      false,       // true = fermata sobre esta nota
  "slur":         "start",     // ligadura: "start" | "continue" | "end"
  "tip":          "cruzar polegar aqui",   // dica pedagógica exibida na linha de julgamento
  "handPosition": "Dó central",            // posição da mão no teclado
  "channel":      0            // canal MIDI 0–15 (multi-instrumento)
}
```

### Tabela de notas MIDI

| Nota | MIDI | Nota | MIDI |
|---|---|---|---|
| C0 | 12 | C4 (Dó central) | 60 |
| A0 (tecla mais grave) | 21 | A4 (Lá 440 Hz) | 69 |
| C8 (tecla mais aguda) | 108 | — | — |

### Tabela de dinâmicas (`dynamic`)

| Valor | Nome | `vel` de referência |
|---|---|---|
| `"ppp"` | pianississimo | ~10 |
| `"pp"` | pianissimo | ~20 |
| `"p"` | piano | ~40 |
| `"mp"` | mezzo-piano | ~55 |
| `"mf"` | mezzo-forte | ~72 |
| `"f"` | forte | ~90 |
| `"ff"` | fortissimo | ~110 |
| `"fff"` | fortississimo | ~120 |

> **Atenção:** `dynamic` é a dinâmica **prescrita pela partitura** (pedagogia).
> `vel` é a velocidade de **reprodução MIDI**. São campos independentes —
> um exercício pode prescrever `"f"` mas reproduzir a 72 para suavizar.

### Pedais (eventos CC)

```jsonc
{ "t": 5000, "cmd": 176, "note": 64, "vel": 127 }  // sustain ON
{ "t": 7500, "cmd": 176, "note": 64, "vel": 0 }    // sustain OFF
```

| `note` (CC nº) | Pedal |
|---|---|
| `64` | Sustain (damper) |
| `66` | Sostenuto |
| `67` | Una corda (soft) |

---

## Perfil de avaliação — `gradingProfile` (G1, G2)

Tolerâncias para o engine de grading. Todos os campos são opcionais —
valores padrão são usados quando ausentes.

```jsonc
{
  "earlyToleranceMs": 500,   // máximo ms de antecipação permitida (padrão: 500)
  "lateToleranceMs":  300,   // máximo ms de atraso permitido (padrão: 300)
  "perfectMs":        90,    // delta máximo para "perfeito" (padrão: 90)
  "goodMs":           200,   // delta máximo para "bom" (padrão: 200)
  "checkVelocity":    false,  // penalizar diferenças de velocidade (padrão: false)
  "velocityTolerance": 30,   // diferença de vel aceitável quando checkVelocity=true
  "checkArticulation": false  // penalizar articulação incorreta (padrão: false)
}
```

### Como o grading funciona

O engine compara cada nota pressionada pelo estudante com o `NoteInterval` mais próximo
na gravação de referência. O resultado por nota é:

| Resultado | Condição |
|---|---|
| **perfect** | `|delta| ≤ perfectMs` |
| **good** | `|delta| ≤ goodMs` |
| **ok** | dentro da janela `earlyToleranceMs / lateToleranceMs` |
| **miss** | fora da janela de tolerância |

---

## Compressão gzip

Para distribuição e biblioteca embutida, o arquivo pode ser comprimido:

```sh
gzip -9 recording.pia          # gera recording.pia.gz
```

O Pianalyze detecta gzip pelos primeiros dois bytes (`0x1F 0x8B`) independentemente da
extensão. Arquivos da biblioteca interna são sempre distribuídos como `.pia.gz`.

---

## Migração v1 → v2

Arquivos v1 têm `"version": 1` (ou sem o campo) e campos escalares:

```jsonc
// v1 (legado)
{ "version": 1, "bpm": 120, "timeSignature": "4/4", "events": [ ... ] }
```

Ao carregar, o pipeline de migração transforma automaticamente:

```jsonc
// v2 (resultado da migração)
{
  "version": 2,
  "tempoMap": [{ "atMs": 0, "bpm": 120 }],
  "timeSignatureMap": [{ "atMs": 0, "value": "4/4" }],
  "events": [ ... ]
}
```

A migração acontece tanto no backend Go quanto no frontend TypeScript —
arquivos v1 funcionam em todos os pontos de entrada do app.

---

## Exemplo completo mínimo

```jsonc
{
  "version": 2,
  "recordedAt": "2024-06-01T14:30:00Z",
  "meta": {
    "title": "Dó Maior — Escala Simples",
    "composer": "Exercício",
    "difficulty": 1,
    "tags": ["beginner", "scale", "c-major"]
  },
  "tempoMap": [
    { "atMs": 0, "bpm": 80, "beatUnit": "quarter", "label": "Andante" }
  ],
  "timeSignatureMap": [
    { "atMs": 0, "value": "4/4" }
  ],
  "keySignature": "C",
  "measureMap": [
    { "measure": 1, "atMs": 0 },
    { "measure": 2, "atMs": 3000 },
    { "measure": 3, "atMs": 6000 }
  ],
  "gradingProfile": {
    "earlyToleranceMs": 600,
    "lateToleranceMs": 400
  },
  "events": [
    { "t": 0,    "cmd": 144, "note": 60, "vel": 72, "finger": 1, "hand": "right" },
    { "t": 750,  "cmd": 128, "note": 60, "vel": 0 },
    { "t": 750,  "cmd": 144, "note": 62, "vel": 70, "finger": 2, "hand": "right" },
    { "t": 1500, "cmd": 128, "note": 62, "vel": 0 },
    { "t": 1500, "cmd": 144, "note": 64, "vel": 68, "finger": 3, "hand": "right" },
    { "t": 2250, "cmd": 128, "note": 64, "vel": 0 }
  ]
}
```

---

## Exemplo com recursos avançados

```jsonc
{
  "version": 2,
  "recordedAt": "2024-06-15T09:00:00Z",
  "meta": {
    "title": "Noturno Op. 9 Nº 2 (fragmento)",
    "composer": "F. Chopin",
    "difficulty": 4,
    "tags": ["romantic", "chopin", "nocturne"],
    "source": { "format": "musicxml", "filename": "chopin_op9_no2.xml" }
  },
  "tempoMap": [
    { "atMs": 0,     "bpm": 66,  "beatUnit": "quarter", "label": "Andante" },
    { "atMs": 24000, "bpm": 66,  "toMs": 28000, "toBpm": 50, "label": "rit." },
    { "atMs": 28000, "bpm": 66,  "label": "a tempo" }
  ],
  "timeSignatureMap": [
    { "atMs": 0, "value": "12/8" }
  ],
  "keySignature": "Bb",
  "measureMap": [
    { "measure": 1, "atMs": 0 },
    { "measure": 2, "atMs": 3636 }
  ],
  "sections": [
    { "name": "Frase A", "startMs": 0,     "type": "verse",  "rehearsalMark": "A" },
    { "name": "Frase B", "startMs": 14000, "type": "chorus", "rehearsalMark": "B" }
  ],
  "hairpins": [
    { "startMs": 0,    "endMs": 4000,  "from": "p",  "to": "mf" },
    { "startMs": 8000, "endMs": 12000, "from": "mf", "to": "p"  }
  ],
  "gradingProfile": {
    "earlyToleranceMs": 350,
    "lateToleranceMs": 200,
    "perfectMs": 60,
    "goodMs": 130,
    "checkVelocity": true,
    "velocityTolerance": 25
  },
  "events": [
    { "t": 0,   "cmd": 144, "note": 62, "vel": 40,  "finger": 2, "hand": "right", "dynamic": "p", "slur": "start" },
    { "t": 303, "cmd": 144, "note": 65, "vel": 38,  "finger": 3, "hand": "right", "dynamic": "p", "slur": "continue" },
    { "t": 606, "cmd": 144, "note": 67, "vel": 55,  "finger": 4, "hand": "right", "dynamic": "mp", "slur": "end" },
    { "t": 0,   "cmd": 144, "note": 46, "vel": 55,  "finger": 5, "hand": "left", "dynamic": "p", "channel": 1 },
    { "t": 0,   "cmd": 176, "note": 64, "vel": 127 },
    { "t": 3000,"cmd": 176, "note": 64, "vel": 0 }
  ]
}
```

---

## Por que o `.pia` é bom

### 1. JSON + gzip: o melhor dos dois mundos

JSON puro é legível, debugável e suportado por qualquer linguagem sem bibliotecas extras.
Gzip comprime bem texto estruturado — uma peça de 500 notas ocupa tipicamente **15–25 KB**
comprimida contra 80–120 KB em JSON puro. O app detecta automaticamente, sem configuração.

### 2. Linha do tempo em milissegundos

Todos os tempos são `ms` inteiros a partir do início — sem frações de compasso, sem
ticks MIDI dependentes de resolução, sem ambiguidade de arredondamento.
Calcular duração de uma nota é `tOff - tOn`. Calcular posição de playback é uma subtração.

### 3. Schema evolutivo sem quebras

O campo `version` + pipeline de migração garante que **nenhum arquivo antigo quebra jamais**.
Uma ferramenta que escreve v1 funciona com um app que lê v2 sem nenhuma configuração.
Novas features são adicionadas como campos opcionais — backwards e forwards compatible.

### 4. Dois níveis de tempo: reprodução e pedagogia

`vel` (velocidade MIDI) controla como a nota **soa**.
`dynamic` (dinâmica prescrita) diz o que a **partitura manda**.
São campos distintos: um exercício pode suavizar a reprodução (`vel=72`) enquanto ensina
o aluno a tocar forte (`dynamic="f"`). Nenhum outro formato simples faz isso.

### 5. Grading embutido no arquivo

O `gradingProfile` permite que cada exercício carregue seus próprios critérios de avaliação
— uma peça para iniciantes aceita 600 ms de tolerância, uma peça avançada exige 60 ms.
Não há configuração global que vaze entre exercícios.

### 6. Mapa de andamento com ramps

O `tempoMap` suporta **interpolação linear** (`toMs` + `toBpm`) para modelar rallentandi
e accelerandi contínuos. Um único campo cobre todos os casos: andamento constante,
mudança abrupta e mudança gradual.

### 7. Pedagogia estruturada no evento

Dedo, mão, articulação, ligadura, fermata, dica de texto e posição de mão vivem **no
próprio evento** — não em tabelas separadas. Isso evita joins, simplifica serialização
e garante que a informação pedagógica nunca fica dessincronizada da nota.

### 8. Suporte a pedais no mesmo stream

Eventos CC (sustain, sostenuto, una corda) vivem no mesmo array `events` com o mesmo
timestamp `t`. Não há necessidade de um stream separado para controle — tudo está em ordem
cronológica numa única passagem de leitura.

---

## Referência rápida de campos

### Raiz

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `version` | `number` | ✅ | Versão do schema: `1` ou `2` |
| `recordedAt` | `string` | — | ISO 8601 UTC da gravação |
| `meta` | `object` | — | Título, compositor, tags, proveniência |
| `tempoMap` | `array` | — | Mapa de andamento com suporte a ramps |
| `timeSignatureMap` | `array` | — | Mudanças de fórmula de compasso |
| `keySignature` | `string` | — | Armadura de clave: `"C"`, `"G"`, `"Am"` etc. |
| `pickup` | `boolean` | — | `true` se o primeiro compasso é anacruse |
| `sections` | `array` | — | Seções nomeadas com papéis estruturais |
| `measureMap` | `array` | — | Posição de início de cada compasso |
| `hairpins` | `array` | — | Crescendos e decrescendos |
| `repeats` | `array` | — | Marcadores de repetição (metadado pós-unroll) |
| `gradingProfile` | `object` | — | Tolerâncias personalizadas de avaliação |
| `events` | `array` | ✅ | Array de eventos MIDI em ordem cronológica |
| `bpm` | `number` | — | ⚠️ Legado v1 — use `tempoMap` |
| `timeSignature` | `string` | — | ⚠️ Legado v1 — use `timeSignatureMap` |

### Evento (`RecordedEvent`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `t` | `number` | ✅ | Timestamp em ms desde o início |
| `cmd` | `number` | ✅ | `144`=NoteOn, `128`=NoteOff, `176`=CC |
| `note` | `number` | ✅ | MIDI note 0–127 ou número do CC |
| `vel` | `number` | ✅ | Velocidade 0–127 ou valor do CC |
| `finger` | `number` | — | Dedo: 1=polegar … 5=mínimo |
| `hand` | `string` | — | `"left"` ou `"right"` |
| `dynamic` | `string` | — | Dinâmica prescrita: `"pp"` … `"fff"` |
| `articulation` | `string` | — | `"legato"`, `"staccato"`, `"tenuto"`, `"accent"` |
| `grace` | `boolean` | — | `true` = nota de graça |
| `voice` | `number` | — | Voz no pauta: 1–4 |
| `fermata` | `boolean` | — | `true` = fermata sobre a nota |
| `slur` | `string` | — | `"start"`, `"continue"`, `"end"` |
| `tip` | `string` | — | Dica pedagógica exibida na linha de julgamento |
| `handPosition` | `string` | — | Posição de mão no teclado |
| `channel` | `number` | — | Canal MIDI 0–15 para multi-instrumento |
