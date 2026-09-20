import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { accountCurrency } from '@/data/helpers'
import { sanitizeFinanceData } from '@/store/finance'
import { entryInAccountCurrency, getCurrencyMeta } from '@/data/currencies'
import { CURRENCIES } from '@/data/seed'
import type { Account, CurrencyCode } from '@/types'

const acc = (over: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Cuenta', short: 'C', type: 'debit',
  color: '#000', balance: 0, last4: null, ...over,
})

describe('divisa efectiva de una cuenta', () => {
  it('usa la divisa propia de la cuenta cuando la tiene', () => {
    expect(accountCurrency(acc({ currency: 'USD' }), 'DOP')).toBe('USD')
  })

  it('cae a la divisa base solo cuando la cuenta no tiene una propia', () => {
    expect(accountCurrency(acc(), 'DOP')).toBe('DOP')
  })
})

describe('entryInAccountCurrency', () => {
  it('no guarda campos FX cuando se teclea en la divisa de la cuenta', () => {
    const e = entryInAccountCurrency(100, 'DOP', 'DOP')
    expect(e).toEqual({ amount: 100 })
    expect(e.fxRate).toBeUndefined()
  })

  it('convierte a la divisa de la cuenta y recuerda lo que el usuario tecleó', () => {
    const e = entryInAccountCurrency(25, 'USD', 'DOP')
    expect(e.originalAmount).toBe(25)
    expect(e.originalCurrency).toBe('USD')
    expect(e.fxRate).toBeGreaterThan(0)
    // El monto del libro es el convertido, no lo tecleado.
    expect(e.amount).toBeCloseTo(25 * e.fxRate!, 2)
    expect(e.amount).not.toBe(25)
  })

  it('la conversión es reconstruible: monto = original × tasa congelada', () => {
    for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
      const e = entryInAccountCurrency(37.5, code, 'DOP')
      if (e.fxRate === undefined) continue
      const decimals = CURRENCIES.DOP.decimals
      expect(e.amount).toBeCloseTo(
        Math.round(e.originalAmount! * e.fxRate * 10 ** decimals) / 10 ** decimals,
        decimals,
      )
    }
  })

  it('redondea al número de decimales de la divisa de la cuenta', () => {
    const e = entryInAccountCurrency(1, 'USD', 'DOP')
    const decimals = CURRENCIES.DOP.decimals
    const shifted = e.amount * 10 ** decimals
    expect(Math.abs(shifted - Math.round(shifted))).toBeLessThan(1e-9)
  })

  it('toda divisa soportada tiene símbolo y bandera para el selector', () => {
    for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
      const meta = getCurrencyMeta(code)
      expect(meta.code).toBe(code)
      expect(meta.flag.length).toBeGreaterThan(0)
      expect(meta.symbol.length).toBeGreaterThan(0)
    }
  })
})

/**
 * Guardia de regresión del bug de Fase 0: formatear el saldo de una cuenta con
 * la divisa BASE de la app en vez de la suya propia hacía que una cuenta en US$
 * se mostrara como "RD$ 1,200". Pasó desapercibido en 13 sitios, así que la
 * defensa no es un test de comportamiento sino un escaneo del propio código.
 */
describe('regresión: saldo de cuenta formateado con la divisa base', () => {
  const SRC = join(__dirname, '..')
  const sep = process.platform === 'win32' ? '\\' : '/'
  // Solo receptores que son CUENTAS (`a`, `account`, `activeAccount`,
  // `fromAccountObj`…). Un `point.balance` de proyección o un `debt.balance`
  // ya vienen en divisa base y formatearlos con `currency` es correcto.
  const BAD = /\b(?:fmt|fmtCompact|fmtVal)\(\s*(?:a|acc|(?:\w*[Aa]ccount\w*))\??\.(?:balance|limit)\b[^,)]*,\s*currency\s*\)/

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full)
      return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
    })
  }

  it('ningún archivo formatea .balance/.limit con la divisa base', () => {
    const offenders = walk(SRC).flatMap(file =>
      readFileSync(file, 'utf8').split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => BAD.test(line))
        .map(({ n }) => `${file.slice(SRC.length + 1).split(sep).join('/')}:${n}`))

    expect(offenders, `Usá accountCurrency(cuenta, currency):\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('persistencia del trío FX', () => {
  const base = {
    accounts: [{ id: 'c1', name: 'Tarjeta', short: 'T', type: 'credit', color: '#fff', balance: -100, last4: '1', limit: 5000 }],
    categories: [{ id: 'k1', name: 'Comida', type: 'expense', color: '#fff', budget: 0, icon: 'food' }],
    goals: [], goalContributions: [], currency: 'DOP',
  }
  const tx = (over: Record<string, unknown>) => ({
    id: 't1', type: 'expense', amount: 1540, date: '2026-09-19', note: 'Compra',
    accountId: 'c1', categoryId: 'k1', ...over,
  })
  const sanitize = (t: Record<string, unknown>) =>
    sanitizeFinanceData({ ...base, transactions: [t] }).transactions[0]

  it('conserva los tres campos cuando son coherentes', () => {
    const out = sanitize(tx({ originalAmount: 25, originalCurrency: 'USD', fxRate: 61.6 }))
    expect(out.originalAmount).toBe(25)
    expect(out.originalCurrency).toBe('USD')
    expect(out.fxRate).toBe(61.6)
  })

  it('descarta el trío entero si falta la tasa', () => {
    const out = sanitize(tx({ originalAmount: 25, originalCurrency: 'USD' }))
    expect(out.originalAmount).toBeUndefined()
    expect(out.originalCurrency).toBeUndefined()
  })

  it('descarta el trío si la tasa es 0 o negativa (backup manipulado)', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = sanitize(tx({ originalAmount: 25, originalCurrency: 'USD', fxRate: bad }))
      expect(out.fxRate, `fxRate=${bad}`).toBeUndefined()
      expect(out.originalAmount).toBeUndefined()
    }
  })

  it('descarta el trío si la divisa no es una soportada', () => {
    const out = sanitize(tx({ originalAmount: 25, originalCurrency: 'XYZ', fxRate: 61.6 }))
    expect(out.originalCurrency).toBeUndefined()
  })

  it('nunca toca el amount del libro: la conversión no se recalcula al cargar', () => {
    const out = sanitize(tx({ originalAmount: 25, originalCurrency: 'USD', fxRate: 61.6 }))
    expect(out.amount).toBe(1540)
  })
})
