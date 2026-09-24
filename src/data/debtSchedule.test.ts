import { describe, expect, it } from 'vitest'
import {
  clampDay, daysBetween, dueStatus, endDateAfter, installmentsLeft,
  nextDueDate, paymentForTerm,
} from './debtSchedule'

describe('proxima fecha de pago', () => {
  it('este mes si el dia aun no llego', () => {
    expect(nextDueDate(15, '2026-09-03')).toBe('2026-09-15')
  })

  /** Hoy ES el dia de pago: la cuota todavia no esta pagada. */
  it('hoy mismo si vence hoy', () => {
    expect(nextDueDate(15, '2026-09-15')).toBe('2026-09-15')
  })

  it('el mes que viene si el dia ya paso', () => {
    expect(nextDueDate(5, '2026-09-20')).toBe('2026-10-05')
  })

  it('cruza el fin de ano', () => {
    expect(nextDueDate(5, '2026-12-20')).toBe('2027-01-05')
  })

  /**
   * EL CASO QUE ROMPE TODO LO DEMAS: `new Date(2026, 1, 31)` se desborda sola
   * al 3 de marzo. Una deuda que vence "el 31" vence el ultimo dia de febrero.
   */
  it('el 31 en febrero es el ultimo dia de febrero', () => {
    expect(nextDueDate(31, '2026-02-01')).toBe('2026-02-28')
    expect(nextDueDate(31, '2028-02-01')).toBe('2028-02-29')  // bisiesto
  })

  it('el 31 en un mes de 30 dias', () => {
    expect(nextDueDate(31, '2026-04-10')).toBe('2026-04-30')
  })

  it('clampDay no baja de 1 ni sube del largo del mes', () => {
    expect(clampDay(0, 2026, 8)).toBe(1)
    expect(clampDay(99, 2026, 8)).toBe(30)   // septiembre
  })
})

describe('estado del pago', () => {
  it('sin dia de pago no opina', () => {
    expect(dueStatus(undefined, '2026-09-23')).toBe('none')
  })

  it('lejos todavia', () => {
    expect(dueStatus(28, '2026-09-01')).toBe('ok')
  })

  it('avisa cuando faltan pocos dias', () => {
    expect(dueStatus(28, '2026-09-25')).toBe('due-soon')
  })

  it('el mismo dia', () => {
    expect(dueStatus(23, '2026-09-23')).toBe('due-today')
  })

  /**
   * Vencido de verdad: paso el dia y no hay pago. Ojo — `nextDueDate` ya salta
   * al mes siguiente cuando el dia paso, asi que 'overdue' solo puede venir de
   * un pago pendiente que el usuario marque, no del calendario solo.
   */
  it('quien ya pago este ciclo no recibe el aviso', () => {
    expect(dueStatus(28, '2026-09-25', '2026-09-24')).toBe('ok')
  })

  it('un pago del ciclo ANTERIOR no silencia el de este mes', () => {
    expect(dueStatus(28, '2026-09-25', '2026-07-28')).toBe('due-soon')
  })
})

describe('cuotas restantes', () => {
  it('cuenta la de este mes', () => {
    expect(installmentsLeft('2026-12-15', '2026-09-10')).toBe(4)
  })

  it('una deuda que termina este mes', () => {
    expect(installmentsLeft('2026-09-30', '2026-09-10')).toBe(1)
  })

  /** Nunca negativo: media cuota no existe y "−3 cuotas" no se puede leer. */
  it('cero cuando la fecha ya paso', () => {
    expect(installmentsLeft('2026-01-15', '2026-09-10')).toBe(0)
  })
})

describe('cuota por plazo', () => {
  /**
   * Amortizacion francesa, la misma que usa el banco. Comprobado contra el
   * caso de libro: 100.000 al 12% anual en 12 meses = 8.884,88/mes.
   */
  it('coincide con la formula del banco', () => {
    expect(paymentForTerm(100_000, 12, 12)).toBeCloseTo(8_884.88, 2)
  })

  /** Sin interes la formula daria 0/0: es una division y ya. */
  it('sin interes reparte el saldo entre las cuotas', () => {
    expect(paymentForTerm(12_000, 0, 12)).toBeCloseTo(1_000, 2)
  })

  it('no inventa cuota sin saldo ni sin plazo', () => {
    expect(paymentForTerm(0, 12, 12)).toBe(0)
    expect(paymentForTerm(100_000, 12, 0)).toBe(0)
  })

  /*
   * La cuota se redondea a centavos, asi que tras 24 meses queda un residuo de
   * centimos — igual que en el banco, donde la ultima cuota se ajusta. Lo que
   * se comprueba es que el plazo cuadra, no que de exactamente cero: exigir
   * cero seria exigir una cuota con decimales que nadie puede pagar.
   */
  it('pagar esa cuota liquida la deuda en el plazo', () => {
    const cuota = paymentForTerm(50_000, 18, 24)
    let saldo = 50_000
    for (let m = 0; m < 24; m++) saldo = saldo * (1 + 0.18 / 12) - cuota
    expect(Math.abs(saldo)).toBeLessThan(1)
  })
})

describe('fecha final desde el plazo', () => {
  it('suma meses', () => {
    expect(endDateAfter(12, '2026-09-23')).toBe('2027-09-23')
  })

  it('cruza el ano', () => {
    expect(endDateAfter(4, '2026-11-10')).toBe('2027-03-10')
  })

  it('el 31 aterriza en el ultimo dia del mes destino', () => {
    expect(endDateAfter(1, '2026-01-31')).toBe('2026-02-28')
  })
})

describe('dias entre fechas', () => {
  it('cuenta hacia adelante y hacia atras', () => {
    expect(daysBetween('2026-09-01', '2026-09-23')).toBe(22)
    expect(daysBetween('2026-09-23', '2026-09-01')).toBe(-22)
  })
})
