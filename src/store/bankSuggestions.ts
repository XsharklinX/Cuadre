import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isDuplicateMovement, type ProcessedMovement } from '@/data/bankIngest'

const MAX_ITEMS = 50
const MAX_PROCESSED = 120

export interface BankSuggestion {
  id: string
  date: string // YYYY-MM-DD
  amount: number
  type: 'income' | 'expense'
  note: string
  postTime: number
  /** Paquete de la app que generó el aviso (ej. "com.bhd.bankingapp") — para recordar a qué cuenta mapearlo. */
  pkg: string
  /** Últimos 4 dígitos de la tarjeta/cuenta, si el banco los incluyó en el texto. */
  cardLast4?: string
  /** Moneda detectada en el aviso; ayuda a elegir la cuenta correcta (DOP vs USD). */
  currency?: 'DOP' | 'USD'
  /**
   * Id del movimiento que YA podrías haber tecleado tú por esta misma compra.
   * Cuando está presente, la sugerencia no se auto-creó a propósito y se
   * muestra marcada, para que decidas si es repetido o son dos gastos
   * distintos del mismo monto.
   */
  possibleDuplicateOf?: string
}

interface BankSuggestionsState {
  enabled: boolean
  /** Si está activo, cuando el aviso se puede resolver a una cuenta (por los 4
   *  dígitos o el mapeo por app) el movimiento se CREA solo, sin pedir confirmar. */
  autoCreate: boolean
  items: BankSuggestion[]
  /** Recuerda a qué cuenta asignar los avisos de cada app bancaria, una vez que el usuario confirma una. */
  packageAccountMap: Record<string, string>
  /** Firmas de movimientos ya procesados (para no duplicar cuando llegan 2-3
   *  notificaciones del mismo consumo). Se poda para no crecer sin límite. */
  processed: ProcessedMovement[]
  setEnabled: (enabled: boolean) => void
  setAutoCreate: (autoCreate: boolean) => void
  add: (item: Omit<BankSuggestion, 'id'>) => void
  remove: (id: string) => void
  clear: () => void
  rememberAccountForPackage: (pkg: string, accountId: string) => void
  forgetAccountForPackage: (pkg: string) => void
  /** true si ya se procesó un movimiento con esta firma hace poco (duplicado). */
  isRecentlyProcessed: (key: string, postTime: number) => boolean
  /** Registra una firma como procesada (evita duplicar los avisos que siguen). */
  markProcessed: (key: string, postTime: number) => void
}

export const useBankSuggestions = create<BankSuggestionsState>()(
  persist(
    (set, get) => ({
      enabled: false,
      autoCreate: true,
      items: [],
      packageAccountMap: {},
      processed: [],
      setEnabled: (enabled) => set({ enabled }),
      setAutoCreate: (autoCreate) => set({ autoCreate }),
      add: (item) => {
        // Evita duplicados cuando el banco actualiza/reemplaza la misma notificación.
        const isDuplicate = get().items.some(existing =>
          existing.date === item.date
          && existing.amount === item.amount
          && existing.type === item.type
          && Math.abs(existing.postTime - item.postTime) < 5 * 60_000)
        if (isDuplicate) return
        set((state) => ({
          items: [
            { ...item, id: `${item.postTime}-${Math.random().toString(36).slice(2)}` },
            ...state.items,
          ].slice(0, MAX_ITEMS),
        }))
      },
      remove: (id) => set((state) => ({ items: state.items.filter(item => item.id !== id) })),
      clear: () => set({ items: [] }),
      rememberAccountForPackage: (pkg, accountId) => set((state) => ({
        packageAccountMap: { ...state.packageAccountMap, [pkg]: accountId },
      })),
      forgetAccountForPackage: (pkg) => set((state) => {
        const { [pkg]: _removed, ...rest } = state.packageAccountMap
        return { packageAccountMap: rest }
      }),
      isRecentlyProcessed: (key, postTime) => isDuplicateMovement(get().processed, key, postTime),
      markProcessed: (key, postTime) => set((state) => ({
        processed: [{ key, postTime }, ...state.processed].slice(0, MAX_PROCESSED),
      })),
    }),
    {
      name: 'sharky-bank-suggestions-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
