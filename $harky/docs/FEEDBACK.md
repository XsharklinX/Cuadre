# Comentarios de usuarios → tu correo

Cómo funciona el flujo de "Configuración → Comentarios" y qué hay que
configurar (una sola vez) para que cada comentario llegue a tu correo.

## Arquitectura

```
App (textarea) → tabla `feedback` en Supabase → Database Webhook
                                               → Edge Function notify-feedback
                                               → Resend → tu correo
```

- El cliente **solo puede insertar** en la tabla (RLS sin políticas de
  lectura): ningún usuario puede ver comentarios de otros ni el correo destino.
- Tu correo vive como **secret del servidor** (`FEEDBACK_EMAIL`) — no aparece
  en el código de la app ni en el tráfico de red del cliente.
- Si el usuario está sin conexión, el comentario se **encola en localStorage**
  y se reenvía al abrir la app (la tabla lo recibe tarde, pero llega).
- Cada comentario incluye contexto: versión de la app, plataforma
  (android/web/windows), idioma y el correo del usuario si tiene sesión cloud
  (esto ya está cubierto por la política de privacidad, sección de comentarios).

## Configuración (una sola vez, ~10 minutos)

### 1. Aplicar la migración

```bash
supabase db push
```

Crea la tabla `feedback` (además de las columnas nuevas de sync v2).

### 2. Crear cuenta en Resend

1. Regístrate gratis en https://resend.com (100 correos/día, sin tarjeta).
2. Crea un **API Key** (Dashboard → API Keys → Create).
3. En el plan gratis sin dominio propio, Resend solo entrega al **correo con
   el que te registraste** — regístrate con el correo donde quieres recibir
   los comentarios.

### 3. Configurar secrets y desplegar la función

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
supabase secrets set FEEDBACK_EMAIL=tu-correo@gmail.com
supabase functions deploy notify-feedback --no-verify-jwt
```

### 4. Crear el Database Webhook

En el Dashboard de Supabase:

1. **Database → Webhooks → Create a new hook**
2. Nombre: `feedback-email`
3. Tabla: `public.feedback` — Evento: **INSERT**
4. Tipo: **Supabase Edge Function** → `notify-feedback`
5. Guardar.

### 5. Probar

Abre la app → Configuración → Comentarios → escribe algo → Enviar.
Debe llegar un correo con asunto `💬 Nuevo comentario en $harky (...)` en
menos de un minuto. Si no llega, revisa los logs:
**Dashboard → Edge Functions → notify-feedback → Logs**.

## Notas

- Aunque el correo falle (Resend caído, secret mal puesto), el comentario
  **queda guardado en la tabla** — puedes leerlos siempre desde
  Dashboard → Table Editor → feedback.
- Anti-spam básico: mensajes limitados a 4.000 caracteres a nivel de BD.
  Si algún día hay abuso, se puede exigir sesión (`to authenticated` en la
  política de INSERT) sin tocar la app.
