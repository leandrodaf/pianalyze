# Pianalyze — Design Document

> Documento vivo. Atualizar antes de implementar qualquer feature nova.

---

## 1. Visão geral

Pianalyze é um app desktop de aprendizado de piano. O aluno conecta um teclado MIDI, carrega um exercício ou música, e pratica vendo as notas chegarem na tela. O app captura o que o aluno toca em tempo real, compara com a partitura e dá feedback visual imediato.

---

## 2. Telas

### 2.1 Tela Inicial (Home)

Ponto de entrada do app. O aluno configura tudo aqui antes de começar a praticar.

**Sidebar (esquerda):**
- Logo + nome do app
- Navegação (Início / Biblioteca / Gravações — os dois últimos ainda não implementados)
- Seção "Seu dispositivo MIDI": lista os dispositivos detectados, permite selecionar e conectar. Mostra pill verde pulsante quando conectado
- Seção "Biblioteca remota": campo de URL para carregar um manifesto JSON externo de exercícios

**Área principal (conteúdo):**
- Saudação contextual (Bom dia / Boa tarde / Boa noite)
- **Quick pills**: ações rápidas compactas
  - ▶ Continuar — abre o último exercício praticado; na primeira vez vai direto para Tocar Livre
  - 🎲 Aleatório — abre o detalhe de um exercício disponível sorteado na hora
  - ⭐ Desafio do dia — exercício determinístico pelo dia do ano (muda toda meia-noite)
- **Seções de exercícios**: Escalas · Acordes · Peças
  - Cards em grid responsivo (2 colunas em janelas pequenas até 9 em telas ultra-wide)
  - Cada card: capa com gradiente + ícone, título, autor, dificuldade em pontos, duração
  - Hover: botão ▶ aparece na capa
  - Click: abre modal de detalhes
- **Modal de detalhes**:
  - Header com gradiente do exercício, ícone grande, título, subtítulo
  - Descrição, autor (com link), grid de stats (dificuldade, duração, BPM, mãos, compasso), tags
  - Botão "Praticar agora" → vai para tela de tocar em modo prática
  - Botão "Em breve" (desabilitado) para exercícios ainda não disponíveis

**Ações que pertencem à Home (não à tela de tocar):**
- Carregar arquivo `.pia` externo (import de gravação)
- Iniciar uma nova gravação
- Gerenciar biblioteca

**Regra:** o aluno NÃO precisa conectar um dispositivo MIDI para navegar pela home ou abrir o modal de detalhes. O dispositivo é necessário apenas para o feedback ao vivo durante a prática.

---

### 2.2 Tela de Tocar (Playing)

Tela de prática imersiva. Sem distrações. O aluno sai daqui via "← Início".

**Layout vertical (de cima para baixo):**

```
┌──────────────────────────────────────────────────────┐
│ top-bar (38px)                                       │
│ ← Início   🎵 Escala de Dó Maior · C D E F G A B C  │
├──────────────────────────────────────────────────────┤
│                                                      │
│               waterfall  (flex: 1)                  │
│    [HUD de análise: acorde, inversão, dinâmica]      │
│                                                      │
├──────────────────────────────────────────────────────┤
│  timeline  (~60px)                                   │
│  MÃO DIREITA  ░░▓▓░░░░▓░░▓▓▓░░░░░░░ [região loop]  │
│  MÃO ESQ.     ░░░░▓▓░░░░░░▓▓░░░░░░░               │
├──────────────────────────────────────────────────────┤
│  controls-bar (44px)                                 │
│  ⏮  ▶/⏸  ⏹   │  0.5x 0.75x 1x 1.5x 2x  │  🔁 A–B  │
├──────────────────────────────────────────────────────┤
│  piano  (clamp 120–200px)                            │
└──────────────────────────────────────────────────────┘
```

---

## 3. Modos de operação da tela de tocar

### 3.1 Modo Prática (padrão quando exercício tem dados)

Ativado automaticamente ao entrar na tela de tocar com um exercício que possui gravação.

