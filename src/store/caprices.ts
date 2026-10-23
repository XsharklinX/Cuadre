import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { addPayment, removePayment, type Caprice, type CapricePayment } from '@/data/caprices'
import { newId } from '@/data/seed'

/**
 * EL BOTE DE LOS CAPRICHOS.
 *
 * Clave propia, aparte del libro, por lo mismo que los clientes: aquí no hay
 * dinero. Lo que hay son referencias a movimientos que ya existen — el gasto
 * que abrió el bote y los movimientos que lo van saldando.
 *
 * Que los aportes sean REFERENCIAS y no montos sueltos es lo que mantiene esto
 * honesto. Si un aporte fuera solo un número, «recuperado» sería una opinión y
 * esto dejaría de ser una cuenta para ser un videojuego pegado encima de tus
 * finanzas.
 */

interface CapricesState {
  items: Caprice[]
  /** Marca un gasto como capricho y abre su bote. */
  open: (txId: string, amount: number, note: string) => string
  /** Añade un aporte respaldado por un movimiento real. */
  pay: (capriceId: string, amount: number, txId: string) => void
  /** Quita un aporte, por ejemplo si se borró el movimiento. */
  unpay: (capriceId: string, txId: string) => void
  /** Cierra un bote. No es un fracaso: deja de contar y se puede olvidar. */
  close: (id: string, closed: boolean) => void
  /**
   * La fecha para la que quieres tenerlo recuperado.
   *
   * No es una promesa que la app vigile: es lo que permite calcular el ritmo,
   * que es lo que convierte una barra de progreso en algo accionable.
   */
  setTarget: (id: string, targetDate: string | undefined) => void
  remove: (id: string) => void
  /** Si un gasto ya tiene bote, para no abrir dos del mismo. */
  byTxId: (txId: string) => Caprice | undefined
  /** Limpia los botes cuyo gasto ya no existe en el libro. */
  prune: (liveTxIds: Set<string>) => number
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Se exporta por lo mismo que el de negocio: es el unico validador, y la
 * restauracion necesitaba uno. Acepta la lista suelta o el objeto del almacen.
 */
export function sanitizeCaprices(raw: unknown): Caprice[] {
  const lista = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : null)
  if (!Array.isArray(lista)) return []
  return lista
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .filter(c => str(c.id) && str(c.txId) && num(c.amount) > 0)
    .map((c): Caprice => ({
      id: str(c.id),
      txId: str(c.txId),
      amount: num(c.amount),
      note: str(c.note),
      createdAt: num(c.createdAt, Date.now()),
      // Un aporte sin movimiento detrás se descarta: era justo lo que no podía
      // pasar, y dejarlo pasar al cargar sería la puerta de atrás.
      payments: (Array.isArray(c.payments) ? c.payments : [])
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .filter(p => str(p.txId) && num(p.amount) > 0)
        .map((p): CapricePayment => ({ txId: str(p.txId), amount: num(p.amount), at: num(p.at) })),
      closed: c.closed === true ? true : undefined,
      // Sin esta linea la fecha objetivo se perderia al reiniciar la app, y
      // con ella el ritmo: este saneador reconstruye desde una lista blanca,
      // igual que `normalizeTransaction`.
      targetDate: /^\d{4}-\d{2}-\d{2}$/.test(str(c.targetDate)) ? str(c.targetDate) : undefined,
      challenge: (() => {
        const r = c.challenge
        if (!r || typeof r !== 'object') return undefined
        const o = r as Record<string, unknown>
        const what = str(o.what).trim().slice(0, 120)
        const amount = Math.max(0, num(o.amount))
        const endsAt = num(o.endsAt)
        // Un reto sin lo que te propones, sin monto o sin fecha no es un reto.
        return what && amount > 0 && endsAt > 0 ? { what, amount, endsAt } : undefined
      })(),
    }))
}

export const useCaprices = create<CapricesState>()(
  persist(
    (set, get) => ({
      items: [],

      open: (txId, amount, note) => {
        // Dos botes del mismo gasto le harían deber el doble de lo que gastó.
        const existente = get().items.find(c => c.txId === txId)
        if (existente) return existente.id
        const id = newId('cap_')
        set(s => ({
          items: [...s.items, { id, txId, amount, note, createdAt: Date.now(), payments: [] }],
        }))
        return id
      },

      pay: (capriceId, amount, txId) => set(s => ({
        items: s.items.map(c => c.id === capriceId ? addPayment(c, amount, txId, Date.now()) : c),
      })),

      unpay: (capriceId, txId) => set(s => ({
        items: s.items.map(c => c.id === capriceId ? removePayment(c, txId) : c),
      })),

      close: (id, closed) => set(s => ({
        items: s.items.map(c => c.id === id ? { ...c, closed: closed || undefined } : c),
      })),

      setTarget: (id, targetDate) => set(s => ({
        items: s.items.map(c => c.id === id ? { ...c, targetDate } : c),
      })),

      remove: (id) => set(s => ({ items: s.items.filter(c => c.id !== id) })),

      byTxId: (txId) => get().items.find(c => c.txId === txId),

      /**
       * Tira los botes y los aportes cuyo movimiento ya no está en el libro.
       *
       * Hace falta porque el libro se puede reemplazar por detrás —restaurar
       * una copia, cerrar un periodo— y entonces quedan botes apuntando a
       * gastos que no existen: un bote que pide recuperar dinero de una compra
       * que nadie puede ver.
       */
      prune: (liveTxIds) => {
        const antes = get().items
        let tocado = false
        const despues: Caprice[] = []
        for (const c of antes) {
          if (!liveTxIds.has(c.txId)) { tocado = true; continue }
          const vivos = c.payments.filter(p => liveTxIds.has(p.txId))
          if (vivos.length !== c.payments.length) { tocado = true; despues.push({ ...c, payments: vivos }) }
          else despues.push(c)
        }
        // Solo se escribe si algo cambió: un `set` en cada arranque haría
        // repintar a todo el que esté suscrito sin motivo.
        if (tocado) set({ items: despues })
        return antes.length - despues.length
      },
    }),
    {
      name: 'cuadre-caprices-v1',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({ ...current, items: sanitizeCaprices(persisted) }),
    },
  ),
)
