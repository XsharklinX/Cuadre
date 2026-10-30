import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE CABLEADO: las 24 de la tercera vuelta siguen enchufadas.
 *
 * Tres veces en este proyecto se escribió lógica con sus pruebas verdes que
 * ninguna pantalla llamaba: `addCharge` sin un botón detrás, el bote de
 * caprichos sin forma de crear uno, y el atajo «Cobrar» que aparecía en
 * Android y no hacía nada porque faltaba en la lista de ejecución.
 *
 * Las pruebas de `wishes` o de `duplicateClients` pasan igual de verdes con
 * las pantallas viejas delante. Esto comprueba que lo escrito se USA.
 */

const SRC = join(__dirname, '..')
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const barra = leer('mobile/MobileTopBar.tsx')
const shell = leer('mobile/MobileShell.tsx')
const panel = leer('mobile/MobileAvatarSheet.tsx')
const movs = leer('mobile/MobileMovements.tsx')
// Negocio se partió en un armazón, sus tres pestañas y la pantalla de cada
// servicio: «la pantalla» es la suma de todos, que es lo que ve el usuario.
const negocio = ['mobile/MobileBusiness.tsx', 'mobile/business/ClientsTab.tsx', 'mobile/business/CollectTab.tsx',
  'mobile/business/ProfitTab.tsx', 'mobile/business/ServiceScreen.tsx'].map(leer).join('\n')
const ficha = leer('mobile/business/ClientCard.tsx')
const formCliente = leer('mobile/business/ClientSheet.tsx')
const formServicio = leer('mobile/business/ServiceSheet.tsx')
const hojas = leer('mobile/business/shared.tsx')
const caprichos = leer('mobile/MobileCaprices.tsx')
// Desde la 2.7 los antojos viven en la misma pantalla que el bote.
const antojos = leer('mobile/MobileCaprices.tsx')
const logros = leer('mobile/caprices/WinsTab.tsx')
const descartar = leer('mobile/caprices/SkipSheet.tsx')
const crear = leer('mobile/MobileCreateFlow.tsx')

describe('A · la barra superior adelgazó', () => {
  it('el avatar se comió perfil, avisos y ajustes', () => {
    // Eran tres iconos de una barra que ya llevaba ocho.
    expect(barra).toContain('mobile-avatar-btn')
    expect(barra).not.toMatch(/onProfile\?:\s/)
    expect(barra).not.toMatch(/onBell\?:\s/)
    expect(barra).not.toMatch(/onSettings:\s/)
    // Y los tres destinos están en el panel, sin desplegar nada.
    expect(panel).toContain("t('profile')")
    expect(panel).toContain("t('notificationsLabel')")
    expect(panel).toContain("t('settings')")
  })

  it('la insignia de avisos vive sobre el avatar', () => {
    // Dentro del MISMO botón: el avatar abre el panel y la insignia dice
    // que hay algo dentro, así que no pueden ser dos controles.
    const i = barra.indexOf('mobile-avatar-btn')
    const fin = barra.indexOf('</button>', i)
    expect(i).toBeGreaterThan(-1)
    expect(barra.slice(i, fin)).toContain('mobile-bell-badge')
  })

  it('el modo privado es un gesto sobre el saldo', () => {
    // Apuntar a un icono de 40px no es la forma más rápida de tapar la
    // pantalla cuando alguien acaba de sentarse al lado.
    expect(movs).toContain('useHoldToHide')
    expect(movs).toContain('ref={holdRef}')
    // Y sigue habiendo interruptor, porque un gesto que no se ve no existe.
    expect(panel).toContain('togglePrivacyMode')
    expect(panel).toContain("t('privacyHoldHint')")
  })

  it('la barra lleva la acción de SU pantalla, no las de todas', () => {
    expect(barra).toMatch(/action\?:/)
    expect(shell).toContain('const topAction =')
    // El calendario ya no es un icono fijo: es la acción de Movimientos.
    expect(barra).not.toContain("t('calendarLabel')")
    expect(shell).toMatch(/icon: 'calendar' as const/)
  })
})

