<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BookOpen, Cloud, ExternalLink, FileUp, LogIn, LogOut, Music2, Pause, Play, Plus, Repeat, Search, Square, Trash2 } from 'lucide-vue-next'
import type { OpenSheetMusicDisplay as SheetMusicRenderer } from 'opensheetmusicdisplay'
import * as Tone from 'tone'
import { catalogScores } from '../data/catalog'
import { createDrumMusicXml, createPitchedMusicXml, drumParts, type DrumPartId, type DrumPattern } from '../lib/drumMusicXml'
import {
  deleteDriveScoreBackup,
  downloadDriveScoreBackup,
  getConnectedGoogleUser,
  isGoogleDriveConfigured,
  loadDriveLibrary,
  listDriveScoreBackups,
  prepareGoogleDrive,
  saveDriveLibrary,
  signInWithGoogle,
  signOutFromGoogle,
  uploadDriveScoreBackup,
  type DriveScoreBackup,
  type DriveLibrarySong,
  type GoogleDriveUser,
  type Instrument,
} from '../lib/googleDrive'

type Tab = 'catalog' | 'library' | 'scores'

type SongReference = DriveLibrarySong

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
const drumScoreTitle = ref('Ritmo de bateria')
const drumTempo = ref(100)
const drumPattern = ref<DrumPattern>({
  kick: [0, 4],
  snare: [2, 6],
  hihat: [0, 1, 2, 3, 4, 5, 6, 7],
  tom: [],
  cymbal: [],
})
const associatedSongId = ref('')
const searchQuery = ref('')
const catalogInstrumentFilter = ref('Todos')
const catalogStyleFilter = ref('Todos')
const scoreInstrumentFilter = ref('Todos')
const scoreSongFilter = ref('')
const songs = ref<SongReference[]>([])
const scores = ref<StoredScore[]>([])
const selectedScore = ref<StoredScore | null>(null)
const renderTarget = ref<HTMLElement | null>(null)
const scoreFrame = ref<HTMLElement | null>(null)
const playheadPosition = ref<{ left: number; top: number; height: number } | null>(null)
const notice = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const isScoreReady = ref(false)
const isAccountReady = ref(false)
const isGoogleReady = ref(!isGoogleDriveConfigured)
const googleUser = ref<GoogleDriveUser | null>(null)
const cloudScores = ref<DriveScoreBackup[]>([])
const isPlaying = ref(false)
const isLooping = ref(false)
const playbackSpeed = ref(1)
const playbackMeasure = ref(1)
let currentAccountId = ''

const instruments: Instrument[] = ['Bateria', 'Baixo', 'Saxofone', 'Flauta', 'Violão', 'Teclado', 'Outro']
const collections = ['Louvor ICM', 'Outro louvor', 'Outras músicas']
const drumPartByNotation: Record<string, DrumPartId> = {
  '5:4': 'kick',
  '0:5': 'snare',
  '7:5': 'hihat',
  '2:5': 'tom',
  '9:5': 'cymbal',
}
const catalogInstruments = [...new Set(catalogScores.map((score) => score.instrument))]
const catalogStyles = [...new Set(catalogScores.map((score) => score.style))]
const filteredCatalogScores = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pt-BR')
  return catalogScores.filter((score) => {
    const matchesQuery = !query || `${score.title} ${score.instrument} ${score.style} ${score.level} ${score.description}`.toLocaleLowerCase('pt-BR').includes(query)
    const matchesInstrument = catalogInstrumentFilter.value === 'Todos' || score.instrument === catalogInstrumentFilter.value
    const matchesStyle = catalogStyleFilter.value === 'Todos' || score.style === catalogStyleFilter.value
    return matchesQuery && matchesInstrument && matchesStyle
  })
})
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
let playbackSynth: Tone.PolySynth | null = null
let kickSynth: Tone.MembraneSynth | null = null
let tomSynth: Tone.MembraneSynth | null = null
let snareSynth: Tone.NoiseSynth | null = null
let hihatSynth: Tone.MetalSynth | null = null
let cymbalSynth: Tone.MetalSynth | null = null
let playbackTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.initialTab, (tab) => {
  activeTab.value = tab
})

