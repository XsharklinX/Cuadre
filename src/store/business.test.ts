import { beforeEach, describe, expect, it } from 'vitest'
import { sanitizeBusinessData, useBusiness } from './business'
import { useCaprices } from './caprices'
import { chargeState, outstanding } from '@/data/clients'
import { recovered } from '@/data/caprices'

const HOY = '2026-10-18'

function limpiar() {
  useBusiness.setState({ clients: [], businesses: [], services: [], charges: [] })
  useCaprices.setState({ items: [] })
}

/** Un cliente de prueba. El tipo sale del propio store, sin inventar nada. */
type NuevoCliente = Parameters<ReturnType<typeof useBusiness.getState>['addClient']>[0]

function nuevoCliente(over: Partial<NuevoCliente> = {}): string {
  return useBusiness.getState().addClient({
    name: 'Juan', concept: 'Netflix', amount: 250, cycle: 'monthly', dueDay: 5,
    accountId: 'a1', categoryId: 'cat_stream', active: true,
    ...over,
  })
}

describe('clientes', () => {
  beforeEach(limpiar)

  it('se guarda con id y fecha de creación', () => {
    const id = nuevoCliente()
    const c = useBusiness.getState().clients[0]
    expect(c.id).toBe(id)
    expect(c.createdAt).toBeGreaterThan(0)
  })

  it('borrar un cliente se lleva lo PENDIENTE y conserva lo cobrado', () => {
    // Un cobro ya pagado apunta a un movimiento real del libro; borrarlo
    // dejaría ese ingreso sin explicación de dónde vino.
    const id = nuevoCliente()
    const pendiente = useBusiness.getState().addCharge(id, '2026-11-05', 250)
    const cobrado = useBusiness.getState().addCharge(id, '2026-10-05', 250)
    useBusiness.getState().markPaid(cobrado, 250, 'tx_1')

    useBusiness.getState().deleteClient(id)
    const quedan = useBusiness.getState().charges
    expect(quedan.map(c => c.id)).toEqual([cobrado])
    expect(quedan.map(c => c.id)).not.toContain(pendiente)
  })
})

describe('negocios y servicios', () => {
  beforeEach(limpiar)

  it('borrar un negocio NO borra sus clientes: solo los deja sin agrupar', () => {
    // Borrar en cascada se llevaría dinero real por delante.
    const biz = useBusiness.getState().addBusiness({
      name: 'Streaming', color: '#35d0a2', icon: 'play',
      incomeCategoryIds: ['cat_stream'], expenseCategoryIds: ['cat_subs'],
    })
    const svc = useBusiness.getState().addService({
      businessId: biz, name: 'Netflix', cost: 600, costCycle: 'monthly',
    })
    const cli = nuevoCliente({ businessId: biz, serviceId: svc })

    useBusiness.getState().deleteBusiness(biz)
    const s = useBusiness.getState()
    expect(s.businesses).toHaveLength(0)
    expect(s.services).toHaveLength(0)
    expect(s.clients).toHaveLength(1)
    expect(s.clients[0].id).toBe(cli)
    expect(s.clients[0].businessId).toBeUndefined()
    expect(s.clients[0].serviceId).toBeUndefined()
  })

  it('borrar un servicio desengancha a sus clientes', () => {
    const biz = useBusiness.getState().addBusiness({
      name: 'X', color: '#fff', icon: 'play', incomeCategoryIds: [], expenseCategoryIds: [],
    })
    const svc = useBusiness.getState().addService({
      businessId: biz, name: 'Netflix', cost: 600, costCycle: 'monthly',
    })
    nuevoCliente({ businessId: biz, serviceId: svc })
    useBusiness.getState().deleteService(svc)
    expect(useBusiness.getState().clients[0].serviceId).toBeUndefined()
  })
})

