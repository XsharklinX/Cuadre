import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE CABLEADO: las 24 de «Negocio a fondo» y las estrellas, enchufadas.
 *
 * La lógica de cada una tiene sus pruebas (`attribution`, `autopay`,
 * `referrals`, `serviceMerge`, `clientList`, `businessForecast`), y esas pasan
 * igual de verdes con la pantalla vieja delante. Esto comprueba que lo escrito
 * se USA.
 */

const SRC = join(__dirname, '..')
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const shell = leer('mobile/MobileBusiness.tsx')
const clientes = leer('mobile/business/ClientsTab.tsx')
const cobros = leer('mobile/business/CollectTab.tsx')
const ganancia = leer('mobile/business/ProfitTab.tsx')
const ficha = leer('mobile/business/ClientCard.tsx')
const borrar = leer('mobile/business/DeleteClientSheet.tsx')
const servicio = leer('mobile/business/ServiceScreen.tsx')
const formServicio = leer('mobile/business/ServiceSheet.tsx')
const cuentas = leer('mobile/business/ServiceAccounts.tsx')
const comoPagas = leer('mobile/business/PayConfigSheet.tsx')
const pagar = leer('mobile/business/PayServiceSheet.tsx')
const formCliente = leer('mobile/business/ClientSheet.tsx')
const formNegocio = leer('mobile/business/BusinessSheet.tsx')
const selectores = leer('mobile/business/Pickers.tsx')
const automatico = leer('hooks/useBusinessAutomation.ts')
const app = leer('App.tsx')
const avisos = leer('lib/localReminders.ts')
const store = leer('store/business.ts')
const analisis = leer('mobile/MobileAnalytics.tsx')

describe('E · estructura', () => {
  it('E1 tres pestañas: Clientes, Cobros y Ganancia', () => {
    expect(shell).toContain("{ id: 'clients', key: 'bizTabClients' }")
    expect(shell).toContain('<ClientsTab')
    expect(shell).toContain('<CollectTab')
    expect(shell).toContain('<ProfitTab')
  })
  it('E2 buscar, filtrar con su número y ordenar', () => {
    expect(clientes).toContain('matchesQuery(c, query)')
    expect(clientes).toContain('filterCounts(clients, owed)')
    expect(clientes).toContain('sortClients(')
  })
  it('E3 cobrar varios de una vez, y lo cobrado por mes', () => {
    expect(cobros).toContain('<BatchCollectSheet')
    expect(cobros).toContain('collectCharge(c)')
    expect(cobros).toContain("t('colDoneIn')")
  })
})

describe('L · clientes', () => {
  it('L1 borrar con nombre y diciendo qué pasa con lo pagado', () => {
    expect(ficha).toContain("t('bizDeleteClient')")
    expect(ficha).toContain('<DeleteClientSheet')
    expect(borrar).toContain('softDeleteClient')
    expect(borrar).toContain('purgeClient')
    expect(store).toContain('deletedAt: Date.now()')
  })
  it('L2 mantener pulsado para elegir varios', () => {
    expect(clientes).toContain('onLong=')
    expect(clientes).toContain('mcl-selbar')
    expect(clientes).toContain('<BulkPriceSheet')
  })
  it('L3 deslizar hacia los dos lados', () => {
    expect(clientes).toContain('useSwipeAction<HTMLDivElement>(onRight, !selecting, onLeft)')
    expect(clientes).toContain('reminderMessage(')
  })
  it('L4 la ficha como su historia', () => {
    expect(ficha).toContain('clientTimeline(client, charges)')
    expect(ficha).toContain('mcc-tl')
  })
})

describe('S · servicios', () => {
  it('S1 pantalla propia con cuatro pestañas y su menú', () => {
    expect(shell).toContain('<ServiceScreen')
    for (const p of ['summary', 'accounts', 'clients', 'payments']) expect(servicio).toContain(`'${p}'`)
  })
  it('S2 las cuentas colocan a los clientes y se editan', () => {
    expect(cuentas).toContain('assignAccounts(sinGuardar)')
    expect(cuentas).toContain('<EditAccountSheet')
    expect(cuentas).toContain('closeAccount(')
  })
  it('S3 unir servicios, propuesto y con deshacer', () => {
    expect(servicio).toContain('mergeServices(service.id, elegido.id)')
    expect(servicio).toContain('unmergeServices(undo)')
    expect(servicio).toContain('similarServices(services)')
  })
  it('S4 mover con todo lo suyo', () => {
    expect(servicio).toContain('<MoveServiceSheet')
    expect(servicio).toContain("t('svcMoveTakes')")
  })
  it('S5 crear tocando el logo, con precio por plaza', () => {
    expect(formServicio).toContain('f28-brands')
    expect(formServicio).toContain('slotPrice')
    expect(formCliente).toContain('elegirServicio(')
  })
})

