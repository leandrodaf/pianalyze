# PIA Format — Gaps, Limitações e Roadmap de Melhorias

> Documento de referência para evolução do formato `.pia`.  
> Baseado na análise de portabilidade de MusicXML / .mscz e no uso atual do app.  
> Atualizar sempre que um gap for resolvido ou um novo for descoberto.
>
> **Última revisão: 2026-06-01 — todos os gaps de schema foram implementados.**

---

## Contexto: o que o .pia é hoje

O `.pia` é uma timeline plana de eventos MIDI em **milissegundos absolutos**, com metadata musical opcional e anotações pedagógicas. Schema **v2** atual:

```
Recording {
  version, recordedAt?, meta?,
  tempoMap[], timeSignatureMap[], keySignature?, pickup?,
  sections[], measureMap[], hairpins[], repeats[],
  gradingProfile?, events[]
}
RecordedEvent {
  t, cmd, note, vel,
  finger?, hand?, dynamic?, articulation?,
  grace?, voice?, tip?, handPosition?, fermata?, slur?, channel?
}
Section { name, startMs, type?, rehearsalMark?, difficulty? }
```

---

## Gaps por categoria

### 1. Timing & Tempo

| # | Gap | Impacto | Prioridade | Status |
|---|-----|---------|-----------|--------|
| T1 | **Tempo map ausente** — `bpm` é um único número; mudanças de andamento ao longo da peça (rit., accel., Allegro → Andante) são impossíveis de representar | Alto — qualquer peça clássica real tem variações de tempo | 🔴 Alta | ✅ Resolvido — `tempoMap[]` com `bpmAt()` |
| T2 | **Mudança de fórmula de compasso** — `timeSignature` é uma string única; peças como 5/4 → 3/4 → 4/4 não têm como ser representadas | Médio | 🟡 Média | ✅ Resolvido — `timeSignatureMap[]` com `timeSigAt()` |
| T3 | **Tipo de pulsação no metrônomo ausente** — `bpm=96` não diz se o pulso é ♩, ♪ ou ♩. (6/8 em colcheia vs semínima são andamentos completamente diferentes) | Médio | 🟡 Média | ✅ Resolvido — `beatUnit` em `TempoEvent` |
| T4 | **Pickup / anacruse não marcado** — não há como indicar que o primeiro compasso é incompleto (anacrusis), o que desloca todos os beats subsequentes | Médio | 🟡 Média | ✅ Resolvido — campo `pickup: boolean` em `Recording` |
| T5 | **Fermata ausente** — nota sustentada por tempo indefinido (comum no final de frases) não pode ser anotada | Baixo | 🟢 Baixa | ✅ Resolvido — `fermata?: boolean` em `RecordedEvent`; símbolo 𝄐 renderizado acima da barra |

---

### 2. Estrutura Musical / Forma

| # | Gap | Impacto | Prioridade | Status |
|---|-----|---------|-----------|--------|
| F1 | **Repetições ausentes** — não há como representar sinais de repetição (‖: :‖), casas (1ª / 2ª), D.C. al Fine, D.S. al Coda, etc. | Alto — duplica/triplica o tamanho do arquivo e perde semântica estrutural | 🔴 Alta | ✅ Resolvido — `repeats?: Repeat[]` no schema como metadados; conversor unrola em eventos lineares |
| F2 | **Informações de compasso/beat ausentes** — nenhum evento sabe em qual compasso ou tempo está | Médio | 🟡 Média | ✅ Resolvido — `measureMap[]` com `MeasureEntry { measureNumber, startMs }` + chip M1, M2 na UI |
| F3 | **Seções sem tipo/papel** — `Section` tem apenas `name`; não há como dizer que é uma "intro", "verso", "refrão", "coda" | Baixo | 🟢 Baixa | ✅ Resolvido — `type?: SectionType` em `Section` |
| F4 | **Marcadores de ensaio alfanuméricos ausentes** — marcadores A, B, C ou 1, 2, 3 para referência rápida; `Section.name` é texto livre sem essa semântica | Baixo | 🟢 Baixa | ✅ Resolvido — `rehearsalMark?: string` em `Section`; exibido como `[A]` no pill da seção |

