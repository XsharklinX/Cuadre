import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { setAsideAmount } from '@/data/business'
import { outstanding } from '@/data/clients'
import { convertCurrency } from '@/data/currencies'
import { fmt, localToday } from '@/data/helpers'
import { newId } from '@/data/seed'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useJuice } from '@/store/juice'
import { BizSheet, Field } from './shared'

/**
 * «ME PAGÓ»: LA ÚNICA PUERTA ENTRE LO QUE TE DEBEN Y LO QUE TIENES.
 *
 * Todo el módulo de cobros vive aparte del libro a propósito: un cobro esperado
 * es una expectativa con fecha, no dinero. Este es el único sitio donde las dos
 * mitades se tocan, y es deliberado — una sola puerta es una sola cosa que
 * puede fallar.
 *
 * ── EL ORDEN IMPORTA ──────────────────────────────────────────────────
 * Primero se crea el MOVIMIENTO y solo si sale bien se marca el cobro. Al
 * revés, un fallo al guardar dejaría el cobro marcado como pagado sin dinero
 * detrás: el libro diría una cosa y la lista de clientes otra, y nadie sabría
 * cuál creer.
 *
 * El `txId` que se guarda es la prueba de que el dinero existe.
 */
export function CollectSheet({
  chargeId, onClose, onCollected,
}: {
  chargeId: string
  onClose: () => void
  onCollected: () => void
}) {
  const t = useT()
  const { accounts, currency, addTx } = useFinance()
  const moneyDecimals = useMoneyDecimals()
  const markLanded = useJuice(s => s.markLanded)
  const { charges, clients, businesses, markPaid, updateCharge, waiveCharge, deleteCharge } = useBusiness()

  const charge = charges.find(c => c.id === chargeId)
  const client = charge ? clients.find(c => c.id === charge.clientId) : null
  const negocio = client?.businessId ? businesses.find(b => b.id === client.businessId) : null

  const falta = charge ? outstanding(charge) : 0
  const cur = client?.currency ?? currency
  const [amount, setAmount] = useState(String(falta || ''))
  const [date, setDate] = useState(localToday())
  /*
   * Si la cuenta del cliente ya no existe, se ofrece la primera usable en vez
   * de dejar el selector vacio: asi cobrar sigue siendo posible de un toque.
   */
  const cuentaValida = client?.accountId && accounts.some(a => a.id === client.accountId)
  const [accountId, setAccountId] = useState(
    cuentaValida ? (client?.accountId ?? '') : (accounts.find(a => a.type !== 'credit')?.id ?? ''),
  )
  const [guardando, setGuardando] = useState(false)
  /*
   * La nota de ESTE cobro, no del cliente.
   *
   * «Este mes le hice ademas el logo», «pago en efectivo», «le fie hasta el
   * viernes». Las del cliente son permanentes y estas son de una vez: meterlas
   * en su ficha convertiria su perfil en un diario.
   */
  const [note, setNote] = useState(charge?.note ?? '')
  /*
   * APARTAR DE VERDAD, no solo decirlo.
   *
   * Viene marcado cuando el negocio tiene cuenta de destino: quien se molesto
   * en configurarla lo hizo para que pasara, no para que se lo recordaran.
   * Se puede desmarcar en el momento, porque hay cobros que no se apartan.
   */
  const [mover, setMover] = useState(true)

  if (!charge || !client) return null

  const monto = Number(amount) || 0
  const cuenta = accounts.find(a => a.id === accountId)
  const canSave = monto > 0 && !!cuenta && !!client.categoryId && !guardando
  const apartar = negocio ? setAsideAmount(negocio, monto) : 0
  /*
   * Solo se mueve si la cuenta de destino EXISTE y no es la misma de la que
   * entra: una transferencia de una cuenta a si misma no mueve nada y deja
   * dos apuntes que no cuadran con nada.
   */
  const cuentaApartar = negocio?.setAsideAccountId
    ? accounts.find(a => a.id === negocio.setAsideAccountId && a.id !== accountId)
    : undefined
  const apartarAhora = mover && cuentaApartar ? apartar : 0

  const cobrar = () => {
    if (!canSave || !cuenta) return
    setGuardando(true)
    try {
      /*
       * El movimiento se guarda en la divisa de la CUENTA, que es la regla del
       * libro entero. Si el cliente paga en otra, se convierte y se deja la
       * memoria de lo que pagó de verdad (`originalAmount`/`fxRate`), igual que
       * hace el formulario normal.
       */
      const cuentaCur = cuenta.currency ?? currency
      const enCuenta = cur === cuentaCur
        ? monto
        : Math.round(convertCurrency(monto, cur, cuentaCur) * 100) / 100
      const tasa = cur === cuentaCur ? undefined : Math.round((enCuenta / monto) * 10_000) / 10_000

      const txId = newId()
      addTx({
        id: txId,
        type: 'income',
        date,
        amount: enCuenta,
        note: `${client.name}${client.concept ? ` · ${client.concept}` : ''}`,
        categoryId: client.categoryId,
        accountId: cuenta.id,
        ...(tasa ? { originalAmount: monto, originalCurrency: cur, fxRate: tasa } : {}),
      })

      // La nota se guarda ANTES de marcar: `markPaid` cierra el cobro y a
      // partir de ahi la hoja se desmonta, asi que escribirla despues la
      // perderia en el camino.
      const limpia = note.trim()
      if (limpia !== (charge.note ?? '')) updateCharge(charge.id, { note: limpia || undefined })

      // Solo DESPUÉS de que el movimiento existe se marca el cobro, y con su id.
      markPaid(charge.id, monto, txId)

      /*
       * LA TRANSFERENCIA DE LO APARTADO, al final y aparte.
       *
       * Va DESPUÉS del ingreso y del marcado a propósito: el dinero llego, y
       * eso es cierto aunque mover una parte falle. Al reves, un fallo aqui
       * dejaria el cobro sin registrar por no haber podido guardar un apunte
       * secundario.
       *
       * Es una TRANSFERENCIA, no un gasto: el dinero no sale de tu patrimonio,
       * cambia de bolsillo. Como gasto, apartar para impuestos apareceria en
       * tus informes como si te lo hubieras gastado.
       */
      if (apartarAhora > 0 && cuentaApartar) {
        try {
          addTx({
            id: newId(),
            type: 'transfer',
            date,
            amount: apartarAhora,
            note: t('bizSetAsideNote').replace('{name}', negocio?.name ?? client.name),
            fromAccount: cuenta.id,
            toAccount: cuentaApartar.id,
          })
        } catch {
          // El cobro ya esta guardado y es lo que importa. Lo apartado se
          // puede mover a mano; decirlo es mejor que deshacer el cobro.
          toast(t('bizSetAsideFailed'), { icon: 'alert' })
        }
      }
      markLanded(txId)
      onCollected()
      onClose()
    } catch (error) {
      setGuardando(false)
      toast(error instanceof Error ? error.message : t('couldNotSave'), { icon: 'alert' })
    }
  }

  return (
    <BizSheet
      title={client.name}
      onClose={onClose}
      onSave={cobrar}
      canSave={canSave}
      saveLabel={t('bizMarkPaid')}
    >
      <div className="mbizs-hero">
        <small>{t('bizOwes')}</small>
        <strong>{fmt(falta, cur, { decimals: moneyDecimals })}</strong>
        <span>
          {client.concept || t('bizCharge')}
          {' · '}
          {t('bizDueOn').replace('{date}', charge.dueDate)}
        </span>
      </div>

      <Field label={t('bizChargeNote')} hint={t('bizChargeNoteHint')}>
        <input
          className="mbizs-input"
          type="text"
          value={note}
          maxLength={280}
          onChange={e => setNote(e.target.value)}
        />
      </Field>

      <Field label={t('bizAmountReceived')} hint={t('bizPartialHint')}>
        <input
          className="mbizs-input"
          type="number"
          inputMode="decimal"
          value={amount}
          autoFocus
          onChange={e => setAmount(e.target.value)}
        />
      </Field>

      <Field label={t('date')}>
        <input
          className="mbizs-input mbizs-input-sm"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </Field>

      <Field label={t('bizDepositedIn')}>
        <select className="mbizs-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">{t('selectAccount')}</option>
          {accounts.filter(a => a.type !== 'credit').map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </Field>

      {/* Si el cliente paga en otra divisa que la cuenta, se dice en cuánto
          entra de verdad: el libro guarda la divisa de la cuenta, siempre. */}
      {cuenta && cur !== (cuenta.currency ?? currency) && monto > 0 && (
        <p className="mbizs-calc">
          {t('bizEntersAsAmount').replace('{amount}', fmt(
            Math.round(convertCurrency(monto, cur, cuenta.currency ?? currency) * 100) / 100,
            cuenta.currency ?? currency,
            { decimals: moneyDecimals },
          ))}
        </p>
      )}

      {/* Apartar lo que no es tuyo del todo: impuestos, reinversión, el coste
          del servicio. Lo que queda es lo que de verdad puedes gastar. */}
      {apartar > 0 && !cuentaApartar && (
        <p className="mbizs-calc">
          <Icon name="piggy" size={12} />
          {' '}
          {t('bizSetAsideHint')
            .replace('{amount}', fmt(apartar, cur, { decimals: moneyDecimals }))
            .replace('{pct}', String(negocio?.setAsidePct ?? 0))}
        </p>
      )}

      {/* Con cuenta de destino deja de ser un consejo y pasa a ser una
          casilla: lo que diga aqui es lo que va a pasar. */}
      {apartar > 0 && cuentaApartar && (
        <button
          type="button"
          className={`mbizs-toggle${mover ? ' on' : ''}`}
          onClick={() => setMover(v => !v)}
        >
          <span>
            <b>
              {t('bizSetAsideMove')
                .replace('{amount}', fmt(apartar, cur, { decimals: moneyDecimals }))
                .replace('{account}', cuentaApartar.name)}
            </b>
            <small>{t('bizSetAsideMoveHint').replace('{pct}', String(negocio?.setAsidePct ?? 0))}</small>
          </span>
          <i />
        </button>
      )}

      {/*
        LA CUENTA BORRADA: EL CALLEJON SIN SALIDA.
        Si borras la cuenta donde depositaba un cliente, el boton de cobrar se
        quedaba apagado sin decir por que. El peor tipo de fallo: la app no
        esta rota, pero se comporta como si lo estuviera. Se dice, y la salida
        esta justo arriba — el selector de cuenta.
      */}
      {(!client.accountId || !accounts.some(a => a.id === client.accountId)) && (
        <p className="mbizs-calc warn">{t('bizNoAccountWarn')}</p>
      )}

      {!client.categoryId && (
        <p className="mbizs-calc warn">{t('bizNoCategoryWarn')}</p>
      )}

      <div className="mbizs-alt">
        {/* Dar por perdido: deja de contar como atrasado sin fingir que se
            cobró. Un cobro que nunca va a llegar ensuciando la lista para
            siempre es peor que reconocerlo. */}
        <button onClick={() => { waiveCharge(charge.id, !charge.waived); onClose() }}>
          {charge.waived ? t('bizUnwaive') : t('bizWaive')}
        </button>
        <button onClick={() => { deleteCharge(charge.id); onClose() }}>
          {t('bizDeleteCharge')}
        </button>
      </div>
    </BizSheet>
  )
}
