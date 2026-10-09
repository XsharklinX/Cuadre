import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactionForm } from '@/modals/TransactionForm'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { Transaction } from '@/types'

/**
 * EDITAR UN MOVIMIENTO NO PUEDE BORRARLE NADA.
 *
 * El formulario de edición copia el movimiento guardado a su estado local, y
 * al guardar manda TODOS esos campos de vuelta. Eso significa que un campo
 * que el efecto de carga se olvide de copiar no se queda «como estaba»: sale
 * vacío hacia el store y BORRA el valor que había.
 *
 * Pasó con la descripción. La rama de transferencias la cargaba —dos veces,
 * por un copy-paste— y la de gastos e ingresos, que es casi todo, no la
 * cargaba nunca. Bastaba abrir un gasto para corregirle el monto y la
 * descripción desaparecía sin decir nada. El usuario lo vio como dos fallos
 * distintos: «se borran al editarlas» y «no se ve la descripción al tocar el
 * movimiento». Era el mismo.
 *
 * Nada lo detectaba: los tipos permiten `description?`, el store acepta
 * `undefined` como «quítala» —que es lo correcto cuando el usuario la borra a
 * propósito— y ningún test editaba un movimiento que tuviera una.
 *
 * Por eso este test no comprueba la descripción sola: comprueba que editar
 * SIN TOCAR NADA devuelve el movimiento intacto. Así cubre también el próximo
 * campo que se añada y se olvide de cargar.
 */

vi.stubGlobal('navigator', { vibrate: vi.fn() })
vi.mock('@/mobile/MobileDatePicker', () => ({ MobileDatePicker: () => null }))
vi.mock('@/mobile/useMobileBackDismiss', () => ({ useMobileBackDismiss: vi.fn() }))
vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))
vi.mock('@/components/ui/DialogProvider', () => ({ useDialogs: () => ({ confirm: vi.fn() }) }))

const GASTO: Transaction = {
  id: 'tx_1', type: 'expense', amount: 800, date: '2026-09-20',
  note: 'Tostadas', accountId: 'acc_cash', categoryId: 'cat_food',
  description: 'Desayuno con Ana, incluia el cafe',
} as Transaction

const TRANSFERENCIA: Transaction = {
  id: 'tx_2', type: 'transfer', amount: 500, date: '2026-09-20',
  note: 'Paso a banco', fromAccount: 'acc_cash', toAccount: 'acc_bank',
  description: 'Para el alquiler',
} as Transaction

function seed(tx: Transaction) {
  useSettings.setState({ language: 'es' })
  useFinance.setState({
    accounts: [
      { id: 'acc_cash', name: 'Efectivo', short: 'Ef', type: 'cash', color: '#f59e0b', balance: 5_000, openingBalance: 5_000, last4: null },
      { id: 'acc_bank', name: 'Banco', short: 'Bk', type: 'debit', color: '#3b82f6', balance: 5_000, openingBalance: 5_000, last4: null },
    ],
    categories: [{ id: 'cat_food', name: 'Comida', type: 'expense', color: '#ff6b8a', budget: 0, icon: 'food' }],
    transactions: [tx],
    currency: 'DOP',
    goals: [],
    goalContributions: [],
  })
}

/** Guarda sin tocar nada, como quien abre para mirar y confirma. */
function guardarSinCambios() {
  const guardar = screen.getAllByRole('button').find(b => /guardar|save/i.test(b.textContent ?? ''))
  expect(guardar, 'no se encontro el boton de guardar').toBeTruthy()
  fireEvent.click(guardar!)
}

describe('editar sin cambiar nada', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('un gasto conserva su descripcion', () => {
    seed(GASTO)
    render(<TransactionForm value={GASTO} mkey="2026-09" onClose={vi.fn()} onDelete={vi.fn()} />)
    guardarSinCambios()

    const guardado = useFinance.getState().transactions.find(t => t.id === 'tx_1')!
    expect(guardado.description).toBe(GASTO.description)
  })

  it('un gasto conserva lo demas: nota, monto, fecha, cuenta y categoria', () => {
    seed(GASTO)
    render(<TransactionForm value={GASTO} mkey="2026-09" onClose={vi.fn()} onDelete={vi.fn()} />)
    guardarSinCambios()

    const g = useFinance.getState().transactions.find(t => t.id === 'tx_1')!
    expect(g.note).toBe(GASTO.note)
    expect(g.amount).toBe(GASTO.amount)
    expect(g.date).toBe(GASTO.date)
    expect(g.accountId).toBe(GASTO.accountId)
    expect(g.categoryId).toBe(GASTO.categoryId)
  })

  /* La transferencia sí la cargaba; se comprueba para que siga haciéndolo. */
  it('una transferencia conserva su descripcion', () => {
    seed(TRANSFERENCIA)
    render(<TransactionForm value={TRANSFERENCIA} mkey="2026-09" onClose={vi.fn()} onDelete={vi.fn()} />)
    guardarSinCambios()

    const guardada = useFinance.getState().transactions.find(t => t.id === 'tx_2')!
    expect(guardada.description).toBe(TRANSFERENCIA.description)
  })

})

/*
 * El otro lado de la moneda, y va al nivel del store porque es ahi donde se
 * decide: borrarla a proposito TIENE que seguir funcionando. Si el arreglo
 * hubiera consistido en conservar siempre la descripcion anterior, el usuario
 * no podria deshacerse de una escrita por error.
 */
describe('la descripcion en el libro', () => {
  it('se guarda al crear un gasto', () => {
    seed(GASTO)
    useFinance.setState({ transactions: [] })
    useFinance.getState().addTx({
      type: 'expense', amount: 100, date: '2026-09-20', note: 'Cafe',
      accountId: 'acc_cash', categoryId: 'cat_food', description: 'Con leche',
    } as never)
    expect(useFinance.getState().transactions[0].description).toBe('Con leche')
  })

  it('vaciarla la quita', () => {
    seed(GASTO)
    useFinance.getState().updateTx('tx_1', { description: undefined })
    expect(useFinance.getState().transactions.find(t => t.id === 'tx_1')!.description).toBeUndefined()
  })

  /* Una descripcion de solo espacios es como no tenerla: guardarla pintaria un
     recuadro vacio en la ficha del movimiento. */
  it('una descripcion en blanco no se guarda', () => {
    seed(GASTO)
    useFinance.getState().updateTx('tx_1', { description: '   ' })
    expect(useFinance.getState().transactions.find(t => t.id === 'tx_1')!.description).toBeUndefined()
  })
})
