-- Sync v2: columnas que el modelo local ganó desde junio y que faltaban en la
-- nube. Sin esto, el round-trip de sincronización devolvía entidades sin estos
-- campos y el merge las aplicaba localmente, borrando datos del usuario.

alter table public.accounts
  add column if not exists opening_balance numeric(16, 2),
  add column if not exists include_in_total boolean,
  add column if not exists currency text
    check (currency in ('DOP', 'USD', 'EUR', 'MXN', 'GBP', 'COP', 'ARS', 'BRL', 'CAD'));

alter table public.categories
  add column if not exists rollover_enabled boolean;

alter table public.transactions
  add column if not exists splits jsonb,
  add column if not exists to_amount numeric(16, 2) check (to_amount > 0),
  add column if not exists skipped_dates text[];

alter table public.goals
  add column if not exists auto_contribute jsonb;

-- ── Feedback de usuarios ────────────────────────────────────────────────────
-- Comentarios enviados desde Configuración → Comentarios. Solo se puede
-- insertar (anónimo o autenticado); nadie puede leer, editar ni borrar desde
-- el cliente — se revisan desde el dashboard o llegan por email vía la Edge
-- Function notify-feedback.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 1 and 4000),
  app_version text,
  platform text,
  language text,
  user_email text,
  user_id uuid references auth.users(id) on delete set null
);

alter table public.feedback enable row level security;

drop policy if exists "anyone_can_insert_feedback" on public.feedback;
create policy "anyone_can_insert_feedback"
on public.feedback for insert
to anon, authenticated
with check (true);

-- Sin políticas de select/update/delete: los clientes no pueden leer feedback.
