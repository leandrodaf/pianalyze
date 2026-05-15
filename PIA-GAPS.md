# PIA Format — Gaps, Limitações e Roadmap de Melhorias

> Documento de referência para evolução do formato `.pia`.  
> Baseado na análise de portabilidade de MusicXML / .mscz e no uso atual do app.  
> Atualizar sempre que um gap for resolvido ou um novo for descoberto.

---

## Contexto: o que o .pia é hoje

O `.pia` é uma timeline plana de eventos MIDI em **milissegundos absolutos**, com metadata musical opcional e anotações pedagógicas. Schema atual resumido:

```
Recording { version, recordedAt, bpm?, timeSignature?, keySignature?, sections?, events[] }
RecordedEvent { t, cmd, note, vel, finger?, hand?, dynamic?, articulation? }
Section { name, startMs }
```

---

## Gaps por categoria

### 1. Timing & Tempo

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| T1 | **Tempo map ausente** — `bpm` é um único número; mudanças de andamento ao longo da peça (rit., accel., Allegro → Andante) são impossíveis de representar | Alto — qualquer peça clássica real tem variações de tempo | 🔴 Alta |
| T2 | **Mudança de fórmula de compasso** — `timeSignature` é uma string única; peças como 5/4 → 3/4 → 4/4 não têm como ser representadas | Médio | 🟡 Média |
| T3 | **Tipo de pulsação no metrônomo ausente** — `bpm=96` não diz se o pulso é ♩, ♪ ou ♩. (6/8 em colcheia vs semínima são andamentos completamente diferentes) | Médio | 🟡 Média |
| T4 | **Pickup / anacruse não marcado** — não há como indicar que o primeiro compasso é incompleto (anacrusis), o que desloca todos os beats subsequentes | Médio | 🟡 Média |
| T5 | **Fermata ausente** — nota sustentada por tempo indefinido (comum no final de frases) não pode ser anotada | Baixo | 🟢 Baixa |

**Solução sugerida para T1–T3:**
```jsonc
"tempoMap": [
  { "atMs": 0,    "bpm": 120, "beatUnit": "quarter", "label": "Allegro" },
  { "atMs": 8000, "bpm": 76,  "beatUnit": "quarter", "label": "Andante" }
]
```

---

### 2. Estrutura Musical / Forma

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| F1 | **Repetições ausentes** — não há como representar sinais de repetição (‖: :‖), casas (1ª / 2ª), D.C. al Fine, D.S. al Coda, etc. O .pia sempre é uma sequência linear de eventos, então uma peça com repetições precisa ter os eventos duplicados manualmente | Alto — duplica/triplica o tamanho do arquivo e perde semântica estrutural | 🔴 Alta |
| F2 | **Informações de compasso/beat ausentes** — nenhum evento sabe em qual compasso ou tempo está; impossível exibir "Compasso 12, tempo 3" ou usar um metrônomo visual sincronizado | Médio | 🟡 Média |
| F3 | **Seções sem tipo/papel** — `Section` tem apenas `name`; não há como dizer que é uma "intro", "verso", "refrão", "coda", "ponte" ou um "ensaio A/B/C" | Baixo | 🟢 Baixa |
| F4 | **Marcadores de ensaio alfanuméricos ausentes** — em partituras profissionais os marcadores são A, B, C ou 1, 2, 3 para referência rápida; `Section.name` é texto livre sem essa semântica | Baixo | 🟢 Baixa |

**Solução sugerida para F1:**
```jsonc
"repeats": [
  { "type": "segno",   "atMs": 0 },
  { "type": "ds_coda", "atMs": 24000 },
  { "type": "coda",    "atMs": 30000 },
  { "type": "fine",    "atMs": 38000 }
]
```
*Alternativa mais simples: ao importar de MusicXML, o conversor "unrola" as repetições e gera os eventos duplicados — sem precisar adicionar `repeats` ao schema.*

---

### 3. Expressão Musical & Notação

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| E1 | **`dynamic` e `articulation` existem no TypeScript mas não são usados pelo app** — os campos estão em `RecordedEvent` e `NoteInterval`, mas o waterfall, o grading e o feedback visual os ignoram completamente | Médio — o dado está lá mas não tem efeito | 🔴 Alta (usar o que já existe) |
| E2 | **Crescendo / decrescendo ausente** — dinâmica contínua (hairpin) que vai de `p` a `f` ao longo de vários compassos não pode ser representada; `dynamic` é por nota, não por região | Médio | 🟡 Média |
| E3 | **Ornamentos ausentes** — trilo, mordente, grupeto, appoggiatura, acciaccatura (grace note) não têm representação. Uma grace note não é um `RecordedEvent` com `t` normal porque ela ocupa tempo "emprestado" | Médio | 🟡 Média |
| E4 | **Ligadura de expressão (slur) ausente** — diferente de tie (que é uma ligadura de valor, resolvida pelo engine), o slur é uma instrução de fraseado (tocar ligado) que se estende por várias notas | Baixo | 🟢 Baixa |
| E5 | **Pedal de sustain ausente** — o MIDI tem CC#64 para sustain pedal, mas o .pia não tem representação explícita; gravar ou importar uma peça com pedal perde essa informação | Médio | 🟡 Média |
| E6 | **Voz (voice) ausente** — em notação de piano é comum ter voz 1 e voz 2 na mesma pauta (melodia e acompanhamento na mão direita, por exemplo); os eventos do .pia não têm campo de voz | Baixo | 🟢 Baixa |

