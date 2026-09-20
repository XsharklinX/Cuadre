# Correos de autenticación (confirmar cuenta / recuperar contraseña)

El login por correo de $harky ya está listo en la app. Para que **lleguen** los
correos de confirmación y de recuperación de contraseña, hay que decirle a
Supabase que los envíe con un SMTP de verdad. Usamos **Resend** (el mismo que ya
manda los comentarios).

> **Por qué**: Supabase trae un correo por defecto **muy limitado** (unos pocos
> por hora, solo para pruebas y a veces cae en spam). Con SMTP propio los correos
> salen bien y sin límite de juguete.

---

## 1. En Resend: verificar un dominio (el paso que la gente olvida)

Para enviar desde una dirección tuya (ej. `no-responder@tudominio.com`), Resend
necesita que el dominio esté **verificado**.

1. Entra a **https://resend.com → Domains → Add Domain**.
2. Escribe tu dominio (ej. `sharky.app` o el que tengas).
3. Resend te da unos registros **DNS** (SPF, DKIM). Agrégalos en donde administres
   tu dominio (Cloudflare, Namecheap, etc.).
4. Espera a que Resend lo marque **Verified** (minutos a un par de horas).

**¿No tienes dominio todavía?** Para *probar* puedes:
- Enviar solo a **tu propio correo verificado** usando el remitente de pruebas
  `onboarding@resend.dev`. Sirve para probar el flujo, pero **no** para usuarios
  reales. Para producción sí necesitas un dominio verificado.

## 2. Credenciales SMTP de Resend

Resend usa estos datos fijos (la contraseña es tu **API key**, la que ya tienes):

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Puerto | `465` (SSL) — o `587` (TLS) |
| Usuario | `resend` |
| Contraseña | tu API key de Resend (`re_...`) |

> Si prefieres no reutilizar la key de los comentarios, crea otra en
> **Resend → API Keys** solo para el correo de auth.

## 3. En Supabase: activar el SMTP propio

Dashboard de Supabase → tu proyecto (**sharky-finanzas**):

1. **Authentication → Providers → Email**: confirma que esté **Enabled**.
   - "Confirm email" **activado** si quieres que confirmen la cuenta antes de
     entrar. (Si lo desactivas, entran directo sin confirmar — más simple, menos
     seguro. Tú eliges.)
2. **Authentication → Emails → SMTP Settings → Enable Custom SMTP** y llena:
   - **Sender email**: `no-responder@tudominio.com` (debe ser del dominio
     verificado en Resend) — o `onboarding@resend.dev` solo para pruebas.
   - **Sender name**: `$harky`
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: tu API key `re_...`
3. **Guardar**.

## 4. Redirect URLs (ya está, solo confirma)

**Authentication → URL Configuration → Redirect URLs** debe tener:

```
sharky://auth/callback
```

Ya lo tienes de antes. Los correos de confirmación y recuperación llevan al
usuario de vuelta a la app por ese enlace, y $harky completa el proceso solo.

## 5. Plantillas de correo (opcional)

**Authentication → Emails → Templates**. Las plantillas por defecto ya funcionan
(el enlace `{{ .ConfirmationURL }}` respeta el redirect de arriba). Si quieres,
personalízalas con el nombre y colores de $harky — pero no es obligatorio para
que funcione.

---

## 6. Probar

1. En la app: **Configuración → Cuenta → Crear cuenta**, con un correo real tuyo.
2. Debe llegar el correo de **confirmación** (revisa spam la primera vez).
3. Toca el enlace → abre $harky → sesión iniciada, ves tu perfil con foto/ID.
4. Prueba **"¿Olvidaste tu contraseña?"** → llega el correo → enlace → la app
   muestra el campo de **nueva contraseña**.

## Notas

- **Límites de Resend (plan gratis)**: ~100 correos/día, 3,000/mes. De sobra para
  empezar.
- Los correos de auth los envía **Supabase** (con tu SMTP), no la Edge Function
  de comentarios — son cosas separadas, pero pueden usar la misma cuenta Resend.
- Si un correo no llega: revisa en **Resend → Logs** si salió, y en Supabase
  **Authentication → Logs** si hubo error de SMTP.