describe('syncCharges', () => {
  beforeEach(limpiar)

  it('crea los cobros que faltan', () => {
    nuevoCliente()
    const n = useBusiness.getState().syncCharges(HOY)
    expect(n).toBeGreaterThan(0)
    expect(useBusiness.getState().charges).toHaveLength(n)
  })

  it('LLAMARLO DOS VECES NO DUPLICA NADA', () => {
    // Se llama al abrir la pantalla; sin esto, abrirla diez veces le
    // inventaría diez deudas al cliente.
    nuevoCliente()
    const primera = useBusiness.getState().syncCharges(HOY)
    const segunda = useBusiness.getState().syncCharges(HOY)
    expect(segunda).toBe(0)
    expect(useBusiness.getState().charges).toHaveLength(primera)
  })

  it('sin clientes no crea nada', () => {
    expect(useBusiness.getState().syncCharges(HOY)).toBe(0)
  })
})

describe('markPaid', () => {
  beforeEach(limpiar)

  it('registra el pago con su movimiento', () => {
    const cli = nuevoCliente()
    const chg = useBusiness.getState().addCharge(cli, '2026-10-05', 250)
    useBusiness.getState().markPaid(chg, 250, 'tx_1')
    const c = useBusiness.getState().charges[0]
    expect(c.paid).toBe(250)
    expect(c.txIds).toEqual(['tx_1'])
    expect(chargeState(c, HOY)).toBe('paid')
  })

  it('un pago parcial deja lo que falta', () => {
    const cli = nuevoCliente()
    const chg = useBusiness.getState().addCharge(cli, '2026-10-05', 250)
    useBusiness.getState().markPaid(chg, 100, 'tx_1')
    expect(outstanding(useBusiness.getState().charges[0])).toBe(150)
  })

  it('SIN movimiento no se marca nada', () => {
    const cli = nuevoCliente()
    const chg = useBusiness.getState().addCharge(cli, '2026-10-05', 250)
    useBusiness.getState().markPaid(chg, 250, '')
    expect(useBusiness.getState().charges[0].paid).toBe(0)
  })

  it('deshacer un pago lo devuelve a pendiente', () => {
    const cli = nuevoCliente()
    const chg = useBusiness.getState().addCharge(cli, '2026-10-05', 250)
    useBusiness.getState().markPaid(chg, 250, 'tx_1')
    useBusiness.getState().unmarkPaid(chg, 'tx_1', 250)
    expect(useBusiness.getState().charges[0].paid).toBe(0)
  })

  it('dar por perdido quita el atraso sin cobrarlo', () => {
    const cli = nuevoCliente()
    const chg = useBusiness.getState().addCharge(cli, '2026-01-05', 250)
    useBusiness.getState().waiveCharge(chg, true)
    expect(chargeState(useBusiness.getState().charges[0], HOY)).toBe('waived')
  })
})

describe('caprichos', () => {
  beforeEach(limpiar)

  it('abre un bote por un gasto', () => {
    const id = useCaprices.getState().open('tx_audifonos', 3_200, 'Audífonos')
    const c = useCaprices.getState().items[0]
    expect(c.id).toBe(id)
    expect(c.amount).toBe(3_200)
  })

  it('EL MISMO GASTO no abre dos botes', () => {
    // Dos botes del mismo gasto le harían deber el doble de lo que gastó.
    const a = useCaprices.getState().open('tx_1', 3_200, 'Audífonos')
    const b = useCaprices.getState().open('tx_1', 3_200, 'Audífonos')
    expect(b).toBe(a)
    expect(useCaprices.getState().items).toHaveLength(1)
  })

  it('un aporte necesita su movimiento', () => {
    const id = useCaprices.getState().open('tx_1', 3_200, 'X')
    useCaprices.getState().pay(id, 1_000, '')
    expect(recovered(useCaprices.getState().items[0])).toBe(0)
    useCaprices.getState().pay(id, 1_000, 'tx_ahorro')
    expect(recovered(useCaprices.getState().items[0])).toBe(1_000)
  })

  it('prune tira los botes cuyo gasto ya no existe', () => {
    // Pasa al restaurar una copia o al cerrar un periodo: quedarían botes
    // pidiendo recuperar dinero de una compra que nadie puede ver.
    useCaprices.getState().open('tx_vivo', 500, 'A')
    useCaprices.getState().open('tx_muerto', 900, 'B')
    const quitados = useCaprices.getState().prune(new Set(['tx_vivo']))
    expect(quitados).toBe(1)
    expect(useCaprices.getState().items.map(c => c.txId)).toEqual(['tx_vivo'])
  })

  it('prune también limpia aportes huérfanos sin tirar el bote', () => {
    const id = useCaprices.getState().open('tx_vivo', 3_200, 'A')
    useCaprices.getState().pay(id, 1_000, 'tx_pago_vivo')
    useCaprices.getState().pay(id, 500, 'tx_pago_muerto')
    useCaprices.getState().prune(new Set(['tx_vivo', 'tx_pago_vivo']))
    const c = useCaprices.getState().items[0]
    expect(c.payments.map(p => p.txId)).toEqual(['tx_pago_vivo'])
    expect(recovered(c)).toBe(1_000)
  })

  it('prune no toca nada si todo está vivo', () => {
    useCaprices.getState().open('tx_1', 500, 'A')
    const antes = useCaprices.getState().items
    useCaprices.getState().prune(new Set(['tx_1']))
    expect(useCaprices.getState().items).toBe(antes)
  })

  it('cerrar un bote deja de contarlo sin borrarlo', () => {
    const id = useCaprices.getState().open('tx_1', 3_200, 'A')
    useCaprices.getState().close(id, true)
    expect(useCaprices.getState().items[0].closed).toBe(true)
  })
})

