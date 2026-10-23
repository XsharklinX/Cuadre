import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE CABLEADO: el rediseño de Negocio sigue enchufado.
 *
 * ── POR QUÉ ESTE TEST ─────────────────────────────────────────────────
 * Dos veces en este módulo se escribió lógica con sus pruebas verdes que
 * ninguna pantalla llamaba nunca: `addCharge` llevaba semanas en el store sin
 * un solo botón detrás, y el bote de caprichos se dio por entregado cuando no
 * había forma de crear uno. Las pruebas de `collectFocus` pasan igual de
 * verdes con la pantalla vieja delante.
 *
 * Esto no comprueba cómo se ve; comprueba que lo que se escribió se USA.
 */

const SRC = join(__dirname, '..')
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const pantalla = leer('mobile/MobileBusiness.tsx')
const ficha = leer('mobile/business/ClientCard.tsx')
const cobroSuelto = leer('mobile/business/NewChargeSheet.tsx')

describe('la pantalla abre con UNA cifra, no con tres', () => {
  it('usa collectFocus para decidir el titular', () => {
    expect(pantalla).toMatch(/collectFocus\(charges, clients, today\)/)
    expect(pantalla).toContain('mbiz-focus')
  })

  it('las tres cifras del mismo peso ya no están', () => {
    // Eran `mbiz-strip` + tres `mbiz-stat`: atrasado, esta semana y cobrado,
    // los tres igual de grandes, y había que decidir cuál importaba.
    expect(pantalla).not.toContain('mbiz-strip')
    expect(pantalla).not.toContain('mbiz-stat')
  })

  it('los tres estados del foco tienen su texto', () => {
    for (const clave of ['bizFocusLate', 'bizFocusToday', 'bizFocusCalm']) {
      expect(pantalla, clave).toContain(`'${clave}'`)
    }
  })
})

