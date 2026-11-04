<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { BookOpen, Download, LogIn, LogOut, Music2, Search, Upload } from 'lucide-vue-next'
import type { OpenSheetMusicDisplay as SheetMusicRenderer } from 'opensheetmusicdisplay'
import { supabase } from '../lib/supabase'

type Instrument = 'Bateria' | 'Saxofone' | 'Flauta' | 'Violão' | 'Teclado' | 'Outro'

interface Song {
  id: string
  title: string
  artist: string
  collection: string
  status: 'pending' | 'approved' | 'rejected'
}

interface Score {
  id: string
  song_id: string
  title: string
  instrument: Instrument
  file_name: string
  storage_path: string
  status: 'pending' | 'approved' | 'rejected'
}

const instruments: Instrument[] = ['Bateria', 'Saxofone', 'Flauta', 'Violão', 'Teclado', 'Outro']
const session = ref<Session | null>(null)
const email = ref('')
const password = ref('')
const isSignUp = ref(false)
const isLoading = ref(false)
const searchQuery = ref('')
const instrumentFilter = ref('Todos')
const selectedSongId = ref('')
const songTitle = ref('')
const songArtist = ref('')
const scoreFile = ref<File | null>(null)
const newScoreTitle = ref('')
const newScoreInstrument = ref<Instrument>('Bateria')
const songs = ref<Song[]>([])
const scores = ref<Score[]>([])
const notice = ref('')
const errorMessage = ref('')
const renderTarget = ref<HTMLElement | null>(null)
const isConfigured = computed(() => supabase !== null)
const user = computed<User | null>(() => session.value?.user ?? null)
const filteredScores = computed(() => scores.value.filter((score) => {
  const song = songs.value.find((item) => item.id === score.song_id)
  const query = searchQuery.value.trim().toLocaleLowerCase('pt-BR')
  const textMatches = !query || `${score.title} ${score.file_name} ${score.instrument} ${song?.title ?? ''}`.toLocaleLowerCase('pt-BR').includes(query)
  return score.status === 'approved' && textMatches && (instrumentFilter.value === 'Todos' || score.instrument === instrumentFilter.value)
}))

let authSubscription: { unsubscribe: () => void } | undefined
let renderer: SheetMusicRenderer | null = null

function resetMessages() {
  notice.value = ''
  errorMessage.value = ''
}

function reportError(context: string, error: unknown) {
  console.error(context, error)
  errorMessage.value = error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

async function loadCatalog() {
  if (!supabase) return
  const [songResult, scoreResult] = await Promise.all([
    supabase.from('songs').select('id,title,artist,collection,status').order('title'),
    supabase.from('scores').select('id,song_id,title,instrument,file_name,storage_path,status').order('title'),
  ])
  if (songResult.error) throw songResult.error
  if (scoreResult.error) throw scoreResult.error
  songs.value = songResult.data as Song[]
  scores.value = scoreResult.data as Score[]
}

async function onAuthChange(_event: AuthChangeEvent, nextSession: Session | null) {
  session.value = nextSession
  if (nextSession) {
    window.setTimeout(() => {
      void loadCatalog().catch((error: unknown) => reportError('Não foi possível carregar o catálogo compartilhado:', error))
    }, 0)
  }
}

onMounted(async () => {
  if (!supabase) return
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    reportError('Não foi possível verificar a sessão:', error)
    return
  }
  session.value = data.session
  authSubscription = supabase.auth.onAuthStateChange(onAuthChange).data.subscription
  try {
    await loadCatalog()
  } catch (loadError) {
    reportError('Não foi possível carregar o catálogo compartilhado:', loadError)
  }
})

onBeforeUnmount(() => {
  authSubscription?.unsubscribe()
  renderer?.clear()
})

async function submitAuth() {
  if (!supabase) return
  resetMessages()
  isLoading.value = true
  try {
    const result = isSignUp.value
      ? await supabase.auth.signUp({ email: email.value.trim(), password: password.value })
      : await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value })
    if (result.error) throw result.error
    if (isSignUp.value && !result.data.session) {
      notice.value = 'Conta criada. Confirme seu e-mail para depois entrar no catálogo.'
    } else {
      notice.value = 'Acesso realizado.'
    }
    password.value = ''
  } catch (error) {
    reportError('Não foi possível autenticar no catálogo:', error)
  } finally {
    isLoading.value = false
  }
}