- As notas do exercício aparecem do **lado direito da tela** e viajam para a **esquerda**
- A **linha dourada** fica fixa à esquerda (~15% da largura útil)
- Quando uma nota chega à linha dourada = hora de tocar
- O aluno toca no teclado MIDI; cada nota é comparada com a partitura e recebe uma nota: Perfect / Good / OK / Miss / Wrong
- O tempo de antecedência (quanto tempo a nota leva para ir do canto direito até a linha) é configurável: padrão **4 segundos**

### 3.2 Modo Ao Vivo (Tocar Livre)

Ativado quando não há exercício ou o exercício não tem dados.

- A **linha dourada** fica fixa à esquerda (mesma posição)
- Quando o aluno pressiona uma tecla, a nota aparece **na linha** e o rastro vai para a esquerda como histórico
- Sem grading, sem partitura
- O HUD de análise fica ativo (mostra acorde, inversão, dinâmica em tempo real)

### 3.3 Transição entre modos

- Ao clicar "Praticar agora" num exercício com dados → modo prática, aguarda o aluno pressionar ▶
- Ao clicar "Tocar Livre" → modo ao vivo
- Ao voltar para Home (← Início) e entrar de novo → reset do estado de prática

---

## 4. Waterfall (cascata de notas)

### 4.1 Eixo Y

Espelha as 52 teclas brancas do piano (A0 → C8). Teclas pretas ficam no ponto médio entre as duas brancas vizinhas. A nota C4 (middle C) tem uma linha tracejada especial marcando a divisão entre as mãos.

**Divisão de mãos:**
- Mão direita: MIDI ≥ 60 (C4 e acima) — cor roxa (`#7b5ff0`)
- Mão esquerda: MIDI < 60 (abaixo de C4) — cor laranja (`#f08a5b`)

Fundo da zona treble tem leve tint roxo; fundo da zona bass tem leve tint laranja.

### 4.2 Eixo X (tempo)

- **Linha dourada** = presente / "toque agora" (posição fixa em ~15% da largura útil)
- **Direita da linha** = futuro (notas que ainda vão chegar)
- **Esquerda da linha** = passado (notas já tocadas / histórico ao vivo)

**Velocidade no modo prática:**
```
velocidade_px_por_ms = (largura_tela - posição_linha) / lead_time_ms
```
Isso garante que uma nota exatamente `lead_time_sec` à frente aparece no canto direito da tela.

### 4.3 Parâmetros configuráveis

| Parâmetro | Padrão | Range | Efeito |
|---|---|---|---|
| `leadTimeSec` | 4s | 1–10s | Quanto tempo antes as notas aparecem |
| `speedMultiplier` | 1x | 0.25x–3x | Velocidade geral do playback + scroll |

Ao alterar `speedMultiplier`, tanto o scheduler de eventos quanto o `practiceScrollPxPerSec` são recalculados para que a relação visual permaneça correta.

### 4.4 HUD de análise

Overlay semitransparente no canto inferior esquerdo do waterfall. Mostra:
- Nome do acorde detectado (grande, bold)
- Inversão (menor, abaixo)
- Barra de dinâmica + label (pp / p / mp / mf / f / ff)

Fica a 35% de opacidade quando nenhum acorde está sendo tocado; vai a 100% ao detectar.

---

## 5. Timeline mini (a implementar)

### 5.1 Propósito

Visão comprimida da música inteira. Permite:
- Ver os próximos ~30 segundos de conteúdo de forma densa
- Navegar clicando numa posição
- Definir região de loop arrastando dois marcadores

### 5.2 Estrutura visual

Dois trilhos independentes: mão direita e mão esquerda. Cada trilho:
- Eixo X = tempo total da gravação comprimido para a largura disponível
- Eixo Y = pitch das notas (comprimido)
- Notas = blocos finos (mínimo 1px de altura), coloridos com as cores da mão

**Janela deslizante (~30s à frente):**
- Retângulo destacado sobre os dois trilhos mostrando o intervalo atual → +30s
- Se move conforme o playback avança
- O aluno vê o "mapa" do que está por vir

