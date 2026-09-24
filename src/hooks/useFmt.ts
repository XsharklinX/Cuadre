import { fmt } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import type { CurrencyCode } from '@/types'

/**
 * Formato de dinero que respeta la preferencia del usuario.
 *
 * La opcion se llamaba "Numeros resumidos" y prometia "1.7k", pero la
 * abreviacion se quito de la app hace versiones: `fmtCompact` quedo como un
 * alias de `fmt`, asi que el interruptor **no hacia absolutamente nada**.
 * Ahora significa lo unico que puede significar: mostrar los montos sin
 * centavos.
 */
/**
 * El enmascarado del modo privado NO vive aqui: vive en `fmt`.
 *
 * Estuvo aqui y era un colador — catorce archivos llaman a `fmt()` sin pasar
 * por este hook. Se suscribe igual a `privacyMode` para que las pantallas se
 * repinten al encenderlo; el valor que devuelve lo decide `fmt`.
 */
export function useFmt() {
  const decimals = useMoneyDecimals()
  useSettings(s => s.privacyMode)
  return (n: number, currency: CurrencyCode | string) =>
    fmt(n, currency as CurrencyCode, { decimals })
}

/**
 * Decimales que el usuario quiere ver: `0` si pidio ocultar los centavos,
 * `undefined` para dejar los de la divisa.
 *
 * Existe para los sitios que llaman a `fmt` o a `AnimatedMoney` directamente:
 * sin esto, cada pantalla decidia por su cuenta y habia montos con centavos y
 * sin centavos en la misma vista.
 */
export function useMoneyDecimals(): number | undefined {
  return useSettings(s => s.compactNumbers) ? 0 : undefined
}
