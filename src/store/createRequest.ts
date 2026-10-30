import { create } from 'zustand'

/**
 * EL BOTÓN + DE LA BARRA, CUANDO ESTÁS EN NEGOCIO.
 *
 * El botón vive en la barra de abajo y lo que tiene que abrir vive en la
 * pantalla de Negocio, que es quien conoce sus hojas. Este almacén es el
 * recado entre las dos: la barra lo deja y la pantalla lo recoge.
 *
 * No se persiste: un recado que sobreviviera a cerrar la app abriría un menú
 * que nadie pidió al volver a entrar.
 */
interface CreateRequestState {
  /** Sube cada vez que se pide; la pantalla reacciona al cambio, no al valor. */
  businessMenu: number
  askBusinessMenu: () => void
  /**
   * «Movimiento» desde el menú de Negocio: el MISMO flujo que el + de
   * siempre, no el formulario genérico de editar. Lo abre el Shell, que es
   * quien sabe ir a la ruta de crear.
   */
  addMovement: number
  askAddMovement: () => void
  /** El «+» grande en Cuentas: abrir el editor de una cuenta nueva. */
  newAccount: number
  askNewAccount: () => void
}

export const useCreateRequest = create<CreateRequestState>()(set => ({
  businessMenu: 0,
  askBusinessMenu: () => set(s => ({ businessMenu: s.businessMenu + 1 })),
  addMovement: 0,
  askAddMovement: () => set(s => ({ addMovement: s.addMovement + 1 })),
  newAccount: 0,
  askNewAccount: () => set(s => ({ newAccount: s.newAccount + 1 })),
}))
