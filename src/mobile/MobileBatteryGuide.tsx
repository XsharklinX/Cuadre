import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { allGuides, detectVendor, guideFor, type Vendor } from '@/data/batteryGuide'
import { isBatteryExempt, openBatterySettings } from '@/lib/localReminders'
import { useBattery } from '@/store/battery'
import { useT } from '@/i18n'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/**
 * GUÍA DE BATERÍA.
 *
 * El problema que resuelve está medido, no supuesto: en el teléfono del
 * usuario la app NO estaba en la lista blanca, y los trabajos de WorkManager
 * se diferían más de 17 horas. Eso es lo que tuvo la detección de movimientos
 * meses sin registrar nada y el respaldo semanal sin correr.
 *
 * Por qué es una pantalla y no un botón: el ajuste estándar de Android no
 * basta en Xiaomi, Huawei, Samsung, OPPO ni vivo — cada uno tiene el suyo, en
 * un sitio distinto y con otro nombre. Un botón que abre "Ajustes" y deja al
 * usuario buscando es lo mismo que no hacer nada. Los pasos vienen de
 * `data/batteryGuide.ts`, con los nombres exactos de cada capa.
 */
export function MobileBatteryGuide({ onClose }: { onClose: () => void }) {
  const t = useT()
  const markDone = useBattery(s => s.markDone)
  const markSnoozed = useBattery(s => s.markSnoozed)

  const [vendor, setVendor] = useState<Vendor>(() => detectVendor(navigator.userAgent))
  const [pickingVendor, setPickingVendor] = useState(false)
  const [exempt, setExempt] = useState<boolean | null>(null)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  /*
   * Se vuelve a consultar al volver del sistema: el usuario sale a Ajustes,
   * concede la exención y regresa. Sin esto la pantalla seguiría diciendo
   * "falta permitirlo" con el permiso ya dado, que es la forma más rápida de
   * que alguien lo intente tres veces y se rinda.
   */
  useEffect(() => {
    let cancelled = false
    const check = () => { void isBatteryExempt().then(v => { if (!cancelled) setExempt(v) }) }
    check()
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const guide = guideFor(vendor)

  const finish = () => {
    markDone()
    toast(t('batteryDoneToast'), { icon: 'check', type: 'ok' })
    onClose()
  }

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true"
        aria-label={t('batteryTitle')} onClick={onClose}>
        <section className="mbat-sheet" onClick={e => e.stopPropagation()}>
          <header className="mbat-head">
            <span className="mbat-ico"><Icon name="bolt" size={22} /></span>
            <div>
              <strong>{t('batteryTitle')}</strong>
              {/* El estado REAL, consultado a Android. Si ya está concedido no
                  se le hace pasar por los pasos a nadie. */}
              {exempt !== null && (
                <small className={exempt ? 'ok' : 'missing'}>
                  {exempt ? t('batteryStatusOk') : t('batteryStatusMissing')}
                </small>
              )}
            </div>
            <button className="mbat-close" aria-label={t('close')} onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </header>

          <div className="mbat-body">
            <p className="mbat-why">{t('batteryWhy')}</p>

            {guide.needsExtraStep && (
              <p className="mbat-warn">
                <Icon name="alert" size={14} /> {t('batteryExtraWarn')}
              </p>
            )}

            <div className="mbat-vendor">
              <span>{t('batteryStepsTitle')}</span>
              <b>{guide.label}</b>
            </div>

            <ol className="mbat-steps">
              {guide.stepKeys.map((key, i) => (
                <li key={key}>
                  <span className="mbat-step-n">{i + 1}</span>
                  <span>{t(key as Parameters<typeof t>[0])}</span>
                </li>
              ))}
            </ol>

            {/* La detección por user-agent acierta casi siempre, pero no
                siempre: dejar cambiarla evita que alguien con un teléfono mal
                detectado siga instrucciones de otra marca. */}
            {!pickingVendor ? (
              <button className="mbat-other" onClick={() => setPickingVendor(true)}>
                {t('batteryOtherVendor')}
              </button>
            ) : (
              <div className="mbat-vendors">
                {allGuides().map(g => (
                  <button
                    key={g.vendor}
                    className={g.vendor === vendor ? 'on' : ''}
                    onClick={() => { setVendor(g.vendor); setPickingVendor(false) }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mbat-actions">
            <button className="mbat-secondary" onClick={() => { markSnoozed(); onClose() }}>
              {t('batterySnoozeAction')}
            </button>
            {exempt
              ? <button className="mbat-primary" onClick={finish}>{t('batteryDoneAction')}</button>
              : <button className="mbat-primary" onClick={() => void openBatterySettings()}>
                  <Icon name="bolt" size={16} /> {t('batteryOpenAction')}
                </button>}
          </div>
        </section>
      </div>
    </SheetPortal>
  )
}
