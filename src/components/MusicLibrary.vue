<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { BookOpen, ExternalLink, FileUp, Music2, Plus, Search, Trash2 } from 'lucide-vue-next'
import type { OpenSheetMusicDisplay as SheetMusicRenderer } from 'opensheetmusicdisplay'
import SharedCatalog from './SharedCatalog.vue'

type Instrument = 'Bateria' | 'Saxofone' | 'Flauta' | 'Violão' | 'Teclado' | 'Outro'
type Tab = 'library' | 'scores' | 'shared'

interface SongReference {
  id: string
  title: string
  artist: string
  url?: string
  platform?: 'Spotify' | 'YouTube'
  collection?: string
}

interface StoredScore {
  id: string
  title: string
  instrument: Instrument
  fileName: string
  data: Blob
  addedAt: number
  songId?: string
}

const props = defineProps<{ initialTab: Tab }>()
const activeTab = ref<Tab>(props.initialTab)
const title = ref('')
const artist = ref('')
const url = ref('')
const collection = ref('Louvor ICM')
const instrument = ref<Instrument>('Bateria')
const associatedSongId = ref('')
const searchQuery = ref('')
const scoreInstrumentFilter = ref('Todos')
const scoreSongFilter = ref('')
const songs = ref<SongReference[]>([])
const scores = ref<StoredScore[]>([])
const selectedScore = ref<StoredScore | null>(null)
const renderTarget = ref<HTMLElement | null>(null)
const notice = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

const instruments: Instrument[] = ['Bateria', 'Saxofone', 'Flauta', 'Violão', 'Teclado', 'Outro']
const collections = ['Louvor ICM', 'Outro louvor', 'Outras músicas']
const filteredSongs = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pt-BR')
  return songs.value.filter((song) => {
    const text = `${song.title} ${song.artist} ${song.collection ?? ''}`.toLocaleLowerCase('pt-BR')
    return !query || text.includes(query)
  })
})
const filteredScores = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pt-BR')
  return scores.value.filter((score) => {
    const song = songs.value.find((item) => item.id === score.songId)
    const matchesText = !query || `${score.title} ${score.fileName} ${score.instrument} ${song?.title ?? ''}`.toLocaleLowerCase('pt-BR').includes(query)
    const matchesInstrument = scoreInstrumentFilter.value === 'Todos' || score.instrument === scoreInstrumentFilter.value
    const matchesSong = !scoreSongFilter.value || score.songId === scoreSongFilter.value
    return matchesText && matchesInstrument && matchesSong
  })
})
let database: IDBDatabase | null = null
let renderer: SheetMusicRenderer | null = null

watch(() => props.initialTab, (tab) => {
  activeTab.value = tab
})

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('drum-studio-library', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('scores', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir a biblioteca local.'))
  })
}

function readScores(db: IDBDatabase): Promise<StoredScore[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction('scores', 'readonly').objectStore('scores').getAll()
    request.onsuccess = () => resolve(request.result as StoredScore[])
    request.onerror = () => reject(request.error ?? new Error('Falha ao carregar partituras salvas.'))
  })
}

function saveScore(db: IDBDatabase, score: StoredScore): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('scores', 'readwrite')
    transaction.objectStore('scores').put(score)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar a partitura.'))
  })
}

function deleteScore(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('scores', 'readwrite')
    transaction.objectStore('scores').delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao remover a partitura.'))
  })
}

function loadSongs() {
  try {
    const saved = localStorage.getItem('drum-studio-songs')
    songs.value = saved ? JSON.parse(saved) as SongReference[] : []
  } catch (error) {
    console.error('Não foi possível carregar as músicas salvas:', error)
    errorMessage.value = 'Não foi possível carregar as músicas deste dispositivo.'
  }
}

function persistSongs(): boolean {
  try {
    localStorage.setItem('drum-studio-songs', JSON.stringify(songs.value))
    return true
  } catch (error) {
    console.error('Não foi possível salvar a biblioteca de músicas:', error)
    errorMessage.value = 'Não foi possível salvar. Verifique o espaço disponível no dispositivo.'
    return false
  }
}

