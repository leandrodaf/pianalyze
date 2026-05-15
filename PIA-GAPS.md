# PIA Format — Gaps, Limitações e Roadmap de Melhorias

> Documento de referência para evolução do formato `.pia`.  
> Revisão profunda feita em 2026-05-15 analisando portabilidade de MusicXML / .mscz.  
> Atualizar sempre que um gap for resolvido ou um novo for descoberto.

---

## O que o .pia é (e o que não é)

O `.pia` é um **formato de performance** — armazena eventos MIDI em milissegundos absolutos com anotações pedagógicas. Ele **não é** um formato de notação (não sabe de divisões, figuras, pautas, hastes, colchetes).

Essa distinção importa: vários conceitos de partitura (ligaduras de valor/tie, tercinas/tuplet, hastes, ligaduras de expressão de 2 notas) se resolvem durante a **importação** e não precisam de nenhuma mudança no schema `.pia`. O que entra no arquivo já são timestamps absolutos.

Schema atual resumido:

```
Recording { version, recordedAt, bpm?, timeSignature?, keySignature?, sections?, events[] }
RecordedEvent { t, cmd, note, vel, finger?, hand?, dynamic?, articulation? }
Section { name, startMs }
```

---

## Deliberadamente fora do escopo do .pia

Estes conceitos existem em partituras mas **não são gaps** — são preocupações exclusivas do conversor (MusicXML → .pia), não do formato em si:

| Conceito | Por quê não precisa estar no .pia |
|---------|----------------------------------|
| Ligadura de valor (tie) | Resolvida no conversor: vira um único NoteOff mais tardio |
| Tercinas / tuplets | Afetam o cálculo de ms no conversor, resultado final já está correto em `t` |
| Colchetes / beaming | Puramente visual na partitura, sem efeito no áudio |
| Hastes / stem direction | Idem |
| Cabeças de nota / note head | Idem |
| Clave (clef) | MIDI usa número absoluto 0-127, clave é só exibição |
| Oitava alta/baixa (8va/8vb) | Mesma coisa; o pitch MIDI já está correto |
| Armadura de clave | Já capturada em `keySignature` como string "C", "Gm" etc. |

---

## Gaps por categoria

### 1. Timing & Tempo

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| T1 | **Tempo map ausente (step)** — `bpm` é um único número; mudanças abruptas de andamento (Allegro → Andante, mudança de seção) são impossíveis de representar | Alto — qualquer peça clássica real tem 1 ou mais mudanças de tempo | 🔴 Alta |
| T2 | **Tempo map ausente (gradual)** — além de step changes, rit. e accel. são acelerações/desacelerações graduais ao longo de vários compassos; sem isso, o conversor aproxima com um único step e o aluno vê o timing errado | Alto — praticamente toda música clássica tem rit. no final das frases | 🔴 Alta |
| T3 | **Mudança de fórmula de compasso** — `timeSignature` é uma string única; peças que alternam 5/4 → 3/4 → 4/4 (Stravinsky, Dave Brubeck) não têm representação | Médio | 🟡 Média |
| T4 | **Tipo de pulsação no metrônomo ausente** — `bpm=96` não diz se ♩=96 ou ♪=96; em 6/8 a diferença é um fator de 2 inteiro no timing real | Médio — crítico para qualquer peça em 6/8, 9/8, 12/8 | 🟡 Média |
| T5 | **Pickup / anacruse não marcado** — sem saber que o primeiro compasso é incompleto, o metrônomo visual e o alinhamento de beat ficam deslocados para a peça inteira | Médio | 🟡 Média |
| T6 | **Fermata ausente** — nota sustentada por tempo indefinido (cadências, finais de frase) não pode ser indicada ao aluno; ele não sabe que deve segurar | Baixo | 🟢 Baixa |