function openDatabase(accountId?: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const databaseName = accountId ? `drum-studio-library-${accountId}` : 'drum-studio-library'
    const request = indexedDB.open(databaseName, 1)
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

function storedSongs(accountId: string): SongReference[] {
  try {
    const saved = localStorage.getItem(`drum-studio-songs-${accountId}`)
    return saved ? JSON.parse(saved) as SongReference[] : []
  } catch (error) {
    console.error('Não foi possível carregar as músicas salvas:', error)
    errorMessage.value = 'Não foi possível carregar as músicas deste dispositivo.'
    return []
  }
}

function persistSongs(): boolean {
  if (!currentAccountId) return false
  try {
    localStorage.setItem(`drum-studio-songs-${currentAccountId}`, JSON.stringify(songs.value))
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

async function addSong() {
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
  const updatedSongs = [song, ...songs.value]
  try {
    await saveDriveLibrary({ songs: updatedSongs })
    songs.value = updatedSongs
    persistSongs()
    title.value = ''
    artist.value = ''
    url.value = ''
    notice.value = 'Louvor salvo na biblioteca privada da sua conta Google.'
  } catch (error) {
    console.error('Não foi possível salvar o louvor no Google Drive:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível salvar o louvor na sua biblioteca.'
  }
}

async function removeSong(id: string) {
  const updatedSongs = songs.value.filter((song) => song.id !== id)
  try {
    await saveDriveLibrary({ songs: updatedSongs })
    songs.value = updatedSongs
    persistSongs()
    notice.value = 'Louvor removido da sua biblioteca.'
  } catch (error) {
    console.error('Não foi possível remover o louvor do Google Drive:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível remover o louvor.'
  }
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

async function refreshCloudScores() {
  if (!googleUser.value) return
  cloudScores.value = await listDriveScoreBackups()
}

function legacySongs(): SongReference[] {
  try {
    const saved = localStorage.getItem('drum-studio-songs')
    return saved ? JSON.parse(saved) as SongReference[] : []
  } catch (error) {
    console.error('Não foi possível ler o repertório local antigo:', error)
    return []
  }
}

async function migrateLegacyScores(): Promise<StoredScore[]> {
  const legacyDatabase = await openDatabase()
  try {
    return await readScores(legacyDatabase)
  } finally {
    legacyDatabase.close()
  }
}

async function signIn(existingUser?: GoogleDriveUser) {
  if (!isGoogleDriveConfigured) return
  errorMessage.value = ''
  notice.value = ''
  isAccountReady.value = false
  isLoading.value = true
  try {
    const user = existingUser ?? await signInWithGoogle()
    googleUser.value = user
    currentAccountId = user.id
    database?.close()
    database = await openDatabase(currentAccountId)

    const [remoteLibrary, remoteScores] = await Promise.all([
      loadDriveLibrary(),
      listDriveScoreBackups(),
    ])
    cloudScores.value = remoteScores

    let localAccountSongs = storedSongs(currentAccountId)
    const localAccountScores = await readScores(database)
    if (!remoteLibrary && !localAccountSongs.length && !localAccountScores.length) {
      const oldSongs = legacySongs()
      const oldScores = await migrateLegacyScores()
      if ((oldSongs.length || oldScores.length) && window.confirm('Encontramos músicas ou partituras antigas neste dispositivo. Deseja associá-las à conta Google que acabou de conectar?')) {
        localAccountSongs = oldSongs
        for (const score of oldScores) {
          if (!localAccountScores.some((item) => item.id === score.id)) {
            await saveScore(database, score)
            localAccountScores.push(score)
          }
        }
      }
    }

    songs.value = remoteLibrary?.songs ?? localAccountSongs
    if (!remoteLibrary) await saveDriveLibrary({ songs: songs.value })
    persistSongs()

    for (const backup of remoteScores) {
      if (localAccountScores.some((score) => score.id === backup.scoreId)) continue
      const data = await downloadDriveScoreBackup(backup.id)
      await saveScore(database, {
        id: backup.scoreId,
        title: backup.title,
        instrument: backup.instrument,
        fileName: backup.fileName,
        data,
        addedAt: backup.createdAt,
        ...(backup.songId ? { songId: backup.songId } : {}),
      })
    }
    for (const score of localAccountScores) {
      if (!remoteScores.some((backup) => backup.scoreId === score.id)) {
        await saveScoreToCloud(score)
      }
    }
    await refreshCloudScores()
    await refreshScores()
    isAccountReady.value = true
    notice.value = `Biblioteca pessoal conectada${user.email ? ` a ${user.email}` : ''}.`
  } catch (error) {
    console.error('Não foi possível carregar a biblioteca da conta Google:', error)
    signOutFromGoogle()
    googleUser.value = null
    currentAccountId = ''
    database?.close()
    database = null
    cloudScores.value = []
    songs.value = []
    scores.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar a biblioteca desta conta.'
  } finally {
    isLoading.value = false
  }
}

async function signOut() {
  errorMessage.value = ''
  stopPlayback()
  signOutFromGoogle()
  googleUser.value = null
  isAccountReady.value = false
  currentAccountId = ''
  database?.close()
  database = null
  cloudScores.value = []
  songs.value = []
  scores.value = []
  selectedScore.value = null
  isScoreReady.value = false
  renderer?.clear()
}

async function saveScoreToCloud(score: StoredScore) {
  if (!googleUser.value) throw new Error('Conecte uma conta Google antes de salvar a partitura.')
  if (score.data.size > 20 * 1024 * 1024) throw new Error('O limite para salvar uma partitura é 20 MB.')
  const existingBackup = cloudScores.value.find((backup) => backup.scoreId === score.id)
  await uploadDriveScoreBackup({
    scoreId: score.id,
    title: score.title.slice(0, 160),
    instrument: score.instrument,
    fileName: score.fileName.slice(0, 255),
    ...(score.songId ? { songId: score.songId } : {}),
  }, score.data, existingBackup?.id)
  await refreshCloudScores()
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
    await saveScoreToCloud(score)
    await saveScore(database, score)
    await refreshScores()
    await showScore(score)
    notice.value = 'Partitura salva na biblioteca privada da sua conta Google.'
  } catch (error) {
    console.error('Não foi possível importar a partitura:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível importar e sincronizar a partitura.'
  } finally {
    isLoading.value = false
    ;(event.target as HTMLInputElement).value = ''
  }
}

function toggleDrumHit(partId: DrumPartId, step: number) {
  const steps = drumPattern.value[partId]
  drumPattern.value[partId] = steps.includes(step)
    ? steps.filter((item) => item !== step)
    : [...steps, step].sort((a, b) => a - b)
}

function createCatalogScore(scoreId: string): StoredScore | undefined {
  const entry = catalogScores.find((item) => item.id === scoreId)
  if (!entry) return undefined
  const musicXml = entry.pattern
    ? createDrumMusicXml(entry.title, entry.tempo, entry.pattern)
    : entry.beats
      ? createPitchedMusicXml(entry.title, entry.instrument, entry.tempo, entry.beats)
      : undefined
  if (!musicXml) return undefined
  return {
    id: `catalog-${entry.id}`,
    title: entry.title,
    instrument: entry.instrument,
    fileName: `${entry.id}.musicxml`,
    data: new Blob([musicXml], { type: 'application/vnd.recordare.musicxml+xml' }),
    addedAt: 0,
  }
}

async function previewCatalogScore(scoreId: string) {
  const score = createCatalogScore(scoreId)
  if (!score) {
    errorMessage.value = 'Essa partitura não está disponível no catálogo.'
    return
  }
  await showScore(score)
}

async function addCatalogScore(scoreId: string) {
  const score = createCatalogScore(scoreId)
  if (!score) {
    errorMessage.value = 'Essa partitura não está disponível no catálogo.'
    return
  }
  if (!database || !isAccountReady.value) {
    errorMessage.value = 'Entre com Google para salvar uma cópia na sua biblioteca privada.'
    return
  }

  const existingScore = scores.value.find((item) => item.id === score.id)
  if (existingScore) {
    notice.value = 'Essa partitura já está na sua biblioteca.'
    await showScore(existingScore)
    return
  }

  errorMessage.value = ''
  isLoading.value = true
  try {
    score.addedAt = Date.now()
    await saveScoreToCloud(score)
    await saveScore(database, score)
    await refreshScores()
    await showScore(score)
    notice.value = 'Cópia adicionada à sua biblioteca privada do Google Drive.'
  } catch (error) {
    console.error('Não foi possível adicionar a partitura do catálogo:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível salvar a partitura na sua biblioteca.'
  } finally {
    isLoading.value = false
  }
}

async function generateDrumScore() {
  errorMessage.value = ''
  notice.value = ''
  if (!database) {
    errorMessage.value = 'O armazenamento local não está disponível neste navegador.'
    return
  }
  const scoreTitle = drumScoreTitle.value.trim()
  if (!scoreTitle) {
    errorMessage.value = 'Informe um nome para o ritmo.'
    return
  }
  if (!Number.isInteger(drumTempo.value) || drumTempo.value < 40 || drumTempo.value > 240) {
    errorMessage.value = 'Escolha um andamento entre 40 e 240 BPM.'
    return
  }
  if (!drumParts.some((part) => drumPattern.value[part.id].length)) {
    errorMessage.value = 'Marque pelo menos uma batida na grade.'
    return
  }

  isLoading.value = true
  try {
    const baseName = scoreTitle.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120)
    const score: StoredScore = {
      id: crypto.randomUUID(),
      title: scoreTitle,
      instrument: 'Bateria',
      fileName: `${baseName || 'ritmo-de-bateria'}.musicxml`,
      data: new Blob([createDrumMusicXml(scoreTitle, drumTempo.value, drumPattern.value)], { type: 'application/vnd.recordare.musicxml+xml' }),
      addedAt: Date.now(),
      ...(associatedSongId.value ? { songId: associatedSongId.value } : {}),
    }
    await saveScoreToCloud(score)
    await saveScore(database, score)
    await refreshScores()
    await showScore(score)
    notice.value = 'Ritmo salvo na biblioteca privada da sua conta Google.'
  } catch (error) {
    console.error('Não foi possível gerar a partitura de bateria:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível gerar e sincronizar a partitura.'
  } finally {
    isLoading.value = false
  }
}

async function showScore(score: StoredScore) {
  stopPlayback()
  isScoreReady.value = false
  selectedScore.value = score
  if (activeTab.value !== 'catalog') activeTab.value = 'scores'
  await nextTick()
  if (!renderTarget.value) return

  try {
    const { CursorType, OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
    if (!renderer) {
      renderer = new OpenSheetMusicDisplay(renderTarget.value, { autoResize: true, backend: 'svg' })
    }
    await renderer.load(score.data)
    renderer.render()
    renderer.enableOrDisableCursors(true)
    renderer.cursor.CursorOptions = {
      type: CursorType.ShortThinTopLeft,
      color: '#d92332',
      alpha: 0.9,
      follow: true,
    }
    renderer.FollowCursor = true
    renderer.cursor.hide()
    playheadPosition.value = null
    isScoreReady.value = true
  } catch (error) {
    console.error('Não foi possível renderizar a partitura:', error)
    isScoreReady.value = false
    errorMessage.value = 'O arquivo foi importado, mas não foi possível exibir a partitura. Tente outro MusicXML.'
  }
}

function initializeDrumSynths() {
  kickSynth ??= new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 } }).toDestination()
  tomSynth ??= new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3, envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.2 } }).toDestination()
  snareSynth ??= new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.02 } }).toDestination()
  hihatSynth ??= new Tone.MetalSynth({ harmonicity: 5.1, modulationIndex: 32, resonance: 5000, octaves: 1.5, envelope: { attack: 0.001, decay: 0.08, release: 0.01 } }).toDestination()
  cymbalSynth ??= new Tone.MetalSynth({ harmonicity: 5.1, modulationIndex: 32, resonance: 3200, octaves: 1.5, envelope: { attack: 0.001, decay: 0.4, release: 0.08 } }).toDestination()
}