/**
 * «OTRO IGUAL»: el mismo trato, otra persona.
 *
 * Con doce clientes del mismo servicio al mismo precio, añadir el trece era
 * reescribir ocho campos que ya estaban escritos doce veces.
 */
describe('duplicateClient', () => {
  beforeEach(limpiar)

  it('copia el trato: servicio, precio, ciclo y día', () => {
    const id = nuevoCliente({
      name: 'Juan', concept: 'Netflix', amount: 250, cycle: 'monthly', dueDay: 5,
      accountId: 'a1', categoryId: 'cat_stream', businessId: 'b1', serviceId: 'svc1',
    })
    const clon = useBusiness.getState().duplicateClient(id)!
    const nuevo = useBusiness.getState().clients.find(c => c.id === clon)!

    expect(nuevo).toMatchObject({
      concept: 'Netflix', amount: 250, cycle: 'monthly', dueDay: 5,
      accountId: 'a1', categoryId: 'cat_stream', businessId: 'b1', serviceId: 'svc1',
      active: true,
    })
    expect(nuevo.id).not.toBe(id)
  })

  it('NO HEREDA LA DEUDA del original', () => {
    // Un cliente nuevo que naciera debiendo lo que debía otro sería dinero
    // inventado: los cobros son de él, no del trato.
    const id = nuevoCliente()
    useBusiness.getState().addCharge(id, '2026-10-05', 250)
    const clon = useBusiness.getState().duplicateClient(id)!

    expect(useBusiness.getState().charges.filter(c => c.clientId === clon)).toEqual([])
    expect(useBusiness.getState().charges.filter(c => c.clientId === id)).toHaveLength(1)
  })

  it('no se lleva el teléfono ni las notas: son de una persona concreta', () => {
    // Copiarlo haría que el recordatorio de cobro le llegara al de al lado.
    const id = nuevoCliente({ phone: '809-555-1234', notes: 'Paga por Banreservas' })
    const clon = useBusiness.getState().duplicateClient(id)!
    const nuevo = useBusiness.getState().clients.find(c => c.id === clon)!

    expect(nuevo.phone).toBeUndefined()
    expect(nuevo.notes).toBeUndefined()
  })

  it('el ancla de fechas se pone a HOY, no la del original', () => {
    /*
     * Con la fecha vieja, `syncCharges` le generaría de golpe todos los cobros
     * desde que entró el primer cliente: el nuevo nacería debiendo un año.
     */
    const id = nuevoCliente({ cycle: 'biweekly', startDate: '2025-01-01' })
    const clon = useBusiness.getState().duplicateClient(id)!
    const nuevo = useBusiness.getState().clients.find(c => c.id === clon)!

    expect(nuevo.startDate).not.toBe('2025-01-01')
    expect(nuevo.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('un cliente sin ancla sigue sin ancla', () => {
    // Ponerle una a quien no la tenía le cambiaría el trato.
    const id = nuevoCliente({ cycle: 'monthly' })
    const clon = useBusiness.getState().duplicateClient(id)!
    expect(useBusiness.getState().clients.find(c => c.id === clon)!.startDate).toBeUndefined()
  })

  it('duplicar a uno PAUSADO lo crea activo', () => {
    // Se duplica para usarlo; nacer pausado obligaría a un paso más que nadie
    // pidió.
    const id = nuevoCliente({ active: false })
    const clon = useBusiness.getState().duplicateClient(id)!
    expect(useBusiness.getState().clients.find(c => c.id === clon)!.active).toBe(true)
  })

  it('duplicar a nadie devuelve null y no crea nada', () => {
    expect(useBusiness.getState().duplicateClient('fantasma')).toBeNull()
    expect(useBusiness.getState().clients).toEqual([])
  })
})

describe('el historial de precios se apunta solo', () => {
  beforeEach(limpiar)

  it('al SUBIRLE el precio, queda el anterior', () => {
    // Un precio que lleva dos años sin tocarse es dinero que se pierde sin
    // que nadie lo note, y hasta ahora el anterior desaparecía al guardar.
    const id = nuevoCliente({ amount: 200 })
    useBusiness.getState().updateClient(id, { amount: 250 })
    const c = useBusiness.getState().clients[0]
    expect(c.amount).toBe(250)
    expect(c.priceLog).toEqual([{ at: expect.any(Number), amount: 200 }])
  })

  it('editar OTRA cosa no apunta nada', () => {
    // Corregir una falta en el nombre no es una subida de precio, y un
    // historial lleno de entradas idénticas no se puede leer.
    const id = nuevoCliente({ amount: 200 })
    useBusiness.getState().updateClient(id, { name: 'Juana', notes: 'x' })
    expect(useBusiness.getState().clients[0].priceLog).toBeUndefined()
  })

  it('guardar el MISMO precio tampoco', () => {
    const id = nuevoCliente({ amount: 200 })
    useBusiness.getState().updateClient(id, { amount: 200 })
    expect(useBusiness.getState().clients[0].priceLog).toBeUndefined()
  })

  it('varios cambios se encadenan en orden', () => {
    const id = nuevoCliente({ amount: 100 })
    useBusiness.getState().updateClient(id, { amount: 150 })
    useBusiness.getState().updateClient(id, { amount: 200 })
    expect(useBusiness.getState().clients[0].priceLog?.map(p => p.amount)).toEqual([100, 150])
  })

  it('no crece sin fin', () => {
    // Un campo libre sin tope dentro de una copia de seguridad es lo que la
    // hace engordar hasta que deja de caber.
    const id = nuevoCliente({ amount: 1 })
    for (let i = 2; i <= 40; i += 1) useBusiness.getState().updateClient(id, { amount: i })
    const log = useBusiness.getState().clients[0].priceLog!
    expect(log.length).toBeLessThanOrEqual(12)
    // Se quedan los ÚLTIMOS, que son los que importan. El último cambio pone
    // 40 y apunta el anterior, 39.
    expect(log[log.length - 1].amount).toBe(39)
  })
})

describe('sanitizeBusinessData · los campos nuevos', () => {
  it('tira los repartos sin servicio o a cero', () => {
    const { clients } = sanitizeBusinessData({
      clients: [{
        id: 'cli1', name: 'Juan',
        serviceShares: [
          { serviceId: 'svc1', amount: 250 },
          { serviceId: '', amount: 100 },
          { serviceId: 'svc2', amount: 0 },
          'basura',
        ],
      }],
    })
    expect(clients[0].serviceShares).toEqual([{ serviceId: 'svc1', amount: 250 }])
  })

  it('recorta la nota de un cobro', () => {
    const { charges } = sanitizeBusinessData({
      clients: [{ id: 'cli1', name: 'Juan' }],
      charges: [{ id: 'ch1', clientId: 'cli1', dueDate: '2026-10-05', note: 'x'.repeat(500) }],
    })
    expect(charges[0].note).toHaveLength(280)
  })

  it('una nota en blanco no se guarda como nota', () => {
    const { charges } = sanitizeBusinessData({
      clients: [{ id: 'cli1', name: 'Juan' }],
      charges: [{ id: 'ch1', clientId: 'cli1', dueDate: '2026-10-05', note: '   ' }],
    })
    expect(charges[0].note).toBeUndefined()
  })

  it('tira las entradas de precio sin fecha', () => {
    const { clients } = sanitizeBusinessData({
      clients: [{ id: 'cli1', name: 'Juan', priceLog: [{ at: 0, amount: 100 }, { at: 5, amount: 200 }] }],
    })
    expect(clients[0].priceLog).toEqual([{ at: 5, amount: 200 }])
  })
})

/**
 * UNIR DOS FICHAS EN UNA.
 *
 * Hasta la 2.1.0 un cliente solo podía tener un servicio, así que quien te
 * compraba Netflix y Crunchyroll estaba apuntado dos veces, con su historial
 * partido entre dos fichas que no se hablan.
 */
describe('mergeClients', () => {
  beforeEach(limpiar)

  function dosFichas() {
    const a = nuevoCliente({ name: 'Carlos Méndez', serviceId: 'svc_netflix', amount: 250 })
    const b = nuevoCliente({ name: 'Carlos Mendez', serviceId: 'svc_crunchy', amount: 150 })
    useBusiness.getState().addCharge(a, '2026-09-05', 250)
    useBusiness.getState().addCharge(b, '2026-09-05', 150)
    useBusiness.getState().addCharge(b, '2026-10-05', 150)
    return { a, b }
  }

  const porId = <T extends { id: string }>(xs: T[]) =>
    [...xs].sort((x, y) => x.id.localeCompare(y.id))

  it('queda una sola ficha, con los dos servicios', () => {
    const { a, b } = dosFichas()
    useBusiness.getState().mergeClients(a, [b])
    const clients = useBusiness.getState().clients
    expect(clients).toHaveLength(1)
    expect(clients[0].id).toBe(a)
    expect(clients[0].serviceShares?.map(s => s.serviceId).sort()).toEqual(['svc_crunchy', 'svc_netflix'])
    expect(clients[0].amount).toBe(400)
  })

  it('LOS COBROS CAMBIAN DE DUEÑO, no se borran', () => {
    // Son dinero que esa persona te debió o te pagó de verdad.
    const { a, b } = dosFichas()
    useBusiness.getState().mergeClients(a, [b])
    const charges = useBusiness.getState().charges
    expect(charges).toHaveLength(3)
    expect(charges.every(c => c.clientId === a)).toBe(true)
  })

  it('se puede DESHACER y queda exactamente como estaba', () => {
    const { a, b } = dosFichas()
    const antesClientes = porId(useBusiness.getState().clients)
    const antesCobros = porId(useBusiness.getState().charges)

    const undo = useBusiness.getState().mergeClients(a, [b])!
    expect(undo).toBeTruthy()
    useBusiness.getState().unmergeClients(undo)

    expect(porId(useBusiness.getState().clients)).toEqual(antesClientes)
    expect(porId(useBusiness.getState().charges)).toEqual(antesCobros)
  })

  it('unir con un id que no existe no hace nada', () => {
    const a = nuevoCliente()
    expect(useBusiness.getState().mergeClients(a, ['fantasma'])).toBeNull()
    expect(useBusiness.getState().clients).toHaveLength(1)
  })

  it('no se absorbe a sí mismo', () => {
    const a = nuevoCliente()
    expect(useBusiness.getState().mergeClients(a, [a])).toBeNull()
    expect(useBusiness.getState().clients).toHaveLength(1)
  })
})

describe('moveService · el servicio se lleva sus clientes', () => {
  beforeEach(limpiar)

  it('cambia de negocio y arrastra a quien lo consume', () => {
    // Un cliente pertenece a un negocio a través del servicio que consume;
    // dejarlo atrás lo haría cliente de un negocio que no le vende nada.
    const svc = useBusiness.getState().addService({ businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly' })
    const cli = nuevoCliente({ businessId: 'b1', serviceId: svc })
    const otro = nuevoCliente({ businessId: 'b1', serviceId: 'svc_otro' })

    useBusiness.getState().moveService(svc, 'b2')

    expect(useBusiness.getState().services[0].businessId).toBe('b2')
    expect(useBusiness.getState().clients.find(c => c.id === cli)!.businessId).toBe('b2')
    // El que no lo consume se queda donde estaba.
    expect(useBusiness.getState().clients.find(c => c.id === otro)!.businessId).toBe('b1')
  })

  it('arrastra también a quien lo tiene en un reparto', () => {
    const svc = useBusiness.getState().addService({ businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly' })
    const cli = nuevoCliente({
      businessId: 'b1',
      serviceShares: [{ serviceId: svc, amount: 250 }, { serviceId: 'otro', amount: 150 }],
    })
    useBusiness.getState().moveService(svc, 'b2')
    expect(useBusiness.getState().clients.find(c => c.id === cli)!.businessId).toBe('b2')
  })
})

describe('moveClientToService', () => {
  beforeEach(limpiar)

  it('lo cambia de servicio y de negocio en un paso', () => {
    const svc = useBusiness.getState().addService({ businessId: 'bizX', name: 'Disney', cost: 450, costCycle: 'monthly' })
    const cli = nuevoCliente({ businessId: 'bizY', serviceId: 'viejo', serviceAccountId: 'cuenta1' })
    useBusiness.getState().moveClientToService(cli, svc)
    const c = useBusiness.getState().clients[0]
    expect(c.serviceId).toBe(svc)
    expect(c.businessId).toBe('bizX')
    // La plaza que ocupaba era de la cuenta vieja: conservarla lo pondría en
    // una cuenta del servicio nuevo que puede no existir.
    expect(c.serviceAccountId).toBeUndefined()
  })
})

describe('ordenar y archivar', () => {
  beforeEach(limpiar)

  const nuevoNegocio = (name: string) => useBusiness.getState().addBusiness({
    name, color: '#35d0a2', icon: 'play', incomeCategoryIds: [], expenseCategoryIds: [],
  })

  it('los negocios quedan en el orden que des', () => {
    const a = nuevoNegocio('A')
    const b = nuevoNegocio('B')
    const c = nuevoNegocio('C')
    useBusiness.getState().reorderBusinesses([c, a, b])
    expect(useBusiness.getState().businesses.map(x => x.name)).toEqual(['C', 'A', 'B'])
  })

  it('LO QUE NO VENGA EN LA LISTA NO SE PIERDE', () => {
    // Una lista de orden incompleta —por una copia vieja, por un filtro—
    // borraría negocios enteros si esto fuera un `map`.
    nuevoNegocio('A')
    const b = nuevoNegocio('B')
    useBusiness.getState().reorderBusinesses([b])
    expect(useBusiness.getState().businesses.map(x => x.name)).toEqual(['B', 'A'])
  })

  it('archivar saca de la lista y pausa a sus clientes', () => {
    const b = nuevoNegocio('Reventa')
    const cli = nuevoCliente({ businessId: b, active: true })
    useBusiness.getState().archiveBusiness(b, true)
    expect(useBusiness.getState().businesses[0].archivedAt).toBeGreaterThan(0)
    expect(useBusiness.getState().clients.find(c => c.id === cli)!.active).toBe(false)
  })

  it('ARCHIVAR NO BORRA NADA', () => {
    // Su historial sigue contando en los informes del año.
    const b = nuevoNegocio('Reventa')
    const cli = nuevoCliente({ businessId: b })
    useBusiness.getState().addCharge(cli, '2026-05-05', 250)
    useBusiness.getState().archiveBusiness(b, true)
    expect(useBusiness.getState().businesses).toHaveLength(1)
    expect(useBusiness.getState().clients).toHaveLength(1)
    expect(useBusiness.getState().charges).toHaveLength(1)
  })

  it('desarchivar quita la marca', () => {
    const b = nuevoNegocio('X')
    useBusiness.getState().archiveBusiness(b, true)
    useBusiness.getState().archiveBusiness(b, false)
    expect(useBusiness.getState().businesses[0].archivedAt).toBeUndefined()
  })
})

describe('Negocio a fondo: las acciones nuevas', () => {
  beforeEach(limpiar)

  it('quien recomendó gana su estrella sola al crear al cliente', () => {
    const madrina = nuevoCliente({ name: 'Maria' })
    const nueva = nuevoCliente({ name: 'Rosa', referredBy: madrina })
    const m = useBusiness.getState().clients.find(c => c.id === madrina)!
    expect(m.stars).toHaveLength(1)
    expect(m.stars![0].referredId).toBe(nueva)
  })

  it('las estrellas bajan el cobro que se genera', () => {
    nuevoCliente({ amount: 300, stars: [{ at: Date.now() }, { at: Date.now() }] })
    useBusiness.getState().syncCharges(HOY)
    const cobros = useBusiness.getState().charges
    expect(cobros.length).toBeGreaterThan(0)
    expect(cobros.every(c => c.amount === 270 && c.discountPct === 10)).toBe(true)
  })

  it('borrar guardando el historial conserva lo pagado y quita lo pendiente', () => {
    const id = nuevoCliente()
    useBusiness.setState(s => ({
      charges: [
        { id: 'pagado', clientId: id, dueDate: '2026-10-05', amount: 250, paid: 250, txIds: ['t'], paidAt: 1 },
        { id: 'pendiente', clientId: id, dueDate: '2026-11-05', amount: 250, paid: 0, txIds: [], paidAt: 0 },
        ...s.charges.filter(c => c.clientId !== id),
      ],
    }))
    useBusiness.getState().softDeleteClient(id)
    const st = useBusiness.getState()
    expect(st.clients.find(c => c.id === id)?.deletedAt).toBeGreaterThan(0)
    expect(st.charges.map(c => c.id)).toEqual(['pagado'])
    // Y sobrevive a recargar: el saneado no lo descarta.
    const recargado = sanitizeBusinessData(JSON.parse(JSON.stringify(st)))
    expect(recargado.charges.map(c => c.id)).toEqual(['pagado'])
  })

  it('borrar todo se lleva el cliente y sus cobros', () => {
    const id = nuevoCliente()
    useBusiness.setState(s => ({ charges: [...s.charges, { id: 'x', clientId: id, dueDate: '2026-10-05', amount: 1, paid: 1, txIds: ['t'], paidAt: 1 }] }))
    useBusiness.getState().purgeClient(id)
    expect(useBusiness.getState().clients).toEqual([])
    expect(useBusiness.getState().charges).toEqual([])
  })

  it('cerrar una cuenta pasa a sus clientes a otra', () => {
    const svc = useBusiness.getState().addService({ businessId: 'b', name: 'Netflix', cost: 600, costCycle: 'monthly', accounts: [{ id: 'a', cost: 600 }, { id: 'b2', cost: 600 }] })
    const c = nuevoCliente({ serviceId: svc, serviceAccountId: 'a' })
    useBusiness.getState().closeAccount(svc, 'a', 'b2')
    expect(useBusiness.getState().clients.find(x => x.id === c)?.serviceAccountId).toBe('b2')
    expect(useBusiness.getState().services[0].accounts?.find(a => a.id === 'a')?.closedAt).toBeGreaterThan(0)
  })

  it('el saneado guarda lo nuevo y descarta lo raro', () => {
    const r = sanitizeBusinessData({
      businesses: [{ id: 'b', name: 'N', referral: { pctPerStar: 10, maxPct: 300 } }],
      services: [{ id: 's', businessId: 'b', name: 'S', payMode: 'auto', payDay: 12, payHandled: ['a|2026-10-12', 'raro'], payMode2: 1, slotPrice: 350 }],
      clients: [{ id: 'c', name: 'C', stars: [{ at: 5 }, { at: 0 }], autoCollect: true, referredBy: 'x' }],
    })
    expect(r.businesses[0].referral).toEqual({ pctPerStar: 10, maxPct: 100, expiresMonths: undefined })
    expect(r.services[0]).toMatchObject({ payMode: 'auto', payDay: 12, payHandled: ['a|2026-10-12'], slotPrice: 350 })
    expect(r.clients[0]).toMatchObject({ stars: [{ at: 5 }], autoCollect: true, referredBy: 'x' })
  })
})
