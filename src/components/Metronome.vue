<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { Play, Pause, Minus, Plus, Volume2 } from 'lucide-vue-next'
import * as Tone from 'tone'

// Configurações do metrônomo
const bpm = ref(72)
const isPlaying = ref(false)
const volume = ref(70)
const timeSignature = ref('4/4')
const subdivision = ref('4n')
const activeBeat = ref(-1)

const signatures: Record<string, number> = {
  '2/4': 2,
  '3/4': 3,
  '4/4': 4,
  '6/8': 6,
}

const subdivisionOptions = [
  { label: 'Semínimas', value: '4n' },
  { label: 'Colcheias', value: '8n' },
  { label: 'Semicolcheias', value: '16n' },
]

let synth: Tone.MembraneSynth | null = null
let beatLoop: Tone.Loop | null = null
let beatCount = 0

// Atualiza a velocidade
function updateBpm() {
  Tone.Transport.bpm.value = bpm.value
}

function changeBpm(value: number) {
  bpm.value = Math.min(240, Math.max(40, bpm.value + value))
  updateBpm()
}

// Ajusta o volume
function updateVolume() {
  if (!synth) return

  synth.volume.value = volume.value === 0 ? -Infinity : Tone.gainToDb(volume.value / 100)
}

// Inicia ou pausa o metrônomo
async function toggleMetronome() {
  if (isPlaying.value) {
    stopMetronome()
    return
  }

  try {
    await Tone.start()

    stopAudio()

    Tone.Transport.bpm.value = bpm.value
    beatCount = 0

    synth = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 2,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.12,
        sustain: 0,
        release: 0.01,
      },
    }).toDestination()

    updateVolume()

    const beatsPerBar = signatures[timeSignature.value] ?? 4

    // Calcula as subdivisões de cada tempo
    const subdivisionsPerBeat = subdivision.value === '4n' ? 1 : subdivision.value === '8n' ? 2 : 4

    const totalTicks = beatsPerBar * subdivisionsPerBeat

    beatLoop = new Tone.Loop((time) => {
      const currentBeat = Math.floor(beatCount / subdivisionsPerBeat)
      const isMainBeat = beatCount % subdivisionsPerBeat === 0
      const isFirstBeat = beatCount === 0

      // Atualiza o indicador visual nos tempos principais
      if (isMainBeat) {
        activeBeat.value = currentBeat
      }

      if (isMainBeat) {
        // Primeiro tempo recebe um som mais forte
        synth?.triggerAttackRelease(isFirstBeat ? 'C3' : 'G2', '16n', time, isFirstBeat ? 1 : 0.65)
      } else {
        // Subdivisões recebem um som mais leve
        synth?.triggerAttackRelease('C4', '32n', time, 0.3)
      }

      beatCount = (beatCount + 1) % totalTicks
    }, subdivision.value)

    beatLoop.start(0)

    Tone.Transport.start()
    isPlaying.value = true
  } catch (error) {
    console.error('Erro ao iniciar metrônomo:', error)
    stopMetronome()
  }
}

// Limpa os recursos de áudio
function stopAudio() {
  Tone.Transport.stop()
  Tone.Transport.cancel()
  Tone.Transport.position = 0

  beatLoop?.dispose()
  beatLoop = null

  synth?.dispose()
  synth = null

  beatCount = 0
}

function stopMetronome() {
  stopAudio()
  activeBeat.value = -1
  isPlaying.value = false
}

// Reinicia o metrônomo ao alterar compasso ou divisão
watch([timeSignature, subdivision], () => {
  if (isPlaying.value) {
    stopMetronome()
  }
})

// Evita deixar o áudio funcionando ao sair da tela
onBeforeUnmount(stopMetronome)
</script>

<template>
  <article class="tool-card metronome-card">
    <div class="card-heading">
      <div class="card-icon">
        <Volume2 :size="21" />
      </div>

      <span class="status">
        {{ isPlaying ? 'EM EXECUÇÃO' : 'DISPONÍVEL' }}
      </span>
    </div>

    <h3>Metrônomo</h3>

    <p>Controle o tempo e mantenha o ritmo.</p>

    <!-- Velocidade -->
    <div class="tempo-display">
      <strong>{{ bpm }}</strong>
      <span>BPM</span>
    </div>

    <div class="tempo-controls">
      <button @click="changeBpm(-1)" aria-label="Diminuir BPM">
        <Minus :size="19" />
      </button>

      <input
        v-model.number="bpm"
        type="range"
        min="40"
        max="240"
        aria-label="Velocidade do metrônomo"
        @input="updateBpm"
      />

      <button @click="changeBpm(1)" aria-label="Aumentar BPM">
        <Plus :size="19" />
      </button>
    </div>

    <!-- Configurações -->
    <div class="metronome-settings">
      <label>
        Compasso

        <select v-model="timeSignature">
          <option value="2/4">2/4</option>
          <option value="3/4">3/4</option>
          <option value="4/4">4/4</option>
          <option value="6/8">6/8</option>
        </select>
      </label>

      <label>
        Divisão

        <select v-model="subdivision">
          <option v-for="option in subdivisionOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>

    <!-- Contagem visual -->
    <div class="beat-counter">
      <span
        v-for="beat in signatures[timeSignature]"
        :key="beat"
        class="beat-dot"
        :class="{ active: activeBeat === beat - 1 }"
      >
        {{ beat }}
      </span>
    </div>

    <!-- Volume -->
    <div class="volume-control">
      <Volume2 :size="17" />

      <input
        v-model.number="volume"
        type="range"
        min="0"
        max="100"
        aria-label="Volume do metrônomo"
        @input="updateVolume"
      />

      <span>{{ volume }}%</span>
    </div>

    <!-- Botão de reprodução -->
    <button class="play-button" @click="toggleMetronome">
      <Pause v-if="isPlaying" :size="19" />
      <Play v-else :size="19" />

      {{ isPlaying ? 'Parar metrônomo' : 'Iniciar metrônomo' }}
    </button>
  </article>
</template>

<style scoped>
.metronome-settings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 20px 0;
}

.metronome-settings label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.metronome-settings select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
}

.beat-counter {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 22px 0;
}

.beat-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--soft);
  color: var(--muted);
  font-weight: 700;
  transition: 0.12s;
}

.beat-dot.active {
  background: var(--red);
  color: white;
  transform: scale(1.15);
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  color: var(--muted);
}

.volume-control input {
  flex: 1;
  min-width: 0;
}

.volume-control span {
  min-width: 38px;
  font-size: 12px;
  text-align: right;
}
</style>