function triggerDrumSound(note: { displayStepUnpitched: number; displayOctaveUnpitched: number }, duration: number): boolean {
  const drumPart = drumPartByNotation[`${note.displayStepUnpitched}:${note.displayOctaveUnpitched}`]
  const time = Tone.now()
  const shortDuration = Math.max(0.06, Math.min(duration, 0.4))

  switch (drumPart) {
    case 'kick':
      kickSynth?.triggerAttackRelease('C1', shortDuration, time, 0.8)
      return true
    case 'snare':
      snareSynth?.triggerAttackRelease(shortDuration, time, 0.65)
      return true
    case 'hihat':
      hihatSynth?.triggerAttackRelease('C6', Math.min(shortDuration, 0.1), time, 0.4)
      return true
    case 'tom':
      tomSynth?.triggerAttackRelease('G2', shortDuration, time, 0.7)
      return true
    case 'cymbal':
      cymbalSynth?.triggerAttackRelease('C5', shortDuration, time, 0.55)
      return true
    default:
      return false
  }
}

function releaseDrumSynths() {
  kickSynth?.triggerRelease()
  tomSynth?.triggerRelease()
  snareSynth?.triggerRelease()
  hihatSynth?.triggerRelease()
  cymbalSynth?.triggerRelease()
}

function schedulePlaybackStep() {
  if (!renderer || !playbackSynth || !isPlaying.value) return

  const cursor = renderer.cursor
  const iterator = cursor.Iterator
  if (iterator.EndReached) {
    if (isLooping.value) cursor.reset()
    else {
      stopPlayback()
      return
    }
  }

  cursor.update()
  positionPlayheadMarker()
  playbackMeasure.value = iterator.CurrentMeasureIndex + 1
  const voiceEntries = iterator.CurrentAudibleVoiceEntries()
  const notes = voiceEntries.flatMap((entry) => entry.Notes)
  const playbackSettings = iterator.currentPlaybackSettings()
  const startTime = iterator.currentTimeStamp.RealValue
  const noteLength = Math.max(0, ...notes.map((note) => note.Length.RealValue))
  const noteDuration = Math.max(0.04, playbackSettings.getDurationInMilliseconds(noteLength) / 1000)

  for (const note of notes) {
    if (note.isRest()) continue
    if (selectedScore.value?.instrument === 'Bateria' && triggerDrumSound(note, noteDuration)) continue
    if (!Number.isFinite(note.Pitch.Frequency) || note.Pitch.Frequency <= 0) continue
    playbackSynth.triggerAttackRelease(note.Pitch.ToStringShort(), noteDuration * 0.9, Tone.now(), 0.65)
  }

  iterator.moveToNextVisibleVoiceEntry(true)
  const elapsedScoreTime = iterator.currentTimeStamp.RealValue - startTime
  const stepDuration = elapsedScoreTime > 0
    ? playbackSettings.getDurationInMilliseconds(elapsedScoreTime) / 1000
    : noteDuration
  playbackTimer = setTimeout(schedulePlaybackStep, Math.max(20, stepDuration * 1000 / playbackSpeed.value))
}

