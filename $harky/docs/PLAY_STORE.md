# $harky - Google Play Console submission notes

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

### Does your app collect or share any of the required user data types?

**Yes.**

### Data types collected

| Category | Type | Collected? | Shared? | Required/Optional | Purpose |
|---|---|---|---|---|---|
| Personal info | Name | Optional | No | Optional | Account management, App functionality |
| Personal info | Email address | Optional | No | Optional | Account management, App functionality |
| Personal info | User IDs | Optional | No | Optional | Account management, App functionality |
| Financial info | User-entered transactions, accounts, budgets, goals | Optional | No | Optional | App functionality (cloud sync) |
| App activity | Comments/feedback text sent by the user | Optional | No | Optional | App functionality (support) |
| App info and performance | Crash logs / diagnostics | Optional, **off by default** | No | Optional | Analytics (app functionality) |

Notes for the form:
- All of the above is collected **only if the user opts in** to Google
  sign-in / cloud sync. Local-only usage (default) sends nothing off-device.
- "Shared" = No: Google (auth provider) and Supabase (cloud database) act as
  service providers / processors strictly to operate the app, which Play
  Console treats as **not** "sharing with third parties" as long as you
  declare them as service providers in your privacy policy (already done,
  section 4).
- Crash/error telemetry (`errorTelemetryEnabled` in Settings) defaults to
  **off** and is local-only unless explicitly enabled by the user — confirm
  current implementation before declaring "collected" if this changes.

### Security practices

- Data is encrypted in transit: **Yes** (HTTPS/TLS, Supabase + Google APIs).
- Users can request data deletion: **Yes**
  - In-app: Settings → Data → "Eliminar todos los datos" (wipes local **and**
    cloud-synced data for signed-in users).
  - Full account deletion: via email to `contactosharklin@gmail.com`
    (documented in Privacy Policy section 6/10).
- Committed to Play Families Policy / target audience: app is **not**
  directed at children (target age 18+, or "Everyone" with no child-directed
  content — pick based on your content rating answers).

## 5. Account deletion (Play Console → App content → Data safety →
   "Account deletion" link, required if app supports account creation)

Provide:
- In-app path: Settings → Data → "Eliminar todos los datos" (deletes synced
  data) + Settings → Account → Sign out.
- Web/contact path: `contactosharklin@gmail.com` for full account removal
  (auth user deletion), since self-service auth-account deletion isn't
  exposed in the Supabase client SDK without a backend function.

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
- [ ] Custom Google OAuth Client (Client ID/Secret) configured in
      Supabase → Authentication → Providers → Google, with consent screen
      branded as "$harky" (fixes the "...supabase.co" branding on the
      Google login screen).
- [ ] Content rating questionnaire (Play Console → App content).
- [ ] Store listing assets: icon, feature graphic, phone screenshots
      (min. 2), short & full description.
- [ ] Confirm `npm run android:build -- -Package both -Target all` produces
      signed `.aab` (for upload) and `.apk` (for sideload testing) in
      `release/android/`.
