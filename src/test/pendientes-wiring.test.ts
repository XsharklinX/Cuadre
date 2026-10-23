import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE CABLEADO: las trece pendientes siguen enchufadas.
 *
 * ── POR QUÉ ESTE TEST ─────────────────────────────────────────────────
 * Dos veces en este módulo se escribió lógica con sus pruebas verdes que
 * ninguna pantalla llamaba: `addCharge` llevaba semanas en el store sin un
 * botón detrás, y el bote de caprichos se dio por entregado cuando no había
 * forma de crear uno. Las pruebas de `clientStatement` o de `chargeReminders`
 * pasan igual de verdes con la pantalla vieja delante.
 *
 * Esto no comprueba cómo se ve. Comprueba que lo que se escribió se USA.
 */

const SRC = join(__dirname, '..')
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const negocio = leer('mobile/MobileBusiness.tsx')
const ficha = leer('mobile/business/ClientCard.tsx')
const formCliente = leer('mobile/business/ClientSheet.tsx')
const formNegocio = leer('mobile/business/BusinessSheet.tsx')
const cobrar = leer('mobile/business/CollectSheet.tsx')
const analisis = leer('mobile/MobileAnalytics.tsx')
const recordatorios = leer('lib/localReminders.ts')
const store = leer('store/business.ts')

describe('los papeles existen y se pueden pedir', () => {
  it('el comprobante se emite desde el historial del cliente', () => {
    expect(ficha).toContain('exportReceiptPdf(charge, client, currency, lang)')
    // Y solo de un cobro con movimiento detrás: un papel que diga «recibido»
    // sin esa prueba es el que no se puede emitir a la ligera.
    expect(ficha).toMatch(/charge\.txIds\.length > 0 && charge\.paid > 0 && !charge\.waived/)
  })

  it('el estado de cuenta se pide desde sus acciones', () => {
    expect(ficha).toContain('exportStatementPdf(client, charges,')
    expect(ficha).toContain("t('stmtAction')")
  })

  it('los cobros se exportan a Excel y a PDF', () => {
    expect(negocio).toContain('exportChargesExcel(charges, clients)')
    expect(negocio).toContain('exportChargesPdf(charges, clients, currency, lang)')
  })

  it('el resumen del mes se fotografía de un nodo real', () => {
    // De una segunda maquetación saldría una imagen que dice otra cosa que la
    // pantalla.
    expect(negocio).toContain('exportElementPng(nodo')
    expect(negocio).toContain('resumenRef')
  })

  it('ningún botón de papel se puede pulsar dos veces', () => {
    // Generar tarda lo suficiente como para recibir dos archivos.
    expect(negocio).toContain('disabled={exportando}')
    expect(ficha).toContain('disabled={generando}')
  })
})

describe('los recordatorios ya no son diarios', () => {
  it('el snapshot usa la escalera, no todos los pendientes', () => {
    // Un cliente con cuarenta días de retraso generaba cuarenta avisos
    // idénticos, y un aviso diario se aprende a descartar sin leerlo.
    expect(recordatorios).toContain('chargesToRemind(charges, hoy)')
    expect(recordatorios).not.toMatch(/filter\(c => !c\.waived && outstanding\(c\) > 0 && c\.dueDate <= hoy\)/)
  })
})

describe('un cliente puede tener varios servicios', () => {
  it('el formulario los guarda con su precio', () => {
    expect(formCliente).toContain('serviceShares:')
    expect(formCliente).toContain('mbizs-shares')
  })

  it('las dos formas NO conviven en el mismo cliente', () => {
    // Con las dos, `clientServices` tendría dos respuestas para lo mismo.
    expect(formCliente).toMatch(/serviceId: varios \? undefined/)
  })

  it('el margen de un servicio usa solo SU parte', () => {
    // Si usara el pago entero, quien compra dos servicios haría que los dos
    // parecieran el doble de buenos.
    const datos = leer('data/business.ts')
    expect(datos).toContain('clientPerMonthForService(c, service.id, base)')
  })

  it('el cobro se genera por el TOTAL de sus servicios', () => {
    // Cobrar por `amount` sería cobrarle de menos todos los meses.
    expect(leer('data/receivables.ts')).toContain('amount: clientTotalAmount(client)')
  })
})

