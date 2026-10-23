import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { WAIT_DAYS, type Wish } from '@/data/wishes'
import { newId } from '@/data/seed'

/**
 * LOS ANTOJOS.
 *
 * Clave propia, igual que los caprichos y los clientes: aquí tampoco hay
 * dinero. Un antojo es algo que QUIERES, no algo que pasó, así que no toca
 * ningún saldo ni aparece en ningún informe hasta que se compra — y entonces
 * lo que aparece es el gasto, como cualquier otro.
 *
 * ── LO DESCARTADO NO SE BORRA ─────────────────────────────────────────
 * Un antojo que dejaste pasar es el dato más valioso de esta función: es la
 * prueba de que esperar funciona. Se queda, resuelto, y alimenta «lo que no
 * gastaste este año».
 */

interface WishesState {
  items: Wish[]
  /** Apunta un antojo. Empieza a contar la espera desde ahora. */
  add: (name: string, amount: number, note?: string) => string
  update: (id: string, fields: Partial<Omit<Wish, 'id'>>) => void
  /** Lo compraste. `txId` es el gasto, si ya se registró. */
  buy: (id: string, txId?: string) => void
  /** Se te pasaron las ganas. Esto es lo que cuenta como ahorro. */
  skip: (id: string) => void
  /** Vuelve a dejarlo esperando, por si te equivocaste de botón. */
  reopen: (id: string) => void
  remove: (id: string) => void
  /** Tira los antojos comprados cuyo gasto ya no está en el libro. */
  prune: (liveTxIds: Set<string>) => void
}

const DIA = 86_400_000
/** Un tope para que la lista no crezca sin fin dentro de una copia. */
const MAX = 300

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** El único validador, como en los demás almacenes. Lo usa la restauración. */
export function sanitizeWishes(raw: unknown): Wish[] {
  const lista = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : [])

  return lista
    .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
    .filter(w => str(w.id) && str(w.name).trim())
    .map((w): Wish => {
      const createdAt = num(w.createdAt, Date.now())
      const resolution = w.resolution === 'bought' || w.resolution === 'skipped'
        ? w.resolution
        : undefined
      return {
        id: str(w.id),
        name: str(w.name).trim().slice(0, 120),
        amount: Math.max(0, num(w.amount)),
        createdAt,
        // Sin fecha de decisión válida se recalcula: un antojo sin ella
        // quedaría esperando para siempre o listo desde el primer día.
        decideAt: num(w.decideAt) > 0 ? num(w.decideAt) : createdAt + WAIT_DAYS * DIA,
        resolvedAt: resolution ? num(w.resolvedAt, createdAt) : 0,
        resolution,
        txId: str(w.txId) || undefined,
        note: str(w.note).trim().slice(0, 280) || undefined,
      }
    })
    .slice(-MAX)
}

export const useWishes = create<WishesState>()(
  persist(
    (set, get) => ({
      items: [],

      add: (name, amount, note) => {
        const id = newId('wish_')
        const now = Date.now()
        set(s => ({
          items: [...s.items, {
            id,
            name: name.trim().slice(0, 120),
            amount: Math.max(0, amount),
            createdAt: now,
            decideAt: now + WAIT_DAYS * DIA,
            resolvedAt: 0,
            note: note?.trim().slice(0, 280) || undefined,
          }].slice(-MAX),
        }))
        return id
      },

      update: (id, fields) => set(s => ({
        items: s.items.map(w => w.id === id ? { ...w, ...fields } : w),
      })),

      buy: (id, txId) => set(s => ({
        items: s.items.map(w => w.id === id
          ? { ...w, resolution: 'bought' as const, resolvedAt: Date.now(), txId: txId || w.txId }
          : w),
      })),

      skip: (id) => set(s => ({
        items: s.items.map(w => w.id === id
          ? { ...w, resolution: 'skipped' as const, resolvedAt: Date.now() }
          : w),
      })),

      /*
       * Reabrir reinicia la espera desde HOY.
       *
       * Si conservara la fecha vieja, un antojo descartado hace un mes
       * volvería ya listo para decidir, y la espera —que es toda la función—
       * no habría servido de nada.
       */
      reopen: (id) => set(s => ({
        items: s.items.map(w => {
          if (w.id !== id) return w
          const now = Date.now()
          return { ...w, resolution: undefined, resolvedAt: 0, txId: undefined, decideAt: now + WAIT_DAYS * DIA, createdAt: now }
        }),
      })),

      remove: (id) => set(s => ({ items: s.items.filter(w => w.id !== id) })),

      /*
       * Solo se limpia el VÍNCULO, no el antojo.
       *
       * Que se borre el gasto no significa que no lo compraras: significa que
       * se perdió la prueba. Borrar el antojo entero convertiría un error en
       * la papelera en una compra que nunca pasó.
       */
      prune: (liveTxIds) => {
        const antes = get().items
        let tocado = false
        const despues = antes.map(w => {
          if (!w.txId || liveTxIds.has(w.txId)) return w
          tocado = true
          return { ...w, txId: undefined }
        })
        if (tocado) set({ items: despues })
      },
    }),
    {
      name: 'cuadre-wishes-v1',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({ ...current, items: sanitizeWishes(persisted) }),
    },
  ),
)
