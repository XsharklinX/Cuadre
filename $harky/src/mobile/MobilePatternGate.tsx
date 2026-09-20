import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { playDoneSound, playWarningHaptic } from '@/lib/sound'
import { PatternPad } from './PatternPad'

export function MobilePatternGate({ pattern, onUnlocked }: { pattern: string; onUnlocked: () => void }) {
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleComplete = (value: string | null) => {
    if (success) return
    if (value === null) return
    if (value === pattern) {
      playDoneSound()
      setError('')
      setSuccess(true)
      setTimeout(onUnlocked, 180)
      return
    }
    playWarningHaptic()
    setError('Patrón incorrecto')
    setShake(true)
    setTimeout(() => setShake(false), 380)
  }

  return (
    <div className="mbio-root">
      <div className="mbio-card mpin-card">
        <div className="mbio-icon">
          <Icon name="grid" size={48} />
        </div>
        <h2>$harky</h2>
        <p>{error || 'Dibuja tu patrón para continuar'}</p>

        <PatternPad onComplete={handleComplete} shake={shake} success={success} />
      </div>
    </div>
  )
}
