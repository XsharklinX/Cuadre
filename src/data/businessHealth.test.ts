import { describe, expect, it } from 'vitest'
import {
  AUTO_FIXABLE, BUSINESS_ISSUE_KEY, businessHealth, isAutoFixable,
  type BusinessHealthInput, type BusinessIssueKind,
} from './businessHealth'
import type { Charge, Client } from './clients'
import type { Business, Service } from './business'
import type { Caprice } from './caprices'
import type { Account, Category, Transaction } from '@/types'

const CUENTA: Account = {
  id: 'a1', name: 'Popular', short: 'Pop', type: 'debit', color: '#3b82f6',
  balance: 0, openingBalance: 0, last4: null,
}
const CAT: Category = {
  id: 'cat1', name: 'Cobros', type: 'income', color: '#35d0a2', budget: 0, icon: 'wallet',
}
const NEGOCIO: Business = {
  id: 'b1', name: 'Streaming', color: '#35d0a2', icon: 'play',
  incomeCategoryIds: ['cat1'], expenseCategoryIds: ['cat2'], createdAt: 0,
}

function tx(id: string): Transaction {
  return { id, type: 'income', amount: 250, date: '2026-10-05', note: 'x', categoryId: 'cat1', accountId: 'a1' } as Transaction
}

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: 'cli1', name: 'Juan', concept: 'Netflix', amount: 250, cycle: 'monthly', dueDay: 5,
    accountId: 'a1', categoryId: 'cat1', active: true, createdAt: 0, ...over,
  }
}

function cobro(over: Partial<Charge> = {}): Charge {
  return { id: 'chg1', clientId: 'cli1', dueDate: '2026-10-05', amount: 250, paid: 0, txIds: [], paidAt: 0, ...over }
}

function bote(over: Partial<Caprice> = {}): Caprice {
  return { id: 'cap1', txId: 'tx_gasto', amount: 3_200, note: 'X', createdAt: 0, payments: [], ...over }
}

function entrada(over: Partial<BusinessHealthInput> = {}): BusinessHealthInput {
  return {
    clients: [], businesses: [], services: [], charges: [], caprices: [],
    transactions: [], accounts: [CUENTA], categories: [CAT], ...over,
  }
}

/** Los tipos de problema encontrados, para afirmar sobre ellos. */
function kinds(input: BusinessHealthInput): BusinessIssueKind[] {
  return businessHealth(input).issues.map(i => i.kind)
}

describe('businessHealth · un libro sano', () => {
  it('sin datos de negocio no hay nada que avisar', () => {
    const r = businessHealth(entrada())
    expect(r.issues).toEqual([])
    expect(r).toMatchObject({ clients: 0, charges: 0, businesses: 0, caprices: 0, outstanding: 0 })
  })

  it('con todo en su sitio tampoco', () => {
    const r = businessHealth(entrada({
      clients: [cliente()],
      businesses: [NEGOCIO],
      charges: [cobro({ paid: 250, txIds: ['t1'], paidAt: 1 })],
      caprices: [bote({ txId: 't2' })],
      transactions: [tx('t1'), tx('t2')],
    }))
    expect(r.issues).toEqual([])
  })

  it('cuenta lo que falta por cobrar', () => {
    const r = businessHealth(entrada({
      clients: [cliente()],
      charges: [cobro({ amount: 250 }), cobro({ id: 'chg2', amount: 100, paid: 40 })],
    }))
    expect(r.outstanding).toBe(310)
  })

  it('lo dado por perdido no cuenta como pendiente', () => {
    const r = businessHealth(entrada({
      clients: [cliente()],
      charges: [cobro({ amount: 9_999, waived: true })],
    }))
    expect(r.outstanding).toBe(0)
  })
})

describe('businessHealth · EL CASO QUE MOTIVO esta pantalla', () => {
  it('caza un cobro que dice estar pagado sin movimiento detras', () => {
    // Salud de datos diria «todo correcto» mientras el libro y la lista de
    // clientes se contradicen.
    const r = businessHealth(entrada({
      clients: [cliente()],
      charges: [cobro({ paid: 250, txIds: ['t_borrado'], paidAt: 1 })],
      transactions: [],
    }))
    expect(r.issues).toEqual([{ kind: 'charge-no-tx', ids: ['chg1'] }])
  })

  it('un cobro SIN pagos no es un problema: nunca prometio nada', () => {
    const r = businessHealth(entrada({ clients: [cliente()], charges: [cobro()] }))
    expect(kinds(entrada({ clients: [cliente()], charges: [cobro()] }))).not.toContain('charge-no-tx')
    expect(r.issues).toEqual([])
  })
})

