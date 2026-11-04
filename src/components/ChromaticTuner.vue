<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Mic, MicOff, Volume2 } from 'lucide-vue-next'

const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const isListening = ref(false)
const errorMessage = ref('')
const frequency = ref(0)
const cents = ref(0)
const detectedNote = ref('--')
const octave = ref('')

let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let mediaStream: MediaStream | null = null
let animationFrame = 0
let lastAnalysisTime = 0

const tuningLabel = computed(() => {
  if (!frequency.value) return 'Toque em iniciar e aproxime o instrumento do microfone.'
  if (Math.abs(cents.value) <= 5) return 'Afinado'
  return cents.value < 0 ? 'Um pouco abaixo' : 'Um pouco acima'
})

function detectPitch(buffer: Float32Array, sampleRate: number): number {
  let rms = 0
  for (const sample of buffer) rms += sample * sample
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.01) return 0

  let bestOffset = -1
  let bestCorrelation = 0
  const minOffset = Math.floor(sampleRate / 1000)
  const maxOffset = Math.min(Math.floor(sampleRate / 50), buffer.length - 1)

  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0
    for (let index = 0; index < buffer.length - offset; index += 1) {
      correlation += 1 - Math.abs(buffer[index]! - buffer[index + offset]!)
    }
    correlation /= buffer.length - offset
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestOffset = offset
    }
  }

  return bestOffset > 0 && bestCorrelation > 0.8 ? sampleRate / bestOffset : 0
}

function updatePitch() {
  if (!analyser || !audioContext) return
  const now = performance.now()
  if (now - lastAnalysisTime < 80) {
    animationFrame = requestAnimationFrame(updatePitch)
    return
  }
  lastAnalysisTime = now
  const samples = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(samples)
  const pitch = detectPitch(samples, audioContext.sampleRate)

  if (pitch > 0) {
    const midi = Math.round(69 + 12 * Math.log2(pitch / 440))
    const referenceFrequency = 440 * 2 ** ((midi - 69) / 12)
    frequency.value = pitch
    cents.value = Math.round(1200 * Math.log2(pitch / referenceFrequency))
    detectedNote.value = chromaticNotes[((midi % 12) + 12) % 12]!
    octave.value = String(Math.floor(midi / 12) - 1)
  } else {
    frequency.value = 0
  }

  animationFrame = requestAnimationFrame(updatePitch)
}

async function startTuner() {
  errorMessage.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value = 'Este navegador não oferece acesso ao microfone. Use uma conexão segura (HTTPS) e tente novamente.'
    return
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioContext = new AudioContext()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 4096
    audioContext.createMediaStreamSource(mediaStream).connect(analyser)
    isListening.value = true
    updatePitch()
  } catch (error) {
    console.error('Não foi possível iniciar o afinador:', error)
    mediaStream?.getTracks().forEach((track) => track.stop())
    mediaStream = null
    errorMessage.value = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Permita o acesso ao microfone nas configurações do navegador para usar o afinador.'
      : 'Não foi possível acessar o microfone. Verifique se ele está conectado e tente novamente.'
  }
}

async function stopTuner() {
  cancelAnimationFrame(animationFrame)
  mediaStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null
  analyser = null
  if (audioContext) await audioContext.close()
  audioContext = null
  isListening.value = false
  frequency.value = 0
}

onBeforeUnmount(() => {
  void stopTuner()
})
</script>

<template>
  <section class="tool-card tuner-card">
    <div class="card-heading">
      <div class="card-icon"><Volume2 :size="21" /></div>
      <span class="status">{{ isListening ? 'MICROFONE ATIVO' : 'AFINADOR CROMÁTICO' }}</span>
    </div>
    <h3>Afine seu instrumento</h3>
    <p>O afinador escuta pelo microfone e identifica a nota mais próxima.</p>

    <div class="tuner-readout" :class="{ 'in-tune': frequency > 0 && Math.abs(cents) <= 5 }">
      <div class="tuner-meter" aria-hidden="true">
        <span class="meter-mark left">♭</span>
        <span class="meter-mark center">●</span>
        <span class="meter-mark right">♯</span>
        <div class="meter-needle" :style="{ transform: `translateX(${Math.max(-46, Math.min(46, cents * 1.5))}px)` }"></div>
      </div>
      <strong>{{ detectedNote }}<small>{{ octave }}</small></strong>
      <span class="tuner-frequency">{{ frequency ? `${frequency.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents} cents` : tuningLabel }}</span>
      <span v-if="frequency" class="tuner-status">{{ tuningLabel }}</span>
    </div>

    <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
    <button class="play-button" @click="isListening ? stopTuner() : startTuner()">
      <MicOff v-if="isListening" :size="19" />
      <Mic v-else :size="19" />
      {{ isListening ? 'Parar afinador' : 'Ativar microfone' }}
    </button>
    <p class="privacy-note">O áudio é processado no dispositivo e não é enviado para um servidor.</p>
  </section>
</template>

<style scoped>
.tuner-card { max-width: 720px; }
.tuner-readout { display: flex; flex-direction: column; align-items: center; padding: 28px 16px 8px; }
.tuner-readout > strong { color: var(--text); font-size: 76px; line-height: 1.1; }
.tuner-readout > strong small { font-size: 26px; margin-left: 5px; color: var(--muted); }
.tuner-frequency { color: var(--muted); font-size: 13px; text-align: center; }
.tuner-status { color: var(--red); font-size: 12px; font-weight: 700; margin-top: 10px; }
.in-tune .tuner-status { color: #36b879; }
.tuner-meter { width: 140px; height: 45px; position: relative; display: flex; justify-content: space-between; color: var(--muted); }
.meter-mark { font-size: 18px; }
.meter-mark.center { color: var(--red); }
.meter-needle { position: absolute; left: 50%; bottom: 1px; width: 2px; height: 25px; background: var(--red); transform-origin: bottom; transition: transform 0.12s; }
.error-message { color: #e85d68 !important; margin-top: 14px; }
.privacy-note { font-size: 11px !important; text-align: center; margin-top: 12px; }
</style>