**Solução para T1 + T2 + T4:**
```jsonc
"tempoMap": [
  { "atMs": 0,      "bpm": 132, "beatUnit": "quarter", "label": "Allegro" },
  { "atMs": 12000,  "bpm": 132, "toMs": 14500, "toBpm": 76, "label": "rit." },
  { "atMs": 14500,  "bpm": 76,  "beatUnit": "quarter", "label": "Andante" }
]
```
> `toMs` + `toBpm` definem uma rampa de interpolação linear. Se ausentes, é step change.
> `beatUnit` padrão implícito = `"quarter"` se omitido.

**Solução para T3:**
```jsonc
"timeSignatureMap": [
  { "atMs": 0,    "value": "4/4" },
  { "atMs": 8000, "value": "3/4" },
  { "atMs": 9500, "value": "4/4" }
]
```

---

### 2. Estrutura Musical / Forma

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| F1 | **Repetições** — não há como representar ‖: :‖, casas (1ª / 2ª), D.C. al Fine, D.S. al Coda | Médio — resolve-se fazendo o conversor **unrolar** repetições em eventos duplicados; o arquivo fica maior mas o schema permanece simples | 🟡 Média (conversor, não schema) |
| F2 | **`measureMap` ausente** — sem saber onde começa cada compasso em ms, impossível exibir "Compasso 12 / Tempo 3", sincronizar metrônomo visual, ou deixar o aluno pular para "compasso X" | Médio | 🟡 Média |
| F3 | **Seções sem tipo** — `Section` tem só `name`; não há como distinguir "intro", "refrão", "coda", "ensaio A" de texto livre | Baixo | 🟢 Baixa |

> **Sobre F1:** adicionar uma estrutura de repetições ao .pia seria complexo de implementar no app (o player teria que iterar a forma em runtime). O **caminho certo é o conversor unrolar** — aceita um aumento de tamanho em troca de um player simples. Só vale estrutura de repetições no formato se houver um editor de partituras integrado ao app no futuro.

**Solução para F2:**
```jsonc
"measureMap": [
  { "measure": 1, "atMs": 0    },
  { "measure": 2, "atMs": 1818 },
  { "measure": 3, "atMs": 3636 }
]
```
> Pode ser pré-computado pelo conversor a partir do `tempoMap` + `timeSignatureMap`.

---

### 3. Metadados do Arquivo

Este é um gap **crítico para importação** que estava completamente ausente na análise anterior:

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| M1 | **Título e compositor ausentes no arquivo .pia** — esses campos existem só no manifesto JSON; um arquivo `.pia` distribuído sem o manifesto não carrega nenhuma informação de autoria | Alto — ao importar MusicXML você perde compositor, título, copyright | 🔴 Alta |
| M2 | **Proveniência ausente** — ao converter de MusicXML/MSCZ, não há como registrar que o arquivo veio de lá, qual era o nome do original, ou quando foi importado | Médio | 🟡 Média |
| M3 | **`recordedAt` obrigatório para exercícios compostos** — exercícios criados manualmente (não gravados) precisam de um timestamp fictício; campo deveria ser opcional | Baixo | 🟢 Baixa |

**Solução para M1 + M2:**
```jsonc
"meta": {
  "title":     "Für Elise",
  "composer":  "Ludwig van Beethoven",
  "copyright": "Public Domain",
  "source": {
    "format":    "musicxml",
    "filename":  "fur_elise.xml",
    "importedAt": "2026-05-15T15:00:00Z"
  }
}
```

---