function identifyPlatform(value: string): SongReference['platform'] | null {
  try {
    const parsedUrl = new URL(value)
    if (parsedUrl.protocol !== 'https:') return null
    if (parsedUrl.hostname === 'open.spotify.com' || parsedUrl.hostname === 'spotify.link') return 'Spotify'
    if (parsedUrl.hostname === 'youtu.be' || parsedUrl.hostname === 'youtube.com' || parsedUrl.hostname.endsWith('.youtube.com')) return 'YouTube'
  } catch {
    return null
  }
  return null
}

function addSong() {
  errorMessage.value = ''
  const trimmedUrl = url.value.trim()
  const platform = trimmedUrl ? identifyPlatform(trimmedUrl) : undefined
  if (!title.value.trim()) {
    errorMessage.value = 'Informe o nome da música.'
    return
  }
  if (trimmedUrl && !platform) {
    errorMessage.value = 'Cole um link HTTPS válido do Spotify ou YouTube.'
    return
  }

  const song: SongReference = {
    id: crypto.randomUUID(),
    title: title.value.trim(),
    artist: artist.value.trim(),
    ...(trimmedUrl ? { url: trimmedUrl } : {}),
    ...(platform ? { platform } : {}),
    collection: collection.value,
  }
  songs.value.unshift(song)
  if (!persistSongs()) {
    songs.value = songs.value.filter((item) => item.id !== song.id)
    return
  }
  title.value = ''
  artist.value = ''
  url.value = ''
  notice.value = 'Louvor adicionado ao repertório deste dispositivo.'
}

function removeSong(id: string) {
  songs.value = songs.value.filter((song) => song.id !== id)
  persistSongs()
}

function scoreCount(songId: string): number {
  return scores.value.filter((score) => score.songId === songId).length
}

function beginScoreImport(song?: SongReference) {
  activeTab.value = 'scores'
  associatedSongId.value = song?.id ?? ''
  scoreSongFilter.value = song?.id ?? ''
  instrument.value = 'Bateria'
  errorMessage.value = ''
}

async function refreshScores() {
  if (!database) return
  scores.value = await readScores(database)
}

async function importScore(event: Event) {
  errorMessage.value = ''
  notice.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!/\.(musicxml|xml|mxl)$/i.test(file.name)) {
    errorMessage.value = 'Escolha uma partitura .musicxml, .xml ou .mxl.'
    return
  }
  if (!database) {
    errorMessage.value = 'O armazenamento local não está disponível neste navegador.'
    return
  }

  isLoading.value = true
  try {
    const score: StoredScore = {
      id: crypto.randomUUID(),
      title: file.name.replace(/\.(musicxml|xml|mxl)$/i, ''),
      instrument: instrument.value,
      fileName: file.name,
      data: file,
      addedAt: Date.now(),
      ...(associatedSongId.value ? { songId: associatedSongId.value } : {}),
    }
    await saveScore(database, score)
    await refreshScores()
    await showScore(score)
    notice.value = 'Partitura importada e salva neste dispositivo.'
  } catch (error) {
    console.error('Não foi possível importar a partitura:', error)
    errorMessage.value = 'Não foi possível abrir esse arquivo. Confira se ele é um MusicXML válido.'
  } finally {
    isLoading.value = false
    ;(event.target as HTMLInputElement).value = ''
  }
}

async function showScore(score: StoredScore) {
  selectedScore.value = score
  activeTab.value = 'scores'
  await nextTick()
  if (!renderTarget.value) return

  try {
    if (!renderer) {
      const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
      renderer = new OpenSheetMusicDisplay(renderTarget.value, { autoResize: true, backend: 'svg' })
    }
    await renderer.load(score.data)
    renderer.render()
  } catch (error) {
    console.error('Não foi possível renderizar a partitura:', error)
    errorMessage.value = 'O arquivo foi importado, mas não foi possível exibir a partitura. Tente outro MusicXML.'
  }
}

async function removeScore(score: StoredScore) {
  if (!database) return
  try {
    await deleteScore(database, score.id)
    await refreshScores()
    if (selectedScore.value?.id === score.id) {
      selectedScore.value = null
      renderer?.clear()
    }
  } catch (error) {
    console.error('Não foi possível remover a partitura:', error)
    errorMessage.value = 'Não foi possível remover essa partitura.'
  }
}

