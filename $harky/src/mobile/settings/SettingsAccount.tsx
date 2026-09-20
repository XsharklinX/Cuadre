import type { SheetProps } from './shared'

/**
 * Cuenta cloud (correo/Google + sync) OCULTA por decisión de producto: no
 * aporta valor actualmente y su mantenimiento (Supabase, SMTP, etc.) tiene un
 * costo que no se justifica todavía. El store (`useAuth`, `useCloudSync`) y
 * toda la lógica siguen intactos — solo se esconde la entrada visible.
 *
 * Para reactivar: restaurar el JSX de login/perfil que vivía aquí (ver
 * historial de git) — no hace falta tocar el store.
 */
export function SettingsAccount(_props: Pick<SheetProps, 'onOpen'>) {
  return null
}
