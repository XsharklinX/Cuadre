# Redirects de Supabase Auth

Supabase debe permitir las URLs a las que vuelve el navegador despues de
confirmar un correo o solicitar una nueva contrasena.

## Desarrollo

En Supabase Dashboard, abrir `Authentication > URL Configuration` y agregar:

```text
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
http://localhost:3002/auth/callback
http://127.0.0.1:3002/auth/callback
```

El frontend envia automaticamente el origen activo, por lo que no depende de
un puerto hardcoded.

## Instalador, portable y Android APK

Agregar esta URL exacta en `Authentication > URL Configuration`:

```text
sharky://auth/callback
```

El instalador y el portable registran el protocolo `sharky://` en Windows. Al
abrir el correo de confirmacion o recuperacion, Supabase vuelve directamente a
la app y el frontend intercambia el codigo PKCE por una sesion.

La APK Android declara el mismo deep link con `scheme=sharky`, `host=auth` y
`path=/callback`, por lo que el mismo redirect funciona en telefono.

## PWA web publica

Si luego se publica la version web, agregar su callback HTTPS en Supabase y
definirlo al compilar:

```text
VITE_AUTH_REDIRECT_URL=https://your-domain.example/auth/callback
```

El enlace anterior que terminaba en `http://localhost:3000` confirmaba el
correo antes de fallar al abrir la pagina. Despues de aplicar esta configuracion,
los enlaces nuevos cerraran el flujo en la URL correcta.
