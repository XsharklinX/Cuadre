import type { IconName } from '@/types'
import type { LangKey } from '@/i18n'
import type { Sheet } from './shared'

/** Las secciones de Ajustes (las mismas que el hub). */
export type SettingsCategory = 'finance' | 'appearance' | 'categories' | 'data' | 'security' | 'bank' | 'about'

/*
 * EL ÍNDICE DEL BUSCADOR DE AJUSTES.
 *
 * Vive aparte para que lo use también el buscador del menú ☰ (2.6) sin
 * arrastrar la pantalla de Ajustes entera al arranque.
 */
export interface SearchEntry {
  /** Hoja que abre. `null` = ajuste que vive suelto en su sección (un interruptor, la letra). */
  sheet: Sheet | null
  /** Sección a la que salta cuando no hay hoja. */
  section?: SettingsCategory
  icon: IconName
  color: string
  labelKey: LangKey
  crumbKey: LangKey
  keywords: string
  tauriOnly?: boolean
}
export const SEARCH_INDEX: SearchEntry[] = [
  { sheet: 'currency',     icon: 'dollar',   color: '#35d0a2', labelKey: 'currency',              crumbKey: 'financeSection',     keywords: 'moneda currency divisa dop usd eur peso dolar' },
  { sheet: 'overdraft',    icon: 'alert',    color: '#f59e0b', labelKey: 'overdraft',             crumbKey: 'financeSection',     keywords: 'sobregiro overdraft saldo negativo limite' },
  { sheet: 'fxAlert',      icon: 'trend',    color: '#5bc0ff', labelKey: 'fxAlertLabel',          crumbKey: 'financeSection',     keywords: 'tasa cambio exchange rate alerta divisa' },
  { sheet: 'anomalyAlert', icon: 'alert',    color: '#ff6b8a', labelKey: 'anomalyAlertLabel',     crumbKey: 'financeSection',     keywords: 'gasto inusual anomaly alerta anomalia deteccion' },
  { sheet: 'theme',        icon: 'palette',  color: '#a78bfa', labelKey: 'theme',                 crumbKey: 'appearanceSection',  keywords: 'tema theme oscuro claro dark light amoled apariencia' },
  { sheet: 'accent',       icon: 'palette',  color: '#5bc0ff', labelKey: 'accentColor',           crumbKey: 'appearanceSection',  keywords: 'acento color accent' },
  { sheet: 'density',      icon: 'sliders',  color: '#35d0a2', labelKey: 'density',               crumbKey: 'appearanceSection',  keywords: 'densidad density compacto espaciado tamano' },
  { sheet: 'language',     icon: 'user',     color: '#ffdd3d', labelKey: 'language',              crumbKey: 'appearanceSection',  keywords: 'idioma language english espanol lenguaje' },
  { sheet: 'soundProfile', icon: 'bell',     color: '#ff6b8a', labelKey: 'soundProfile',          crumbKey: 'soundHapticsSection', keywords: 'sonido sound haptico vibracion volumen audio' },
  { sheet: 'categories',   icon: 'tag',      color: '#a78bfa', labelKey: 'categorySettings',      crumbKey: 'categorySettings',   keywords: 'categoria category presupuesto icono color' },
  { sheet: 'categoryRules', icon: 'sliders', color: '#5bc0ff', labelKey: 'categoryRulesLabel',    crumbKey: 'categorySettings',   keywords: 'regla rule aprendida categorizacion automatica' },
  { sheet: 'export',       icon: 'download', color: '#35d0a2', labelKey: 'exportData',            crumbKey: 'dataSection',        keywords: 'exportar export backup respaldo json excel pdf descargar' },
  { sheet: 'backupSchedule', icon: 'fileJson', color: '#a78bfa', labelKey: 'weeklyBackupLastLabel', crumbKey: 'dataSection',      keywords: 'backup semanal respaldo automatico carpeta weekly', tauriOnly: true },
  { sheet: 'reset',        icon: 'trash',    color: '#ff6b8a', labelKey: 'deleteAllData',         crumbKey: 'dataSection',        keywords: 'borrar delete eliminar reiniciar datos todo' },
  { sheet: 'pin',          icon: 'key',      color: '#ffdd3d', labelKey: 'appLock',               crumbKey: 'securitySection',    keywords: 'bloqueo lock pin patron biometria huella seguridad' },
  { sheet: 'bankNotifications', icon: 'bell', color: '#5bc0ff', labelKey: 'transactionDetection', crumbKey: 'notificationsSection', keywords: 'notificacion banco deteccion transaccion automatica recordatorio segundo plano agregar rapido', tauriOnly: true },
  { sheet: 'comments',     icon: 'edit',     color: '#a78bfa', labelKey: 'comments',              crumbKey: 'aboutSection',       keywords: 'comentario feedback sugerencia opinion' },
  { sheet: 'about',        icon: 'info',     color: '#5bc0ff', labelKey: 'aboutUs',               crumbKey: 'aboutSection',       keywords: 'acerca nosotros about version' },
  { sheet: 'privacy',      icon: 'lock',     color: '#35d0a2', labelKey: 'privacyPolicy',         crumbKey: 'aboutSection',       keywords: 'privacidad privacy datos politica' },
  { sheet: 'terms',        icon: 'fileJson', color: '#7a8296', labelKey: 'termsOfUse',            crumbKey: 'aboutSection',       keywords: 'terminos terms condiciones uso legal' },
  /*
   * LO QUE NO ES UNA HOJA.
   *
   * El buscador solo encontraba ajustes que abren hoja. El tamaño de letra, el
   * modo privado o la vibración son interruptores sueltos dentro de su
   * sección, y buscar «letra» no daba nada. Estos saltan a la sección.
   */
  { sheet: null, section: 'appearance', icon: 'sliders', color: '#a78bfa', labelKey: 'fontSizeLabel',     crumbKey: 'appearanceSection',  keywords: 'letra fuente tamano texto grande pequena zoom font size' },
  { sheet: null, section: 'appearance', icon: 'eyeOff',  color: '#35d0a2', labelKey: 'privacyModeLabel',  crumbKey: 'appearanceSection',  keywords: 'privado privacidad ocultar montos tapar privacy' },
  { sheet: null, section: 'appearance', icon: 'coins',   color: '#5bc0ff', labelKey: 'compactNumbers',    crumbKey: 'appearanceSection',  keywords: 'numeros compactos abreviar miles k m' },
  { sheet: null, section: 'appearance', icon: 'bell',    color: '#ff6b8a', labelKey: 'hapticsLabel',      crumbKey: 'soundHapticsSection', keywords: 'vibracion vibrar haptico haptics' },
  { sheet: null, section: 'finance',    icon: 'coins',   color: '#ffdd3d', labelKey: 'roundAmountsLabel', crumbKey: 'financeSection',     keywords: 'redondear centavos decimales round' },
]

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

