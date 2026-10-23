import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { addToTrash, pruneTrash, sanitizeTrash, takeFromTrash, type TrashedTx } from '@/data/trash'
import type { Transaction } from '@/types'

/**
 * La papelera, con su propia clave de almacenamiento.
 *
 * Deliberadamente SEPARADA de `sharky-finance-v2`: ver el comentario largo en
 * `data/trash.ts`. En resumen — tocar la forma del libro arrastra el saneado
 * al cargar, el formato de las copias de seguridad y Salud de datos, y un
 * movimiento ya borrado no justifica ese riesgo.
 *
 * Aquí solo vive el almacén. Las reglas (caducidad, tope, duplicados,
 * validación) están en `data/trash.ts`, que es puro y tiene sus pruebas.
 */

interface TrashState {
  items: TrashedTx[]
  /** Guarda una copia de lo borrado. La llama quien borra, después de borrar. */
  push: (tx: Transaction) => void
  /** Saca una entrada y la devuelve, para que quien llama la reinserte. */
  pop: (id: string) => TrashedTx | null
  /** Vacía la papelera de golpe. */
  clear: () => void
  /** Quita lo caducado. Se llama al abrir la pantalla. */
  prune: () => void
}

export const useTrash = create<TrashState>()(
  persist(
    (set, get) => ({
      items: [],

      push: (tx) => set(s => ({ items: addToTrash(s.items, tx) })),

      pop: (id) => {
        const { items, taken } = takeFromTrash(get().items, id)
        if (taken) set({ items })
        return taken
      },

      clear: () => set({ items: [] }),

      prune: () => set(s => {
        const limpio = pruneTrash(s.items)
        // Solo se escribe si algo cambió: un `set` por cada apertura de la
        // pantalla haría repintar a todo el que esté suscrito sin motivo.
        return limpio.length === s.items.length ? s : { items: limpio }
      }),
    }),
    {
      name: 'cuadre-trash-v1',
      storage: createJSONStorage(() => localStorage),
      // La papelera se sanea al cargar, igual que el libro: lo que hay en
      // `localStorage` lo puede haber escrito una versión vieja o una mano
      // ajena. Aquí descartar es seguro, porque no hay dinero vivo — solo
      // copias de lo que ya se borró.
      merge: (persisted, current) => ({
        ...current,
        items: sanitizeTrash((persisted as { items?: unknown } | undefined)?.items),
      }),
    },
  ),
)