function positionPlayheadMarker() {
  if (!renderer || !renderTarget.value || !scoreFrame.value || renderer.cursor.Hidden) return
  const cursorRect = renderer.cursor.cursorElement.getBoundingClientRect()
  const scoreContainer = renderTarget.value
  const frame = scoreFrame.value
  const frameRect = frame.getBoundingClientRect()
  if (!cursorRect.width || !cursorRect.height) return

  playheadPosition.value = {
    left: cursorRect.left - frameRect.left + scoreContainer.scrollLeft - frame.clientLeft - 8,
    top: cursorRect.top - frameRect.top + scoreContainer.scrollTop - frame.clientTop - 6,
    height: cursorRect.height,
  }
}

async function togglePlayback() {
  if (isPlaying.value) {
    isPlaying.value = false
    if (playbackTimer) clearTimeout(playbackTimer)
    playbackTimer = null
    playbackSynth?.releaseAll()
    releaseDrumSynths()
    return
  }
  if (!renderer || !selectedScore.value) {
    errorMessage.value = 'Abra uma partitura antes de iniciar a reprodução.'
    return
  }

  errorMessage.value = ''
  try {
    await Tone.start()
    playbackSynth ??= new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.12, sustain: 0.45, release: 0.15 },
    }).toDestination()
    if (selectedScore.value.instrument === 'Bateria') initializeDrumSynths()
    renderer.enableOrDisableCursors(true)
    renderer.FollowCursor = true
    renderer.cursor.SkipInvisibleNotes = true
    renderer.cursor.show()
    if (renderer.cursor.Iterator.EndReached) renderer.cursor.reset()
    renderer.cursor.update()
    isPlaying.value = true
    positionPlayheadMarker()
    schedulePlaybackStep()
  } catch (error) {
    console.error('Não foi possível iniciar a reprodução da partitura:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Não foi possível iniciar o áudio.'
    isPlaying.value = false
  }
}

function stopPlayback() {
  if (playbackTimer) clearTimeout(playbackTimer)
  playbackTimer = null
  playbackSynth?.releaseAll()
  releaseDrumSynths()
  isPlaying.value = false
  playbackMeasure.value = 1
  if (renderer) {
    renderer.cursor.reset()
    renderer.cursor.hide()
  }
  playheadPosition.value = null
}