---

### 3. Expressão Musical & Notação

| # | Gap | Impacto | Prioridade | Status |
|---|-----|---------|-----------|--------|
| E1 | **`dynamic` e `articulation` existem no TypeScript mas não são usados pelo app** | Médio | 🔴 Alta (usar o que já existe) | ✅ Resolvido — waterfall renderiza dinâmica (label no canto), staccato (ponto), accent (>), tenuto (traço) |
| E2 | **Crescendo / decrescendo ausente** — hairpin de `p` a `f` ao longo de vários compassos | Médio | 🟡 Média | ✅ Resolvido — `hairpins?: Hairpin[]`; cunhas < e > desenhadas abaixo do pentagrama no modo prática |
| E3 | **Ornamentos ausentes** — grace note não tem representação | Médio | 🟡 Média | ✅ Resolvido — `grace?: boolean` em `RecordedEvent`; barra a 62% de altura com borda tracejada |
| E4 | **Ligadura de expressão (slur) ausente** — instrução de fraseado que se estende por várias notas | Baixo | 🟢 Baixa | ✅ Resolvido — `slur?: 'start'\|'end'\|'continue'`; arcos Bézier desenhados em `drawSlurs()` |
| E5 | **Pedal de sustain ausente** — CC#64 não tinha representação explícita | Médio | 🟡 Média | ✅ Resolvido — eventos `cmd=0xB0 note=64` são eventos MIDI válidos na `events[]`; app ignora corretamente em `buildIntervals()` |
| E6 | **Voz (voice) ausente** — voz 1 e voz 2 na mesma pauta sem identificação | Baixo | 🟢 Baixa | ✅ Resolvido — `voice?: number` em `RecordedEvent` e `NoteInterval` |

---

### 4. Múltiplas Partes / Instrumentos

| # | Gap | Impacto | Prioridade | Status |
|---|-----|---------|-----------|--------|
| P1 | **Apenas um "instrumento" implícito** — impossível representar piano + voz, dueto a 4 mãos | Baixo agora | 🟢 Baixa | ⏳ Pendente — requer refatoração maior do schema (array de `Part`) |
| P2 | **Sem canal MIDI** — o .pia não armazena o canal MIDI dos eventos | Baixo agora | 🟢 Baixa | ✅ Resolvido — `channel?: number` em `RecordedEvent` |

---

### 5. Pedagogy / Ensino

| # | Gap | Impacto | Prioridade | Status |
|---|-----|---------|-----------|--------|
| G1 | **`GRADE_TOLERANCE_MS` é constante global** — 300 ms fixo para todo exercício | Alto | 🔴 Alta | ✅ Resolvido — `gradingProfile?: GradingProfile` com `toleranceMs`, `velocityTolerance`, `strictArticulation` |
| G2 | **Velocidade esperada por nota ausente** — distinção entre vel gravado vs vel prescrito | Médio | 🟡 Média | ✅ Resolvido — `velocityTolerance` em `GradingProfile`; grader verifica e emite feedback |
| G3 | **Dificuldade por seção ausente** — toda a peça tem dificuldade única, mas seções variam | Baixo | 🟢 Baixa | ✅ Resolvido — `difficulty?: 1\|2\|3\|4\|5` em `Section`; ponto colorido no pill da seção |
| G4 | **Dica textual por nota ausente** — não há campo para observações pedagógicas por evento | Baixo | 🟢 Baixa | ✅ Resolvido — `tip?: string` em `RecordedEvent`; tooltip flutuante aparece quando a nota está a < 2 s da judge line |
| G5 | **Posição de mão ausente** — posição inicial/final da mão no teclado sem representação | Baixo | 🟢 Baixa | ✅ Resolvido — `handPosition?: string` em `RecordedEvent`; exibido no mesmo tooltip que `tip` (`tip ?? handPosition`) |

---

### 6. Formato / Técnico