describe('businessHealth · clientes que no se pueden cobrar', () => {
  it('caza al cliente cuya cuenta se borro', () => {
    // El boton de cobrar se quedaba apagado sin decir por que.
    expect(kinds(entrada({ clients: [cliente({ accountId: 'borrada' })] })))
      .toContain('client-no-account')
  })

  it('caza al cliente sin categoria', () => {
    expect(kinds(entrada({ clients: [cliente({ categoryId: 'borrada' })] })))
      .toContain('client-no-category')
  })

  it('un cliente INACTIVO no se avisa: ya no se le cobra', () => {
    expect(kinds(entrada({ clients: [cliente({ accountId: 'borrada', active: false })] })))
      .toEqual([])
  })

  it('un cliente sin cuenta asignada todavia tambien se avisa', () => {
    expect(kinds(entrada({ clients: [cliente({ accountId: '' })] })))
      .toContain('client-no-account')
  })
})

describe('businessHealth · lo demas', () => {
  it('caza el cobro sin cliente', () => {
    expect(kinds(entrada({ charges: [cobro()] }))).toContain('charge-no-client')
  })

  it('caza el capricho cuyo gasto ya no esta', () => {
    expect(kinds(entrada({ caprices: [bote()] }))).toContain('caprice-no-tx')
  })

  it('caza el aporte cuyo movimiento ya no esta, con el gasto vivo', () => {
    const k = kinds(entrada({
      caprices: [bote({ txId: 't1', payments: [{ txId: 't_muerto', amount: 500, at: 1 }] })],
      transactions: [tx('t1')],
    }))
    expect(k).toContain('caprice-payment-no-tx')
    expect(k).not.toContain('caprice-no-tx')
  })

  it('caza el servicio cuyo negocio desaparecio', () => {
    const svc: Service = {
      id: 's1', businessId: 'fantasma', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0,
    }
    expect(kinds(entrada({ services: [svc] }))).toContain('service-no-business')
  })

  it('avisa del negocio sin categorias: su ganancia sera cero para siempre', () => {
    const vacio: Business = { ...NEGOCIO, incomeCategoryIds: [], expenseCategoryIds: [] }
    expect(kinds(entrada({ businesses: [vacio] }))).toContain('business-no-categories')
  })

  it('un negocio con solo categorias de gasto NO se avisa: es legitimo', () => {
    // Un negocio en el que todavia solo has invertido y no has cobrado nada.
    const soloGastos: Business = { ...NEGOCIO, incomeCategoryIds: [] }
    expect(kinds(entrada({ businesses: [soloGastos] }))).not.toContain('business-no-categories')
  })

  it('devuelve los ids, no solo un recuento', () => {
    // Detectar sin poder arreglar solo sirve para preocupar.
    const r = businessHealth(entrada({
      clients: [cliente({ id: 'cli1', accountId: 'x' }), cliente({ id: 'cli2', accountId: 'y' })],
    }))
    const issue = r.issues.find(i => i.kind === 'client-no-account')!
    expect(issue.ids).toEqual(['cli1', 'cli2'])
  })
})

describe('qué se puede arreglar solo', () => {
  it('lo que no necesita decidir nada', () => {
    expect(isAutoFixable('charge-no-tx')).toBe(true)
    expect(isAutoFixable('caprice-no-tx')).toBe(true)
    expect(isAutoFixable('service-no-business')).toBe(true)
  })

  it('lo que SI necesita una decision del usuario, no', () => {
    // Elegir la cuenta o la categoria de un cliente en su nombre es decidir
    // sobre su dinero.
    expect(isAutoFixable('client-no-account')).toBe(false)
    expect(isAutoFixable('client-no-category')).toBe(false)
    expect(isAutoFixable('business-no-categories')).toBe(false)
  })

  it('todo lo auto-arreglable es un tipo que existe', () => {
    for (const kind of AUTO_FIXABLE) {
      expect(BUSINESS_ISSUE_KEY[kind], `${kind} sin clave de traduccion`).toBeTruthy()
    }
  })

  it('todos los tipos tienen su clave de traduccion', () => {
    // Si alguien añade un tipo y olvida el texto, el usuario veria una clave
    // cruda en pantalla.
    const kindsConClave = Object.keys(BUSINESS_ISSUE_KEY)
    expect(kindsConClave).toHaveLength(8)
    for (const k of kindsConClave) {
      expect(BUSINESS_ISSUE_KEY[k as BusinessIssueKind]).toMatch(/^bh[A-Z]/)
    }
  })
})
