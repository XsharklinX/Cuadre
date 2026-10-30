import { describe, expect, it } from 'vitest'
import {
  activeStars, applyDiscount, DEFAULT_REFERRAL, nextStep, referralDiscount, referralRules,
  referralSummary, thanksMessage,
} from './referrals'
import type { Business } from './business'
import type { Client } from './clients'

const AHORA = Date.parse('2026-10-24T12:00:00')
const MES = 30.4375 * 86_400_000

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: `c${Math.random()}`, name: 'María Rodríguez', concept: '', amount: 350, cycle: 'monthly',
    dueDay: 1, accountId: 'a1', categoryId: 'cat', active: true, createdAt: 0, ...over,
  }
}
const estrellas = (n: number, hace = 0) => Array.from({ length: n }, () => ({ at: AHORA - hace }))

describe('referralDiscount · cada estrella es un %', () => {
  it('5% por estrella con las reglas de siempre', () => {
    expect(referralDiscount(cliente({ stars: estrellas(2) }), DEFAULT_REFERRAL, AHORA)).toBe(10)
  })

  it('CON TOPE: veinte recomendaciones no lo hacen gratis', () => {
    expect(referralDiscount(cliente({ stars: estrellas(20) }), DEFAULT_REFERRAL, AHORA)).toBe(25)
  })

  it('sin estrellas, sin descuento', () => {
    expect(referralDiscount(cliente(), DEFAULT_REFERRAL, AHORA)).toBe(0)
  })

  it('con el programa apagado no hay descuento aunque tenga estrellas', () => {
    expect(referralDiscount(cliente({ stars: estrellas(3) }), { pctPerStar: 0, maxPct: 25 }, AHORA)).toBe(0)
  })

  it('las que caducan dejan de contar', () => {
    const c = cliente({ stars: [{ at: AHORA - 14 * MES }, { at: AHORA - 2 * MES }] })
    const reglas = { pctPerStar: 10, maxPct: 50, expiresMonths: 12 }
    expect(activeStars(c, reglas, AHORA)).toHaveLength(1)
    expect(referralDiscount(c, reglas, AHORA)).toBe(10)
  })
})

describe('referralRules', () => {
  it('sin reglas propias, las de siempre', () => {
    expect(referralRules(null)).toEqual(DEFAULT_REFERRAL)
  })
  it('recorta lo que no tiene sentido', () => {
    const b = { referral: { pctPerStar: 140, maxPct: -3, expiresMonths: 6.4 } } as Business
    expect(referralRules(b)).toEqual({ pctPerStar: 100, maxPct: 0, expiresMonths: 6 })
  })
})

describe('applyDiscount', () => {
  it('350 con 10% son 315', () => expect(applyDiscount(350, 10)).toBe(315))
  it('sin descuento no toca el monto', () => expect(applyDiscount(350, 0)).toBe(350))
  it('redondea a céntimos', () => expect(applyDiscount(14.99, 15)).toBe(12.74))
})

describe('nextStep · lo que hace que traiga a otro', () => {
  it('dice el siguiente escalón', () => {
    expect(nextStep(cliente({ stars: estrellas(1) }), DEFAULT_REFERRAL, AHORA)).toEqual({ pct: 10 })
  })
  it('en el tope no hay siguiente', () => {
    expect(nextStep(cliente({ stars: estrellas(5) }), DEFAULT_REFERRAL, AHORA)).toBeNull()
  })
  it('el último escalón no pasa del tope', () => {
    expect(nextStep(cliente({ stars: estrellas(2) }), { pctPerStar: 10, maxPct: 25 }, AHORA)).toEqual({ pct: 25 })
  })
})

describe('referralSummary · ¿compensa el programa?', () => {
  it('lo que regalas contra lo que te traen', () => {
    const madrina = cliente({ id: 'm', stars: estrellas(2) })
    const traidos = [cliente({ referredBy: 'm' }), cliente({ referredBy: 'm' })]
    const r = referralSummary([madrina, ...traidos], () => DEFAULT_REFERRAL, c => c.amount, AHORA)
    expect(r).toEqual({ referred: 2, recommenders: 1, discountPerMonth: 35, referredRevenue: 700 })
  })
  it('los borrados y pausados no cuentan', () => {
    const r = referralSummary(
      [cliente({ referredBy: 'x', active: false }), cliente({ referredBy: 'x', deletedAt: 1 })],
      () => DEFAULT_REFERRAL, c => c.amount, AHORA,
    )
    expect(r.referred).toBe(0)
  })
})

describe('thanksMessage', () => {
  it('usa el nombre de pila y los números', () => {
    expect(thanksMessage('Gracias {nombre} por traer a {recomendado}: ahora pagas {pct}% menos', {
      name: 'María Rodríguez', referred: 'Juan', pct: 10,
    })).toBe('Gracias María por traer a Juan: ahora pagas 10% menos')
  })
})
