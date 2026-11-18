export type Instrument = 'Bateria' | 'Baixo' | 'Saxofone' | 'Flauta' | 'Violão' | 'Teclado' | 'Outro'

export interface DriveScoreBackup {
  id: string
  scoreId: string
  title: string
  instrument: Instrument
  fileName: string
  createdAt: number
  songId?: string
}

export interface DriveLibrarySong {
  id: string
  title: string
  artist: string
  url?: string
  platform?: 'Spotify' | 'YouTube'
  collection?: string
}

export interface DriveLibrarySnapshot {
  songs: DriveLibrarySong[]
}

export interface GoogleDriveUser {
  id: string
  email?: string
  name?: string
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface GoogleUserInfo {
  sub?: string
  email?: string
  name?: string
}

interface GoogleDriveFile {
  id: string
  name: string
  description?: string
  createdTime?: string
  modifiedTime?: string
}

interface GoogleDriveFileList {
  files?: GoogleDriveFile[]
  nextPageToken?: string
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(options: {
        client_id: string
        scope: string
        callback: (response: GoogleTokenResponse) => void
        error_callback: (error: { message?: string }) => void
      }): {
        requestAccessToken(options?: { prompt?: string }): void
      }
      revoke(token: string, callback: () => void): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
const driveScope = 'openid email profile https://www.googleapis.com/auth/drive.file'
let token = ''
let tokenExpiresAt = 0
let googleScriptPromise: Promise<void> | null = null
let connectedUser: GoogleDriveUser | null = null

export const isGoogleDriveConfigured = Boolean(clientId)

export function prepareGoogleDrive(): Promise<void> {
  if (!clientId) return Promise.resolve()
  return loadGoogleIdentity()
}

function loadGoogleIdentity(): Promise<void> {
  if (window.google) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise

  const loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => window.google ? resolve() : reject(new Error('O login Google não ficou disponível.'))
    script.onerror = () => reject(new Error('Não foi possível carregar o login Google.'))
    document.head.append(script)
  })
  const handledPromise = loadPromise.catch((error: unknown) => {
    googleScriptPromise = null
    throw error
  })
  googleScriptPromise = handledPromise
  return handledPromise
}

async function requestAccessToken(prompt: string): Promise<string> {
  if (!clientId) throw new Error('Configure o Client ID OAuth do Google para ativar a cópia na nuvem.')
  await loadGoogleIdentity()
  if (!window.google) throw new Error('O login Google não ficou disponível.')

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: driveScope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'O Google não autorizou o acesso ao Drive.'))
          return
        }
        token = response.access_token
        tokenExpiresAt = Date.now() + (response.expires_in ?? 3600) * 1000
        resolve(token)
      },
      error_callback: (error) => reject(new Error(error.message || 'A janela de login Google foi fechada ou falhou.')),
    })
    client.requestAccessToken(prompt ? { prompt } : {})
  })
}

async function getAccessToken(): Promise<string> {
  if (token && tokenExpiresAt > Date.now() + 60_000) return token
  return requestAccessToken('')
}

async function driveRequest(path: string, init: RequestInit = {}, upload = false): Promise<Response> {
  const accessToken = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  const endpoint = upload ? 'https://www.googleapis.com/upload/drive/v3' : 'https://www.googleapis.com/drive/v3'
  const url = path.startsWith('https://') ? path : `${endpoint}${path}`
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    if (response.status === 401) {
      token = ''
      tokenExpiresAt = 0
    }
    let message = `Google Drive respondeu com status ${response.status}.`
    try {
      const body = await response.json() as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch (error) {
      console.error('Não foi possível ler a resposta de erro do Google Drive:', error)
    }
    throw new Error(message)
  }
  return response
}

export async function signInWithGoogle(): Promise<GoogleDriveUser> {
  connectedUser = null
  await requestAccessToken('select_account')
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('Não foi possível identificar a conta Google conectada.')
  const user = await response.json() as GoogleUserInfo
  if (!user.sub) throw new Error('O Google não retornou o identificador da conta.')
  connectedUser = { id: user.sub, email: user.email, name: user.name }
  return connectedUser
}

export function getConnectedGoogleUser(): GoogleDriveUser | null {
  return connectedUser
}

export function signOutFromGoogle(): void {
  const tokenToRevoke = token
  token = ''
  tokenExpiresAt = 0
  connectedUser = null
  if (tokenToRevoke && window.google) {
    window.google.accounts.oauth2.revoke(tokenToRevoke, () => undefined)
  }
}