async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) {
    reportError('Não foi possível sair do catálogo:', error)
    return
  }
  session.value = null
  songs.value = []
  scores.value = []
}

async function submitSong() {
  if (!supabase || !user.value) return
  resetMessages()
  isLoading.value = true
  try {
    const { data, error } = await supabase.from('songs').insert({
      title: songTitle.value.trim(),
      artist: songArtist.value.trim(),
      collection: 'Louvor ICM',
      submitted_by: user.value.id,
      status: 'pending',
    }).select('id,title,artist,collection,status').single()
    if (error) throw error
    songs.value.push(data as Song)
    songTitle.value = ''
    songArtist.value = ''
    notice.value = 'Louvor enviado para análise. Ele ficará visível para todos após aprovação.'
  } catch (error) {
    reportError('Não foi possível enviar o louvor:', error)
  } finally {
    isLoading.value = false
  }
}

async function submitScore() {
  if (!supabase || !user.value || !scoreFile.value || !selectedSongId.value) return
  resetMessages()
  isLoading.value = true
  const file = scoreFile.value
  const storagePath = `${user.value.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`
  try {
    const { error: uploadError } = await supabase.storage.from('drum-studio-scores').upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (uploadError) throw uploadError

    const { error: insertError } = await supabase.from('scores').insert({
      song_id: selectedSongId.value,
      title: newScoreTitle.value.trim() || file.name.replace(/\.(musicxml|xml|mxl)$/i, ''),
      instrument: newScoreInstrument.value,
      file_name: file.name,
      storage_path: storagePath,
      submitted_by: user.value.id,
      status: 'pending',
    })
    if (insertError) {
      const { error: cleanupError } = await supabase.storage.from('drum-studio-scores').remove([storagePath])
      if (cleanupError) console.error('Não foi possível limpar o arquivo após falha ao salvar os metadados:', cleanupError)
      throw insertError
    }
    scoreFile.value = null
    newScoreTitle.value = ''
    notice.value = 'Partitura enviada para análise. Ela ficará visível para todos após aprovação.'
  } catch (error) {
    reportError('Não foi possível enviar a partitura:', error)
  } finally {
    isLoading.value = false
  }
}

function selectScoreFile(event: Event) {
  resetMessages()
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!/\.(musicxml|xml|mxl)$/i.test(file.name)) {
    errorMessage.value = 'Selecione um arquivo .musicxml, .xml ou .mxl.'
    ;(event.target as HTMLInputElement).value = ''
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    errorMessage.value = 'O limite de tamanho por partitura é 20 MB.'
    ;(event.target as HTMLInputElement).value = ''
    return
  }
  scoreFile.value = file
  if (!newScoreTitle.value) newScoreTitle.value = file.name.replace(/\.(musicxml|xml|mxl)$/i, '')
}

async function downloadScore(score: Score) {
  if (!supabase) return
  resetMessages()
  try {
    const { data, error } = await supabase.storage.from('drum-studio-scores').createSignedUrl(score.storage_path, 60)
    if (error) throw error
    const response = await fetch(data.signedUrl)
    if (!response.ok) throw new Error('O download da partitura falhou.')
    const file = await response.blob()
    const objectUrl = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = score.file_name
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  } catch (error) {
    reportError('Não foi possível baixar a partitura:', error)
  }
}

async function viewScore(score: Score) {
  if (!supabase || !renderTarget.value) return
  resetMessages()
  try {
    const { data, error } = await supabase.storage.from('drum-studio-scores').createSignedUrl(score.storage_path, 60)
    if (error) throw error
    const response = await fetch(data.signedUrl)
    if (!response.ok) throw new Error('O arquivo da partitura não pôde ser carregado.')
    const file = await response.blob()
    if (!renderer) {
      const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
      renderer = new OpenSheetMusicDisplay(renderTarget.value, { autoResize: true, backend: 'svg' })
    }
    await renderer.load(file)
    renderer.render()
  } catch (error) {
    reportError('Não foi possível exibir a partitura:', error)
  }
}
</script>

