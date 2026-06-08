import { useSettings } from '@/store/settings'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function volume(): number {
  const s = useSettings.getState()
  return s.soundsEnabled ? s.soundVolume : 0
}

function tone(freq: number, duration: number, { type = 'sine' as OscillatorType, gain = 0.05, delay = 0 } = {}) {
  const audio = getCtx()
  if (!audio) return
  const vol = volume()
  if (vol <= 0) return
  const osc  = audio.createOscillator()
  const amp  = audio.createGain()
  const start = audio.currentTime + delay
  osc.type = type
  osc.frequency.value = freq
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(gain * vol, start + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp)
  amp.connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.03)
}

/** Click mecánico estilo máquina de escribir: ráfaga de ruido filtrada + golpe grave + vibración sincronizada. */
function typewriterClick(freq: number, gain = 0.05, vibrateMs = 8) {
  const audio = getCtx()
  if (!audio) return
  const vol = volume()
  if (vol <= 0) return
  if (vibrateMs > 0) navigator.vibrate?.(vibrateMs)
  const start = audio.currentTime
  const duration = 0.045

  const bufferSize = Math.floor(audio.sampleRate * duration)
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)

  const noise  = audio.createBufferSource()
  noise.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.4
  const noiseAmp = audio.createGain()
  noiseAmp.gain.setValueAtTime(gain * vol, start)
  noiseAmp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  noise.connect(filter)
  filter.connect(noiseAmp)
  noiseAmp.connect(audio.destination)
  noise.start(start)

  // Golpe grave (el "thunk" mecánico de la palanca)
  const thunk = audio.createOscillator()
  const thunkAmp = audio.createGain()
  thunk.type = 'triangle'
  thunk.frequency.value = freq / 6
  thunkAmp.gain.setValueAtTime(0, start)
  thunkAmp.gain.linearRampToValueAtTime(gain * 0.7 * vol, start + 0.004)
  thunkAmp.gain.exponentialRampToValueAtTime(0.0001, start + 0.05)
  thunk.connect(thunkAmp)
  thunkAmp.connect(audio.destination)
  thunk.start(start)
  thunk.stop(start + 0.06)
}

function enabled() {
  return useSettings.getState().soundsEnabled
}

/** Tecla numérica del teclado de montos — clic de máquina de escribir + vibración leve */
export function playKeySound() {
  if (!enabled()) return
  typewriterClick(1900, 0.05, 8)
}

/** Operadores (+, −, ×, ÷, .) — clic ligeramente más grave */
export function playOperatorSound() {
  if (!enabled()) return
  typewriterClick(1400, 0.05, 10)
}

/** Borrar dígito — clic más seco y agudo + vibración leve */
export function playBackspaceSound() {
  if (!enabled()) return
  typewriterClick(2400, 0.045, 10)
}

/** Abrir el flujo de "agregar" (botón + flotante) */
export function playOpenSound() {
  if (!enabled()) return
  tone(620, 0.07, { gain: 0.05 })
  tone(880, 0.08, { gain: 0.045, delay: 0.05 })
}

/** Abrir la sección de cuentas */
export function playAccountsSound() {
  if (!enabled()) return
  tone(740, 0.06, { type: 'triangle', gain: 0.045 })
  tone(1040, 0.09, { type: 'triangle', gain: 0.04, delay: 0.045 })
}

/** Confirmar / guardar (movimiento, categoría, meta, deuda…) */
export function playConfirmSound() {
  if (!enabled()) return
  tone(660, 0.09, { gain: 0.06 })
  tone(990, 0.14, { gain: 0.06, delay: 0.075 })
}

/** Eliminar */
export function playDeleteSound() {
  if (!enabled()) return
  tone(420, 0.06, { gain: 0.05 })
  tone(260, 0.1, { gain: 0.045, delay: 0.05 })
}

/** Logro: meta cumplida, deuda liquidada… */
export function playAchievementSound() {
  if (!enabled()) return
  tone(523.25, 0.1,  { gain: 0.06 })
  tone(659.25, 0.1,  { gain: 0.06, delay: 0.09 })
  tone(783.99, 0.18, { gain: 0.07, delay: 0.18 })
}