export async function loadDriveLibrary(): Promise<DriveLibrarySnapshot | null> {
  const params = new URLSearchParams({
    spaces: 'drive',
    pageSize: '100',
    q: "appProperties has { key='application' and value='drum-studio' } and appProperties has { key='kind' and value='library' } and trashed = false",
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
  })
  const response = await driveRequest(`/files?${params}`)
  const result = await response.json() as GoogleDriveFileList
  const file = result.files?.[0]
  if (!file) return null

  const contentResponse = await driveRequest(`/files/${encodeURIComponent(file.id)}?alt=media`)
  const data: unknown = await contentResponse.json()
  if (
    typeof data !== 'object'
    || data === null
    || !('songs' in data)
    || !Array.isArray(data.songs)
    || !data.songs.every((song) =>
      typeof song === 'object'
      && song !== null
      && 'id' in song
      && typeof song.id === 'string'
      && 'title' in song
      && typeof song.title === 'string'
      && 'artist' in song
      && typeof song.artist === 'string')
  ) {
    throw new Error('A biblioteca salva no Google Drive está inválida ou corrompida.')
  }
  return data as DriveLibrarySnapshot
}

export async function saveDriveLibrary(snapshot: DriveLibrarySnapshot): Promise<void> {
  const params = new URLSearchParams({
    spaces: 'drive',
    pageSize: '100',
    q: "appProperties has { key='application' and value='drum-studio' } and appProperties has { key='kind' and value='library' } and trashed = false",
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
  })
  const listResponse = await driveRequest(`/files?${params}`)
  const result = await listResponse.json() as GoogleDriveFileList
  const existingFile = result.files?.[0]
  const content = new Blob([JSON.stringify(snapshot)], { type: 'application/json' })
  const metadata = {
    name: 'Drum Studio - biblioteca.json',
    mimeType: 'application/json',
    description: JSON.stringify({ kind: 'library' }),
    appProperties: { application: 'drum-studio', kind: 'library' },
  }
  const path = existingFile
    ? `/files/${encodeURIComponent(existingFile.id)}?uploadType=resumable&fields=id`
    : '/files?uploadType=resumable&fields=id'
  const session = await driveRequest(path, {
    method: existingFile ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/json',
      'X-Upload-Content-Length': String(content.size),
    },
    body: JSON.stringify(metadata),
  }, true)
  const uploadUrl = session.headers.get('Location')
  if (!uploadUrl) throw new Error('O Google Drive não retornou o endereço de envio da biblioteca.')
  await driveRequest(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  })
}

export async function listDriveScoreBackups(): Promise<DriveScoreBackup[]> {
  const backups: DriveScoreBackup[] = []
  let pageToken = ''

  do {
    const params = new URLSearchParams({
      spaces: 'drive',
      pageSize: '100',
      q: "appProperties has { key='application' and value='drum-studio' } and trashed = false",
      fields: 'nextPageToken,files(id,name,description,createdTime)',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const response = await driveRequest(`/files?${params}`)
    const result = await response.json() as GoogleDriveFileList

    for (const file of result.files ?? []) {
      if (!file.description) continue
      try {
        const details = JSON.parse(file.description) as Omit<DriveScoreBackup, 'id' | 'createdAt'>
        if (!details.scoreId || !details.title || !details.instrument || !details.fileName) continue
        backups.push({
          id: file.id,
          ...details,
          createdAt: Date.parse(file.createdTime ?? ''),
        })
      } catch (error) {
        console.error(`Não foi possível ler os metadados do backup ${file.id}:`, error)
      }
    }
    pageToken = result.nextPageToken ?? ''
  } while (pageToken)

  return backups.sort((a, b) => b.createdAt - a.createdAt)
}

export async function uploadDriveScoreBackup(
  score: Omit<DriveScoreBackup, 'id' | 'createdAt'>,
  data: Blob,
  existingFileId?: string,
): Promise<void> {
  const metadata = {
    name: `Drum Studio - ${score.title}`,
    mimeType: 'application/octet-stream',
    description: JSON.stringify(score),
    appProperties: { application: 'drum-studio' },
  }
  const path = existingFileId
    ? `/files/${encodeURIComponent(existingFileId)}?uploadType=resumable&fields=id`
    : '/files?uploadType=resumable&fields=id'
  const session = await driveRequest(path, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(data.size),
    },
    body: JSON.stringify(metadata),
  }, true)
  const uploadUrl = session.headers.get('Location')
  if (!uploadUrl) throw new Error('O Google Drive não retornou o endereço de envio do arquivo.')
  await driveRequest(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: data,
  })
}

export async function downloadDriveScoreBackup(fileId: string): Promise<Blob> {
  const response = await driveRequest(`/files/${encodeURIComponent(fileId)}?alt=media`)
  return response.blob()
}

export async function deleteDriveScoreBackup(fileId: string): Promise<void> {
  await driveRequest(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}