describe('la lista va agrupada por estado', () => {
  it('usa groupCharges y no una lista plana', () => {
    expect(pantalla).toContain('groupCharges(')
    // `sortForList` devolvía todo mezclado en una sola lista infinita.
    expect(pantalla).not.toContain('sortForList')
  })

  it('los cuatro grupos se pintan', () => {
    for (const clave of ['bizGroupLate', 'bizGroupWeek', 'bizGroupLater', 'bizGroupDone']) {
      expect(pantalla, clave).toContain(`'${clave}'`)
    }
  })

  it('el recuento solo cuenta cobros que se pueden pintar', () => {
    // Si no, la cabecera dice «3» encima de dos filas.
    expect(pantalla).toMatch(/groupCharges\(\s*charges\.filter\(c => clientMap\.has\(c\.clientId\)\)/)
  })
})

describe('tocar un cliente abre su FICHA, no su formulario', () => {
  it('la lista de clientes abre ClientCard', () => {
    expect(pantalla).toContain('setClientCardId(client.id)')
    expect(pantalla).toContain('<ClientCard')
  })

  it('desde la LISTA nunca se abre el formulario, solo la ficha', () => {
    /*
     * Editar pasó a ser un botón dentro de la ficha. Lo que no puede volver a
     * pasar es que tocar un cliente en la lista abra sus catorce campos de
     * configuración, que era el gesto natural de «ver quién es».
     *
     * La pantalla abre `ClientSheet` en dos casos y solo dos: sin id para
     * crear, y con el id del clon recién duplicado —al que solo le falta el
     * nombre—. Cualquier otro `clientId=` desde aquí es la regresión.
     */
    const aperturas = pantalla.match(/<ClientSheet clientId=\{[^}]*\}/g) ?? []
    expect(aperturas.sort()).toEqual([
      '<ClientSheet clientId={editId}',
      '<ClientSheet clientId={null}',
    ])
    // Y la fila de la lista abre la ficha, no el formulario.
    expect(pantalla).toContain('setClientCardId(client.id)')
    expect(ficha).toContain('<ClientSheet clientId={client.id}')
  })

  it('«otro igual» duplica el trato y abre el clon', () => {
    // Con doce clientes del mismo servicio al mismo precio, añadir el trece
    // era reescribir ocho campos ya escritos doce veces.
    expect(ficha).toContain('duplicateClient(client.id)')
    expect(ficha).toContain("t('bizCliDuplicate')")
    expect(pantalla).toContain('setEditId(id)')
  })

  it('la ficha enseña el historial que la app ya tenía y no mostraba', () => {
    expect(ficha).toContain('clientHistory(')
    for (const clave of ['bizCliPaidYou', 'bizCliOwes', 'bizCliNext']) {
      expect(ficha, clave).toContain(`'${clave}'`)
    }
  })

  it('la ficha se cierra si borran al cliente', () => {
    // El borrado va con deshacer: el cliente desaparece un rato DESPUÉS de
    // cerrarse el formulario, y sin esto queda una hoja invisible encima.
    expect(ficha).toMatch(/useEffect\(\(\) => \{ if \(!client\) onClose\(\) \}/)
  })
})

describe('el cobro suelto existe de verdad', () => {
  it('algo llama a addCharge', () => {
    // Estaba en el store desde el principio sin un solo botón detrás: no había
    // forma de cobrarle un trabajo puntual a alguien que ya es cliente.
    expect(cobroSuelto).toContain('addCharge(clientId, date, monto)')
  })

  it('se puede abrir desde la pantalla y desde la ficha de un cliente', () => {
    expect(pantalla).toContain('<NewChargeSheet')
    expect(ficha).toContain('<NewChargeSheet')
  })

  it('no toca el libro: crea una expectativa, no dinero', () => {
    // La única puerta al balance sigue siendo CollectSheet → markPaid → addTx.
    // Se buscan LLAMADAS: el comentario de cabecera nombra las dos a
    // propósito, para decir de dónde no cuelga esta hoja.
    expect(cobroSuelto).not.toMatch(/addTx\(/)
    expect(cobroSuelto).not.toMatch(/markPaid\(/)
  })

  it('no ofrece clientes pausados', () => {
    // Su propia ficha dice que no se le generan cobros nuevos.
    expect(cobroSuelto).toMatch(/clients\.filter\(c => c\.active \|\| c\.id === fijo\)/)
  })
})

describe('la ganancia se lee, no se adivina', () => {
  it('lleva el margen en porcentaje', () => {
    // El monto solo no dice si el negocio es bueno: subir de 1,000 a 1,200
    // puede ser porque vendiste más o porque te subieron el coste.
    expect(pantalla).toContain('marginPct(runRate.collected, runRate.profit)')
    expect(pantalla).toContain("t('bizMarginPct')")
  })

  it('enseña de dónde sale la cifra grande sin abrir la tarjeta', () => {
    expect(pantalla).toContain('mbiz-biz-three')
    expect(pantalla).toContain('mbiz-biz-big')
  })

  it('la gráfica del año lleva meses y media', () => {
    // Doce barras sin una etiqueta son una forma bonita, no un dato.
    expect(pantalla).toContain('mbiz-chart-avg')
    expect(pantalla).toContain("t('bizChartAvg')")
    expect(pantalla).toMatch(/shortMonth\(p\.mkey, locale\)/)
  })

  it('la media solo cuenta los meses que ya pasaron', () => {
    // Con los doce, un año recién empezado hundiría la línea a la mitad.
    expect(pantalla).toMatch(/points\.filter\(p => p\.mkey <= mkey\)/)
  })
})

describe('el día de pago se toca, no se teclea', () => {
  const compartido = leer('mobile/business/shared.tsx')

  it('son 31 botones, no un campo de número', () => {
    // Era un input con un `1` dentro y un recorte en cada tecla: para el día
    // 5 tecleabas «5» y quedaba «15»; para el 25, «125» recortado a 31.
    const desde = compartido.indexOf('export function DayPicker')
    const hasta = compartido.indexOf('export function WeekdayPicker')
    expect(desde, 'DayPicker').toBeGreaterThan(-1)
    expect(hasta, 'WeekdayPicker').toBeGreaterThan(desde)
    const picker = compartido.slice(desde, hasta)

    expect(picker).toMatch(/Array\.from\(\{ length: 31 \}/)
    expect(picker).toContain('mbizs-days')
    expect(picker).not.toMatch(/type="number"/)
  })

  it('el aviso del mes corto solo sale cuando aplica', () => {
    // Fijo bajo el campo no le decía nada a quien cobra el día 5.
    expect(compartido).toMatch(/value >= 29 &&/)
  })
})

describe('Escape cierra una hoja, no la pila', () => {
  it('el diálogo de arriba es el único que responde', () => {
    // Cada hoja escucha `keydown` en `window`: sin la pila, un Escape con la
    // ficha de un cliente y su formulario abiertos cerraba las dos.
    const hook = leer('mobile/useDialogA11y.ts')
    expect(hook).toContain('dialogStack')
    expect(hook).toMatch(/if \(dialogStack\[dialogStack\.length - 1\] !== token\) return/)
  })
})
