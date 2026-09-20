import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { authenticateBiometric, checkBiometric } from '@/lib/biometric'

type GateState = 'checking' | 'prompting' | 'error' | 'done'

export function MobileBiometricGate({ onUnlocked, onUnavailable }: { onUnlocked: () => void; onUnavailable: () => void }) {
  const [state, setState]   = useState<GateState>('checking')
  const [error, setError]   = useState('')
  const [icon,  setIcon]    = useState<'fingerprint' | 'faceId'>('fingerprint')

  const tryAuth = async () => {
    setState('prompting')
    setError('')
    try {
      await authenticateBiometric('Desbloquear $harky')
      setState('done')
      onUnlocked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar tu identidad')
      setState('error')
    }
  }

  useEffect(() => {
    checkBiometric().then(status => {
      if (!status.available) {
        // La biometría dejó de estar disponible (ej. se borraron las huellas del
        // dispositivo) — no se puede pedir biometría, pero NO se debe desbloquear
        // la app sin verificación. Cede el paso al PIN/patrón, que siempre está
        // configurado cuando requireBiometric está activo.
        onUnavailable()
        return
      }
      setIcon(status.biometryType === 'faceId' ? 'faceId' : 'fingerprint')
      void tryAuth()
    })
  }, [])

  if (state === 'checking' || state === 'done') return null

  return (
    <div className="mbio-root">
      <div className="mbio-card">
        <div className="mbio-icon">
          <Icon name={icon === 'faceId' ? 'user' : 'lock'} size={48} />
        </div>
        <h2>$harky</h2>
        <p>{state === 'error' ? error : 'Verificando identidad…'}</p>
        {state === 'error' && (
          <>
            <button className="mbio-retry" onClick={tryAuth}>
              <Icon name="refresh" size={16} /> Reintentar
            </button>
            <button className="mbio-fallback" onClick={onUnavailable}>
              Usar PIN o patrón
            </button>
          </>
        )}
      </div>
    </div>
  )
}
