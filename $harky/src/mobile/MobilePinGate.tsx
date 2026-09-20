import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { playKeySound, playBackspaceSound, playDoneSound, playWarningHaptic } from '@/lib/sound'

export function MobilePinGate({ pin, onUnlocked }: { pin: string; onUnlocked: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const press = (digit: string) => {
    playKeySound()
    if (error) setError('')
    setValue(v => {
      if (v.length >= pin.length) return v
      const next = v + digit
      if (next.length === pin.length) {
        if (next === pin) {
          playDoneSound()
          setTimeout(onUnlocked, 80)
          return next
        }
        playWarningHaptic()
        setTimeout(() => { setValue(''); setError('PIN incorrecto') }, 220)
      }
      return next
    })
  }
  const back = () => {
    playBackspaceSound()
    if (error) setError('')
    setValue(v => v.slice(0, -1))
  }

  return (
    <div className="mbio-root">
      <div className="mbio-card mpin-card">
        <div className="mbio-icon">
          <Icon name="lock" size={48} />
        </div>
        <h2>$harky</h2>
        <p>{error || 'Ingresa tu PIN para continuar'}</p>

        <div className="mpin-dots">
          {Array.from({ length: pin.length }).map((_, i) => (
            <span key={i} className={`mpin-dot${i < value.length ? ' on' : ''}${error ? ' err' : ''}`} />
          ))}
        </div>

        <div className="mpin-keypad">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} onClick={() => press(d)}>{d}</button>
          ))}
          <span />
          <button onClick={() => press('0')}>0</button>
          <button aria-label="Borrar" onClick={back}><Icon name="close" size={18} /></button>
        </div>
      </div>
    </div>
  )
}
