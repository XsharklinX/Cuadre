// Paleta de colores de acento (usada en pickers de color, categorías, metas, deudas)
export const ACCENT_COLORS = [
  '#ffdd3d', '#35d0a2', '#5bc0ff', '#a78bfa', '#ff6b8a', '#f59e0b',
] as const

// Paleta extendida para categorías (acento + 4 tonos adicionales)
export const CAT_COLORS = [
  ...ACCENT_COLORS, '#fb7185', '#22c55e', '#c084fc', '#38bdf8',
] as const

// Todos los códigos de moneda soportados
export const CURRENCY_CODES = [
  'DOP', 'USD', 'EUR', 'MXN', 'GBP', 'COP', 'ARS', 'BRL', 'CAD',
] as const

// Debounce del auto-backup local (ms)
export const BACKUP_DEBOUNCE_MS = 3_000

// Debounce de la sincronización cloud (ms)
export const SYNC_DEBOUNCE_MS = 1_800

// Umbral de almacenamiento para advertencia (70%) y crítico (90%)
export const STORAGE_WARN_RATIO = 0.7
export const STORAGE_CRITICAL_RATIO = 0.9