describe('P · pagos solos', () => {
  it('P1 el gasto se crea solo el día que toca', () => {
    expect(app).toContain('useBusinessAutomation()')
    expect(automatico).toContain("duePayments(services, hoy, { modes: ['auto'] })")
    expect(automatico).toContain('registerServicePayment(due, { auto: true })')
  })
  it('P2 con aviso: un toque lo registra', () => {
    expect(cobros).toContain("duePayments(services, today, { modes: ['ask'] })")
    expect(cobros).toContain("t('colAskPaid')")
  })
  it('P3 el aviso de la víspera viaja al teléfono', () => {
    expect(avisos).toContain('servicePaySnapshot')
    expect(avisos).toContain('upcomingPayments(services, today, 1)')
  })
  it('P4 se elige por servicio', () => {
    expect(servicio).toContain('<PayConfigSheet')
    expect(comoPagas).toContain("'auto'")
    expect(comoPagas).toContain("'ask'")
    expect(comoPagas).toContain("'manual'")
  })
  it('P5 clientes que se cobran solos', () => {
    expect(formCliente).toContain('autoCollect')
    expect(automatico).toContain('collectCharge(ch, ch.dueDate)')
  })
  it('pagar a mano resuelve el pago que tocaba', () => {
    expect(pagar).toContain('settleManualPayment(')
  })
})

describe('K · crear sin salir', () => {
  it('K1 «＋ Nueva categoría» donde se elige una', () => {
    expect(selectores).toContain('<NewCategorySheet')
    expect(pagar).toContain('<CategoryChips')
    expect(comoPagas).toContain('<CategoryChips')
    expect(formCliente).toContain('<CategoryChips')
  })
  it('K2 servicio, negocio y cuenta también', () => {
    expect(formCliente).toContain('onCreated={id => { elegirServicio(id)')
    expect(formCliente).toContain('<BusinessSheet')
    expect(selectores).toContain('<NewAccountSheet')
  })
  it('K3 el negocio nuevo propone sus categorías propias', () => {
    expect(formNegocio).toContain('crearPropias')
    expect(formNegocio).toContain("t('bizOwnCatsTitle')")
  })
})

describe('G · ganancia', () => {
  it('G1 la ganancia sale de lo que cobraste y pagaste, en Ganancia y en Análisis', () => {
    expect(ganancia).toContain('makeOwner(')
    expect(ganancia).toContain('serviceBreakdown(')
    expect(analisis).toContain('makeOwner(')
  })
  it('G2 unir negocios', () => {
    expect(ganancia).toContain('similarBusinesses(')
    expect(ganancia).toContain('mergeBusinesses(queda')
  })
  it('G3 lo que deja cada cliente y cada cuenta', () => {
    expect(servicio).toContain('clientProfits(')
    expect(cuentas).toContain('accountProfits(')
  })
  it('G4 los próximos meses', () => {
    expect(ganancia).toContain('businessForecast(')
    expect(ganancia).toContain('weakestMonth(')
  })
})

describe('★ · las estrellas', () => {
  it('cada estrella baja el precio de los cobros que se generan', () => {
    expect(store).toContain('referralDiscount(client, referralRules(')
  })
  it('quien recomendó gana la suya sola al crear al cliente', () => {
    expect(store).toContain('c.referredBy')
    expect(formCliente).toContain('referredBy')
  })
  it('se ven en la ficha y se configuran por negocio', () => {
    expect(ficha).toContain('mcc-stars')
    expect(ficha).toContain('<AddStarSheet')
    expect(formNegocio).toContain("t('bizStarsTitle')")
  })
  it('Ganancia dice si el programa compensa', () => {
    expect(ganancia).toContain('referralSummary(')
  })
})