<template>
  <section class="shared-catalog">
    <header class="catalog-header">
      <div>
        <span class="section-tag">REPERTÓRIO COMUNITÁRIO</span>
        <h2>Catálogo de louvores ICM</h2>
        <p>As partituras aprovadas ficam disponíveis para todos e sincronizadas entre dispositivos.</p>
      </div>
      <button v-if="user" class="secondary-button" @click="signOut"><LogOut :size="17" /> Sair</button>
    </header>

    <div v-if="!isConfigured" class="setup-notice" role="status">
      <strong>O banco compartilhado ainda não está conectado.</strong>
      <span>Configure o projeto Supabase e as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para habilitar o catálogo online.</span>
    </div>

    <template v-else>
      <p v-if="notice" class="success-message" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>

      <section v-if="!user" class="tool-card auth-card">
        <div class="card-icon"><LogIn :size="20" /></div>
        <h3>{{ isSignUp ? 'Criar conta para contribuir' : 'Entrar para contribuir' }}</h3>
        <p>O catálogo aprovado é público. Uma conta é necessária para enviar louvores e partituras para revisão.</p>
        <form class="auth-form" @submit.prevent="submitAuth">
          <label>E-mail<input v-model="email" type="email" autocomplete="email" required /></label>
          <label>Senha<input v-model="password" :autocomplete="isSignUp ? 'new-password' : 'current-password'" type="password" minlength="8" required /></label>
          <button class="play-button" type="submit" :disabled="isLoading">{{ isLoading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar' }}</button>
        </form>
        <button class="text-button" @click="isSignUp = !isSignUp; resetMessages()">
          {{ isSignUp ? 'Já tenho uma conta' : 'Quero criar uma conta' }}
        </button>
      </section>

      <template v-else>
        <div class="contribution-grid">
          <form class="tool-card contribution-form" @submit.prevent="submitSong">
            <h3>Enviar louvor</h3>
            <p>Os dados enviados ficam pendentes até um administrador revisar.</p>
            <label>Título<input v-model="songTitle" maxlength="160" required placeholder="Nome do louvor" /></label>
            <label>Artista ou compositor<input v-model="songArtist" maxlength="160" placeholder="Opcional" /></label>
            <button class="play-button" type="submit" :disabled="isLoading"><Music2 :size="17" /> Enviar para revisão</button>
          </form>

          <form class="tool-card contribution-form" @submit.prevent="submitScore">
            <h3>Enviar partitura</h3>
            <p>Compartilhe uma partitura que você criou ou tem autorização para publicar.</p>
            <label>Louvor
              <select v-model="selectedSongId" required>
                <option value="" disabled>Escolha um louvor</option>
                <option v-for="song in songs" :key="song.id" :value="song.id">{{ song.title }}{{ song.status === 'pending' ? ' · aguardando aprovação' : '' }}</option>
              </select>
            </label>
            <label>Instrumento<select v-model="newScoreInstrument"><option v-for="item in instruments" :key="item">{{ item }}</option></select></label>
            <label>Título da partitura<input v-model="newScoreTitle" maxlength="160" placeholder="Opcional; usa o nome do arquivo" /></label>
            <label class="file-picker"><Upload :size="17" /> {{ scoreFile?.name ?? 'Escolher MusicXML (máx. 20 MB)' }}
              <input type="file" accept=".musicxml,.xml,.mxl" @change="selectScoreFile" />
            </label>
            <button class="play-button" type="submit" :disabled="isLoading || !scoreFile || !selectedSongId"><Upload :size="17" /> Enviar para revisão</button>
          </form>
        </div>
      </template>

      <section class="catalog-list">
        <div class="list-heading">
          <div><h3>Partituras publicadas</h3><p>{{ filteredScores.length }} disponíveis</p></div>
          <label class="instrument-filter">Instrumento
            <select v-model="instrumentFilter"><option>Todos</option><option v-for="item in instruments" :key="item">{{ item }}</option></select>
          </label>
        </div>
        <label class="search-field"><Search :size="18" /><input v-model="searchQuery" type="search" placeholder="Buscar por louvor, artista ou partitura" /></label>
        <div v-if="filteredScores.length" class="public-score-list">
          <article v-for="score in filteredScores" :key="score.id" class="public-score">
            <div class="score-icon"><BookOpen :size="19" /></div>
            <div class="score-info">
              <strong>{{ score.title }}</strong>
              <span>{{ songs.find((song) => song.id === score.song_id)?.title ?? 'Louvor' }} · {{ score.instrument }}</span>
            </div>
            <button class="icon-action" :aria-label="`Visualizar ${score.title}`" @click="viewScore(score)"><BookOpen :size="18" /></button>
            <button class="icon-action" :aria-label="`Baixar ${score.title}`" @click="downloadScore(score)"><Download :size="18" /></button>
          </article>
        </div>
        <div v-else class="empty-state"><Music2 :size="28" /><strong>{{ searchQuery ? 'Nenhum resultado' : 'O catálogo ainda não tem partituras publicadas' }}</strong><span>Novos envios aparecem aqui após aprovação.</span></div>
        <div v-if="filteredScores.length" ref="renderTarget" class="score-renderer" aria-label="Visualização da partitura"></div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.shared-catalog { display: flex; flex-direction: column; gap: 20px; }
.catalog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 24px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
.catalog-header h2 { margin: 8px 0; font-size: clamp(20px, 3vw, 27px); }
.catalog-header p, .auth-card > p, .contribution-form > p { color: var(--muted); font-size: 12px; line-height: 1.6; }
.setup-notice { display: flex; flex-direction: column; gap: 8px; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); font-size: 13px; }
.setup-notice span { color: var(--muted); font-size: 12px; line-height: 1.6; }
.auth-card { max-width: 520px; }
.auth-card h3 { margin: 16px 0 8px; }
.auth-form, .contribution-form { display: flex; flex-direction: column; gap: 13px; }
.auth-form { margin-top: 20px; }
.auth-form label, .contribution-form label, .instrument-filter { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 12px; }
.auth-form input, .contribution-form input, .contribution-form select, .instrument-filter select { width: 100%; min-height: 42px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: var(--text); }
.auth-form .play-button, .contribution-form .play-button { margin-top: 3px; }
.text-button { margin-top: 14px; border: 0; background: transparent; color: var(--red); font-size: 12px; }
.contribution-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.contribution-form h3 { margin-bottom: -5px; }
.file-picker { display: flex !important; min-height: 44px; flex-direction: row !important; align-items: center; overflow: hidden; padding: 10px 12px; border: 1px dashed var(--border); border-radius: 8px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.file-picker input { display: none; }
.catalog-list { display: flex; flex-direction: column; gap: 12px; }
.list-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.list-heading h3 { font-size: 17px; }
.list-heading p { margin-top: 5px; color: var(--muted); font-size: 12px; }
.instrument-filter { min-width: 160px; }
.search-field { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--muted); }
.search-field input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 13px; }
.public-score-list { overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.public-score { display: flex; align-items: center; gap: 12px; min-height: 66px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.public-score:last-child { border-bottom: 0; }
.score-icon { display: grid; flex: 0 0 38px; width: 38px; height: 38px; place-items: center; border-radius: 9px; background: var(--soft); color: var(--red); }
.score-info { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }
.score-info strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.score-info span { color: var(--muted); font-size: 11px; }
.icon-action { display: grid; flex: 0 0 40px; width: 40px; height: 40px; place-items: center; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--muted); }
.icon-action:hover { border-color: var(--border); background: var(--soft); color: var(--text); }
.score-renderer { overflow-x: auto; min-height: 0; padding: 12px; border-radius: 8px; background: #fff; color: #111; }
.success-message, .error-message { padding: 12px 14px; border-radius: 8px; font-size: 12px; }
.success-message { color: #36b879; background: color-mix(in srgb, #36b879 10%, var(--surface)); }
.error-message { color: #e85d68; background: color-mix(in srgb, #e85d68 10%, var(--surface)); }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 30px 16px; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); text-align: center; }
.empty-state svg { color: var(--red); }
.empty-state strong { color: var(--text); font-size: 13px; }
.empty-state span { font-size: 12px; }
@media (max-width: 720px) { .contribution-grid { grid-template-columns: 1fr; } }
@media (max-width: 520px) {
  .catalog-header { padding: 18px; }
  .list-heading { align-items: stretch; flex-direction: column; }
  .instrument-filter { min-width: 0; }
  .public-score { gap: 7px; padding: 8px; }
  .icon-action { flex-basis: 36px; width: 36px; height: 40px; }
}
</style>
