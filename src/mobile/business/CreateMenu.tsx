import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import type { IconName } from '@/types'
import { BizSheet } from './shared'

/**
 * «CREAR», DESDE EL BOTÓN + CUANDO ESTÁS EN NEGOCIO.
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────
 * Es el botón más grande de la app y en Negocio no hacía nada que tuviera que
 * ver con Negocio: siempre creaba un movimiento.
 *
 * ── LA LÍNEA DE DEBAJO DE CADA OPCIÓN ─────────────────────────────────
 * Es la que enseña cómo encaja todo. Que un negocio agrupa servicios y los
 * servicios tienen clientes es la pieza que más cuesta entender, y aquí se
 * explica sin un tutorial.
 *
 * ── Y EL MOVIMIENTO SIGUE AHÍ ─────────────────────────────────────────
 * Lo que hacía el botón no se pierde: es la última opción. Quitarlo habría
 * convertido el + en un botón que hace cosas distintas según la pantalla sin
 * dejar hacer la de siempre.
 */
type Opcion = 'client' | 'charge' | 'service' | 'business' | 'movement'

export function CreateMenu({ onClose, onPick }: {
  onClose: () => void
  /** Para un servicio, con el negocio al que va. */
  onPick: (opcion: Opcion, businessId?: string) => void
}) {
  const t = useT()
  const businesses = useBusiness(s => s.businesses).filter(b => !b.archivedAt)
  const clients = useBusiness(s => s.clients)
  // Con varios negocios, un servicio pregunta a cuál va antes de abrirse.
  const [eligiendoNegocio, setEligiendoNegocio] = useState(false)

  const opciones: Array<{ id: Opcion; icon: IconName; title: string; hint: string; disabled?: string }> = [
    { id: 'client', icon: 'user', title: t('createClient'), hint: t('createClientHint') },
    {
      id: 'charge', icon: 'receipt', title: t('bizNewCharge'), hint: t('createChargeHint'),
      // Un cobro suelto es para alguien que ya es cliente.
      disabled: clients.length ? undefined : t('bizChargeNoClients'),
    },
    {
      id: 'service', icon: 'play', title: t('createService'), hint: t('createServiceHint'),
      disabled: businesses.length ? undefined : t('createNeedsBusiness'),
    },
    { id: 'business', icon: 'briefcase', title: t('createBusiness'), hint: t('createBusinessHint') },
    { id: 'movement', icon: 'plus', title: t('createMovement'), hint: t('createMovementHint') },
  ]

  const elegir = (id: Opcion) => {
    playSoftHaptic()
    if (id === 'service' && businesses.length > 1) { setEligiendoNegocio(true); return }
    onPick(id, id === 'service' ? businesses[0]?.id : undefined)
  }

  return (
    <BizSheet title={eligiendoNegocio ? t('createWhichBusiness') : t('createTitle')} onClose={onClose}>
      {eligiendoNegocio ? (
        businesses.map(b => (
          <button key={b.id} type="button" className="mcreate-row" onClick={() => onPick('service', b.id)}>
            <span
              className="mcreate-ico"
              style={{ background: `color-mix(in oklab, ${b.color} 20%, transparent)`, color: b.color }}
            >
              <Icon name={b.icon} size={18} />
            </span>
            <span><b>{b.name}</b></span>
          </button>
        ))
      ) : (
        opciones.map(o => (
          <button
            key={o.id}
            type="button"
            className="mcreate-row"
            disabled={!!o.disabled}
            onClick={() => elegir(o.id)}
          >
            <span className={`mcreate-ico k-${o.id}`}><Icon name={o.icon} size={18} /></span>
            <span>
              <b>{o.title}</b>
              {/* Deshabilitado, dice POR QUÉ: un botón apagado sin motivo es
                  el peor tipo de fallo, la app parece rota sin estarlo. */}
              <small>{o.disabled ?? o.hint}</small>
            </span>
          </button>
        ))
      )}
    </BizSheet>
  )
}
