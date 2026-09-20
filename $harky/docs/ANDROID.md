# Android build

$harky usa Tauri 2 para generar APK Android desde el mismo frontend React/TypeScript.

## Requisitos locales

- Android Studio instalado.
- Android SDK en `%LOCALAPPDATA%\Android\Sdk`.
- Android NDK `29.0.14206865`.
- CMake `3.22.1`.
- Rust targets:
  - `aarch64-linux-android`
  - `armv7-linux-androideabi`
  - `i686-linux-android`
  - `x86_64-linux-android`

Instalar targets Rust:

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Instalar NDK/CMake si faltan:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:PATH="$env:JAVA_HOME\bin;$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin;$env:PATH"
sdkmanager --install "ndk;29.0.14206865" "cmake;3.22.1"
```

## Generar APK para telefono

APK debug ARM64 instalable:

```powershell
npm run package:android -- -Debug -Target aarch64
```

Salida:

```text
release/android/$harky-android-debug-universal.apk
```

Este APK sirve para instalar manualmente en un telefono Android moderno.

APK release ARM64 firmado localmente:

```powershell
npm run package:android -- -Target aarch64 -Package apk
```

APK + AAB release para distribucion:

```powershell
npm run package:android -- -Target aarch64 -Package both
```

## Instalar por USB

Activa en el telefono:

1. Opciones de desarrollador.
2. Depuracion USB.
3. Autoriza el equipo cuando Android lo pida.

Luego:

```powershell
adb devices
adb install -r "release/android/$harky-android-debug-universal.apk"
```

## Build release

El build release usa `release/android/signing.properties` si existe. Ese archivo debe apuntar a un keystore privado:

```properties
storeFile=E:/Programacion/$harky/release/android/keystore/sharky-release.jks
storePassword=...
keyAlias=sharky
keyPassword=...
```

`release/` esta ignorado por git. No subas el keystore ni `signing.properties`.

El AAB generado en `release/android` es el archivo que se sube a Play Console. El APK release sirve para instalacion directa o pruebas manuales.

## Estado actual

- Proyecto Android generado en `src-tauri/gen/android`.
- APK debug ARM64 generado correctamente.
- APK/AAB release firmados si existe `release/android/signing.properties`.
- Iconos Android incluidos desde el pipeline de Tauri.
- `kotlin.compiler.execution.strategy=in-process` habilitado para evitar errores del daemon Kotlin en Windows con rutas en discos distintos.
