import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { BrandTile } from '@/components/ui/BrandTile'
import { mergePlan, suggestSurvivor, type DuplicateGroup } from '@/data/duplicateClients'
import { fmt } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSuccessHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { BizSheet } from './shared'

/**
 * UNIR DOS FICHAS EN UNA.
 *
 * ── LO QUE ENSEÑA ANTES DE HACERLO ────────────────────────────────────
 * Cuál se queda, cuál se absorbe, y CÓMO QUEDA la ficha resultante: sus
 * servicios, lo que se le cobrará al mes y cuántos cobros cambian de dueño.
 * Un «¿seguro?» sin eso no es una pregunta, es un trámite.
 *
 * ── Y SE PUEDE DESHACER ───────────────────────────────────────────────
 * Unir mueve cobros, que son dinero real que esa persona te debió o te pagó.
 * Así que no lleva confirmación y nada más: lleva deshacer de verdad, con todo
 * lo necesario para volver al estado exacto anterior. Si dos nombres
 * parecidos eran dos personas, el error se arregla con un toque.
 */
export function MergeSheet({ group, onClose }: { group: DuplicateGroup; onClose: () => void }) {
  const t = useT()
  const moneyDecimals = useMoneyDecimals()
  const { currency } = useFinance()
  const { charges, services, businesses, mergeClients, unmergeClients } = useBusiness()

  // El que más historial tiene, propuesto pero no impuesto: mover menos
  // cobros es menos que pueda salir mal, pero quién es el bueno lo sabe él.
  const [survivorId, setSurvivorId] = useState(() => suggestSurvivor(group.clients, charges).id)

  const plan = useMemo(() => {
    const survivor = group.clients.find(c => c.id === survivorId)
    if (!survivor) return null
    const absorbed = group.clients.filter(c => c.id !== survivorId)
    return mergePlan(survivor, absorbed, charges)
  }, [group.clients, survivorId, charges])

  if (!plan) return null

  const cur = plan.survivor.currency ?? currency
  const negocio = businesses.find(b => b.id === plan.result.businessId)

  const unir = () => {
    const undo = mergeClients(survivorId, plan.absorbed.map(c => c.id))
    if (!undo) return
    playSuccessHaptic()
    toast(t('mergeDone').replace('{name}', plan.result.name), {
      icon: 'check',
      type: 'ok',
      // Cinco segundos de red: unir mueve cobros, que son dinero real.
      duration: 6000,
      action: { label: t('undo'), onClick: () => unmergeClients(undo) },
    })
    onClose()
  }

  return (
    <BizSheet title={t('mergeTitle')} onClose={onClose} onSave={unir} saveLabel={t('mergeAction')}>
      <p className="mbizs-calc">
        {group.reason === 'phone' ? t('mergeWhyPhone') : t('mergeWhyName')}
      </p>

      <div className="mbizs-field-label">{t('mergeKeeps')}</div>
      {group.clients.map(c => {
        const esElegido = c.id === survivorId
        const suyos = charges.filter(ch => ch.clientId === c.id)
        const cerrados = suyos.filter(ch => ch.paidAt > 0).length
        return (
          <button
            key={c.id}
            type="button"
            className={`mmerge-pick${esElegido ? ' on' : ''}`}
            aria-pressed={esElegido}
            onClick={() => setSurvivorId(c.id)}
          >
            <span>
              <b>{c.name}</b>
              <small>
                {t('mergeHistory')
                  .replace('{paid}', String(cerrados))
                  .replace('{total}', String(suyos.length))}
              </small>
            </span>
            {esElegido
              ? <Icon name="check" size={16} />
              : <em>{t('mergeAbsorbs')}</em>}
          </button>
        )
      })}

      {/* CÓMO QUEDA, antes de hacerlo. */}
      <div className="mbizs-field-label">{t('mergeResult')}</div>
      <div className="mmerge-result">
        {plan.services.map(({ serviceId, amount }) => {
          const svc = services.find(v => v.id === serviceId)
          if (!svc) return null
          return (
            <div key={serviceId} className="mcli-svc">
              <BrandTile name={svc.name} size={24} color={negocio?.color} icon={negocio?.icon} />
              <span>{svc.name}</span>
              <b>{fmt(amount, cur, { decimals: moneyDecimals })}</b>
            </div>
          )
        })}
        <div className="mmerge-total">
          <span>
            {t('mergeMoved').replace('{n}', String(plan.movedCharges))}
          </span>
          <b>{fmt(plan.totalAmount, cur, { decimals: moneyDecimals })}</b>
        </div>
      </div>

      <p className="mbizs-calc">{t('mergeUndoable')}</p>
    </BizSheet>
  )
}
