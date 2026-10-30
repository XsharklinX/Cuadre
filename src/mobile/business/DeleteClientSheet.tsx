import { toast } from '@/components/ui/Toast'
import { fmt } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { BizSheet } from './shared'

/**
 * L1 · BORRAR, DICIENDO QUÉ PASA CON LO QUE YA TE PAGÓ.
 *
 * Tres salidas, y la primera es la que suele querer quien borra:
 *
 *  · BORRAR Y GUARDAR SU HISTORIAL — sale de todas las listas, pero lo que te
 *    pagó sigue contando en Ganancia y en su servicio. Es un borrado «suave»
 *    a propósito: los cobros sin cliente se descartan al cargar, así que no
 *    puede ser un borrado de verdad.
 *  · BORRAR TODO — el cliente y todos sus cobros.
 *  · MEJOR PAUSARLO — la mayoría de las veces el cliente se fue por un tiempo
 *    y vuelve, y pausar es lo que de verdad se quería.
 *
 * En ningún caso se tocan los ingresos del libro: ese dinero entró de verdad.
 * Sirve para uno o para varios (la selección de la lista).
 */
export function DeleteClientSheet({ clientIds, onClose, onDone }: {
  clientIds: string[]
  onClose: () => void
  onDone?: () => void
}) {
  const t = useT()
  const moneyDecimals = useMoneyDecimals()
  const currency = useFinance(s => s.currency)
  const { clients, charges, softDeleteClient, purgeClient, updateClients } = useBusiness()
  const cuales = clients.filter(c => clientIds.includes(c.id))
  if (!cuales.length) return null

  const pagados = charges.filter(ch => clientIds.includes(ch.clientId) && ch.paid > 0)
  const pagado = pagados.reduce((s, ch) => s + ch.paid, 0)
  const uno = cuales.length === 1 ? cuales[0] : null

  /** Lo de antes, entero, para el deshacer. */
  const foto = () => {
    const st = useBusiness.getState()
    return {
      clients: st.clients.filter(c => clientIds.includes(c.id)).map(c => ({ ...c })),
      charges: st.charges.filter(ch => clientIds.includes(ch.clientId)).map(ch => ({ ...ch })),
      // Quien tenía a estos como «recomendado por» lo pierde al borrar todo.
      referred: st.clients.filter(c => c.referredBy && clientIds.includes(c.referredBy)).map(c => ({ id: c.id, by: c.referredBy! })),
    }
  }

  const deshacer = (antes: ReturnType<typeof foto>) => () => {
    const ids = new Set(antes.clients.map(c => c.id))
    const cobros = new Set(antes.charges.map(c => c.id))
    const porQuien = new Map(antes.referred.map(r => [r.id, r.by]))
    useBusiness.setState(st => ({
      clients: [
        ...st.clients.filter(c => !ids.has(c.id)).map(c => (porQuien.has(c.id) ? { ...c, referredBy: porQuien.get(c.id) } : c)),
        ...antes.clients,
      ],
      charges: [...st.charges.filter(c => !cobros.has(c.id)), ...antes.charges],
    }))
  }

  const hacer = (que: 'keep' | 'all' | 'pause') => {
    playSoftHaptic()
    const antes = foto()
    if (que === 'pause') {
      updateClients(clientIds, { active: false })
      toast(t('cliPausedToast'), { icon: 'check', type: 'ok' })
    } else {
      for (const id of clientIds) (que === 'keep' ? softDeleteClient : purgeClient)(id)
      toast(t(cuales.length === 1 ? 'bizClientDeleted' : 'cliDeletedMany').replace('{n}', String(cuales.length)), {
        icon: 'trash',
        duration: 6000,
        action: { label: t('undo'), onClick: deshacer(antes) },
      })
    }
    onDone?.()
    onClose()
  }

  return (
    <BizSheet
      title={uno ? t('cliDeleteTitle').replace('{name}', uno.name.split(/\s+/)[0]) : t('cliDeleteTitleMany').replace('{n}', String(cuales.length))}
      onClose={onClose}
    >
      <p className="mbizs-calc">
        {pagado > 0
          ? t('cliDeletePaid')
            .replace('{amount}', fmt(pagado, uno?.currency ?? currency, { decimals: moneyDecimals }))
            .replace('{n}', String(pagados.length))
          : t('cliDeleteNothingPaid')}
      </p>
      <div className="mdel-opts">
        {pagado > 0 && (
          <button type="button" className="best" onClick={() => hacer('keep')}>
            <b>{t('cliDeleteKeep')}</b>
            <small>{t('cliDeleteKeepHint')}</small>
          </button>
        )}
        <button type="button" className="danger" onClick={() => hacer('all')}>
          <b>{pagado > 0 ? t('cliDeleteAll') : t('bizDeleteClient')}</b>
          <small>{t('cliDeleteAllHint')}</small>
        </button>
        <button type="button" className="ghost" onClick={() => hacer('pause')}>
          <b>{t('cliDeletePauseInstead')}</b>
          <small>{t('cliPauseHint')}</small>
        </button>
      </div>
    </BizSheet>
  )
}
