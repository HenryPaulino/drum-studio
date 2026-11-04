<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  BookOpen,
  Drum,
  Headphones,
  House,
  Library,
  Moon,
  Sun,
  Volume2,
} from 'lucide-vue-next'
import Metronome from './components/Metronome.vue'
import ChromaticTuner from './components/ChromaticTuner.vue'
import MusicLibrary from './components/MusicLibrary.vue'

type View = 'home' | 'library' | 'scores' | 'tuner'

const isDark = ref(true)
const activeView = ref<View>('home')

const viewLabels: Record<View, string> = {
  home: 'Início',
  library: 'Biblioteca musical',
  scores: 'Partituras',
  tuner: 'Afinador',
}

onMounted(() => {
  const savedTheme = localStorage.getItem('drum-studio-theme')
  isDark.value = savedTheme ? savedTheme === 'dark' : true
  applyTheme()
})

function applyTheme() {
  document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light'
  localStorage.setItem('drum-studio-theme', isDark.value ? 'dark' : 'light')
}

watch(isDark, applyTheme)
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="activeView = 'home'">
        <div class="brand-icon"><Drum :size="25" /></div>
        <div>
          <h1>DRUM STUDIO</h1>
          <span>SEU ESTÚDIO MUSICAL</span>
        </div>
      </a>

      <div class="menu-label">SEU ESPAÇO</div>
      <nav class="navigation" aria-label="Navegação principal">
        <button class="nav-item" :class="{ active: activeView === 'home' }" @click="activeView = 'home'">
          <House :size="19" /><span>Início</span>
        </button>
        <button class="nav-item" :class="{ active: activeView === 'library' }" @click="activeView = 'library'">
          <Library :size="19" /><span>Músicas</span>
        </button>
        <button class="nav-item" :class="{ active: activeView === 'scores' }" @click="activeView = 'scores'">
          <BookOpen :size="19" /><span>Partituras</span>
        </button>
        <button class="nav-item" :class="{ active: activeView === 'tuner' }" @click="activeView = 'tuner'">
          <Volume2 :size="19" /><span>Afinador</span>
        </button>
      </nav>

      <div class="sidebar-bottom">
        <div class="sidebar-message">
          <Headphones :size="21" />
          <p>Seu espaço para estudar música, no seu ritmo.</p>
        </div>
        <span class="version">DRUM STUDIO · V0.2</span>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <span class="breadcrumb">DRUM STUDIO / {{ viewLabels[activeView].toUpperCase() }}</span>
          <h2>{{ activeView === 'home' ? 'Seu espaço musical' : viewLabels[activeView] }}</h2>
        </div>
        <button
          class="theme-button"
          :aria-label="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'"
          @click="isDark = !isDark"
        >
          <Sun v-if="isDark" :size="19" />
          <Moon v-else :size="19" />
          <span>{{ isDark ? 'Tema claro' : 'Tema escuro' }}</span>
        </button>
      </header>

      <template v-if="activeView === 'home'">
        <section class="welcome-section">
          <div>
            <span class="section-tag">BEM-VINDO AO DRUM STUDIO</span>
            <h1>Vamos fazer música?</h1>
            <p>Estude com suas músicas, explore partituras para diferentes instrumentos e evolua um compasso de cada vez.</p>
          </div>
          <div class="welcome-icon"><Drum :size="75" :stroke-width="1.2" /></div>
        </section>

        <section class="section-heading">
          <div>
            <h3>Ferramentas de estudo</h3>
            <p>Metrônomo, afinador, músicas e partituras em um só lugar.</p>
          </div>
        </section>

        <section class="tools-grid">
          <Metronome />
          <button class="feature-card" @click="activeView = 'tuner'">
            <div class="card-icon"><Volume2 :size="21" /></div>
            <h3>Afinador cromático</h3>
            <p>Afine seu instrumento usando o microfone do celular ou tablet.</p>
            <span class="feature-link">Abrir afinador <span aria-hidden="true">→</span></span>
          </button>
          <button class="feature-card" @click="activeView = 'library'">
            <div class="card-icon"><Library :size="21" /></div>
            <h3>Biblioteca musical</h3>
            <p>Guarde referências de músicas do Spotify e do YouTube para seus estudos.</p>
            <span class="feature-link">Abrir biblioteca <span aria-hidden="true">→</span></span>
          </button>
          <button class="feature-card" @click="activeView = 'scores'">
            <div class="card-icon"><BookOpen :size="21" /></div>
            <h3>Partituras</h3>
            <p>Visualize e exporte partituras MusicXML para bateria, sopros e outros instrumentos.</p>
            <span class="feature-link">Ver partituras <span aria-hidden="true">→</span></span>
          </button>
        </section>
      </template>

      <MusicLibrary v-else-if="activeView === 'library'" initial-tab="library" />
      <MusicLibrary v-else-if="activeView === 'scores'" initial-tab="scores" />
      <ChromaticTuner v-else />

      <footer class="footer">
        <span>DRUM STUDIO</span>
        <span>Desenvolvido para quem vive a música.</span>
      </footer>
    </main>

    <nav class="mobile-navigation" aria-label="Navegação móvel">
      <button :class="{ active: activeView === 'home' }" @click="activeView = 'home'"><House :size="20" /><span>Início</span></button>
      <button :class="{ active: activeView === 'library' }" @click="activeView = 'library'"><Library :size="20" /><span>Músicas</span></button>
      <button :class="{ active: activeView === 'scores' }" @click="activeView = 'scores'"><BookOpen :size="20" /><span>Partituras</span></button>
      <button :class="{ active: activeView === 'tuner' }" @click="activeView = 'tuner'"><Volume2 :size="20" /><span>Afinador</span></button>
    </nav>
  </div>
</template>
