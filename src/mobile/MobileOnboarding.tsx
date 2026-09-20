import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { ACCENT_COLORS } from '@/constants'
import { cashAccountOf, guessNetwork } from '@/data/cardNetwork'
import { findBank, guessBank } from '@/data/banks'
import { useFinance } from '@/store/finance'
import { useT } from '@/i18n'
import { MobileAmountSheet } from './MobileAmountSheet'
import { MobileBankPicker } from './MobileBankPicker'
import type { Account, IconName } from '@/types'

type AccountType = Account['type']

/**
 * ONBOARDING.
 *
 * Antes era UNA pantalla que creaba UNA cuenta y te dejaba en una app vacía.
 * Dos problemas:
 *
 * 1. Ofrecía crear "Efectivo" cuando la app YA crea uno al instalarse. El
 *    usuario terminaba con dos, y con la regla de efectivo único el segundo
 *    se degradaba a Ahorro — veía su cuenta cambiar de tipo sola.
 * 2. Terminabas con una cuenta y cero movimientos. Quien acaba el onboarding
 *    con la app vacía no vuelve: no hay nada que mirar.
 *
 * Ahora no CREA el efectivo, pregunta cuánto tiene el que ya existe, y deja
 * al usuario con sus saldos reales cargados. El objetivo no es explicar la
 * app: es que termine con datos suyos dentro.
 */

type Step = 'cash' | 'bank' | 'done'

const CARD_TYPES: Array<{ id: Exclude<AccountType, 'cash'>; labelKey: 'debit' | 'savings' | 'credit'; icon: IconName }> = [
  { id: 'debit',   labelKey: 'debit',   icon: 'cards' },
  { id: 'savings', labelKey: 'savings', icon: 'piggy' },
  { id: 'credit',  labelKey: 'credit',  icon: 'cards' },
]

