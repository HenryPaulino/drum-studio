export type DrumPartId = 'kick' | 'snare' | 'hihat' | 'tom' | 'cymbal'

export interface DrumPart {
  id: DrumPartId
  name: string
  symbol: string
  step: string
  octave: number
  midi: number
}

export type DrumPattern = Record<DrumPartId, number[]>

export interface PitchedBeat {
  notes: { step: string; octave: number }[]
  duration: 1 | 2
}

export const drumParts: DrumPart[] = [
  { id: 'kick', name: 'Bumbo', symbol: '◉', step: 'F', octave: 4, midi: 36 },
  { id: 'snare', name: 'Caixa', symbol: '⊙', step: 'C', octave: 5, midi: 38 },
  { id: 'hihat', name: 'Chimbal', symbol: '≋', step: 'G', octave: 5, midi: 42 },
  { id: 'tom', name: 'Tom', symbol: '◌', step: 'D', octave: 5, midi: 45 },
  { id: 'cymbal', name: 'Prato', symbol: '✳', step: 'A', octave: 5, midi: 49 },
]

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    }
    return entities[character]!
  })
}

export function createDrumMusicXml(title: string, tempo: number, pattern: DrumPattern): string {
  const scoreInstrumentsXml = drumParts.map((part, index) => {
    const instrumentId = `P1-I${index + 1}`
    return `<score-instrument id="${instrumentId}"><instrument-name>${part.name}</instrument-name></score-instrument>`
  }).join('')
  const midiInstrumentsXml = drumParts.map((part, index) => {
    const instrumentId = `P1-I${index + 1}`
    return `<midi-instrument id="${instrumentId}"><midi-channel>10</midi-channel><midi-unpitched>${part.midi}</midi-unpitched></midi-instrument>`
  }).join('')
  const measuresXml = Array.from({ length: 8 }, (_, step) => {
    const hits = drumParts.filter((part) => pattern[part.id].includes(step))
    if (!hits.length) return '<note><rest/><duration>1</duration><voice>1</voice><type>eighth</type></note>'
    return hits.map((part, index) => {
      const drumIndex = drumParts.findIndex((item) => item.id === part.id) + 1
      return `<note>${index ? '<chord/>' : ''}<unpitched><display-step>${part.step}</display-step><display-octave>${part.octave}</display-octave></unpitched><duration>1</duration><instrument id="P1-I${drumIndex}"/><voice>1</voice><type>eighth</type></note>`
    }).join('')
  }).join('')
  const safeTitle = escapeXml(title)

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${safeTitle}</work-title></work>
  <identification><encoding><software>Drum Studio</software></encoding></identification>
  <part-list><score-part id="P1"><part-name>Bateria</part-name>${scoreInstrumentsXml}${midiInstrumentsXml}</score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>
      ${measuresXml}
      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>
  </part>
</score-partwise>`
}

export function createPitchedMusicXml(title: string, instrument: string, tempo: number, beats: PitchedBeat[]): string {
  const safeTitle = escapeXml(title)
  const safeInstrument = escapeXml(instrument)
  const clef = instrument === 'Baixo'
    ? '<clef><sign>F</sign><line>4</line></clef>'
    : '<clef><sign>G</sign><line>2</line></clef>'
  const notesXml = beats.map((beat) => {
    const type = beat.duration === 1 ? 'eighth' : 'quarter'
    return beat.notes.map((note, index) => {
      const chord = index ? '<chord/>' : ''
      return `<note>${chord}<pitch><step>${escapeXml(note.step)}</step><octave>${note.octave}</octave></pitch><duration>${beat.duration}</duration><voice>1</voice><type>${type}</type></note>`
    }).join('')
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${safeTitle}</work-title></work>
  <identification><encoding><software>Drum Studio</software></encoding></identification>
  <part-list><score-part id="P1"><part-name>${safeInstrument}</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time>${clef}</attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>
      ${notesXml}
      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>
  </part>
</score-partwise>`
}
