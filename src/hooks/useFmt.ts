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
export function useFmt() {
  const decimals = useMoneyDecimals()
  const privacy = useSettings(s => s.privacyMode)
  return (n: number, currency: CurrencyCode | string) =>
    privacy ? MASK : fmt(n, currency as CurrencyCode, { decimals })
}

/**
 * Lo que se ve en modo privado.
 *
 * Ancho fijo y sin signo: con el monto real detras, un "−" delator o un texto
 * mas largo en unos sitios que en otros seguiria contando cuanto hay. Tapar a
 * medias no es tapar.
 */
export const MASK = '••••'

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
