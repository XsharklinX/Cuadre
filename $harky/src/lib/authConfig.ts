/**
 * Cuenta cloud (correo + contraseña, Google, sync multi-dispositivo) OCULTA
 * por decisión de producto: no aporta valor actualmente y su mantenimiento
 * (Supabase, SMTP) tiene un costo operativo/de atención que no se justifica
 * todavía. La app queda 100% local — sin llamadas de red a Supabase, incluso
 * al arrancar.
 *
 * `CLOUD_AUTH_ENABLED = false` corta `initialize()` en seco (no toca
 * Supabase para nada) y `SettingsAccount` no renderiza ninguna UI. El login
 * local (PIN/patrón, sin red) sigue funcionando igual.
 *
 * Para reactivar: poner esto en `true` y restaurar el JSX de
 * `SettingsAccount` (ver historial de git) — no hace falta tocar el store.
 */
export const CLOUD_AUTH_ENABLED = false

/** @deprecated usar CLOUD_AUTH_ENABLED — se mantiene por compatibilidad. */
export const GOOGLE_AUTH_ENABLED = CLOUD_AUTH_ENABLED
