# Cuadre - Google Play Console submission notes

Reference for the first Play Store release. Update this file each time the
app is resubmitted with relevant changes.

## 1. Version

- `package.json` / `tauri.conf.json` version: **1.7.0**
- Android `versionCode`: **1007000** / `versionName`: **1.7.0**
  (auto-generated into `src-tauri/gen/android/.../tauri.properties` from the
  version above on the next `npm run android:build`)

## 2. Release notes (Spanish, for Play Console "What's new")

Short version (recommended for the listing):

> Mejoras de privacidad y estabilidad: ahora "Eliminar todos los datos"
> también borra tu copia en la nube si usas sincronización con Google,
> y se corrigieron problemas de inicio de sesión con Google.

Long version (changelog style):

- Corregido: el inicio de sesión con Google ya no se queda esperando
  indefinidamente tras elegir la cuenta.
- "Eliminar todos los datos" ahora también elimina tus datos sincronizados
  en la nube (cuentas, transacciones, categorías, metas y aportes), no solo
  los locales.
- Política de privacidad y términos de uso ahora disponibles también como
  páginas web públicas.

## 3. Privacy policy / Terms of use URLs

Once GitHub Pages is enabled for this repo (`XsharklinX/Sharky-Coin`,
serving from `/docs`), the public URLs are:

- Privacy Policy: `https://xsharklinx.github.io/Sharky-Coin/privacy.html`
- Terms of Use: `https://xsharklinx.github.io/Sharky-Coin/terms.html`

Use the Privacy Policy URL in **Play Console → App content → Privacy policy**.

## 4. Data Safety form

> **Cambio desde 1.9.6:** se elimino toda la infraestructura cloud (Supabase,
> login con Google, sync entre dispositivos). La app es 100% local. Esto
> simplifica el formulario radicalmente — **hay que volver a rellenarlo**,
> porque el que esta enviado declara datos que ya no se recogen.

### Does your app collect or share any of the required user data types?

**No.**

La app no envia nada fuera del dispositivo. No hay cuentas, no hay servidor y
no hay copia de los datos financieros en ningun sitio salvo el telefono del
usuario. El formulario de comentarios abre la app de correo del propio usuario
con el texto escrito: el envio lo hace el, desde su cuenta, con su cliente de
correo — la app no transmite nada.

Si Play Console insiste en una justificacion, la frase es: *"Data is entered
and stored exclusively in the app's private on-device storage. The app has no
backend, no accounts and no network transmission of user data."*

### Security practices

- Data is encrypted in transit: **N/A** — no user data is transmitted.
- Users can request data deletion: **Yes**
  - In-app: Settings → Data → "Eliminar todos los datos".
  - Desinstalar la app borra su almacenamiento privado por completo.
- Committed to Play Families Policy / target audience: app is **not**
  directed at children (target age 18+, or "Everyone" with no child-directed
  content — pick based on your content rating answers).

## 5. Account deletion

**Ya no aplica.** La app no permite crear cuentas, asi que Play Console no
exige el enlace de eliminacion de cuenta. `docs/delete-account.html` se
mantiene publicada de todos modos: explica como borrar los datos locales y no
estorba tenerla.

## 6. After the release goes live on Play Store

Update `docs/version.json` (`android.version`) to match the version that is
now actually live and reviewable on the Play Store listing, then commit and
push. The in-app update dialog (`useUpdateCheck`) fetches this file from
GitHub Pages and only shows "update available" once this number changes —
do **not** bump it until the new `.aab` has cleared Play Console review and
is publicly installable, or users will be sent to a Play Store version that
isn't the newer one yet.

## 7. Outstanding before submission

- [ ] Enable GitHub Pages for `XsharklinX/Sharky-Coin` (`/docs` folder) and
      verify `privacy.html` / `terms.html` load publicly.
- [ ] Content rating questionnaire (Play Console → App content).
- [ ] Store listing assets: icon, feature graphic, phone screenshots
      (min. 2), short & full description.
- [ ] Confirm `npm run android:build -- -Package both -Target all` produces
      signed `.aab` (for upload) and `.apk` (for sideload testing) in
      `release/android/`.
