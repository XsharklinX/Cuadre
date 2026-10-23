import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { remaining } from '@/data/caprices'
import { dateLocale, fmt } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playConfirmSound } from '@/lib/sound'
import { useCaprices } from '@/store/caprices'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { Transaction } from '@/types'
// Las piezas de hoja se comparten con Negocio: son la misma forma (cabecera,
// cuerpo desplazable, acciones abajo) y duplicarlas garantizaria que una de
// las dos acabe distinta.
import { BizSheet } from '../business/shared'

/**
 * PAGAR UN CAPRICHO CON UN MOVIMIENTO DE VERDAD.
 *
 * ── LA MITAD QUE FALTABA ──────────────────────────────────────────────
 * El bote sabía sumar aportes y no había ninguna pantalla para asignarle uno.
 * Escribí la lógica, el almacén y sus pruebas, y nunca cablée esto: el bote
 * solo podía subir.
 *
 * ── POR QUÉ NO HAY UN BOTÓN DE «RECUPERADO» ───────────────────────────
 * Porque entonces «recuperado» sería una opinión. El bote baja cuando baja
 * dinero de verdad, y aquí se elige CUÁL. Si fuera un botón que suma lo que
 * tú digas, esto dejaría de ser una cuenta y pasaría a ser un videojuego
 * pegado encima de tus finanzas.
 *
 * ── QUÉ MOVIMIENTOS SE OFRECEN, Y POR QUÉ ESOS ────────────────────────
 * Dos clases, y las dos son dinero que de verdad compensa un capricho:
 *
 *  · **Transferencias a una cuenta de ahorro.** Mandaste dinero a ahorrar: eso
 *    es exactamente recuperar.
 *  · **Ingresos extra**, los que no vienen de un recurrente. Un trabajo suelto
 *    o un cobro a un cliente. Tu sueldo NO aparece: ese dinero ya estaba
 *    contado y asignarlo sería hacer trampa contigo mismo.
 *
 * Y nunca uno ya asignado a otro bote: el mismo dinero no puede saldar dos
 * caprichos.
 */

/** Cuántos movimientos se ofrecen. Más allá, la lista deja de ayudar. */
const MAX_CANDIDATOS = 25

/** Cuántos días hacia atrás se mira. */
const VENTANA_DIAS = 90

export function PayCapriceSheet({
  capriceId, onClose, onPaid,
}: {
  capriceId: string
  onClose: () => void
  onPaid: (amount: number) => void
}) {
  const t = useT()
  const { transactions, accounts, currency } = useFinance()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const items = useCaprices(s => s.items)
  const pay = useCaprices(s => s.pay)

  const caprice = items.find(c => c.id === capriceId)
  const [elegido, setElegido] = useState<string | null>(null)

  /** Los ids ya asignados a cualquier bote: el mismo dinero no cuenta dos veces. */
  const yaAsignados = useMemo(
    () => new Set(items.flatMap(c => c.payments.map(p => p.txId))),
    [items],
  )

  const ahorroIds = useMemo(
    () => new Set(accounts.filter(a => a.type === 'savings').map(a => a.id)),
    [accounts],
  )

  const candidatos = useMemo(() => {
    const limite = Date.now() - VENTANA_DIAS * 86_400_000
    return transactions
      .filter(tx => {
        if (yaAsignados.has(tx.id)) return false
        const ms = Date.parse(`${tx.date}T00:00:00`)
        if (!Number.isFinite(ms) || ms < limite) return false
        // Una transferencia a ahorro: mandaste dinero a ahorrar.
        if (tx.type === 'transfer') return !!tx.toAccount && ahorroIds.has(tx.toAccount)
        // Un ingreso extra, no el sueldo de cada mes.
        return tx.type === 'income' && !tx.recurring && !tx.generatedFrom
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_CANDIDATOS)
  }, [transactions, yaAsignados, ahorroIds])

  if (!caprice) return null

  const falta = remaining(caprice)
  const tx = candidatos.find(c => c.id === elegido)
  /*
   * Se aplica como mucho lo que FALTA, no el movimiento entero.
   *
   * Si transferiste 5,000 al ahorro y el capricho era de 3,200, se salda con
   * 3,200 y los otros 1,800 quedan libres para otro bote. Aplicar los 5,000
   * dejaría el bote «recuperado de más», que no significa nada, y además
   * gastaría ese movimiento entero en un capricho que no lo necesitaba.
   */
  const aplicar = tx ? Math.min(tx.amount, falta) : 0

  const asignar = () => {
    if (!tx || aplicar <= 0) return
    pay(caprice.id, aplicar, tx.id)
    playConfirmSound()
    onPaid(aplicar)
    onClose()
  }

  const etiqueta = (c: Transaction) =>
    c.type === 'transfer'
      ? `${t('capToSavings')} · ${accounts.find(a => a.id === c.toAccount)?.name ?? ''}`
      : c.note

  return (
    <BizSheet
      title={t('capAssignTitle')}
      onClose={onClose}
      onSave={asignar}
      canSave={!!tx && aplicar > 0}
      saveLabel={t('capAssignAction')}
    >
      <div className="mbizs-hero">
        <small>{t('capRemainingShort')}</small>
        <strong>{fmt(falta, currency, { decimals: moneyDecimals })}</strong>
        <span>{caprice.note || t('capUntitled')}</span>
      </div>

      {candidatos.length === 0 ? (
        <>
          <p className="mbizs-field-hint">{t('capNoCandidates')}</p>
          <p className="mbizs-field-hint">{t('capNoCandidatesHow')}</p>
        </>
      ) : (
        <>
          <p className="mbizs-field-hint">{t('capCandidatesHint')}</p>
          <div className="mcap-cands">
            {candidatos.map(c => (
              <button
                key={c.id}
                type="button"
                className={`mcap-cand${elegido === c.id ? ' on' : ''}`}
                aria-pressed={elegido === c.id}
                onClick={() => setElegido(c.id)}
              >
                <span className="mcap-cand-id">
                  <b>{etiqueta(c)}</b>
                  <small>{new Date(`${c.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</small>
                </span>
                <span className="mcap-cand-amt">{fmt(c.amount, currency, { decimals: moneyDecimals })}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Se dice cuánto se va a aplicar y cuánto sobra, porque casi nunca
          coincide con el movimiento entero. */}
      {tx && (
        <p className="mbizs-calc strong">
          <Icon name="check" size={12} />
          {' '}
          {t('capWillApply').replace('{amount}', fmt(aplicar, currency, { decimals: moneyDecimals }))}
          {tx.amount > aplicar && ` · ${t('capLeftOver').replace('{amount}', fmt(tx.amount - aplicar, currency, { decimals: moneyDecimals }))}`}
        </p>
      )}
    </BizSheet>
  )
}
