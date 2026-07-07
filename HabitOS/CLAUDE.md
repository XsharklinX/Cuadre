# HabitOS

App móvil (Android-first) de creación y seguimiento de hábitos. Sucesora de HabitTracker: hereda su dominio testeado, pero con UI y rendimiento rediseñados.

## Comandos

- `npm start` — Metro dev server (Expo).
- `npm run android` — build + run en dispositivo/emulador (dev).
- `npm run android:release` — build release (usar SIEMPRE para medir cold start; objetivo < 2 s).
- `npm test` — tests de dominio con Vitest.
- `npm run typecheck` — `tsc --noEmit`.

## Stack

Expo SDK 56 · React Native 0.85 (New Architecture + Hermes) · expo-router · Zustand 5 · react-native-mmkv 4 · NativeWind 4 · Zod · Temporal polyfill · Vitest.

> Regla heredada: consultar docs versionadas https://docs.expo.dev/versions/v56.0.0/ antes de usar APIs de Expo.

## Arquitectura (capas, dependencias hacia abajo)

- `app/` — rutas expo-router, solo composición (AppScreen + Screen + BottomNav).
- `src/presentation/` — screens, components, theme, hooks. UI en NativeWind, tema oscuro slate.
- `src/state/habitStore.ts` — store Zustand único; `configureHabitStore()` permite inyectar repositorio en tests.
- `src/use-cases/` — orquestación (completar/deshacer, guardar, journal, hábitos del día).
- `src/repositories/` — interfaz `HabitRepository` + `LocalHabitRepository`.
- `src/persistence/` — MMKV (id `habitos.local.v1`), esquema Zod versionado, migraciones.
- `src/domain/` + `src/dates/` — lógica pura 100% testeada (rachas, frecuencias, validación, fechas lógicas). **No importa nada de React/Expo.**

## Reglas de negocio

Ver `docs/business-rules.md` (fechas lógicas locales, nunca UTC directo; rachas por frecuencia; semana prorrateada; duplicados; undo; archivado). El dominio proviene de HabitTracker y sus tests son el contrato: no cambiar comportamiento sin actualizar ese doc.

## Rendimiento (requisito de primera clase)

- Hidratación síncrona desde MMKV; splash se oculta al hidratar (`app/_layout.tsx`).
- Nada de trabajo pesado en el arranque; features nuevas se cargan tras el primer render.
- Medir cold start solo en builds release.

## Roadmap

- [x] Fase 0 — Scaffold + dominio portado (28 tests).
- [x] Fase 1 — CRUD hábitos + Dashboard + persistencia MMKV.
- [x] Fase 2 — Rachas + calendario mensual + journal.
- [ ] Fase 3 — Gamificación (XP, niveles, logros) en `src/domain/gamification.ts`.
- [ ] Fase 4 — Analíticas (heatmap anual, tendencias).
- [ ] Fase 5 — Notificaciones/recordatorios (expo-notifications; el form ya modela reminders).
- [ ] Fase 6 — Widget Android nativo (ver `HabitTracker/docs/android-widget.md` como referencia).
- [ ] Fase 7 — Sync Supabase offline-first.
- [ ] Fase 8 — Onboarding, export/import, APK firmado.

## Reglas del repo

- Commits locales solamente — **NUNCA `git push`** (el usuario lo hace manualmente).
