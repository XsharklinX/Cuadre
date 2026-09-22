import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { playSuccessHaptic } from '@/lib/sound'
import { billingAvailable, buyVip, getVipProduct, restoreVip } from '@/lib/playBilling'
import { useDev } from '@/store/dev'
import { useT } from '@/i18n'
import { SettingsRow, SettingsSheet, type SheetProps } from './shared'

/**
 * CUADRE VIP — pago único, sin suscripción.
 *
 * Cobra de verdad, con **Google Play Billing** (`lib/playBilling.ts` y el
 * plugin `plugins/play-billing`). No es una decisión estética: Google exige su
 * sistema para cualquier cosa que desbloquee funciones dentro de una app
 * distribuida en Play, y cobrar por fuera (PayPal, Stripe, un enlace) es de
 * las pocas infracciones por las que retiran la app en vez de avisar.
 *
 * La pantalla sigue OCULTA tras el modo desarrollador hasta que el producto
 * esté publicado en Play Console.
 *
 * `useDev().vip` NO es la fuente de la verdad: `localStorage` se edita en diez
 * segundos. La verdad la tiene `restoreVip()`, que le pregunta a Play qué
 * posee esta cuenta; la bandera local solo existe para pintar sin esperar.
 */
export function SettingsVip({ activeSheet, onOpen, onClose }: SheetProps) {
  const t = useT()
  const vip = useDev(d => d.vip)
  const setVip = useDev(d => d.setVip)
  const [price, setPrice] = useState<string | null>(null)
  const [canBuy, setCanBuy] = useState(false)
  const [busy, setBusy] = useState(false)

  /*
   * Al abrir: se pregunta si Play puede vender aqui, cual es el precio REAL y
   * —sobre todo— si esta cuenta ya compro. Restaurar no puede depender de que
   * el usuario encuentre un boton: quien reinstala tiene que recuperar lo suyo
   * solo con abrir la pantalla.
   */
  useEffect(() => {
    if (activeSheet !== 'vip') return
    let cancelled = false
    void (async () => {
      const availability = await billingAvailable()
      if (cancelled) return
      setCanBuy(availability.available)
      if (!availability.available) return

      const product = await getVipProduct()
      if (!cancelled && product.found && product.price) setPrice(product.price)

      const owned = await restoreVip()
      if (!cancelled && owned.owned) setVip(true)
    })()
    return () => { cancelled = true }
  }, [activeSheet, setVip])

  const purchase = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await buyVip()
      if (result.owned) {
        setVip(true)
        playSuccessHaptic()
        toast(t('vipThanks'), { icon: 'check', type: 'ok' })
      } else if (result.pending) {
        toast(t('vipPending'), { icon: 'info' })
      } else if (!result.cancelled) {
        // Cerrar el dialogo no dice nada: solo se avisa de fallos de verdad.
        toast(t('vipFailed'), { icon: 'alert' })
      }
    } finally {
      setBusy(false)
    }
  }

  const perks = [
    ['shield', '#5fe3c0', t('vipPerkAdsTitle'), t('vipPerkAdsDesc')],
    ['heart', '#ff6b8a', t('vipPerkSupportTitle'), t('vipPerkSupportDesc')],
    ['star', '#ffd166', t('vipPerkFutureTitle'), t('vipPerkFutureDesc')],
  ] as const

  return (
    <>
      <div className="mset-card">
        <SettingsRow
          icon="star" iconColor="#ffd166"
          label={t('vipTitle')}
          value={vip ? t('vipOwned') : t('vipPrice')}
          onClick={() => onOpen('vip')}
        />
      </div>

      {activeSheet === 'vip' && (
        <SettingsSheet title={t('vipTitle')} onClose={onClose}>
          <div className="mset-sheet-body mset-vip">
            <div className="mset-vip-hero">
              <span className="mset-vip-crown"><Icon name="star" size={30} /></span>
              <strong>{t('vipTitle')}</strong>
              <small>{t('vipTagline')}</small>
              <span className="mset-vip-badge-once">{t('vipPriceNote')}</span>
            </div>

            <div className="mset-vip-perks">
              {perks.map(([icon, color, title, desc]) => (
                <div key={title} className="mset-vip-perk">
                  <span style={{ background: color + '22', color }}>
                    <Icon name={icon} size={16} />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* El precio sale de Play, no del codigo: Play lo entrega ya
                convertido a la moneda del pais del usuario. Un "US$ 4.99"
                fijo miente en cuanto alguien abre la app fuera de EE.UU. */}
            {/* Sin repetir "pago unico" bajo la cifra: ya lo dice la chapa de
                arriba, y decirlo dos veces en la misma pantalla suena a que se
                insiste porque no es del todo cierto. */}
            <div className="mset-vip-price">
              <b>{price ?? t('vipPrice')}</b>
            </div>

            <button
              className={`mset-vip-cta${vip ? ' owned' : ''}`}
              disabled={vip || busy}
              onClick={purchase}
            >
              <Icon name={vip ? 'check' : 'star'} size={17} />
              {vip ? t('vipOwned') : t('vipCta')}
            </button>

            {!vip && (
              <button className="mset-vip-restore" disabled={busy} onClick={async () => {
                const owned = await restoreVip()
                if (owned.owned) { setVip(true); toast(t('vipThanks'), { icon: 'check', type: 'ok' }) }
                else toast(t('vipNothingToRestore'), { icon: 'info' })
              }}>
                {t('vipRestore')}
              </button>
            )}

            <p className="mset-vip-note">
              <Icon name="info" size={13} />
              {canBuy ? t('vipExperimentalNote') : t('vipUnavailableNote')}
            </p>
          </div>
        </SettingsSheet>
      )}
    </>
  )
}
