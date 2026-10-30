
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import {
  House,
  Library,
  Music2,
  BookOpen,
  Settings,
  Moon,
  Sun,
  Headphones,
  Drum
} from 'lucide-vue-next'

import Metronome from './components/Metronome.vue'

// Controla o tema visual
const isDark = ref(true)

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

    <!-- Menu lateral -->
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon">
          <Drum :size="25" />
        </div>

        <div>
          <h1>DRUM STUDIO</h1>
          <span>SEU ESTÚDIO MUSICAL</span>
        </div>
      </div>

      <div class="menu-label">MENU PRINCIPAL</div>

      <nav class="navigation">
        <button class="nav-item active">
          <House :size="19" />
          <span>Início</span>
        </button>

        <button class="nav-item" disabled>
          <Library :size="19" />
          <span>Biblioteca</span>
          <small>Em breve</small>
        </button>

        <button class="nav-item" disabled>
          <Music2 :size="19" />
          <span>Partituras</span>
          <small>Em breve</small>
        </button>

        <button class="nav-item" disabled>
          <BookOpen :size="19" />
          <span>Meus estudos</span>
          <small>Em breve</small>
        </button>
      </nav>

      <div class="sidebar-bottom">
        <div class="sidebar-message">
          <Headphones :size="21" />
          <p>Seu espaço para evoluir na bateria.</p>
        </div>

        <button class="nav-item" disabled>
          <Settings :size="19" />
          <span>Configurações</span>
        </button>

        <span class="version">DRUM STUDIO · V0.1</span>
      </div>
    </aside>

    <!-- Conteúdo principal -->
    <main class="main-content">

      <header class="topbar">
        <div>
          <span class="breadcrumb">DRUM STUDIO / INÍCIO</span>
          <h2>Seu espaço musical</h2>
        </div>

        <button
          class="theme-button"
          @click="isDark = !isDark"
          :aria-label="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'"
        >
          <Sun v-if="isDark" :size="19" />
          <Moon v-else :size="19" />

          <span>{{ isDark ? 'Tema claro' : 'Tema escuro' }}</span>
        </button>
      </header>

      <!-- Apresentação -->
      <section class="welcome-section">
        <div>
          <span class="section-tag">BEM-VINDO AO DRUM STUDIO</span>

          <h1>Vamos fazer música?</h1>

          <p>
            Organize seus estudos, pratique seus ritmos
            e evolua um compasso de cada vez.
          </p>
        </div>

        <div class="welcome-icon">
          <Drum :size="75" :stroke-width="1.2" />
        </div>
      </section>

      <!-- Ferramentas -->
      <section class="section-heading">
        <div>
          <h3>Ferramentas de estudo</h3>
          <p>Tudo o que você precisa para praticar.</p>
        </div>
      </section>

      <section class="tools-grid">

        <!-- Metrônomo funcional -->
        <Metronome />

        <!-- Biblioteca musical -->
        <article class="tool-card">
          <div class="card-heading">
            <div class="card-icon">
              <Library :size="21" />
            </div>

            <span class="coming-soon">EM DESENVOLVIMENTO</span>
          </div>

          <h3>Biblioteca musical</h3>

          <p>Organize seus louvores e músicas favoritas.</p>

          <div class="empty-icon">
            <Music2 :size="35" />
          </div>

          <span class="card-footer">
            Cadastro de músicas em breve
          </span>
        </article>

        <!-- Partituras -->
        <article class="tool-card">
          <div class="card-heading">
            <div class="card-icon">
              <BookOpen :size="21" />
            </div>

            <span class="coming-soon">EM DESENVOLVIMENTO</span>
          </div>

          <h3>Partituras de bateria</h3>

          <p>Bumbo, caixa, chimbal, pratos e tons.</p>

          <div class="empty-icon">
            <Drum :size="35" />
          </div>

          <span class="card-footer">
            Notação musical em breve
          </span>
        </article>

      </section>

      <footer class="footer">
        <span>DRUM STUDIO</span>
        <span>Desenvolvido para quem vive a música.</span>
      </footer>

    </main>
  </div>
</template>
