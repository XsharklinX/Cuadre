import { Icon } from '@/components/ui/Icon'
import { firstRecurrenceDate } from '@/hooks/useRecurring'
import { fmtCompact, getAccount, getCategory } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import type { ViewProps } from '@/types'
import { Card, Empty } from './shared'

export function Calendar({ txns, mkey, onEditTx }: ViewProps) {
  const { accounts, categories, currency } = useFinance()
  const expected = txns.filter(tx => tx.recurring)
    .map(tx => ({ tx, next: firstRecurrenceDate(tx) }))
    .filter(item => item.next.startsWith(mkey))
    .sort((a, b) => a.next.localeCompare(b.next))

  return <div className="view">
    <div className="reset-note">
      <Icon name="calendar" size={16} style={{ color: 'var(--accent)' }} />
      <span>Agenda financiera: pagos e ingresos recurrentes esperados para el mes seleccionado.</span>
    </div>
    <Card title="Próximos movimientos" sub={`${expected.length} recurrencia${expected.length === 1 ? '' : 's'} programada${expected.length === 1 ? '' : 's'}`}>
      {expected.length === 0 ? <Empty icon="calendar" title="No hay pagos programados"
        text="Marca un movimiento como recurrente para verlo aquí antes de su próxima ejecución." /> :
        <div className="recovery-list">
          {expected.map(({ tx, next }) => <button className="recovery-item" key={tx.id} onClick={() => onEditTx(tx)}
            style={{ width: '100%', cursor: 'pointer', textAlign: 'left', border: 0 }}>
            <div>
              <b>{tx.note}</b>
              <span>{next} · {getCategory(tx.categoryId, categories)?.name ?? 'Sin categoría'} · {getAccount(tx.accountId, accounts)?.name ?? 'Sin cuenta'}</span>
            </div>
            <strong style={{ color: tx.type === 'expense' ? 'var(--expense)' : 'var(--income)' }}>
              {fmtCompact(tx.amount, currency)}
            </strong>
          </button>)}
        </div>}
    </Card>
  </div>
}