describe('B · lo visual de Negocio', () => {
  it('los servicios llevan su logo de marca', () => {
    // Los logos llevaban en el repositorio desde antes que Negocio.
    expect(negocio).toContain('<BrandTile name={svc.name}')
    expect(leer('components/ui/BrandTile.tsx')).toContain('matchBrand(name)')
  })

  it('la cabecera del negocio va teñida con su color', () => {
    expect(negocio).toContain("'--biz': biz.color")
  })

  it('el titular de cobros va sin caja', () => {
    expect(negocio).toContain('mbiz-focus bare')
  })

  it('la ficha del cliente tiene cabecera propia', () => {
    expect(ficha).toContain('mcc-hero')
    expect(ficha).toContain("t('cliSince')")
  })

  it('el resumen de todos los negocios solo sale con dos o más', () => {
    // Con uno, es la misma cifra que la tarjeta de abajo dicha dos veces.
    expect(negocio).toMatch(/cuentas\.length > 1 && \(/)
    expect(negocio).toContain('mbiz-allsum')
  })
})

describe('C · organizar', () => {
  it('un servicio se mueve a otro negocio, avisando de la categoría', () => {
    // Vive en la pantalla del servicio, y avisa de lo viejo que se queda.
    const pantallaServicio = leer('mobile/business/ServiceScreen.tsx')
    expect(pantallaServicio).toContain('moveService(service.id, b.id)')
    expect(pantallaServicio).toContain("t('svcMoveOld')")
    void formServicio
  })

  it('se ordena y se archiva', () => {
    expect(leer('mobile/business/OrganizeSheet.tsx')).toContain('reorderBusinesses(orden)')
    expect(leer('mobile/business/OrganizeSheet.tsx')).toContain('archiveBusiness(biz.id, archivar)')
    expect(negocio).toContain('<OrganizeSheet')
  })

  it('un negocio archivado sale de la lista, no del libro', () => {
    expect(negocio).toMatch(/businesses\.filter\(b => !b\.archivedAt\)/)
  })

  it('un cliente cambia de servicio sin pasar por el formulario', () => {
    expect(ficha).toContain('moveClientToService(client.id, svc.id)')
  })
})

describe('D · duplicados', () => {
  it('la app los encuentra y lo dice', () => {
    expect(negocio).toContain('findDuplicates(clients)')
    expect(negocio).toContain('mbiz-dup')
  })

  it('NUNCA fusiona sola', () => {
    // Dos hermanos pueden llamarse igual. Sugiere, y decide el usuario.
    expect(negocio).toContain('onMerge(g.key)')
    expect(negocio).toContain('setMergeKey(key)')
    expect(negocio).not.toMatch(/mergeClients\(/)
  })

  it('se puede decir «no son» y no vuelve a preguntar', () => {
    expect(negocio).toContain('cuadre-dup-ignored')
  })

  it('unir enseña el resultado antes, y se puede deshacer', () => {
    const unir = leer('mobile/business/MergeSheet.tsx')
    expect(unir).toContain('mergePlan(survivor, absorbed, charges)')
    expect(unir).toContain("t('mergeResult')")
    expect(unir).toMatch(/onClick: \(\) => unmergeClients\(undo\)/)
  })

  it('avisa antes de crear el duplicado', () => {
    expect(formCliente).toContain('nameAlreadyUsed(name, clients)')
    expect(formCliente).toContain("t('bizNameTaken')")
  })
})

describe('E · Caprichos', () => {
  it('se llama Caprichos y es una sola pantalla (2.7): bote, antojos y logros', () => {
    expect(caprichos).toContain('nxk-jar')
    expect(caprichos).toContain('<WinsTab')
    expect(caprichos).not.toContain('mcap-tabs')
  })

  it('los antojos se apuntan y se deciden', () => {
    expect(antojos).toContain('<WishSheet')
    expect(antojos).toContain('buy(w.id)')
    expect(antojos).toContain('<SkipSheet')
  })

  it('LO QUE NO SE GASTÓ NO ABONA SOLO: hace falta una transferencia', () => {
    /*
     * No comprar algo de 4,500 no mueve ni un peso. Abonarlo al bote sin más
     * sería inventarse una recuperación, igual que marcar un cobro sin
     * movimiento detrás sería inventarse un ingreso.
     */
    expect(descartar).toMatch(/type: 'transfer'/)
    // El abono va DESPUÉS de crear el movimiento, y con su id.
    const iTx = descartar.indexOf('const txId = newId()')
    const iPay = descartar.indexOf('pay(elegido.id,')
    expect(iTx).toBeGreaterThan(-1)
    expect(iPay).toBeGreaterThan(iTx)
    expect(descartar).toContain("t('wishSkipExplain')")
  })

  it('el capricho tiene fecha y la app dice el ritmo', () => {
    expect(caprichos).toContain('pace(cap, hoy)')
    expect(caprichos).toContain('monthsAtCurrentPace(cap')
    expect(caprichos).toContain('setTarget(cap.id')
  })

  it('la fecha sobrevive a reiniciar la app', () => {
    // El saneador reconstruye desde una lista blanca: lo que no se nombra ahí
    // no existe.
    expect(leer('store/caprices.ts')).toContain('targetDate:')
  })

  it('marcar un capricho se sugiere donde se comete', () => {
    expect(crear).toContain('looksLikeCaprice(')
    expect(crear).toContain("t('capLooksLike')")
  })

  it('los logros separan lo recuperado de lo no gastado', () => {
    // Una es dinero que se movió; la otra, dinero que no se movió nunca.
    // Sumarlas daría un número más grande y menos cierto.
    expect(logros).toContain('recoveredInYear(caprices, year)')
    expect(logros).toContain('savedInYear(wishes, year)')
    expect(logros).toContain('capricesByCategory(caprices, catDe)')
  })
})

describe('F · el tacto', () => {
  it('se pasa de pestaña con el dedo', () => {
    expect(shell).toContain('useSwipeRoute')
    expect(shell).toContain('ref={swipeRef}')
  })

  it('y no dentro de una herramienta, donde no hay pestaña siguiente', () => {
    expect(shell).toMatch(/const swipeActivo = !isInProfileSub && route !== 'add'/)
  })

  it('las listas entran escalonadas y se apagan con reduced-motion', () => {
    expect(negocio).toContain('mbiz-list m-stagger')
    const css = leer('styles/mobile-shell.css')
    expect(css).toContain('.m-stagger > *')
    expect(css).toMatch(/prefers-reduced-motion[\s\S]{0,200}\.m-stagger/)
  })

  it('las hojas se cierran arrastrando', () => {
    expect(hojas).toContain('useSheetDrag')
    expect(panel).toContain('useSheetDrag')
  })

  it('el arrastre NO deja un transform permanente', () => {
    // Uno fijo crearía un bloque contenedor y encogería a su caja lo que
    // lleve dentro con `position: fixed`. Ya le pasó a esta app.
    const hook = leer('hooks/useSheetDrag.ts')
    expect(hook).toContain("el.style.removeProperty('--m-drag')")
    expect(hook).toContain("el.classList.remove('m-dragging')")
  })

  it('se desliza una fila para cobrar, y abre la hoja en vez de dar por hecho', () => {
    // Un cobro parcial es normal, y esto crea un movimiento real en el libro.
    expect(negocio).toContain('<SwipeCharge')
    expect(leer('mobile/business/SwipeCharge.tsx')).toContain('useSwipeAction')
    expect(negocio).toMatch(/onCollect=\{\(\) => onCollect\(charge\.id\)\}/)
  })

  it('lo ya cobrado no se puede deslizar', () => {
    expect(negocio).toMatch(/const cobrable = estado !== 'paid' && estado !== 'waived'/)
    expect(negocio).toContain('disabled={!cobrable}')
  })
})