function exportScore(score: StoredScore) {
  const downloadUrl = URL.createObjectURL(score.data)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = score.fileName
  link.click()
  URL.revokeObjectURL(downloadUrl)
}

onMounted(async () => {
  loadSongs()
  try {
    database = await openDatabase()
    await refreshScores()
  } catch (error) {
    console.error('Não foi possível iniciar o armazenamento de partituras:', error)
    errorMessage.value = 'Não foi possível abrir o armazenamento de partituras neste navegador.'
  }
})
</script>

<template>
  <section class="library-page">
    <div class="library-intro">
      <div>
        <span class="section-tag">SEU REPERTÓRIO</span>
        <h1>Músicas e partituras</h1>
        <p>Organize referências e mantenha seus arquivos de partitura acessíveis neste dispositivo.</p>
      </div>
      <div class="library-symbol"><Music2 :size="30" /></div>
    </div>

    <div class="library-tabs" role="tablist" aria-label="Biblioteca">
      <button role="tab" :aria-selected="activeTab === 'library'" :class="{ active: activeTab === 'library' }" @click="activeTab = 'library'">
        <Music2 :size="17" /> Músicas
      </button>
      <button role="tab" :aria-selected="activeTab === 'scores'" :class="{ active: activeTab === 'scores' }" @click="activeTab = 'scores'">
        <BookOpen :size="17" /> Partituras
      </button>
      <button role="tab" :aria-selected="activeTab === 'shared'" :class="{ active: activeTab === 'shared' }" @click="activeTab = 'shared'">
        <Music2 :size="17" /> Catálogo ICM
      </button>
    </div>

    <p v-if="notice" class="success-message" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>

    <SharedCatalog v-if="activeTab === 'shared'" />

    <template v-else-if="activeTab === 'library'">
      <section class="tool-card library-form">
        <div class="card-heading">
          <div class="card-icon"><Plus :size="21" /></div>
          <span class="coming-soon">REPERTÓRIO LOCAL</span>
        </div>
        <h3>Adicionar louvor ao repertório</h3>
        <p>Cadastre o louvor e associe partituras autorizadas por instrumento.</p>
        <form class="song-form" @submit.prevent="addSong">
          <label>Nome do louvor<input v-model="title" required maxlength="120" placeholder="Título do louvor" /></label>
          <label>Artista <span class="optional">(opcional)</span><input v-model="artist" maxlength="120" placeholder="Nome do artista" /></label>
          <label>Repertório
            <select v-model="collection">
              <option v-for="item in collections" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>Link Spotify/YouTube <span class="optional">(opcional)</span><input v-model="url" type="url" placeholder="https://..." /></label>
          <button class="play-button form-wide" type="submit"><Plus :size="18" /> Adicionar louvor</button>
        </form>
        <p class="legal-note">O link é apenas uma referência; o app não baixa nem transcreve o áudio.</p>
      </section>

      <section class="library-list-section">
        <div class="section-heading">
          <div><h3>Repertório de louvores</h3><p>{{ filteredSongs.length }} {{ filteredSongs.length === 1 ? 'louvor' : 'louvores' }}</p></div>
        </div>
        <label class="search-field"><Search :size="18" /><input v-model="searchQuery" type="search" placeholder="Buscar por louvor ou artista" aria-label="Buscar louvores" /></label>
        <div v-if="filteredSongs.length" class="song-list">
          <article v-for="song in filteredSongs" :key="song.id" class="song-row">
            <div class="song-icon"><Music2 :size="20" /></div>
            <div class="song-info"><strong>{{ song.title }}</strong><span>{{ song.collection ?? 'Louvor ICM' }}<template v-if="song.artist"> · {{ song.artist }}</template><template v-if="scoreCount(song.id)"> · {{ scoreCount(song.id) }} partitura(s)</template></span></div>
            <button class="icon-action" :aria-label="`Adicionar partitura de bateria para ${song.title}`" @click="beginScoreImport(song)"><BookOpen :size="18" /></button>
            <a v-if="song.url" class="icon-action" :href="song.url" target="_blank" rel="noopener noreferrer" :aria-label="`Abrir ${song.title} no ${song.platform}`"><ExternalLink :size="18" /></a>
            <button class="icon-action danger" :aria-label="`Remover ${song.title}`" @click="removeSong(song.id)"><Trash2 :size="18" /></button>
          </article>
        </div>
        <div v-else class="empty-state"><Music2 :size="30" /><strong>{{ searchQuery ? 'Nenhum louvor encontrado' : 'Seu repertório está vazio' }}</strong><span>{{ searchQuery ? 'Tente outro título ou artista.' : 'Cadastre louvores para organizar as partituras.' }}</span></div>
      </section>
    </template>

    <template v-else>
      <section class="tool-card score-import">
        <div class="card-heading">
          <div class="card-icon"><FileUp :size="21" /></div>
          <span class="coming-soon">MUSICXML</span>
        </div>
        <h3>Importar uma partitura</h3>
        <p>Associe partituras autorizadas aos louvores do repertório e organize por instrumento.</p>
        <div class="import-controls">
          <label>Instrumento
            <select v-model="instrument">
              <option v-for="item in instruments" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label class="song-association">Louvor
            <select v-model="associatedSongId">
              <option value="">Sem louvor associado</option>
              <option v-for="song in songs" :key="song.id" :value="song.id">{{ song.title }}</option>
            </select>
          </label>
          <label class="file-button"><FileUp :size="18" /> {{ isLoading ? 'Importando...' : 'Escolher arquivo' }}
            <input type="file" accept=".musicxml,.xml,.mxl" :disabled="isLoading" @change="importScore" />
          </label>
        </div>
        <p class="legal-note">Compatível com .musicxml, .xml e .mxl. As partituras ficam neste dispositivo; importe apenas material que você tem autorização para usar.</p>
      </section>

      <section class="library-list-section">
        <div class="section-heading"><div><h3>Partituras por louvor e instrumento</h3><p>{{ filteredScores.length }} de {{ scores.length }} {{ scores.length === 1 ? 'partitura salva' : 'partituras salvas' }}</p></div></div>
        <div class="score-filters">
          <label class="search-field"><Search :size="18" /><input v-model="searchQuery" type="search" placeholder="Buscar louvor ou partitura" aria-label="Buscar partituras" /></label>
          <label class="filter-label">Instrumento
            <select v-model="scoreInstrumentFilter"><option>Todos</option><option v-for="item in instruments" :key="item">{{ item }}</option></select>
          </label>
          <label class="filter-label">Louvor
            <select v-model="scoreSongFilter"><option value="">Todos os louvores</option><option v-for="song in songs" :key="song.id" :value="song.id">{{ song.title }}</option></select>
          </label>
        </div>
        <div v-if="filteredScores.length" class="song-list">
          <article v-for="score in filteredScores" :key="score.id" class="song-row">
            <div class="song-icon"><BookOpen :size="20" /></div>
            <button class="score-open" @click="showScore(score)"><strong>{{ score.title }}</strong><span>{{ score.instrument }}<template v-if="songs.find((song) => song.id === score.songId)"> · {{ songs.find((song) => song.id === score.songId)?.title }}</template> · {{ score.fileName }}</span></button>
            <button class="icon-action" :aria-label="`Exportar ${score.title}`" @click="exportScore(score)"><FileUp :size="18" /></button>
            <button class="icon-action danger" :aria-label="`Remover ${score.title}`" @click="removeScore(score)"><Trash2 :size="18" /></button>
          </article>
        </div>
        <div v-else class="empty-state"><BookOpen :size="30" /><strong>{{ scores.length ? 'Nenhuma partitura corresponde aos filtros' : 'Nenhuma partitura importada' }}</strong><span>{{ scores.length ? 'Altere os filtros ou a busca.' : 'Use MusicXML autorizado para adicionar as partituras dos louvores.' }}</span></div>
      </section>

      <section v-if="selectedScore" class="tool-card score-viewer">
        <div class="viewer-heading"><div><span class="section-tag">{{ selectedScore.instrument.toUpperCase() }}</span><h3>{{ selectedScore.title }}</h3></div><button class="secondary-button" @click="exportScore(selectedScore)"><FileUp :size="17" /> Exportar MusicXML</button></div>
        <div ref="renderTarget" class="score-renderer" aria-label="Visualização da partitura"></div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.library-page { display: flex; flex-direction: column; gap: 24px; }
