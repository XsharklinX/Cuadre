import { useSettings } from '@/store/settings'

let ctx: AudioContext | null = null
let output: GainNode | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function getOutput(audio: AudioContext): GainNode {
  if (output) return output

  const compressor = audio.createDynamicsCompressor()
  compressor.threshold.value = -28
  compressor.knee.value = 18
  compressor.ratio.value = 5
  compressor.attack.value = 0.003
  compressor.release.value = 0.08

  output = audio.createGain()
  output.gain.value = 0.72
  output.connect(compressor)
  compressor.connect(audio.destination)
  return output
}

function enabled(): boolean {
  return useSettings.getState().soundsEnabled
}

function volume(): number {
  const settings = useSettings.getState()
  if (!settings.soundsEnabled || settings.soundProfile === 'silent') return 0
  const profileGain = settings.soundProfile === 'full' ? 1 : 0.68
  return settings.soundVolume * profileGain
}

// La vibración se controla SOLO con hapticsEnabled, no con el sonido: en modo
// silencio el háptico es lo que reemplaza al audio, así que apagar el sonido no
// debe callarlo. Antes iba atado a soundsEnabled + perfil, y por eso «no
// vibraba nada» para quien tenía el sonido apagado.
function haptic(ms: number | number[]) {
  if (!useSettings.getState().hapticsEnabled) return
  navigator.vibrate?.(ms)
}

export function playTapHaptic() {
  haptic(6)
}

export function playSoftHaptic() {
  haptic(10)
}

export function playSuccessHaptic() {
  haptic(14)
}

export function playWarningHaptic() {
  haptic([14, 36, 18])
}

export function playDeleteHaptic() {
  haptic([12, 40, 24])
}

function tone(
  freq: number,
  duration: number,
  {
    type = 'sine' as OscillatorType,
    gain = 0.04,
    delay = 0,
    endFreq = freq,
  } = {},
) {
  const audio = getCtx()
  if (!audio) return
  const vol = volume()
  if (vol <= 0) return

  const osc = audio.createOscillator()
  const amp = audio.createGain()
  const start = audio.currentTime + delay

  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration)

  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(gain * vol, start + 0.006)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(amp)
  amp.connect(getOutput(audio))
  osc.start(start)
  osc.stop(start + duration + 0.03)
}

function softNoise(duration: number, gain = 0.012, delay = 0) {
  const audio = getCtx()
  if (!audio) return
  const vol = volume()
  if (vol <= 0) return

  const frames = Math.max(1, Math.floor(audio.sampleRate * duration))
  const buffer = audio.createBuffer(1, frames, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)

  const source = audio.createBufferSource()
  const filter = audio.createBiquadFilter()
  const amp = audio.createGain()
  const start = audio.currentTime + delay

  source.buffer = buffer
  filter.type = 'highpass'
  filter.frequency.value = 1200
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(gain * vol, start + 0.004)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(filter)
  filter.connect(amp)
  amp.connect(getOutput(audio))
  source.start(start)
  source.stop(start + duration + 0.02)
}

function tapClick(freq: number, gain = 0.04, vibrateMs = 6) {
  haptic(vibrateMs)
  if (!enabled()) return

  const audio = getCtx()
  if (!audio) return
  const vol = volume()
  if (vol <= 0) return

  const start = audio.currentTime
  const osc = audio.createOscillator()
  const amp = audio.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, start)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.72, start + 0.055)
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(gain * vol, start + 0.004)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.065)

  osc.connect(amp)
  amp.connect(getOutput(audio))
  osc.start(start)
  osc.stop(start + 0.085)
  softNoise(0.028, gain * 0.25)
}

// Sin guarda de sonido arriba: tapClick ya dispara el háptico (auto-gated) y
// silencia el audio si el sonido está apagado. Así el teclado vibra aunque el
// sonido esté en silencio.
export function playKeySound() {
  tapClick(760, 0.04, 5)
}

export function playOperatorSound() {
  tapClick(610, 0.045, 7)
}

export function playBackspaceSound() {
  tapClick(480, 0.04, 9)
}

export function playDoneSound() {
  haptic(14)
  if (!enabled()) return
  tone(660, 0.08, { type: 'triangle', gain: 0.045, endFreq: 720 })
  tone(990, 0.12, { type: 'sine', gain: 0.04, delay: 0.055, endFreq: 1120 })
}

export function playOpenSound() {
  haptic(10)
  if (!enabled()) return
  tone(520, 0.06, { type: 'triangle', gain: 0.035, endFreq: 660 })
  tone(820, 0.08, { type: 'sine', gain: 0.028, delay: 0.045, endFreq: 920 })
}

export function playAccountsSound() {
  haptic(8)
  if (!enabled()) return
  tone(560, 0.055, { type: 'triangle', gain: 0.034, endFreq: 640 })
  tone(760, 0.08, { type: 'triangle', gain: 0.028, delay: 0.04, endFreq: 820 })
}

export function playConfirmSound() {
  haptic(12)
  if (!enabled()) return
  tone(600, 0.08, { type: 'triangle', gain: 0.042, endFreq: 700 })
  tone(880, 0.13, { type: 'sine', gain: 0.04, delay: 0.06, endFreq: 1040 })
}

export function playDeleteSound() {
  haptic(18)
  if (!enabled()) return
  tone(360, 0.055, { type: 'triangle', gain: 0.04, endFreq: 300 })
  tone(240, 0.08, { type: 'sine', gain: 0.032, delay: 0.045, endFreq: 210 })
}

export function playAchievementSound() {
  haptic(22)
  if (!enabled()) return
  tone(523.25, 0.09, { type: 'triangle', gain: 0.042 })
  tone(659.25, 0.09, { type: 'triangle', gain: 0.044, delay: 0.075 })
  tone(880, 0.16, { type: 'sine', gain: 0.045, delay: 0.15, endFreq: 990 })
}

export function playSoundPreview() {
  playOpenSound()
  setTimeout(playKeySound, 90)
  setTimeout(playConfirmSound, 180)
}