**Solução sugerida para E2:**
```jsonc
"hairpins": [
  { "startMs": 4000, "endMs": 8000, "from": "p", "to": "f" }
]
```

**Solução sugerida para E3:**
```jsonc
// flag no evento: grace note sem duração fixa
{ "t": 1980, "cmd": 144, "note": 64, "vel": 60, "grace": true }
```

**Solução sugerida para E5:**
```jsonc
// Pedal como evento de controle dentro do array events
{ "t": 2000, "cmd": 176, "note": 64, "vel": 127 }  // CC#64 on
{ "t": 4000, "cmd": 176, "note": 64, "vel": 0   }  // CC#64 off
// → já é MIDI válido! só falta o app processar cmd=0xB0
```

---

### 4. Múltiplas Partes / Instrumentos

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| P1 | **Apenas um "instrumento" implícito** — todos os eventos vão para um único stream; impossível representar piano + voz, dueto de piano a 4 mãos, ou até piano + metrônomo | Baixo agora | 🟢 Baixa |
| P2 | **Sem canal MIDI** — o .pia não armazena o canal MIDI dos eventos (byte já existe no protocolo MIDI mas é omitido no schema); impede múltiplos instrumentos no futuro | Baixo agora | 🟢 Baixa |

---

### 5. Pedagogy / Ensino

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| G1 | **`GRADE_TOLERANCE_MS` é constante global** — 300 ms fixo para todo exercício; uma peça lenta (Adagio a 40 BPM) deveria ter tolerância maior, e uma peça rápida (Presto a 200 BPM) deveria ser mais rigorosa | Alto — grading inadequado para extremos de tempo | 🔴 Alta |
| G2 | **Velocidade esperada por nota ausente** — `vel` é o que foi gravado/prescrito, mas não há distinção entre "vel é a dinâmica alvo" e "vel é o que saiu na gravação original"; no grading não é possível penalizar um aluno por tocar muito forte quando o `vel` do evento já vem alto do gravador | Médio | 🟡 Média |
| G3 | **Dificuldade por seção ausente** — toda a peça tem uma dificuldade única (no manifesto), mas seções individuais podem ter complexidades diferentes (intro fácil, development difícil) | Baixo | 🟢 Baixa |
| G4 | **Dica textual por nota ausente** — não há campo para adicionar observações pedagógicas por evento ("cruzar polegar aqui", "muda posição", "diminuendo") | Baixo | 🟢 Baixa |
| G5 | **Posição de mão ausente** — a posição inicial/final da mão no teclado (ex: "posição de Dó central") não tem representação; útil para guiar alunos a reposicionar | Baixo | 🟢 Baixa |

**Solução sugerida para G1:**
```jsonc
"gradingProfile": {
  "toleranceMs": 250,        // override do padrão 300ms
  "velocityTolerance": 30,   // diferença de velocity aceitável
  "strictArticulation": true // false = ignora staccato/legato no grading
}
```

---

### 6. Formato / Técnico

| # | Gap | Impacto | Prioridade |
|---|-----|---------|-----------|
| V1 | **`version` não versionado com semântica** — o campo existe mas é sempre `1`; não há política de versão, backward compatibility ou migration path definidos | Alto para evolução do formato | 🔴 Alta |
| V2 | **JSON não comprimido** — uma peça completa de 5 minutos com muitas notas pode ter 50–200 KB de JSON; sem gzip/bzip isso é carregado e parseado inteiramente em memória | Médio | 🟡 Média |
| V3 | **`recordedAt` obrigatório mas irrelevante para exercícios compostos manualmente** — exercícios criados por humanos (não gravados de MIDI) têm um timestamp fictício; deveria ser opcional | Baixo | 🟢 Baixa |
| V4 | **`cmd` como raw byte** — `0x90` e `0x80` são bytes MIDI brutos; um campo `type: "noteOn" | "noteOff" | "cc" | "pitchBend"` seria muito mais legível e extensível | Baixo | 🟢 Baixa |
| V5 | **Sem checksum / assinatura** — impossível verificar integridade do arquivo ou autoria; relevante se o app futuramente tiver um marketplace de exercícios | Baixo | 🟢 Baixa |
| V6 | **`t` em ms com float implícito** — eventos gravados em hardware real podem ter `t: 1234.567`; o schema não especifica se inteiro ou float, o que pode causar inconsistências entre plataformas | Baixo | 🟢 Baixa |

---

## Resumo por prioridade

