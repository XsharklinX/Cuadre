import { useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { BANKS, searchBanks, type Bank } from '@/data/banks'
import { hasFeeProfile } from '@/data/bankFees'
import { useT } from '@/i18n'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/**
 * SELECTOR DE BANCO con buscador.
 *
 * Se elige de la lista, nunca se escribe. Con texto libre, "Banreservas",
 * "banreservas" y "Banco de Reservas" son tres bancos distintos para la app:
 * el id no coincide y las comisiones automáticas dejan de aplicarse. El
 * usuario ve un campo relleno y un comportamiento que no ocurre — el peor tipo
 * de fallo, porque no se nota.
 *
 * Con ~60 entidades, el buscador no es un lujo: sin él, encontrar una
 * asociación de ahorros exige recorrer toda la lista.
 */
export function MobileBankPicker({
  value,
  onPick,
  onClose,
}: {
  value?: string
  onPick: (bankId: string | undefined) => void
  onClose: () => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const results = useMemo(() => searchBanks(query), [query])

  /**
   * Agrupado por país, con RD primero: la app se usa en República Dominicana
   * y buscar el propio banco no debería exigir scroll. Al buscar se deja
   * plano — cuando ya filtraste, los encabezados estorban.
   */
  const groups = useMemo(() => {
    if (query.trim()) return [{ key: 'all' as const, items: results }]
    return [
      { key: 'do' as const, items: results.filter(b => b.country === 'do') },
      { key: 'intl' as const, items: results.filter(b => b.country === 'intl') },
    ].filter(g => g.items.length > 0)
  }, [results, query])

  const row = (bank: Bank) => (
    <button
      key={bank.id}
      className={`mbank-row${value === bank.id ? ' on' : ''}`}
      onClick={() => onPick(bank.id)}
    >
      <span className="mbank-initial" aria-hidden="true">{bank.name.charAt(0)}</span>
      <span className="mbank-info">
        <strong>{bank.name}</strong>
        {/* Se dice con franqueza si de este banco conocemos el tarifario.
            Prometer comisiones automáticas donde no hay datos sería peor que
            no ofrecerlas. */}
        <small>{hasFeeProfile(bank.id) ? t('bankHasFees') : t('bankNoFees')}</small>
      </span>
      {value === bank.id && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
    </button>
  )

  return (
    <SheetPortal>
      <div
        ref={dialogRef}
        className="mobile-detail-sheet"
        style={{ zIndex: 430 }}
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <section className="mbank-sheet" onClick={e => e.stopPropagation()}>
          <header className="mbank-header">
            <span>{t('bankLabel')}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>

          <div className="mbank-search">
            <Icon name="search" size={16} />
            <input
              id="mbank-search"
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('searchBankPlaceholder')}
              aria-label={t('searchBankPlaceholder')}
              autoComplete="off"
            />
            {query && (
              <button className="mbank-clear" aria-label={t('clearLabel')} onClick={() => { setQuery(''); inputRef.current?.focus() }}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <div className="mbank-list">
            <button className={`mbank-row${!value ? ' on' : ''}`} onClick={() => onPick(undefined)}>
              <span className="mbank-initial none" aria-hidden="true"><Icon name="close" size={14} /></span>
              <span className="mbank-info">
                <strong>{t('noneLabel')}</strong>
                <small>{t('bankNoneHint')}</small>
              </span>
              {!value && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
            </button>

            {groups.map(group => (
              <div key={group.key} className="mbank-group">
                {group.key !== 'all' && (
                  <p className="mbank-group-title">
                    {group.key === 'do' ? t('banksInDR') : t('banksIntl')}
                  </p>
                )}
                {group.items.map(row)}
              </div>
            ))}

            {results.length === 0 && (
              <p className="mbank-empty">
                {t('noBankFound').replace('{q}', query.trim())}
              </p>
            )}
          </div>

          <p className="mbank-count">{t('bankCount').replace('{n}', String(BANKS.length))}</p>
        </section>
      </div>
    </SheetPortal>
  )
}