.library-intro { display: flex; justify-content: space-between; align-items: center; padding: 28px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
.library-intro h1 { margin: 10px 0 7px; font-size: clamp(22px, 3vw, 30px); }
.library-intro p, .library-form > p, .score-import > p { color: var(--muted); font-size: 13px; line-height: 1.65; }
.library-symbol { color: var(--red); }
.library-tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--border); }
.library-tabs button { display: inline-flex; gap: 8px; align-items: center; padding: 12px 16px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); }
.library-tabs button.active { border-bottom-color: var(--red); color: var(--text); }
.library-form, .score-import { max-width: 760px; }
.library-form .card-heading, .score-import .card-heading { margin-bottom: 16px; }
.song-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; }
.song-form label, .import-controls > label { display: flex; flex-direction: column; gap: 7px; color: var(--muted); font-size: 12px; }
.song-form input, .song-form select, .import-controls select, .filter-label select { width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: var(--text); }
.form-wide { grid-column: 1 / -1; }
.optional { opacity: .7; }
.song-form .play-button { margin-top: 0; }
.legal-note { margin-top: 14px; font-size: 11px !important; }
.library-list-section { margin-top: 4px; }
.library-list-section .section-heading { margin-bottom: 13px; }
.search-field { display: flex; align-items: center; gap: 10px; min-height: 44px; margin-bottom: 12px; padding: 0 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--muted); }
.search-field input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 13px; }
.score-filters { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(150px, .55fr) minmax(180px, .7fr); gap: 10px; align-items: end; margin-bottom: 12px; }
.score-filters .search-field { margin: 0; }
.filter-label { display: flex; flex-direction: column; gap: 5px; color: var(--muted); font-size: 11px; }
.filter-label select { padding: 11px; }
.song-list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
.song-row { display: flex; align-items: center; gap: 14px; min-height: 70px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.song-row:last-child { border-bottom: 0; }
.song-icon, .card-icon { display: grid; place-items: center; color: var(--red); background: var(--soft); border-radius: 10px; }
.song-icon { width: 40px; height: 40px; flex-shrink: 0; }
.song-info, .score-open { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; text-align: left; }
.song-info strong, .score-open strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.song-info span, .score-open span { color: var(--muted); font-size: 11px; }
.score-open { border: 0; background: transparent; color: var(--text); }
.icon-action { display: grid; place-items: center; flex-shrink: 0; width: 38px; height: 38px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--muted); }
.icon-action:hover { border-color: var(--border); background: var(--soft); color: var(--text); }
.icon-action.danger:hover { color: var(--red); }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 35px 20px; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); text-align: center; }
.empty-state > svg { color: var(--red); }
.empty-state strong { color: var(--text); font-size: 13px; }
.empty-state span { font-size: 12px; }
.import-controls { display: flex; align-items: end; gap: 12px; margin-top: 20px; }
.import-controls > label { flex: 1; }
.import-controls select { padding: 11px; }
.file-button, .secondary-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 10px 15px; border: 1px solid var(--border); border-radius: 8px; background: var(--soft); color: var(--text); font-size: 12px; cursor: pointer; }
.file-button input { display: none; }
.score-viewer { overflow: hidden; }
.viewer-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
.viewer-heading h3 { margin-top: 6px; }
.score-renderer { overflow-x: auto; min-height: 80px; padding: 12px; border-radius: 8px; background: #fff; color: #111; }
.success-message, .error-message { padding: 12px 14px; border-radius: 8px; font-size: 12px; }
.success-message { color: #36b879; background: color-mix(in srgb, #36b879 10%, var(--surface)); }
.error-message { color: #e85d68; background: color-mix(in srgb, #e85d68 10%, var(--surface)); }
@media (max-width: 600px) {
  .library-page { gap: 18px; }
  .library-intro { padding: 22px 18px; }
  .song-form { grid-template-columns: 1fr; }
  .form-wide { grid-column: auto; }
  .import-controls { align-items: stretch; flex-direction: column; }
  .score-filters { grid-template-columns: 1fr; }
  .file-button { min-height: 48px; }
  .song-row { gap: 9px; padding: 10px; }
  .viewer-heading { align-items: flex-start; flex-direction: column; }
}
</style>