### 🔴 Alta (bloqueia portabilidade real ou afeta experiência core)

| ID | Descrição curta |
|----|----------------|
| T1 | Tempo map (múltiplos BPMs) |
| F1 | Repetições (ou unrolling no conversor) |
| E1 | Usar `dynamic`/`articulation` que já existem no schema |
| G1 | `GRADE_TOLERANCE_MS` deveria ser configurável por exercício |
| V1 | Política de versão e migração definida |

### 🟡 Média (limita qualidade para repertório sério)

| ID | Descrição curta |
|----|----------------|
| T2 | Mudança de fórmula de compasso |
| T3 | Tipo de pulsação no metrônomo (♩ vs ♪) |
| T4 | Pickup / anacruse |
| F2 | Posição de compasso/beat nos eventos |
| E2 | Crescendo / decrescendo (hairpin) |
| E3 | Ornamentos e grace notes |
| E5 | Pedal de sustain (CC#64) |
| G2 | Distinção entre vel gravado vs vel prescrito |
| V2 | Compressão do JSON |

### 🟢 Baixa (nice-to-have, sem urgência)

| ID | Descrição curta |
|----|----------------|
| T5 | Fermata |
| F3 | Tipo/papel das seções |
| F4 | Marcadores de ensaio alfanuméricos |
| E4 | Ligadura de expressão (slur) |
| E6 | Voz (voice) dentro da pauta |
| P1 | Múltiplas partes / instrumentos |
| P2 | Canal MIDI nos eventos |
| G3 | Dificuldade por seção |
| G4 | Dica textual por nota |
| G5 | Posição de mão |
| V3 | `recordedAt` opcional |
| V4 | `cmd` como enum legível |
| V5 | Checksum / assinatura |
| V6 | Especificar `t` como inteiro ou float |

---

## Comparação com outros formatos

| Capacidade | .pia atual | MusicXML | MIDI std | .mscz |
|-----------|-----------|---------|---------|-------|
| Múltiplos tempos | ❌ | ✅ | ✅ (tempo events) | ✅ |
| Mudança de fórmula | ❌ | ✅ | ✅ | ✅ |
| Repetições | ❌ | ✅ | ✅ | ✅ |
| Fingering | ✅ | ✅ | ❌ | ✅ |
| Mão (hand) | ✅ | ✅ (staff) | ❌ | ✅ (staff) |
| Dinâmica por nota | ✅ (campo existe) | ✅ | ✅ (velocity) | ✅ |
| Articulação | ✅ (campo existe) | ✅ | ❌ | ✅ |
| Pedal de sustain | ❌ | ✅ | ✅ (CC#64) | ✅ |
| Grace notes | ❌ | ✅ | ⚠️ parcial | ✅ |
| Seções nomeadas | ✅ | ✅ (rehearsal) | ❌ | ✅ |
| Hairpin (cresc./decresc.) | ❌ | ✅ | ❌ | ✅ |
| Legibilidade humana | ✅ JSON | ✅ XML | ❌ binário | ❌ binário |
| Anotações pedagógicas | ✅ (finger/hand) | ❌ | ❌ | ❌ |
| Grading profile | ❌ | ❌ | ❌ | ❌ |

---

## Proposta de schema v2 (esboço)

```typescript
interface Recording {
  version: 2
  recordedAt?: string            // agora opcional

  // Metadata musical
  tempoMap: TempoEvent[]         // substitui bpm único (T1, T3)
  timeSignatureMap?: TimeSigEvent[] // substitui timeSignature única (T2)
  keySignature?: string          // mantém para a tônica inicial
  pickup?: boolean               // marca anacruse (T4)

  // Estrutura
  sections?: Section[]           // mantém
  hairpins?: Hairpin[]           // novo (E2)

  // Configuração pedagógica
  gradingProfile?: GradingProfile // novo (G1, G2)

  events: RecordedEvent[]        // mantém; adiciona CC e grace flag
}

interface TempoEvent {
  atMs: number
  bpm: number
  beatUnit: 'quarter' | 'half' | 'eighth' | 'dotted-quarter'
  label?: string                 // "Allegro", "Andante", "rit." etc.
}

interface TimeSigEvent {
  atMs: number
  value: string                  // "4/4", "3/4", "6/8"
}

interface Hairpin {
  startMs: number
  endMs: number
  from: Dynamic
  to: Dynamic
}

interface GradingProfile {
  toleranceMs?: number           // padrão 300
  velocityTolerance?: number     // padrão: sem checagem
  strictArticulation?: boolean   // padrão false
}

interface RecordedEvent {
  t: number                      // inteiro, ms desde início
  cmd: number                    // mantém raw byte para compat.; CC#64 = sustain
  note: number
  vel: number
  finger?: Finger
  hand?: Hand
  dynamic?: Dynamic
  articulation?: Articulation
  grace?: boolean                // novo (E3)
}
```

---

*Criado em 2026-05-15. Revisar ao planejar portabilidade MusicXML ou novo ciclo de features.*