### 4. Expressão Musical

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| E1 | **`dynamic` e `articulation` existem no schema mas o app os ignora completamente** — estão em `RecordedEvent` e `NoteInterval`; o waterfall exibe a label, mas o **grading** não considera velocidade nem articulação, apenas timing | Alto — o dado existe, ninguém usa | 🔴 Alta |
| E2 | **`vel` confundido com `dynamic`** — para exercícios importados de MusicXML, qual valor colocar em `vel`? A partitura tem `mf` mas não tem velocity. O conversor precisa fazer uma conversão arbitrária. Pior: o grading usa `vel` para reprodução mas não para comparação, então um aluno que toca `ff` num trecho `pp` nunca é penalizado | Alto — `vel` serve dois propósitos que nunca são separados | 🔴 Alta |
| E3 | **Crescendo / decrescendo (hairpin) ausente** — dinâmica contínua de `p` a `f` ao longo de vários compassos não pode ser representada; `dynamic` é por nota | Médio | 🟡 Média |
| E4 | **Ornamentos ausentes** — trilo, mordente, grupeto, grace note (acciaccatura/appoggiatura) não têm representação. Uma grace note ocupa tempo "emprestado" da nota anterior ou seguinte, não um `t` absoluto fixo | Médio | 🟡 Média |
| E5 | **Pedais ausentes** — o MIDI define três pedais via CC: #64 sustain, #66 sostenuto, #67 una corda. Nenhum é representável no .pia atual; gravar uma peça com pedal perde a informação inteiramente | Médio — crítico para Chopin, Debussy, Ravel | 🟡 Média |
| E6 | **Ligadura de expressão (slur) ausente** — frasear ligado várias notas (diferente de tie); instrução de execução que o aluno deveria seguir | Baixo | 🟢 Baixa |
| E7 | **Voz (voice) ausente** — em notação de piano a mão direita pode ter voz 1 (melodia, semínimas) e voz 2 (acompanhamento, mínimas simultâneas). Sem campo de voz, o grading e a exibição visual não sabem qual linha é a principal | Baixo | 🟢 Baixa |

**Solução para E2 — separar `vel` (playback) de `dynamic` (pedagogy):**
```jsonc
// vel = como deve soar (para MIDI output)
// dynamic = o que a partitura diz (para display e grading)
{ "t": 2000, "cmd": 144, "note": 60, "vel": 72, "dynamic": "mf" }
```
> Tabela de referência para conversão MusicXML → vel na importação:
> `pp=20`, `p=40`, `mp=55`, `mf=72`, `f=90`, `ff=110`

**Solução para E5 — pedais como CC events no array `events`:**
```jsonc
{ "t": 2000, "cmd": 176, "note": 64, "vel": 127 }  // CC#64 sustain on
{ "t": 4500, "cmd": 176, "note": 64, "vel": 0   }  // CC#64 sustain off
{ "t": 6000, "cmd": 176, "note": 66, "vel": 127 }  // CC#66 sostenuto on
```
> O `cmd=0xB0` (176) já é MIDI válido. O app só precisa processar `cmd !== 0x90/0x80`.  
> **Zero mudança de schema** — só mudança no player e no gravador.

**Solução para E3:**
```jsonc
"hairpins": [
  { "startMs": 4000, "endMs": 8000, "from": "p",  "to": "f"  },
  { "startMs": 9000, "endMs": 11000,"from": "mf", "to": "pp" }
]
```

**Solução para E4:**
```jsonc
{ "t": 1995, "cmd": 144, "note": 64, "vel": 55, "grace": true }
```

---

### 5. Grading / Avaliação

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| G1 | **Tolerância de tempo hardcoded** — `GRADE_TOLERANCE_MS = 300` é constante global; limites de "perfect" (70ms), "good" (150ms) e o próprio teto (300ms) não são configuráveis por exercício | Alto — 300ms é razoável para Andante mas leniente para Presto e rigoroso para Adagio | 🔴 Alta |
| G2 | **Grading avalia apenas timing** — `gradeInput()` só verifica `Math.abs(iv.startMs - currentMs)`; velocity, dynamic e articulation são completamente ignorados na avaliação | Alto — aluno pode tocar `ff` num trecho `pp` e tirar "Perfect" | 🔴 Alta |
| G3 | **Grading avalia notas individualmente, nunca acordes** — se um acorde tem 4 notas e o aluno acerta 3, cada nota é avaliada separada; não há nota de "acorde quase certo" | Médio | 🟡 Média |
| G4 | **Grading não distingue mão esquerda de direita** — se o aluno acerta a nota mas com a mão errada, não há como detectar | Baixo | 🟢 Baixa |
| G5 | **Dica textual por evento ausente** — não há campo para "cruzar polegar aqui", "muda posição da mão", "diminuendo nesta nota" | Baixo | 🟢 Baixa |