async function removeScore(score: StoredScore) {
  if (!database) return
  try {
    const cloudBackup = cloudScores.value.find((backup) => backup.scoreId === score.id)
    if (cloudBackup) await deleteDriveScoreBackup(cloudBackup.id)
    await deleteScore(database, score.id)
    await refreshCloudScores()
    await refreshScores()
    if (selectedScore.value?.id === score.id) {
      stopPlayback()
      selectedScore.value = null
      isScoreReady.value = false
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
  if (isGoogleDriveConfigured) {
    void prepareGoogleDrive().then(() => {
      isGoogleReady.value = true
      const connectedUser = getConnectedGoogleUser()
      if (connectedUser) void signIn(connectedUser)
    }).catch((error: unknown) => {
      console.error('Não foi possível preparar o login Google:', error)
      errorMessage.value = 'Não foi possível carregar o login Google. Verifique sua conexão e tente novamente.'
    })
  }
})

onBeforeUnmount(() => {
  stopPlayback()
  playbackSynth?.dispose()
  playbackSynth = null
  kickSynth?.dispose()
  kickSynth = null
  tomSynth?.dispose()
  tomSynth = null
  snareSynth?.dispose()
  snareSynth = null
  hihatSynth?.dispose()
  hihatSynth = null
  cymbalSynth?.dispose()
  cymbalSynth = null
  renderer?.clear()
})
</script>

<template>
  <section class="library-page">
    <div class="library-intro">
      <div>
        <span class="section-tag">SEU REPERTÓRIO</span>
        <h1>Músicas e partituras</h1>
        <p>Organize seu repertório e acesse suas músicas e partituras na conta Google conectada.</p>
      </div>
      <div class="library-symbol"><Music2 :size="30" /></div>
    </div>

    <section class="tool-card drive-account">
      <div>
        <div class="card-heading"><div class="card-icon"><Cloud :size="21" /></div><span class="coming-soon">BIBLIOTECA PESSOAL</span></div>
        <h3>Seus dados, na sua conta</h3>
        <p>Entre com Google para acessar suas músicas e partituras privadas em seus dispositivos.</p>
      </div>
      <div class="drive-account-actions">
        <template v-if="googleUser">
          <span class="drive-account-name">{{ googleUser.email || googleUser.name }}</span>
          <button class="secondary-button" :disabled="isLoading" @click="signOut"><LogOut :size="17" /> Sair</button>
        </template>
        <template v-else-if="isGoogleDriveConfigured">
          <button class="play-button" :disabled="isLoading || !isGoogleReady" @click="signIn()">
            <LogIn :size="17" /> {{ isLoading ? 'Conectando...' : isGoogleReady ? 'Entrar com Google' : 'Carregando login...' }}
          </button>
        </template>
      </div>
      <p v-if="!isGoogleDriveConfigured" class="legal-note">Configure `VITE_GOOGLE_CLIENT_ID` para ativar o login Google. Sem login, a biblioteca pessoal não fica disponível.</p>
      <p v-else-if="googleUser && !isAccountReady" class="legal-note">Carregando e sincronizando os dados privados da sua conta...</p>
      <p class="legal-note">Os arquivos são guardados no Google Drive de cada usuário. O app não paga por armazenamento; cada conta usa sua própria quota.</p>
    </section>

    <p v-if="notice" class="success-message" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>

    <div class="library-tabs" role="tablist" aria-label="Catálogo e biblioteca pessoal">
      <button role="tab" :aria-selected="activeTab === 'catalog'" :class="{ active: activeTab === 'catalog' }" @click="activeTab = 'catalog'">
        <BookOpen :size="17" /> Catálogo
      </button>
      <button role="tab" :aria-selected="activeTab === 'library'" :class="{ active: activeTab === 'library' }" @click="activeTab = 'library'">
        <Music2 :size="17" /> Músicas
      </button>
      <button role="tab" :aria-selected="activeTab === 'scores'" :class="{ active: activeTab === 'scores' }" @click="activeTab = 'scores'">
        <BookOpen :size="17" /> Partituras
      </button>
    </div>

    <template v-if="activeTab === 'catalog'">
      <section class="tool-card catalog-intro">
        <div class="card-heading">
          <div class="card-icon"><BookOpen :size="21" /></div>
          <span class="coming-soon">CATÁLOGO COMPARTILHADO</span>
        </div>
        <h3>Estudos originais para vários instrumentos</h3>
        <p>Explore estudos curtos, visualize a partitura e salve uma cópia na sua biblioteca privada. Este catálogo é incluído no app e não depende de um serviço de armazenamento.</p>
        <p class="legal-note">Conteúdo original do Drum Studio; não inclui nem copia partituras do Songsterr. O catálogo inicial reúne bateria, baixo, violão e teclado.</p>
      </section>

      <section class="library-list-section">
        <div class="section-heading">
          <div><h3>Partituras para estudar</h3><p>{{ filteredCatalogScores.length }} de {{ catalogScores.length }} estudos</p></div>
        </div>
        <div class="score-filters catalog-filters">
          <label class="search-field"><Search :size="18" /><input v-model="searchQuery" type="search" placeholder="Buscar título, estilo ou nível" aria-label="Buscar no catálogo" /></label>
          <label class="filter-label">Instrumento
            <select v-model="catalogInstrumentFilter"><option>Todos</option><option v-for="item in catalogInstruments" :key="item">{{ item }}</option></select>
          </label>
          <label class="filter-label">Estilo
            <select v-model="catalogStyleFilter"><option>Todos</option><option v-for="style in catalogStyles" :key="style">{{ style }}</option></select>
          </label>
        </div>
        <div v-if="filteredCatalogScores.length" class="catalog-grid">
          <article v-for="score in filteredCatalogScores" :key="score.id" class="tool-card catalog-card">
            <div class="catalog-card-heading">
              <div class="song-icon"><Music2 :size="20" /></div>
              <span class="catalog-level">{{ score.level }}</span>
            </div>
            <h4>{{ score.title }}</h4>
            <p>{{ score.description }}</p>
            <div class="catalog-details"><span>{{ score.instrument }} · {{ score.style }}</span><span>{{ score.tempo }} BPM · 4/4</span></div>
            <div class="catalog-actions">
              <button class="secondary-button" type="button" @click="previewCatalogScore(score.id)">Ver partitura</button>
              <button class="play-button" type="button" :disabled="isLoading || !isAccountReady" @click="addCatalogScore(score.id)">
                <Plus :size="16" /> {{ isAccountReady ? 'Salvar na biblioteca' : 'Entre para salvar' }}
              </button>
            </div>
          </article>
        </div>
        <div v-else class="empty-state"><BookOpen :size="30" /><strong>Nenhum estudo encontrado</strong><span>Altere a busca ou os filtros do catálogo.</span></div>
      </section>
    </template>

    <template v-else-if="googleUser && isAccountReady">
    <template v-if="activeTab === 'library'">
      <section class="tool-card library-form">
        <div class="card-heading">
          <div class="card-icon"><Plus :size="21" /></div>
          <span class="coming-soon">REPERTÓRIO PESSOAL</span>
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

    <template v-else-if="activeTab === 'scores'">
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
        <div v-if="instrument === 'Bateria'" class="drum-composer">
          <div class="drum-composer-intro">
            <h4>Monte um ritmo de bateria</h4>
            <p>Toque nas casas para marcar cada peça. A grade tem um compasso 4/4 com oito subdivisões.</p>
          </div>
          <div class="drum-composer-controls">
            <label>Nome do ritmo
              <input v-model="drumScoreTitle" maxlength="120" placeholder="Ex.: Rock básico" />
            </label>
            <label>Andamento (BPM)
              <input v-model.number="drumTempo" type="number" min="40" max="240" step="1" />
            </label>
          </div>
          <div class="drum-grid" role="group" aria-label="Grade de ritmo de bateria">
            <div class="drum-grid-row drum-grid-header">
              <span>Peça</span>
              <span v-for="step in 8" :key="step">{{ step % 2 ? Math.ceil(step / 2) : '&' }}</span>
            </div>
            <div v-for="part in drumParts" :key="part.id" class="drum-grid-row">
              <span class="drum-part-name"><span class="drum-part-symbol" aria-hidden="true">{{ part.symbol }}</span>{{ part.name }}</span>
              <button
                v-for="step in 8"
                :key="step"
                type="button"
                class="drum-step"
                :class="{ active: drumPattern[part.id].includes(step - 1) }"
                :aria-label="`${part.name}, subdivisão ${Math.ceil(step / 2)}${step % 2 ? '' : ' e'}`"
                :aria-pressed="drumPattern[part.id].includes(step - 1)"
                @click="toggleDrumHit(part.id, step - 1)"
              />
            </div>
          </div>
          <button class="play-button generate-drum-score" type="button" :disabled="isLoading" @click="generateDrumScore">
            <BookOpen :size="17" /> {{ isLoading ? 'Gerando...' : 'Criar e salvar partitura de bateria' }}
          </button>
        </div>
        <p class="legal-note">Compatível com .musicxml, .xml e .mxl. As partituras são sincronizadas com seu Google Drive pessoal.</p>
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

    </template>
    </template>
    <div v-else-if="googleUser" class="empty-state"><Cloud :size="28" /><strong>Sincronizando sua biblioteca</strong><span>Aguarde enquanto carregamos seus dados privados do Google Drive.</span></div>
    <div v-else class="empty-state"><Cloud :size="28" /><strong>Biblioteca pessoal protegida</strong><span>Entre com Google para acessar suas músicas e partituras privadas. O catálogo público pode ser consultado sem login.</span></div>

    <section v-if="selectedScore && activeTab !== 'library'" class="tool-card score-viewer">
      <div class="viewer-heading"><div><span class="section-tag">{{ selectedScore.instrument.toUpperCase() }}</span><h3>{{ selectedScore.title }}</h3></div><button class="secondary-button" @click="exportScore(selectedScore)"><FileUp :size="17" /> Exportar MusicXML</button></div>
      <div class="playback-controls" role="group" aria-label="Controles de reprodução da partitura">
        <button class="playback-button" type="button" :disabled="isLoading || !isScoreReady" @click="togglePlayback">
          <Pause v-if="isPlaying" :size="18" />
          <Play v-else :size="18" />
          {{ isPlaying ? 'Pausar' : 'Tocar' }}
        </button>
        <button class="playback-button secondary" type="button" :disabled="!isPlaying && playbackMeasure === 1" @click="stopPlayback">
          <Square :size="16" /> Parar
        </button>
        <label class="playback-speed">Velocidade
          <select v-model.number="playbackSpeed">
            <option :value="0.5">50%</option>
            <option :value="0.75">75%</option>
            <option :value="1">100%</option>
            <option :value="1.25">125%</option>
            <option :value="1.5">150%</option>
          </select>
        </label>
        <button class="playback-button secondary" type="button" :aria-pressed="isLooping" @click="isLooping = !isLooping">
          <Repeat :size="16" /> {{ isLooping ? 'Repetir: sim' : 'Repetir' }}
        </button>
        <span class="playback-measure">Compasso {{ playbackMeasure }}</span>
      </div>
      <div ref="scoreFrame" class="score-frame">
        <div ref="renderTarget" class="score-renderer" aria-label="Visualização da partitura"></div>
        <span v-if="playheadPosition" class="playhead-marker" :style="{ left: `${playheadPosition.left}px`, top: `${playheadPosition.top}px`, height: `${playheadPosition.height}px` }" aria-hidden="true"></span>
      </div>
    </section>

    <section v-if="selectedScore" class="mini-player" aria-label="Mini player de partitura">
      <button class="playback-button mini-player-toggle" type="button" :disabled="isLoading || !isScoreReady" @click="togglePlayback">
        <Pause v-if="isPlaying" :size="18" />
        <Play v-else :size="18" />
        <span>{{ isPlaying ? 'Pausar' : 'Tocar' }}</span>
      </button>
      <div class="mini-player-track">
        <strong>{{ selectedScore.title }}</strong>
        <span>{{ selectedScore.instrument }} · Compasso {{ playbackMeasure }}<template v-if="isPlaying"> · Reproduzindo</template></span>
      </div>
      <label class="mini-player-speed">Velocidade
        <select v-model.number="playbackSpeed">
          <option :value="0.5">50%</option>
          <option :value="0.75">75%</option>
          <option :value="1">100%</option>
          <option :value="1.25">125%</option>
          <option :value="1.5">150%</option>
        </select>
      </label>
      <button class="playback-button secondary mini-player-loop" type="button" :aria-pressed="isLooping" @click="isLooping = !isLooping">
        <Repeat :size="16" /> {{ isLooping ? 'Loop ligado' : 'Repetir' }}
      </button>
      <button class="playback-button secondary mini-player-stop" type="button" :disabled="!isPlaying && playbackMeasure === 1" aria-label="Parar reprodução" @click="stopPlayback">
        <Square :size="16" />
      </button>
    </section>
  </section>
</template>

<style scoped>
.library-page { display: flex; flex-direction: column; gap: 20px; }
.library-intro { display: flex; justify-content: space-between; align-items: center; padding: clamp(22px, 3vw, 32px); border: 1px solid var(--border); border-radius: 20px; background: radial-gradient(440px circle at 90% 50%, color-mix(in srgb, var(--red) 9%, transparent), transparent 58%), var(--surface); box-shadow: var(--shadow-card); }
.library-intro h1 { margin: 10px 0 7px; font-size: clamp(23px, 3vw, 32px); letter-spacing: -.7px; }
.library-intro p, .library-form > p, .score-import > p { color: var(--muted); font-size: 13px; line-height: 1.65; }
.library-symbol { display: grid; width: 58px; height: 58px; flex: 0 0 auto; place-items: center; border: 1px solid var(--border); border-radius: 18px; background: var(--soft); color: var(--red); }
.library-tabs { display: inline-flex; align-self: flex-start; gap: 4px; padding: 5px; border: 1px solid var(--border); border-radius: 13px; background: var(--soft); }
.library-tabs button { display: inline-flex; gap: 8px; align-items: center; padding: 10px 14px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--muted); font-size: 12px; transition: background .18s, color .18s, box-shadow .18s; }
.library-tabs button:hover:not(.active) { background: color-mix(in srgb, var(--surface) 70%, transparent); color: var(--text); }
.library-tabs button.active { border-color: var(--border); background: var(--surface); box-shadow: 0 3px 10px rgb(0 0 0 / 8%); color: var(--text); }
.library-tabs button.active svg { color: var(--red); }
.library-form, .score-import { max-width: 760px; }
.catalog-intro { max-width: 900px; }
.catalog-intro .legal-note { margin-bottom: 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
.catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; }
.catalog-card { display: flex; flex-direction: column; gap: 12px; padding: 18px; transition: border-color .18s, transform .18s, background .18s; }
.catalog-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--red) 35%, var(--border)); background: var(--surface-hover); }
.catalog-card-heading { display: flex; align-items: center; justify-content: space-between; }
.catalog-level { padding: 5px 8px; border-radius: 999px; background: var(--soft); color: var(--muted); font-size: 10px; }
.catalog-card h4 { font-size: 14px; }
.catalog-card > p { min-height: 38px; color: var(--muted); font-size: 11px; line-height: 1.6; }
.catalog-details { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 10px; }
.catalog-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; }
.catalog-actions .play-button { width: auto; min-height: 40px; margin: 0; padding: 9px 12px; font-size: 11px; }
.catalog-actions .secondary-button { min-height: 40px; padding: 9px 12px; font-size: 11px; }
.drum-composer { display: flex; flex-direction: column; gap: 14px; margin-top: 20px; padding: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--background); }
.drum-composer-intro h4 { margin-bottom: 5px; font-size: 14px; }
.drum-composer-intro p { color: var(--muted); font-size: 11px; line-height: 1.5; }
.drum-composer-controls { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 12px; }
.drum-composer-controls label { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 11px; }
.drum-composer-controls input { width: 100%; min-height: 40px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); }
.drum-grid { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; }
.drum-grid-row { display: grid; grid-template-columns: minmax(100px, 1.4fr) repeat(8, minmax(28px, 1fr)); gap: 4px; align-items: center; min-height: 40px; padding: 4px 8px; border-bottom: 1px solid var(--border); }
.drum-grid-row:last-child { border-bottom: 0; }
.drum-grid-header { min-height: 32px; color: var(--muted); font-size: 10px; text-align: center; }
.drum-grid-header > :first-child { text-align: left; }
.drum-part-name { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.drum-part-symbol { display: inline-grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; background: var(--soft); color: var(--red); font-size: 17px; font-weight: 700; }
.drum-step { width: 22px; height: 22px; justify-self: center; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); }
.drum-step.active { border-color: var(--red); background: var(--red); box-shadow: 0 0 0 2px color-mix(in srgb, var(--red) 18%, transparent); }
.generate-drum-score { align-self: flex-start; }
.drive-account { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; max-width: 900px; border-radius: 18px; box-shadow: var(--shadow-card); }
.drive-account h3 { margin: 8px 0 5px; }
.drive-account > div:first-child > p, .drive-account .legal-note { color: var(--muted); font-size: 11px; line-height: 1.6; }
.drive-account .card-heading { margin-bottom: 10px; }
.drive-account-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.drive-account-name { color: var(--muted); font-size: 12px; }
.drive-account .play-button { margin-top: 0; }
.icon-action:disabled, .secondary-button:disabled { opacity: .5; cursor: not-allowed; }
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
.search-field { display: flex; align-items: center; gap: 10px; min-height: 46px; margin-bottom: 12px; padding: 0 13px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--muted); transition: border-color .18s, box-shadow .18s; }
.search-field:focus-within { border-color: color-mix(in srgb, var(--red) 55%, var(--border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--red) 11%, transparent); }
.search-field input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 13px; }
.score-filters { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(150px, .55fr) minmax(180px, .7fr); gap: 10px; align-items: end; margin-bottom: 12px; }
.score-filters .search-field { margin: 0; }
.filter-label { display: flex; flex-direction: column; gap: 5px; color: var(--muted); font-size: 11px; }
.filter-label select { padding: 11px; }
.song-list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 15px; overflow: hidden; background: var(--surface); box-shadow: var(--shadow-card); }
.song-row { display: flex; align-items: center; gap: 14px; min-height: 70px; padding: 12px 16px; border-bottom: 1px solid var(--border); transition: background .16s; }
.song-row:hover { background: var(--surface-hover); }
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
.file-button, .secondary-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 10px 15px; border: 1px solid var(--border); border-radius: 10px; background: var(--soft); color: var(--text); font-size: 12px; cursor: pointer; transition: border-color .18s, background .18s, transform .18s; }
.file-button:hover, .secondary-button:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--red) 38%, var(--border)); background: var(--surface-hover); }
.file-button input { display: none; }
.score-viewer { overflow: hidden; border-radius: 18px; box-shadow: var(--shadow-card); }
.viewer-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
.viewer-heading h3 { margin-top: 6px; }
.playback-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin-bottom: 14px; }
.playback-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 38px; padding: 8px 12px; border: 1px solid var(--red); border-radius: 8px; background: var(--red); color: white; font-size: 11px; }
.playback-button.secondary { border-color: var(--border); background: var(--soft); color: var(--text); }
.playback-speed { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 11px; }
.playback-speed select { min-height: 38px; padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); }
.playback-measure { color: var(--muted); font-size: 11px; }
.score-frame { position: relative; min-width: 0; }
.score-renderer { overflow-x: auto; min-height: 80px; padding: 16px; border: 1px solid var(--border); border-radius: 14px; background: #fff; box-shadow: inset 0 1px 5px #0000000a; color: #111; }
.playhead-marker { position: absolute; z-index: 3; width: 2px; min-height: 18px; border-radius: 999px; background: linear-gradient(180deg, #ff8790, #d92332 30%, #d92332 75%, #ff8790); box-shadow: 0 0 10px #d9233280, 0 0 22px #d9233240; pointer-events: none; transform: translateX(-1px); transition: left .08s linear, top .08s linear; }
.playhead-marker::before { position: absolute; top: -4px; left: 50%; width: 9px; height: 9px; border: 2px solid #fff; border-radius: 50%; background: #d92332; box-shadow: 0 0 0 3px #d923322b, 0 0 14px #d92332bb; content: ""; transform: translateX(-50%); }
.mini-player { position: fixed; z-index: 4; right: max(20px, calc((100vw - 1600px) / 2 + 45px)); bottom: 18px; left: max(280px, calc((100vw - 1600px) / 2 + 300px)); display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto; align-items: center; gap: 10px; padding: 11px 13px; border: 1px solid color-mix(in srgb, var(--border) 80%, white); border-radius: 15px; background: color-mix(in srgb, var(--surface) 90%, transparent); box-shadow: 0 12px 36px rgb(0 0 0 / 28%); backdrop-filter: blur(18px); }
.mini-player .playback-button { min-height: 38px; }
.mini-player-track { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.mini-player-track strong, .mini-player-track span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-player-track strong { font-size: 12px; letter-spacing: -.1px; }
.mini-player-track span { color: var(--muted); font-size: 10px; }
.mini-player-speed { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 10px; }
.mini-player-speed select { min-height: 36px; padding: 6px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--text); }
.mini-player-stop { width: 38px; padding: 8px; }
.success-message, .error-message { padding: 12px 14px; border-radius: 8px; font-size: 12px; }
.success-message { color: #36b879; background: color-mix(in srgb, #36b879 10%, var(--surface)); }
.error-message { color: #e85d68; background: color-mix(in srgb, #e85d68 10%, var(--surface)); }
@media (max-width: 600px) {
  .library-page { gap: 18px; }
  .library-intro { align-items: flex-start; gap: 14px; padding: 22px 18px; }
  .library-symbol { width: 46px; height: 46px; border-radius: 14px; }
  .library-tabs { width: 100%; }
  .library-tabs button { flex: 1; justify-content: center; padding-inline: 8px; }
  .drive-account, .library-form, .score-import { width: 100%; }
  .song-form { grid-template-columns: 1fr; }
  .form-wide { grid-column: auto; }
  .import-controls { align-items: stretch; flex-direction: column; }
  .drum-composer-controls { grid-template-columns: minmax(0, 1fr) 110px; }
  .drum-grid-row { grid-template-columns: minmax(75px, 1.3fr) repeat(8, minmax(20px, 1fr)); gap: 2px; padding-inline: 5px; }
  .drum-part-name { gap: 4px; font-size: 10px; }
  .catalog-details { flex-direction: column; }
  .mini-player { right: 12px; bottom: calc(72px + env(safe-area-inset-bottom)); left: 12px; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 7px; padding: 9px; }
  .mini-player-toggle span, .mini-player-speed { display: none; }
  .mini-player-loop { width: 40px; padding: 8px; overflow: hidden; font-size: 0; }
  .mini-player-loop svg { flex-shrink: 0; }
  .drum-part-symbol { width: 18px; height: 18px; font-size: 14px; }
  .drum-step { width: 18px; height: 18px; }
  .score-filters { grid-template-columns: 1fr; }
  .file-button { min-height: 48px; }
  .song-row { gap: 9px; padding: 10px; }
  .viewer-heading { align-items: flex-start; flex-direction: column; }
  .drive-account { grid-template-columns: 1fr; }
  .drive-account-actions { justify-content: flex-start; }
}
@media (min-width: 601px) and (max-width: 900px) {
  .mini-player { right: 16px; left: 226px; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 7px; }
  .mini-player-toggle span, .mini-player-speed { display: none; }
  .mini-player-loop { width: 40px; padding: 8px; overflow: hidden; font-size: 0; }
  .mini-player-loop svg { flex-shrink: 0; }
}
</style>