describe('el precio de antes se apunta y se enseña', () => {
  it('el store apunta el anterior al cambiarlo', () => {
    expect(store).toMatch(/priceLog: \[\.\.\.\(c\.priceLog \?\? \[\]\), \{ at: Date\.now\(\), amount: c\.amount \}\]/)
  })

  it('y solo cuando cambia de verdad', () => {
    // Corregir una falta en el nombre no es una subida de precio.
    expect(store).toMatch(/Math\.abs\(fields\.amount - c\.amount\) > 0\.005/)
  })

  it('la ficha lo dice', () => {
    expect(ficha).toContain('lastPriceChange(client)')
    expect(ficha).toContain("t('bizPriceWas')")
  })
})

describe('un cobro puede llevar su nota', () => {
  it('se escribe al cobrar y se guarda antes de marcar', () => {
    // `markPaid` cierra el cobro y la hoja se desmonta: escribirla después la
    // perdería en el camino.
    expect(cobrar).toContain("t('bizChargeNote')")
    const iNota = cobrar.indexOf('updateCharge(charge.id, { note:')
    const iMarca = cobrar.indexOf('markPaid(charge.id, monto, txId)')
    expect(iNota).toBeGreaterThan(-1)
    expect(iNota).toBeLessThan(iMarca)
  })

  it('se ve en la ficha del cliente', () => {
    expect(ficha).toContain('charge.note')
  })
})

describe('apartar el % mueve el dinero de verdad', () => {
  it('el negocio dice a qué cuenta', () => {
    expect(formNegocio).toContain('setAsideAccountId')
    expect(formNegocio).toContain("t('bizSetAsideTo')")
  })

  it('el cobro hace una TRANSFERENCIA, no un gasto', () => {
    // Como gasto, apartar para impuestos aparecería en los informes como si
    // se hubiera gastado.
    expect(cobrar).toMatch(/type: 'transfer'[\s\S]{0,300}toAccount: cuentaApartar\.id/)
  })

  it('va DESPUÉS de marcar el cobro, y su fallo no lo tumba', () => {
    const iMarca = cobrar.indexOf('markPaid(charge.id, monto, txId)')
    const iMover = cobrar.indexOf('if (apartarAhora > 0 && cuentaApartar)')
    expect(iMover).toBeGreaterThan(iMarca)
    expect(cobrar).toContain("t('bizSetAsideFailed')")
  })

  it('no se transfiere una cuenta a sí misma', () => {
    // No movería nada y dejaría dos apuntes que no cuadran con nada.
    expect(cobrar).toMatch(/a\.id === negocio\.setAsideAccountId && a\.id !== accountId/)
  })
})

describe('los informes separan negocio de personal', () => {
  it('el filtro se aplica arriba, sobre todo el libro', () => {
    // Sección por sección, la mitad de la pantalla contestaría a una pregunta
    // y la otra mitad a otra.
    expect(analisis).toContain('scopeTransactions(todoTx, businesses,')
    expect(analisis).toContain('const visTx = useMemo(')
  })

  it('el selector solo sale si hay frontera que trazar', () => {
    expect(analisis).toContain('canScope(businesses)')
    expect(analisis).toContain('{puedeFiltrar && (')
  })

  it('con un filtro puesto, la pantalla lo dice', () => {
    expect(analisis).toContain('man-scope-note')
  })
})

describe('la lista de clientes se puede agrupar, y la pantalla vacía guía', () => {
  it('agrupar por servicio existe y se recuerda', () => {
    expect(negocio).toContain('cuadre-clients-by-service')
    expect(negocio).toContain('gruposDeClientes')
  })

  it('un cliente con dos servicios sale en los dos grupos', () => {
    // Enseñarlo en uno solo haría que la otra cuenta pareciera tener una
    // plaza libre que no tiene.
    expect(negocio).toMatch(/for \(const \{ serviceId \} of suyos\)/)
  })

  it('la guía de cuatro pasos está en la pantalla vacía', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(negocio, `paso ${n}`).toContain(`t('bizGuideStep${n}')`)
    }
    expect(negocio).toContain('mbiz-guide')
  })
})