export function MobileOnboarding({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const t = useT()
  const accounts = useFinance(s => s.accounts)
  const addAccount = useFinance(s => s.addAccount)
  const updateAccount = useFinance(s => s.updateAccount)
  const currency = useFinance(s => s.currency)

  const [step, setStep] = useState<Step>('cash')
  const [cashAmount, setCashAmount] = useState(0)
  const [cashSheet, setCashSheet] = useState(false)

  // Cuenta bancaria / tarjeta opcional
  const [type, setType] = useState<Exclude<AccountType, 'cash'>>('debit')
  const [name, setName] = useState('')
  const [balance, setBalance] = useState(0)
  const [balanceSheet, setBalanceSheet] = useState(false)
  const [bankId, setBankId] = useState<string | undefined>()
  const [bankSheet, setBankSheet] = useState(false)

  const cash = cashAccountOf(accounts)

  const saveCash = () => {
    // Se AJUSTA el efectivo existente, no se crea otro.
    if (cash) updateAccount(cash.id, { balance: cashAmount, openingBalance: cashAmount })
    setStep('bank')
  }

  const saveBank = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      addAccount({
        type,
        name: trimmed,
        short: trimmed.slice(0, 4).toUpperCase(),
        color: ACCENT_COLORS[type === 'credit' ? 3 : type === 'savings' ? 1 : 0] ?? ACCENT_COLORS[0],
        // Una tarjeta de crédito arranca en deuda (negativo), una cuenta en
        // positivo. Teclear un número y que signifique lo contrario de lo que
        // esperas es de los errores más desconcertantes que hay.
        balance: type === 'credit' ? -Math.abs(balance) : balance,
        last4: null,
        ...(bankId ? { bankId } : {}),
        ...(guessNetwork(trimmed) ? { network: guessNetwork(trimmed)! } : {}),
      })
      setStep('done')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('couldNotSave'), { icon: 'alert' })
    }
  }

  return (
    <div className="mob-onboard">
      <div className="mob-onboard-step">

        {/* ── Paso 1: el efectivo que ya existe ───────────── */}
        {step === 'cash' && (
          <>
            <div className="mob-onboard-header">
              <span className="mob-onboard-mark"><Icon name="shark" size={30} /></span>
              <h2>{t('onboardCashTitle')}</h2>
              <p>{t('onboardCashHint')}</p>
            </div>

            <button className="mob-onboard-amount" onClick={() => setCashSheet(true)}>
              <span className="mob-onboard-amount-label">{t('cash')}</span>
              <span className="mob-onboard-amount-value">
                {cashAmount > 0
                  ? cashAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '0.00'}
              </span>
              <span className="mob-onboard-amount-tap">{t('tapToEditLabel')}</span>
            </button>

            <div className="mob-onboard-actions">
              <button className="mob-onboard-primary" onClick={saveCash}>{t('continueLabel')}</button>
              {onBack && (
                <button className="mob-onboard-ghost" onClick={onBack}>{t('back')}</button>
              )}
            </div>
          </>
        )}

        {/* ── Paso 2: banco o tarjeta (opcional) ──────────── */}
        {step === 'bank' && (
          <>
            <div className="mob-onboard-header">
              <h2>{t('onboardBankTitle')}</h2>
              <p>{t('onboardBankHint')}</p>
            </div>

            <div className="mob-onboard-types mob-onboard-types-compact">
              {CARD_TYPES.map(opt => (
                <button
                  key={opt.id}
                  className={`mob-onboard-type${type === opt.id ? ' on' : ''}`}
                  onClick={() => setType(opt.id)}
                >
                  <Icon name={opt.icon} size={20} />
                  <span>{t(opt.labelKey)}</span>
                </button>
              ))}
            </div>

            <input
              id="onboard-name"
              className="mob-onboard-input"
              value={name}
              onChange={e => {
                setName(e.target.value)
                // El banco se propone al escribir, igual que en el editor.
                if (!bankId) {
                  const guessed = guessBank(e.target.value)
                  if (guessed) setBankId(guessed.id)
                }
              }}
              placeholder={t('onboardNamePlaceholder')}
              aria-label={t('onboardNamePlaceholder')}
              autoComplete="off"
            />

            <button className="mob-onboard-row" onClick={() => setBankSheet(true)}>
              <Icon name="landmark" size={16} />
              <span>{t('bankLabel')}</span>
              <b>{bankId ? (findBank(bankId)?.name ?? bankId) : t('notSetLabel')}</b>
            </button>

            <button className="mob-onboard-row" onClick={() => setBalanceSheet(true)}>
              <Icon name="coins" size={16} />
              <span>{type === 'credit' ? t('owedLabel') : t('balance')}</span>
              <b>{balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
            </button>

            <div className="mob-onboard-actions">
              <button className="mob-onboard-primary" disabled={!name.trim()} onClick={saveBank}>
                {t('continueLabel')}
              </button>
              {/* Saltar es una salida legítima, no un castigo: quien solo
                  maneja efectivo no debería tener que inventar un banco. */}
              <button className="mob-onboard-ghost" onClick={() => setStep('done')}>
                {t('skipForNow')}
              </button>
            </div>
          </>
        )}

        {/* ── Paso 3: listo ───────────────────────────────── */}
        {step === 'done' && (
          <>
            <div className="mob-onboard-header">
              <span className="mob-onboard-mark ok"><Icon name="check" size={30} /></span>
              <h2>{t('onboardDoneTitle')}</h2>
              <p>{t('onboardDoneHint')}</p>
            </div>

            <div className="mob-onboard-summary">
              {accounts.map(a => (
                <div key={a.id} className="mob-onboard-summary-row">
                  <span className="mob-onboard-summary-dot" style={{ background: a.color }} />
                  <span>{a.name}</span>
                  <b>{a.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                </div>
              ))}
            </div>

            <div className="mob-onboard-actions">
              <button className="mob-onboard-primary" onClick={onDone}>{t('onboardStartLabel')}</button>
            </div>
          </>
        )}
      </div>

      {cashSheet && (
        <MobileAmountSheet
          title={t('onboardCashTitle')}
          value={cashAmount}
          currency={currency}
          onDone={v => { setCashAmount(v); setCashSheet(false) }}
          onClose={() => setCashSheet(false)}
        />
      )}

      {balanceSheet && (
        <MobileAmountSheet
          title={type === 'credit' ? t('owedLabel') : t('balance')}
          value={balance}
          currency={currency}
          onDone={v => { setBalance(v); setBalanceSheet(false) }}
          onClose={() => setBalanceSheet(false)}
        />
      )}

      {bankSheet && (
        <MobileBankPicker
          value={bankId}
          onPick={id => { setBankId(id); setBankSheet(false) }}
          onClose={() => setBankSheet(false)}
        />
      )}
    </div>
  )
}
