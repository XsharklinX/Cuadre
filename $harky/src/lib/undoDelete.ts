import { toast } from '@/components/ui/Toast'
import { tt } from '@/i18n'

/**
 * Borra algo dejando 5 s de red de seguridad: ejecuta el borrado ya (la lista
 * reacciona al instante, como siempre) y muestra un snackbar con «Deshacer»
 * que reinserta el objeto exacto que se quitó.
 *
 * El borrado es inmediato a propósito, no diferido: diferirlo obligaría a cada
 * lista a filtrar un estado «pendiente de borrado», y bastantes vistas leen el
 * store directo. Restaurar desde un snapshot es más simple y no deja la UI en
 * un limbo. `onRestore` tiene que reinsertar preservando el id y revirtiendo el
 * efecto en saldos — por eso cada entidad tiene su propio `restore*` en el
 * store, en vez de un `add*` que generaría un id nuevo.
 *
 * Si restaurar falla (p. ej. el saldo ya no da para revertir un gasto), se
 * avisa en vez de fallar en silencio.
 */
export function deleteWithUndo(opts: {
  /** Mensaje del snackbar, ya traducido (ej. «Cuenta eliminada»). */
  message: string
  onDelete: () => void
  onRestore: () => void
}): void {
  opts.onDelete()
  toast(opts.message, {
    icon: 'trash',
    duration: 5000,
    action: {
      label: tt('undo'),
      onClick: () => {
        try {
          opts.onRestore()
        } catch (error) {
          toast(error instanceof Error ? error.message : tt('couldNotSave'), { icon: 'alert' })
        }
      },
    },
  })
}