**Solução para G1 + G2:**
```jsonc
"gradingProfile": {
  "toleranceMs":   250,
  "perfectMs":     60,
  "goodMs":        120,
  "checkVelocity": true,
  "velocityTolerance": 30,
  "checkArticulation": false
}
```

---

### 6. Formato / Técnico

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| V1 | **`version` sem semântica de migração** — campo existe mas é sempre `1`; não há política de backward compatibility nem migration path definido | Alto para qualquer mudança de schema | 🔴 Alta |
| V2 | **`cmd` como raw byte MIDI sem discriminador de tipo** — `0x90`, `0x80`, `0xB0` são bytes opacos; ao adicionar pedal (CC), o campo `note` vira "controller number", o que é tecnicamente correto em MIDI mas semanticamente confuso no JSON | Médio | 🟡 Média |
| V3 | **JSON não comprimido** — uma peça de 5 min com pedal e ornamentos pode ter 100–400 KB; carregado e parseado inteiramente em memória | Médio | 🟡 Média |
| V4 | **`t` como float não especificado** — gravações reais produzem `t: 1234.567`; o schema não define se inteiro ou float, causando inconsistências entre plataformas | Baixo | 🟢 Baixa |
| V5 | **Sem checksum / assinatura** — sem verificação de integridade; relevante se houver marketplace de exercícios no futuro | Baixo | 🟢 Baixa |

**Solução para V2 — discriminador de tipo nos eventos:**
```typescript
// Opção A: campo type explícito (breaking change, mais limpo)
type Event =
  | { type: 'note'; t: number; note: number; vel: number; on: boolean;
      finger?: Finger; hand?: Hand; dynamic?: Dynamic; articulation?: Articulation; grace?: boolean }
  | { type: 'cc';   t: number; controller: number; value: number }

// Opção B: manter cmd mas documentar formalmente que cmd=0xB0 é CC (backward compat.)
```

---

## Resumo por prioridade

### 🔴 Alta (bloqueia portabilidade real ou afeta experiência core)

| ID | Descrição curta |
|----|----------------|
| T1 | Tempo map — step changes |
| T2 | Tempo map — mudanças graduais (rit./accel.) |
| M1 | Metadados (título, compositor) dentro do .pia |
| E1 | Usar `dynamic`/`articulation` que já existem no schema |
| E2 | Separar `vel` (playback) de `dynamic` (partitura) |
| G1 | Tolerância de timing configurável por exercício |
| G2 | Grading verificar dynamic/velocity além de timing |
| V1 | Política de versão e migração definida |

### 🟡 Média (limita qualidade para repertório sério)