| # | Gap | Impacto | Prioridade | Status |
|---|-----|---------|-----------|--------|
| V1 | **`version` não versionado com semântica** — campo existe mas era sempre `1`; sem política de migração | Alto | 🔴 Alta | ✅ Resolvido — schema v2 com `migrateRecording()` que converte v1 → v2 automaticamente |
| V2 | **JSON não comprimido** — peça de 5 min pode ter 50–200 KB de JSON | Médio | 🟡 Média | ✅ Resolvido — gzip aplicado no save/load; `isGzipped()` detecta e descomprime automaticamente |
| V3 | **`recordedAt` obrigatório mas irrelevante para exercícios compostos manualmente** | Baixo | 🟢 Baixa | ✅ Resolvido — `recordedAt?: string` (opcional em v2) |
| V4 | **`cmd` como raw byte** — `0x90`/`0x80` são MIDI brutos; campo legível seria melhor | Baixo | 🟢 Baixa | ✅ Resolvido — helper `cmdType(ev)` retorna `'noteOn' \| 'noteOff' \| 'cc' \| 'pitchBend' \| 'unknown'` |
| V5 | **Sem checksum / assinatura** — impossível verificar integridade ou autoria | Baixo | 🟢 Baixa | ⏳ Pendente — relevante apenas para marketplace futuro |
| V6 | **`t` em ms com float implícito** — schema não especifica inteiro ou float | Baixo | 🟢 Baixa | ✅ Resolvido — documentado como inteiro; `t: number` sempre truncado para ms inteiros |

---

## Resumo — Estado atual

| Categoria | Total | ✅ Resolvido | ⏳ Pendente |
|-----------|-------|-------------|------------|
| Timing (T) | 5 | 5 | 0 |
| Estrutura (F) | 4 | 4 | 0 |
| Expressão (E) | 6 | 6 | 0 |
| Partes (P) | 2 | 1 | 1 |
| Pedagogia (G) | 5 | 5 | 0 |
| Técnico (V) | 6 | 5 | 1 |
| **Total** | **28** | **26** | **2** |

Os 2 gaps pendentes (P1 — múltiplas partes; V5 — checksum) são de baixa prioridade e requerem refatoração maior não justificada pelo escopo atual.

---

## Comparação com outros formatos

| Capacidade | .pia v2 | MusicXML | MIDI std | .mscz |
|-----------|---------|---------|---------|-------|
| Múltiplos tempos | ✅ | ✅ | ✅ (tempo events) | ✅ |
| Mudança de fórmula | ✅ | ✅ | ✅ | ✅ |
| Repetições (schema) | ✅ metadados | ✅ | ✅ | ✅ |
| Fingering | ✅ | ✅ | ❌ | ✅ |
| Mão (hand) | ✅ | ✅ (staff) | ❌ | ✅ (staff) |
| Dinâmica por nota | ✅ renderizado | ✅ | ✅ (velocity) | ✅ |
| Articulação | ✅ renderizado | ✅ | ❌ | ✅ |
| Pedal de sustain | ✅ CC#64 nativo | ✅ | ✅ (CC#64) | ✅ |
| Grace notes | ✅ renderizado | ✅ | ⚠️ parcial | ✅ |
| Seções nomeadas | ✅ | ✅ (rehearsal) | ❌ | ✅ |
| Marcadores de ensaio | ✅ | ✅ | ❌ | ✅ |
| Hairpin (cresc./decresc.) | ✅ renderizado | ✅ | ❌ | ✅ |
| Slur | ✅ schema + arco | ✅ | ❌ | ✅ |
| Fermata | ✅ schema + 𝄐 | ✅ | ❌ | ✅ |
| Voz dentro da pauta | ✅ schema | ✅ | ❌ | ✅ |
| Canal MIDI | ✅ schema | ✅ | ✅ | ✅ |
| Legibilidade humana | ✅ JSON | ✅ XML | ❌ binário | ❌ binário |
| Anotações pedagógicas | ✅ | ❌ | ❌ | ❌ |
| Grading profile | ✅ | ❌ | ❌ | ❌ |
| Dificuldade por seção | ✅ | ❌ | ❌ | ❌ |
| Dica por nota (tip) | ✅ | ❌ | ❌ | ❌ |
| Posição de mão | ✅ | ❌ | ❌ | ❌ |

---

*Criado em 2026-05-15. Última revisão: 2026-06-01 — schema v2 completo, 26/28 gaps resolvidos.*
