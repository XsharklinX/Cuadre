import { beforeEach, describe, expect, it } from 'vitest'
import { useFinance } from '@/store/finance'
import type { Transaction } from '@/types'

/**
 * «ESTA SUSCRIPCIÓN LA REVENDO»: el enlace tiene que sobrevivir a una edición.
 *
 * ── POR QUÉ ESTE TEST EXISTE ──────────────────────────────────────────
 * `normalizeTransaction` reconstruye cada movimiento desde una LISTA BLANCA:
 * lo que no se nombra ahí no existe. Ya se perdió así la descripción —el
 * usuario lo vivió como dos fallos distintos— y estuvo a punto de perderse la
 * marca de la foto del recibo.
 *
 * Un campo nuevo pasa el typechecker, pasa el backup y pasa cualquier test de
 * «se guarda bien». Lo que no pasa es volver a abrir el movimiento, cambiarle
 * el monto y encontrarlo entero.
 */

const SUSCRIPCION: Transaction = {
  id: 'tx_netflix', type: 'expense', amount: 750, date: '2026-10-01',
  note: 'Netflix', accountId: 'acc_1', categoryId: 'cat_ocio',
  recurring: 'monthly', recurringNext: '2026-11-01',
  resoldAs: 'svc_netflix',
} as Transaction

function sembrar(tx: Transaction) {
  useFinance.setState({
    accounts: [{ id: 'acc_1', name: 'Banco', short: 'Bk', type: 'debit', color: '#3b82f6', balance: 10_000, openingBalance: 10_000, last4: null }],
    categories: [{ id: 'cat_ocio', name: 'Ocio', type: 'expense', color: '#ff6b8a', budget: 0, icon: 'play' }],
    transactions: [tx],
  })
}

const leer = () => useFinance.getState().transactions[0]

describe('el enlace con el servicio sobrevive', () => {
  beforeEach(() => { sembrar(SUSCRIPCION) })

  it('se guarda al crear la plantilla', () => {
    expect(leer().resoldAs).toBe('svc_netflix')
  })

  it('SIGUE AHÍ despues de editar otra cosa', () => {
    // El caso real: abres Netflix porque te subieron el precio y le cambias
    // el monto. Sin su línea en la lista blanca, el enlace se iría con él.
    useFinance.getState().updateTx('tx_netflix', { amount: 820 })
    expect(leer().amount).toBe(820)
    expect(leer().resoldAs).toBe('svc_netflix')
  })

  it('se puede quitar a propósito', () => {
    // Dejar de revenderla es una acción legítima: `undefined` significa
    // «quítalo», igual que en los demás campos opcionales.
    useFinance.getState().updateTx('tx_netflix', { resoldAs: undefined })
    expect(leer().resoldAs).toBeUndefined()
  })

  it('no se queda una cadena vacía haciéndose pasar por un enlace', () => {
    // Un `resoldAs: ''` apuntaría a un servicio con id «», y la pantalla lo
    // trataría como enlazado mientras no encuentra ningún servicio.
    useFinance.getState().updateTx('tx_netflix', { resoldAs: '' })
    expect(leer().resoldAs).toBeUndefined()
  })

  it('un movimiento que NO es recurrente no lleva enlace', () => {
    /*
     * Solo una plantilla recurrente puede ser «la suscripción que revendes».
     * Una compra suelta con este campo seria un enlace sin sentido que luego
     * nadie limpia.
     */
    sembrar({ ...SUSCRIPCION, recurring: undefined, recurringNext: undefined } as Transaction)
    useFinance.getState().updateTx('tx_netflix', { note: 'Netflix' })
    expect(leer().resoldAs).toBeUndefined()
  })

  it('la ocurrencia generada tampoco lo arrastra', () => {
    // Las ocurrencias no tienen `recurring`: son gastos normales ya pasados.
    sembrar({
      ...SUSCRIPCION, id: 'tx_oct', recurring: undefined,
      recurringNext: undefined, generatedFrom: 'tx_netflix',
    } as Transaction)
    useFinance.getState().updateTx('tx_oct', { amount: 750 })
    expect(leer().resoldAs).toBeUndefined()
    expect(leer().generatedFrom).toBe('tx_netflix')
  })
})
