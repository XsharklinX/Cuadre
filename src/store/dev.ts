import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * MODO DESARROLLADOR — oculto, se abre con seis toques sobre la versión en
 * "Acerca de" (ver `data/devUnlock.ts`).
 *
 * No es una preferencia del usuario: vive en su propio almacén para que un
 * respaldo o una restauración de los ajustes normales nunca lo arrastre a otro
 * teléfono. Quien lo quiera, que haga el gesto.
 */
interface DevState {
  /** ¿El gesto ya se completó en ESTE dispositivo? */
  unlocked: boolean
  /**
   * VIP SIMULADO.
   *
   * Hoy es solo para probar la interfaz: el interruptor del panel de
   * desarrollador enciende la insignia y lo que dependa de ella sin cobrar
   * nada. Cuando exista la compra de verdad, este campo pasa a ser el reflejo
   * local de lo que diga Google Play, NO la fuente de la verdad — una bandera
   * en localStorage se cambia desde las DevTools en diez segundos.
   */
  vip: boolean
  /**
   * Pide abrir el dialogo de valoracion en el PROXIMO arranque, saltandose
   * sus reglas. Se persiste porque el dialogo lo monta App, no Ajustes: hace
   * falta recargar para verlo.
   */
  forceRating: boolean
  setForceRating: (v: boolean) => void
  unlock: () => void
  lock: () => void
  setVip: (vip: boolean) => void
}

export const useDev = create<DevState>()(
  persist(
    (set) => ({
      unlocked: false,
      vip: false,
      forceRating: false,
      setForceRating: (forceRating) => set({ forceRating }),
      unlock: () => set({ unlocked: true }),
      // Al cerrar el modo se apaga también el VIP simulado: si no, quedaría
      // una insignia encendida sin forma visible de apagarla.
      lock: () => set({ unlocked: false, vip: false, forceRating: false }),
      setVip: (vip) => set({ vip }),
    }),
    {
      name: 'cuadre-dev-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
