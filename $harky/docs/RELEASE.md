# $harky release process

This checklist keeps Windows releases repeatable and auditable.

## 1. Preflight

- Confirm `ROADMAP.md` has the target version and closed scope.
- Confirm `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `src/data/release.ts` share the same version.
- Review `git status --short` and make sure unrelated local work is understood.

## 2. Validation

Run:

```powershell
npm run lint
npm run test -- --run
npm run build
npm run test:e2e
cargo check --manifest-path src-tauri/Cargo.toml
```

The Vite build should not warn about first-load chunks. Large exporter dependencies are allowed only when they are isolated behind dynamic imports and excluded from PWA precache.

## 3. Package Windows

Run:

```powershell
npm run package:windows
```

Expected outputs:

- `release/windows/$harky-setup.exe`
- `release/windows/$harky-portable.exe`
- SHA-256 hashes printed by the packaging script

## 4. Smoke test

- Start the portable executable.
- Open the installed executable.
- Create or unlock a local user.
- Create an account and a transaction.
- Export CSV, PDF, Excel, and JSON backup.
- Reopen the app and confirm persistence.

## 5. Signing and publication

Required before public distribution:

- Sign setup and portable executables with a Windows code-signing certificate.
- Publish hashes beside the release artifacts.
- Publish the changelog from `src/data/release.ts`.
- Publish update metadata for the selected channel: `stable` or `beta`.

Auto-update remains blocked until a signing certificate and update hosting URL exist.
