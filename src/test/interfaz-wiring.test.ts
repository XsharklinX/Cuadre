import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE CABLEADO: las 22 de «Cuadre, la interfaz» siguen enchufadas.
 *
 * La lógica de cada una tiene sus pruebas propias, y esas pasan igual de
 * verdes con las pantallas viejas delante. Esto comprueba que lo escrito se
 * USA: que cada cálculo tiene una pantalla que lo llama.
 */

const SRC = join(__dirname, '..')
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

// Negocio se partió en un armazón, sus tres pestañas y la pantalla de cada
// servicio: «la pantalla» es la suma de todos, que es lo que ve el usuario.
const negocio = ['mobile/MobileBusiness.tsx', 'mobile/business/ClientsTab.tsx', 'mobile/business/CollectTab.tsx',
  'mobile/business/ProfitTab.tsx', 'mobile/business/ServiceScreen.tsx'].map(leer).join('\n')
const pagar = leer('mobile/business/PayServiceSheet.tsx')
const inversion = leer('data/investment.ts')
// Lo que se configura está en su hoja; lo que se mira, en su pantalla.
const servicio = leer('mobile/business/ServiceSheet.tsx') + leer('mobile/business/ServiceScreen.tsx')
const cuentas = leer('mobile/business/ServiceAccounts.tsx')
const catalogo = leer('data/subscriptionCatalog.ts')
const arrastre = leer('hooks/useSheetDrag.ts')
const formNegocio = leer('mobile/business/BusinessSheet.tsx')
const formCliente = leer('mobile/business/ClientSheet.tsx')
const barraAbajo = leer('mobile/MobileBottomNav.tsx')
const shell = leer('mobile/MobileShell.tsx')
const analisis = leer('mobile/MobileAnalytics.tsx')
const comparar = leer('mobile/CompareMonthsSheet.tsx')

describe('G · las ganancias', () => {
  it('G1 «Has puesto» cuenta solo lo que pagaste por sus servicios', () => {
    // Antes sumaba categorías compartidas con lo personal: 13,671 que nadie puso.
    expect(pagar).toContain('paidService: service.id')
    expect(inversion).toContain('tx.paidService')
    expect(negocio).toMatch(/businessInvestment\([^)]*services\)/)
  })
  it('G2 el negocio se ve en pesos o en dólares', () => {
    expect(negocio).toContain('mbiz-cur')
    expect(negocio).toContain('toView(')
  })
  it('G3 (2.8) el año y la inversión, en filas que abren su hoja', () => {
    expect(negocio).toContain("kind: 'inv'")
    expect(negocio).toContain("kind: 'year'")
  })
  it('G4 el gráfico del año dice cuál fue el mejor y el peor mes', () => {
    expect(negocio).toContain('bestLabel')
    expect(negocio).toContain('worstLabel')
  })
})

describe('N · la pantalla de Negocio', () => {
  it('N1 una acción principal y lo demás en un menú', () => {
    // El menú es ahora una hoja con sus opciones con nombre (`mmenu`).
    expect(negocio).toContain('className="primary"')
    expect(negocio).toContain('mmenu')
  })
  it('N2 los clientes van agrupados con su servicio delante', () => {
    expect(negocio).toContain('mbiz-svc-head')
  })
  it('N3 cada cliente dice cómo va', () => {
    expect(negocio).toContain('mbiz-dot')
  })
  it('un negocio que ya existe se puede editar', () => {
    // Desde la 2.0.0 el formulario sabía editar y nada lo abría con un negocio
    // existente: solo se llamaba con «new».
    expect(negocio).toContain('onEditBusiness(biz.id)')
    expect(negocio).toContain('setBizSheet(id)')
  })
})

describe('C · crear', () => {
  it('C1 el fondo no se mueve al tocar un formulario', () => {
    expect(arrastre).toContain('scrollerAlTope(destino, el)')
  })
  it('N4 (2.8) un negocio nuevo se crea en un paso, con el icono sacado del nombre', () => {
    expect(formNegocio).toContain('const porPasos = false')
    expect(formNegocio).toContain('suggestBusinessIcon(')
  })
  it('C3 el cliente nuevo empieza por el monto, y lo demás va en filas', () => {
    expect(formCliente).toContain('masOpciones')
    expect(formCliente.indexOf('<BigAmount')).toBeLessThan(formCliente.indexOf('<FormRows'))
  })
  it('la ficha de cliente empieza como un contacto, sin listas desplegables', () => {
    expect(formCliente).toContain('mcf-hero')
    expect(formCliente).not.toContain('<select')
  })
  it('C4 el + en Negocio abre el menú de crear, y el movimiento sigue ahí', () => {
    expect(barraAbajo).toContain('askBusinessMenu()')
    expect(negocio).toContain('<CreateMenu')
    expect(shell).toContain('s.addMovement')
  })
})

describe('S · los servicios', () => {
  it('S1 y S2 varias cuentas, con las caras de quien ocupa cada plaza', () => {
    expect(servicio).toContain('<ServiceAccounts')
    expect(cuentas).toContain('updateClient(')
  })
  it('S3 reconoce la marca al escribir el nombre', () => {
    expect(servicio).toContain('matchBrand(')
    expect(catalogo).toMatch(/slots\?: number/)
  })
  it('S4, S5 y S6 precio por plaza, cuándo toca pagar y qué lo arregla', () => {
    expect(servicio).toContain('slotEconomics(')
    expect(servicio).toContain('nextPaymentDate(')
    expect(servicio).toContain('servicePayments(')
    expect(servicio).toContain('howToFix(')
  })
})

describe('A · Análisis', () => {
  it('A1 (2.8) abre con una frase que contesta y tres cifras', () => {
    expect(analisis).toContain('an28-trio')
    expect(analisis).toContain('an28HeadSaved')
  })
  it('A2 sabe del negocio y de lo que no está en el saldo', () => {
    expect(analisis).toContain('businessIncome(')
    expect(analisis).toContain('receivablesSummary(')
  })
  it('A8 (2.8) compara sin abrir otra hoja: mes anterior, año pasado o tu media', () => {
    expect(analisis).toContain('setCompareBase(')
    expect(analisis).toContain("'lastYear'")
    expect(analisis).toContain("'avg'")
    expect(comparar).toContain('compareCategoryTotals(')
  })
  it('A4 una barra de a dónde se fue el mes', () => {
    expect(analisis).toContain('spendShares(')
    expect(analisis).toContain('man-stack')
  })
  it('A3 (2.8) «lo que hay que mirar» en filas que abren su detalle', () => {
    // Ni acordeones (2.6) ni la tira de saltos: una tarjeta de filas.
    expect(analisis).not.toContain('AnalyticsFold')
    expect(analisis).not.toContain('<JumpStrip')
    expect(analisis).toContain("setDetail('days')")
    expect(analisis).toContain("setDetail('pace')")
  })
})