**Marcadores de loop (A e B):**
- Duas guias verticais arrastáveis sobre os trilhos
- A região entre elas fica com fundo levemente colorido
- Quando loop ativo (🔁), o playback volta para A ao chegar em B

### 5.3 Interações

| Ação | Resultado |
|---|---|
| Click numa posição na timeline | Seek para aquela posição no playback |
| Drag guia A ou B | Move o marcador de loop |
| Drag dentro da região A–B | Move a região inteira (mantém duração) |
| Double-click fora da região | Remove o loop |

---

## 6. Controls bar (redesenhada)

**Botões de transporte:**
- ⏮ — volta ao início (ou ao ponto A se loop ativo)
- ▶ / ⏸ — play/pause
- ⏹ — stop (volta ao início, limpa grading)

**Velocidade:**
Botões discretos: `0.25x` · `0.5x` · `0.75x` · `1x` · `1.25x` · `1.5x` · `2x`  
O botão ativo fica destacado. Afeta tanto o scheduler quanto a velocidade visual.

**Loop:**
- Botão 🔁 toggle: ativa/desativa o loop na região A–B selecionada
- Fica desabilitado se não há região definida

**O que foi removido desta barra:**
- ~~RecordControls~~ → move para Home (nova gravação)
- ~~ImportControls~~ → move para Home (abrir arquivo .pia)

---

## 7. Sistema de exercícios

### 7.1 Tipos de exercício

```typescript
interface Exercise {
  id: string
  title: string
  subtitle: string
  description: string
  author: { name: string; url?: string }
  category: 'scales' | 'chords' | 'pieces'
  difficulty: 1 | 2 | 3 | 4 | 5   // 1=Iniciante … 5=Expert
  tags: string[]
  style: { gradient: [string, string]; icon: string }
  stats: { durationSec: number; bpm?: number; timeSignature?: string; hands?: 'left'|'right'|'both' }
  comingSoon?: boolean
  data?: Recording   // undefined = sem dados ainda
}
```

### 7.2 Fontes de exercícios

**Built-in (compilado no app):**  
`src/data/builtin-manifest.json` + arquivos em `src/data/exercises/**/*.json`  
Carregados na inicialização via `import.meta.glob`. Sempre disponíveis offline.

**Remoto (URL de manifesto):**  
O aluno cola uma URL no sidebar. O app faz fetch do `LibraryManifest` JSON e resolve os `dataUrl` relativos para carregar os arquivos `.pia`. Exercícios remotos são adicionados à lista sem substituir os built-in (exceto por ID igual).

### 7.3 Formato de gravação (.pia)

```typescript
interface Recording {
  version: 1
  recordedAt: string   // ISO 8601
  events: Array<{
    t: number      // ms desde o início
    cmd: number    // 0x90 = note on/off
    note: number   // MIDI 0–127
    vel: number    // 0 = note off
    finger?: 1|2|3|4|5  // dedo correto (opcional, apenas em note-on)
  }>
}
```

**Dedilhado (`finger`):**  
Convenção universal: 1 = polegar … 5 = mínimo, igual para ambas as mãos.  
Campo opcional — arquivos sem `finger` continuam válidos.  
Quando presente, o waterfall exibe o número do dedo em um círculo sobre a barra da nota durante a prática.

### 7.4 Dificuldade

| Nível | Label | Cor |
|---|---|---|
| 1 | Iniciante | Verde `#4ade80` |
| 2 | Básico | Verde claro `#86efac` |
| 3 | Intermediário | Laranja `#fb923c` |
| 4 | Avançado | Vermelho `#f87171` |
| 5 | Expert | Roxo `#a78bfa` |

---

## 8. Grading (avaliação da prática)

Ao tocar uma nota no modo prática:

1. Compara o `currentMs` (posição do playback) com o `startMs` de cada `NoteInterval` esperado para aquela nota
2. Aceita correspondências dentro de `GRADE_TOLERANCE_MS` (atualmente ±200ms)
3. Atribui grade:
   - < 70ms de diferença → **Perfect** (dourado)
   - 70–150ms → **Good** (verde)
   - 150–200ms → **OK** (laranja)
   - Nota esperada passada sem ser tocada → **Miss** (vermelho)
   - Nota tocada sem correspondência esperada → **Wrong** (vermelho)
4. Badge com texto aparece no waterfall e some em 1.3s com fade-out

---

## 9. Análise musical em tempo real

Pipeline de stages que roda a cada evento MIDI recebido:

```
MIDI event
  → NoteStateUpdaterStage   (atualiza pressedNotes, velocity, dynamic)
  → IntervalCalculatorStage (calcula microsegundos desde evento anterior)
  → NoteIdentifierStage     (nome da nota: "C3", "F#4", …)
  → ChordIdentifierStage    (nome do acorde, inversão, se é tríade)
  → FinalStage              (log / futuro: server/lesson system)
```

**Detecção de acordes:** lookup table `[1<<12]` indexada por bitmask de classes de pitch. ~19–26 ns/op, 0 allocs.

**Dinâmica:** array `[256]DynamicLevel` pré-computado. O compilador elimina bounds check. O(1) sem branch.

---

## 10. Arquitetura de módulos (frontend)

```
src/
├── lib/
│   ├── exercise-types.ts       — interfaces e constantes de exercícios
│   ├── recording-types.ts      — Recording, NoteInterval, GRADE_TOLERANCE_MS
│   ├── note-colors.ts          — noteColor(midi) → hex string
│   ├── waterfall-canvas.ts     — canvas da cascata de notas (refatorar: ver §10.1)
│   └── piano-canvas.ts         — canvas do teclado
├── stores/
│   ├── midi.ts                 — estado MIDI ao vivo (pressedNotes, chord, …)
│   ├── playback.ts             — engine de playback + prática + grading
│   └── exercises.ts            — lista de exercícios + loadFromUrl()
├── components/
│   ├── HomeScreen.svelte       — tela inicial completa
│   ├── NoteWaterfall.svelte    — wrapper do canvas + sincronização com stores
│   ├── Piano.svelte            — wrapper do canvas do teclado
│   ├── RecordControls.svelte   — (mover para Home)
│   └── ImportControls.svelte   — (mover para Home)
└── App.svelte                  — roteamento home ↔ playing
```

### 10.1 Refatoração planejada para waterfall-canvas.ts

Separar em:

| Arquivo | Conteúdo |
|---|---|
| `waterfall-layout.ts` | `pitchY`, `barH`, `idxY`, `ledgerSlots` — matemática pura, testável unitariamente |
| `waterfall-draw.ts` | Funções de desenho stateless que recebem `ctx + layout + data` |
| `waterfall-canvas.ts` | Orquestração: estado, RAF loop, API pública |
| `timeline-canvas.ts` | Canvas da mini timeline (novo) |

---

## 11. Decisões de design tomadas

- **Linha dourada sempre à esquerda (~15%)** — representa "agora". Não se move.
- **Notas sempre da direita para a esquerda** — em ambos os modos.
- **Sem bloqueio por falta de MIDI** — o aluno pode entrar na tela de tocar sem dispositivo; simplesmente não haverá input ao vivo.
- **Modo prática manual** — ao clicar "Praticar agora" num exercício com dados, o app entra em modo prática mas aguarda o aluno pressionar ▶ para iniciar.
- **Pré-roll de lead time** — o playback começa com `positionMs = 0` mas o waterfall subtrai `leadTimeSec * 1000` do `practiceMs`, fazendo as primeiras notas aparecerem na borda direita.
- **RecordControls e ImportControls saem da tela de tocar** — essa tela é só para praticar.
- **Speed multiplier afeta scheduler + scroll** — mudar velocidade não distorce a relação visual nota/tempo.
- **Loop region** — definida arrastando guias na mini timeline; persiste enquanto o aluno estiver na tela de tocar.
