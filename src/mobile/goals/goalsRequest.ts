import { create } from 'zustand'

/**
 * Lo que el «+» grande le pide a Metas: aportar a la meta principal o crear
 * una nueva. Va por un almacén mínimo, igual que `useCreateRequest` en
 * Negocio, porque la barra de abajo no tiene acceso a la pantalla.
 */
type GoalsRequest = 'contributeMain' | 'new' | null

export const useGoalsRequest = create<{
  request: GoalsRequest
  ask: (r: Exclude<GoalsRequest, null>) => void
  clear: () => void
}>(set => ({
  request: null,
  ask: request => set({ request }),
  clear: () => set({ request: null }),
}))
