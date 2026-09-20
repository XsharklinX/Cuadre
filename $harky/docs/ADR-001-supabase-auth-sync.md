# ADR-001: Backend y autenticacion para sincronizacion

Fecha: 2026-06-02  
Estado: Aceptado

## Decision

Usar Supabase Cloud como backend gestionado para la sincronizacion opcional de
`$harky`.

- Region inicial: `us-east-1` (North Virginia), cercana a Republica Dominicana.
- Proyecto aprovisionado: `sharky-finanzas` (`hfzwcfvyrbwcbnrzgajj`).
- Base de datos: Postgres gestionado.
- Autenticacion: Supabase Auth con correo y contrasena.
- Autorizacion: Row Level Security (RLS) en todas las tablas sincronizadas.
- Desarrollo: migraciones SQL versionadas en `supabase/migrations`.
- Tiempo real: comenzar con pull incremental y outbox local. Agregar Broadcast
  privado solo cuando la sincronizacion base sea estable.

El modo local actual se mantiene. Crear una cuenta cloud sera opcional y no debe
bloquear el uso offline.

## Motivo

Los datos de `$harky` son relacionales: cuentas, categorias, transacciones,
metas, aportes y auditoria. Postgres permite mantener referencias, restricciones,
consultas para reportes y migraciones explicitas sin duplicar logica de
integridad en documentos independientes.

Supabase Auth integra el usuario autenticado con Postgres mediante JWT y permite
aplicar RLS con `auth.uid()`. Esto mantiene la clave publica utilizable desde el
cliente sin exponer una clave administrativa.

Firebase Auth + Firestore sigue siendo una opcion valida, pero no sera la base
principal. Su persistencia offline resuelve conflictos concurrentes del mismo
documento con last-write-wins. Para una app financiera conviene controlar
versiones y conflictos de forma explicita.

## Modelo de autenticacion

### Cuenta cloud

- Registro con nombre, correo y contrasena.
- Confirmacion obligatoria de correo antes de sincronizar.
- Recuperacion de contrasena por correo.
- Cierre de sesion local y cierre remoto de otras sesiones.
- Google OAuth puede agregarse despues; no forma parte del primer corte.
- MFA TOTP queda preparado como endurecimiento posterior.

### Sesion

- Access token JWT de corta duracion administrado por Supabase Auth.
- Refresh token rotativo administrado por el SDK.
- Web/PWA: persistencia de sesion con el storage del cliente web.
- Tauri Windows: el SDK usa un storage asincrono que delega en comandos Rust y
  guarda la sesion en el Administrador de credenciales del sistema operativo.
- Al iniciar Tauri se eliminan tokens Supabase heredados en `localStorage`.
- Enlaces de confirmacion y reset: PKCE.
- Callback web: `/auth/callback`.
- Callback desktop: `sharky://auth/callback`, registrado por Tauri en Windows.

No se guardaran contrasenas, hashes propios ni claves administrativas en el
frontend. La clave `service_role` nunca debe incluirse en Vite ni Tauri.

## Esquema inicial

Todas las tablas sincronizadas incluyen:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz null`
- `revision bigint not null default 1`

Tablas:

- `profiles`
- `accounts`
- `categories`
- `transactions`
- `goals`
- `goal_contributions`
- `audit_events`
- `devices`

Los deletes se sincronizan con tombstones (`deleted_at`) para que un equipo
offline no vuelva a crear registros eliminados.

## Politicas RLS

Cada tabla de usuario debe habilitar RLS y limitar lectura y escritura al dueno:

```sql
alter table public.accounts enable row level security;

create policy "users_select_own_accounts"
on public.accounts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users_insert_own_accounts"
on public.accounts for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users_update_own_accounts"
on public.accounts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users_delete_own_accounts"
on public.accounts for delete
to authenticated
using ((select auth.uid()) = user_id);
```

Aplicar el mismo patron a cada tabla sincronizada. Las operaciones
administrativas se ejecutan fuera del cliente.

## Sincronizacion

1. Mantener Zustand como cache local y modo offline.
2. Registrar mutaciones cloud en una outbox local.
3. Al reconectar, enviar mutaciones pendientes con `revision`.
4. Descargar filas propias con `updated_at > last_sync_at`.
5. Aplicar tombstones.
6. Si la revision remota cambio desde la ultima lectura, crear un conflicto
   visible en vez de sobrescribir silenciosamente.
7. Agregar Broadcast privado para refrescar equipos conectados cuando el flujo
   incremental ya sea confiable.

## Backups y cifrado

- Supabase mantiene backups administrados de la base de datos.
- Mantener los snapshots locales y exportaciones JSON actuales como recuperacion
  independiente del proveedor.
- Para archivos de backup cloud, usar Storage privado y RLS.
- Agregar cifrado de exportaciones con una clave derivada de una frase secreta
  del usuario antes de subir archivos. No reutilizar la contrasena de login.

## Fases

### Fase 1

- Inicializar Supabase CLI y migraciones.
- Crear esquema, indices, triggers `updated_at` y RLS.
- Agregar cliente `@supabase/supabase-js`.
- Sustituir el hash local opcional por Auth cloud opt-in.

### Fase 2

- Implementar outbox, pull incremental, tombstones y conflictos.
- Sincronizar cuentas, categorias, transacciones, metas y aportes.
- Agregar pantalla de estado de sincronizacion y dispositivos.

### Fase 3

- Recuperacion de contrasena con PKCE.
- Cierre remoto de sesiones.
- SMTP transaccional propio.
- Storage privado para backups cifrados.
- MFA TOTP opcional.

## Referencias

- https://supabase.com/docs/guides/auth/
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/realtime/subscribing-to-database-changes/
- https://supabase.com/docs/guides/local-development
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/regions
- https://firebase.google.com/docs/firestore/manage-data/enable-offline