| ID | Descrição curta |
|----|----------------|
| T3 | Mudança de fórmula de compasso |
| T4 | Tipo de pulsação no metrônomo (♩ vs ♪) |
| T5 | Pickup / anacruse |
| F1 | Repetições — estratégia de unrolling no conversor |
| F2 | `measureMap` — posição de compasso em ms |
| M2 | Proveniência / source da importação |
| E3 | Crescendo / decrescendo (hairpin) |
| E4 | Ornamentos e grace notes |
| E5 | Pedais (CC#64/66/67) — zero mudança de schema, só player |
| G3 | Grading por acorde (não por nota individual) |
| V2 | Discriminador de tipo nos eventos |
| V3 | Compressão do JSON |

### 🟢 Baixa (nice-to-have, sem urgência)

| ID | Descrição curta |
|----|----------------|
| T6 | Fermata |
| F3 | Tipo/papel das seções |
| E6 | Ligadura de expressão (slur) |
| E7 | Voz (voice) dentro da pauta |
| G4 | Grading por mão |
| G5 | Dica textual por evento |
| M3 | `recordedAt` opcional |
| V4 | Especificar `t` como inteiro ou float |
| V5 | Checksum / assinatura |

---

## Comparação com outros formatos (revisada)

| Capacidade | .pia atual | .pia v2 | MusicXML | MIDI std | .mscz |
|-----------|-----------|---------|---------|---------|-------|
| Múltiplos tempos (step) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Múltiplos tempos (gradual) | ❌ | ✅ | ✅ | ❌ | ✅ |
| Mudança de fórmula | ❌ | ✅ | ✅ | ✅ | ✅ |
| Repetições | ❌ | ⚠️ unroll | ✅ | ✅ | ✅ |
| Fingering | ✅ | ✅ | ✅ | ❌ | ✅ |
| Mão (hand) | ✅ | ✅ | ✅ (staff) | ❌ | ✅ (staff) |
| Dinâmica simbólica (pp/ff) | ✅ (ignorada) | ✅ usada | ✅ | ❌ | ✅ |
| Vel e dynamic separados | ❌ | ✅ | N/A | N/A | N/A |
| Articulação | ✅ (ignorada) | ✅ usada | ✅ | ❌ | ✅ |
| Pedal de sustain | ❌ | ✅ (CC#64) | ✅ | ✅ | ✅ |
| Sostenuto + soft pedal | ❌ | ✅ (CC#66/67) | ✅ | ✅ | ✅ |
| Grace notes | ❌ | ✅ (`grace:true`) | ✅ | ⚠️ | ✅ |
| Hairpin (cresc./decresc.) | ❌ | ✅ | ✅ | ❌ | ✅ |
| Seções nomeadas | ✅ | ✅ | ✅ (rehearsal) | ❌ | ✅ |
| Posição de compasso | ❌ | ✅ (`measureMap`) | ✅ | ⚠️ | ✅ |
| Metadados (título/compositor) | ❌ no arquivo | ✅ | ✅ | ✅ | ✅ |
| Grading configurável | ❌ | ✅ | ❌ | ❌ | ❌ |
| Grading por dynamic/vel | ❌ | ✅ | ❌ | ❌ | ❌ |
| Legibilidade humana | ✅ JSON | ✅ JSON | ✅ XML | ❌ binário | ❌ ZIP |
| Anotações pedagógicas | ✅ finger/hand | ✅ + tips | ❌ | ❌ | ❌ |

---

## Schema v2 completo (proposta)

```typescript
interface Recording {
  version: 2
  recordedAt?: string                  // opcional — ausente em exercícios compostos

  // ── Metadados ───────────────────────────────────────────────────────────────
  meta?: RecordingMeta

  // ── Timing ──────────────────────────────────────────────────────────────────
  tempoMap: TempoEvent[]               // obrigatório (substitui bpm único)
  timeSignatureMap?: TimeSigEvent[]    // opcional (substitui timeSignature única)
  keySignature?: string                // "C", "Gm", "F#" etc. — tônica inicial
  pickup?: boolean                     // true = primeiro compasso é anacruse

  // ── Estrutura ───────────────────────────────────────────────────────────────
  sections?: Section[]                 // mantém — marcadores de loop/navegação
  measureMap?: MeasureEntry[]          // novo — início de cada compasso em ms
  hairpins?: Hairpin[]                 // novo — crescendo/decrescendo

  // ── Pedagogy ────────────────────────────────────────────────────────────────
  gradingProfile?: GradingProfile      // novo — tolerâncias configuráveis

  // ── Eventos ─────────────────────────────────────────────────────────────────
  events: RecordedEvent[]              // note-on, note-off, CC (pedal) — em ms
}

// ── Metadados ─────────────────────────────────────────────────────────────────

interface RecordingMeta {
  title?:     string
  composer?:  string
  copyright?: string
  source?: {
    format:     'musicxml' | 'mscz' | 'midi' | 'manual'
    filename?:  string
    importedAt?: string  // ISO 8601
  }
}

// ── Timing ───────────────────────────────────────────────────────────────────

interface TempoEvent {
  atMs: number
  bpm: number
  beatUnit?: 'quarter' | 'half' | 'eighth' | 'dotted-quarter'  // default: quarter
  // Se toMs+toBpm presentes → interpolação linear (rit./accel.)
  toMs?:  number
  toBpm?: number
  label?: string   // "Allegro", "Andante", "rit.", "a tempo" etc.
}

interface TimeSigEvent {
  atMs:  number
  value: string    // "4/4", "3/4", "6/8", "5/4" etc.
}

// ── Estrutura ────────────────────────────────────────────────────────────────

interface MeasureEntry {
  measure: number   // número do compasso (começa em 1; anacrusis = 0)
  atMs:    number
}

interface Hairpin {
  startMs: number
  endMs:   number
  from:    Dynamic
  to:      Dynamic
}

// ── Pedagogy ─────────────────────────────────────────────────────────────────

interface GradingProfile {
  toleranceMs?:       number   // janela total de aceitação — padrão 300
  perfectMs?:         number   // delta < perfectMs = "Perfect" — padrão 70
  goodMs?:            number   // delta < goodMs    = "Good"    — padrão 150
  checkVelocity?:     boolean  // penalizar dynamic errada      — padrão false
  velocityTolerance?: number   // diferença de vel aceita (0-127) — padrão 30
  checkArticulation?: boolean  // penalizar staccato/legato errado — padrão false
}

// ── Eventos ──────────────────────────────────────────────────────────────────

interface RecordedEvent {
  t:    number   // ms desde o início — inteiro recomendado, float aceito
  cmd:  number   // 0x90=NoteOn, 0x80=NoteOff, 0xB0=CC (pedal, expression, etc.)
  note: number   // MIDI 0-127 para notas; controller number (64/66/67) para CC
  vel:  number   // velocity/value 0-127; 0 = sempre note-off independente de cmd

  // Campos pedagógicos — apenas em NoteOn (cmd=0x90, vel>0)
  finger?:       Finger        // 1-5
  hand?:         Hand          // 'left' | 'right'
  dynamic?:      Dynamic       // marcação simbólica da partitura (pp/p/mp/mf/f/ff)
  articulation?: Articulation  // staccato/legato/tenuto/accent
  grace?:        boolean       // true = grace note (acciaccatura/appoggiatura)
  tip?:          string        // dica pedagógica livre ("cruzar polegar aqui")
}
```

---

## Checklist: o que é preciso para importar MusicXML com qualidade

Com o schema v2 acima implementado, a pipeline de importação precisaria:

- [x] Parser XML do MusicXML (`encoding/xml` em Go ou `DOMParser` no frontend)
- [ ] Engine de tempo simbólico → ms (divisions + BPM map → timestamps absolutos)
- [ ] Suporte a mudanças de tempo step (`<sound tempo="">`) e gradual (`<words>rit.</words>` com interpolação)
- [ ] Resolução de ties (ligaduras de valor → NoteOff mais tardio)
- [ ] Unrolling de repetições (barlines, casas, D.C./D.S./Coda)
- [ ] Mapeamento staff → hand (staff 1 = treble = right, staff 2 = bass = left)
- [ ] Extração de fingering (`<technical><fingering>`)
- [ ] Mapeamento dinâmica → vel (pp=20, p=40, mp=55, mf=72, f=90, ff=110)
- [ ] Extração de articulação (staccato, accent, tenuto → `articulation`)
- [ ] Extração de pedal (`<pedal type="start/stop">` → CC#64 events)
- [ ] Construção do `tempoMap` com rampas para rit./accel.
- [ ] Construção do `timeSignatureMap` quando há mudanças
- [ ] Construção do `measureMap`
- [ ] Extração de marcadores de ensaio / rehearsal marks → `sections`
- [ ] Extração de hairpins (`<direction><dynamics>` + `<wedge>`) → `hairpins[]`
- [ ] Preenchimento de `meta.title`, `meta.composer`, `meta.copyright`

> Com todos esses itens implementados, **qualquer partitura de MusicXML vira um .pia completo** pronto para prática guiada com fingering, grading, pedal e feedback de dinâmica.

---

*Criado em 2026-05-15. Revisão profunda feita na mesma data. Revisar ao planejar implementação do conversor MusicXML.*
