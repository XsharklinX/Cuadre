import { describe, expect, it } from 'vitest'
import {
  CARD_NETWORKS, canCreateCash, canDeleteAccountType, canHaveNetwork,
  cashAccountOf, creatableTypes, guessNetwork, networkMeta,
} from './cardNetwork'
import { sanitizeFinanceData } from '@/store/finance'
import { accountBalanceInBase } from './helpers'
import type { Account } from '@/types'

const acc = (over: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Cuenta', short: 'C', type: 'debit',
  color: '#fff', balance: 0, last4: null, ...over,
})

const load = (accounts: Account[]) => sanitizeFinanceData({
  accounts, transactions: [], categories: [], goals: [],
  goalContributions: [], currency: 'DOP',
}).accounts

describe('red de la tarjeta', () => {
  it('reconoce la red por el nombre', () => {
    expect(guessNetwork('Visa Clásica')).toBe('visa')
    expect(guessNetwork('Mastercard Gold')).toBe('mastercard')
    expect(guessNetwork('Master Card Platino')).toBe('mastercard')
    expect(guessNetwork('American Express')).toBe('amex')
  })

  it('no adivina cuando no hay señal clara', () => {
    // Poner la marca equivocada es peor que no poner ninguna: el usuario deja
    // de confiar en lo que lee.
    expect(guessNetwork('Mi tarjeta')).toBeNull()
    expect(guessNetwork('Banco Popular')).toBeNull()
    expect(guessNetwork('')).toBeNull()
  })

  it('no confunde palabras que contienen el nombre', () => {
    // "divisa" contiene "visa"; el límite de palabra lo evita.
    expect(guessNetwork('Cuenta en divisas')).toBeNull()
  })

  it('solo las cuentas con plástico pueden tener red', () => {
    expect(canHaveNetwork('debit')).toBe(true)
    expect(canHaveNetwork('credit')).toBe(true)
    expect(canHaveNetwork('savings')).toBe(true)
    expect(canHaveNetwork('cash')).toBe(false)
  })

  it('cada red tiene nombre y color de marca', () => {
    for (const n of CARD_NETWORKS) {
      expect(networkMeta(n.id)?.name).toBeTruthy()
      expect(n.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('el saneado quita una red puesta sobre efectivo', () => {
    const [out] = load([acc({ type: 'cash', network: 'visa' })])
    expect(out.network).toBeUndefined()
  })

  it('el saneado quita una red desconocida', () => {
    const [out] = load([acc({ network: 'inventada' as never })])
    expect(out.network).toBeUndefined()
  })

  it('el saneado conserva una red válida sobre una tarjeta', () => {
    const [out] = load([acc({ type: 'credit', network: 'mastercard' })])
    expect(out.network).toBe('mastercard')
  })
})

describe('el efectivo es uno solo', () => {
  it('se puede crear si no existe', () => {
    expect(canCreateCash([acc()])).toBe(true)
  })

  it('no se puede crear un segundo', () => {
    // No tienes "dos efectivos": tienes el dinero que cargas encima.
    expect(canCreateCash([acc({ type: 'cash' })])).toBe(false)
  })

  it('deja de ofrecerse como tipo cuando ya existe', () => {
    // Un control que no se puede usar no debe estar activo.
    expect(creatableTypes([acc({ type: 'cash' })])).not.toContain('cash')
    expect(creatableTypes([acc()])).toContain('cash')
  })

  it('al editar el efectivo, su propio tipo sigue disponible', () => {
    const cash = acc({ type: 'cash' })
    expect(creatableTypes([cash], 'cash')).toContain('cash')
  })

  it('el efectivo no se puede borrar', () => {
    expect(canDeleteAccountType(acc({ type: 'cash' }))).toBe(false)
    expect(canDeleteAccountType(acc({ type: 'debit' }))).toBe(true)
  })

  it('lo encuentra en la lista', () => {
    const cash = acc({ id: 'c', type: 'cash' })
    expect(cashAccountOf([acc(), cash])?.id).toBe('c')
    expect(cashAccountOf([acc()])).toBeNull()
  })
})

describe('backup antiguo con varios efectivos', () => {
  const many = [
    acc({ id: 'c1', type: 'cash', name: 'Efectivo', balance: 5_000 }),
    acc({ id: 'c2', type: 'cash', name: 'Alcancía', balance: 3_000 }),
    acc({ id: 'c3', type: 'cash', name: 'Sobre viaje', balance: 1_000 }),
  ]

  it('conserva el primero como efectivo', () => {
    const out = load(many)
    expect(out.filter(a => a.type === 'cash')).toHaveLength(1)
    expect(out.find(a => a.type === 'cash')!.id).toBe('c1')
  })

  it('DEGRADA el resto a ahorro en vez de descartarlos', () => {
    // Descartarlos borraría dinero del libro; fusionarlos lo movería en
    // silencio. Un efectivo guardado aparte es, literalmente, ahorro.
    const out = load(many)
    expect(out).toHaveLength(3)
    expect(out.find(a => a.id === 'c2')!.type).toBe('savings')
    expect(out.find(a => a.id === 'c3')!.type).toBe('savings')
  })

  it('ningún saldo desaparece en la migración', () => {
    const before = many.reduce((s, a) => s + accountBalanceInBase(a, 'DOP'), 0)
    const after = load(many).reduce((s, a) => s + accountBalanceInBase(a, 'DOP'), 0)
    expect(after).toBe(before)
  })

  it('una lista con un solo efectivo no se toca', () => {
    const one = [acc({ id: 'c1', type: 'cash' }), acc({ id: 'd1', type: 'debit' })]
    const out = load(one)
    expect(out.map(a => a.type)).toEqual(['cash', 'debit'])
  })
})
