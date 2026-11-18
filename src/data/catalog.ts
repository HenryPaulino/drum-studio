import type { Instrument } from '../lib/googleDrive'
import type { DrumPattern, PitchedBeat } from '../lib/drumMusicXml'

export interface CatalogScore {
  id: string
  title: string
  instrument: Instrument
  style: string
  level: 'Iniciante' | 'Intermediário'
  tempo: number
  description: string
  pattern?: DrumPattern
  beats?: PitchedBeat[]
}

const eighthNotes = [0, 1, 2, 3, 4, 5, 6, 7]

export const catalogScores: CatalogScore[] = [
  {
    id: 'rock-basico',
    title: 'Rock básico',
    instrument: 'Bateria',
    style: 'Rock',
    level: 'Iniciante',
    tempo: 100,
    description: 'Groove 4/4 com chimbal em colcheias e caixa nos tempos 2 e 4.',
    pattern: { kick: [0, 4], snare: [2, 6], hihat: eighthNotes, tom: [], cymbal: [] },
  },
  {
    id: 'pop-aberto',
    title: 'Pop aberto',
    instrument: 'Bateria',
    style: 'Pop',
    level: 'Iniciante',
    tempo: 92,
    description: 'Base pop em 4/4 com chimbal espaçado e acentos de bumbo.',
    pattern: { kick: [0, 4, 6], snare: [2, 6], hihat: [0, 2, 4, 6], tom: [], cymbal: [0] },
  },
  {
    id: 'balada-meio-tempo',
    title: 'Balada meio-tempo',
    instrument: 'Bateria',
    style: 'Balada',
    level: 'Iniciante',
    tempo: 72,
    description: 'Exercício lento para praticar controle, pulsação e dinâmica.',
    pattern: { kick: [0, 4], snare: [4], hihat: [0, 2, 4, 6], tom: [], cymbal: [] },
  },
  {
    id: 'funk-sincopado',
    title: 'Funk sincopado',
    instrument: 'Bateria',
    style: 'Funk',
    level: 'Intermediário',
    tempo: 112,
    description: 'Bumbo sincopado, caixa no backbeat e chimbal contínuo.',
    pattern: { kick: [0, 3, 5], snare: [2, 6], hihat: eighthNotes, tom: [], cymbal: [] },
  },
  {
    id: 'rock-com-virada',
    title: 'Rock com virada',
    instrument: 'Bateria',
    style: 'Rock',
    level: 'Intermediário',
    tempo: 108,
    description: 'Groove de rock com uma pequena virada de tons no fim do compasso.',
    pattern: { kick: [0, 4], snare: [2, 6], hihat: [0, 1, 2, 3, 4, 5], tom: [6, 7], cymbal: [0] },
  },
  {
    id: 'baixo-linha-colcheias',
    title: 'Linha de baixo em colcheias',
    instrument: 'Baixo',
    style: 'Estudo',
    level: 'Iniciante',
    tempo: 84,
    description: 'Sequência original de oito notas para praticar pulsação e troca de cordas.',
    beats: [
      { notes: [{ step: 'E', octave: 2 }], duration: 1 },
      { notes: [{ step: 'G', octave: 2 }], duration: 1 },
      { notes: [{ step: 'A', octave: 2 }], duration: 1 },
      { notes: [{ step: 'B', octave: 2 }], duration: 1 },
      { notes: [{ step: 'D', octave: 3 }], duration: 1 },
      { notes: [{ step: 'B', octave: 2 }], duration: 1 },
      { notes: [{ step: 'A', octave: 2 }], duration: 1 },
      { notes: [{ step: 'G', octave: 2 }], duration: 1 },
    ],
  },
  {
    id: 'violao-ciclo-acordes',
    title: 'Ciclo de acordes abertos',
    instrument: 'Violão',
    style: 'Acordes',
    level: 'Iniciante',
    tempo: 76,
    description: 'Quatro tríades originais para treinar leitura de acordes em 4/4.',
    beats: [
      { notes: [{ step: 'C', octave: 3 }, { step: 'E', octave: 3 }, { step: 'G', octave: 3 }], duration: 2 },
      { notes: [{ step: 'G', octave: 2 }, { step: 'B', octave: 2 }, { step: 'D', octave: 3 }], duration: 2 },
      { notes: [{ step: 'A', octave: 2 }, { step: 'C', octave: 3 }, { step: 'E', octave: 3 }], duration: 2 },
      { notes: [{ step: 'F', octave: 2 }, { step: 'A', octave: 2 }, { step: 'C', octave: 3 }], duration: 2 },
    ],
  },
  {
    id: 'teclado-arpejo-do',
    title: 'Arpejo de Dó maior',
    instrument: 'Teclado',
    style: 'Arpejo',
    level: 'Iniciante',
    tempo: 80,
    description: 'Arpejo de oito colcheias para desenvolver coordenação das mãos.',
    beats: [
      { notes: [{ step: 'C', octave: 4 }], duration: 1 },
      { notes: [{ step: 'E', octave: 4 }], duration: 1 },
      { notes: [{ step: 'G', octave: 4 }], duration: 1 },
      { notes: [{ step: 'C', octave: 5 }], duration: 1 },
      { notes: [{ step: 'G', octave: 4 }], duration: 1 },
      { notes: [{ step: 'E', octave: 4 }], duration: 1 },
      { notes: [{ step: 'D', octave: 4 }], duration: 1 },
      { notes: [{ step: 'F', octave: 4 }], duration: 1 },
    ],
  },
]
