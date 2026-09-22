param(
  [ValidateSet('build', 'dev', 'run')]
  [string]$Mode = 'build',
  [ValidateSet('aarch64', 'armv7', 'i686', 'x86_64', 'all')]
  [string]$Target = 'aarch64',
  [ValidateSet('apk', 'aab', 'both')]
  [string]$Package = 'apk',
  [switch]$Debug,
  # Salta el auto-incremento del PATCH. Se usa cuando la version ya se fijo a
  # mano para un release menor o mayor (ej. 1.8.18 -> 1.9.0): sin esto el
  # script la convertiria en 1.9.1 y el changelog dejaria de coincidir con la
  # version que se publica.
  [switch]$SkipVersionBump,
  [string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr',
  [string]$NdkVersion = '29.0.14206865'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$releaseDir = Join-Path $repoRoot 'release\android'
$ndkHome = Join-Path $SdkRoot "ndk\$NdkVersion"
$androidVersionStateFile = Join-Path $releaseDir 'version-code.txt'
$tauriPropsFile = Join-Path $repoRoot 'src-tauri\gen\android\app\tauri.properties'

if (!(Test-Path -LiteralPath $JavaHome)) {
  throw "No se encontro Java en '$JavaHome'. Instala Android Studio o pasa -JavaHome."
}

if (!(Test-Path -LiteralPath $SdkRoot)) {
  throw "No se encontro Android SDK en '$SdkRoot'. Instala Android Studio o pasa -SdkRoot."
}

if (!(Test-Path -LiteralPath $ndkHome)) {
  throw "No se encontro Android NDK $NdkVersion en '$ndkHome'. Instala el NDK desde Android Studio SDK Manager."
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:NDK_HOME = $ndkHome
$env:PATH = "$JavaHome\bin;$SdkRoot\platform-tools;$SdkRoot\cmdline-tools\latest\bin;$env:PATH"

Set-Location $repoRoot

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

# Cargo cachea rutas ABSOLUTAS dentro de target/ (.fingerprint y el `output` de
# cada build script). Si el repo se copia o mueve a otra ruta arrastrando esa
# carpeta, el build script de tauri sigue apuntando a la ruta vieja y el build
# revienta con "failed to read plugin permissions: ... (os error 3)" — a veces
# solo en algunos ABIs, porque los demas se regeneraron por casualidad.
# Se sella la ruta del repo y, si no coincide, se invalida el cache entero.
function Assert-CargoTargetRoot {
  param([string]$TargetDir)

  if (!(Test-Path -LiteralPath $TargetDir)) { return }

  $stampFile = Join-Path $TargetDir '.sharky-repo-root'
  $stamped = if (Test-Path -LiteralPath $stampFile) {
    (Get-Content -LiteralPath $stampFile -Raw).Trim()
  } else {
    ''
  }

  if ($stamped -ne "$repoRoot") {
    if ($stamped) {
      Write-Host "Cache de cargo generado en '$stamped' pero el repo esta en '$repoRoot'; se borra $TargetDir."
    } else {
      Write-Host "Cache de cargo sin sello de ruta; se borra $TargetDir por seguridad."
    }
    Remove-Item -LiteralPath $TargetDir -Recurse -Force
  }
}

$cargoTargetDirs = @((Join-Path $repoRoot 'src-tauri\target')) +
  @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'plugins') -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'target' })

foreach ($targetDir in $cargoTargetDirs) {
  Assert-CargoTargetRoot -TargetDir $targetDir
}

function Write-CargoTargetStamps {
  foreach ($targetDir in $cargoTargetDirs) {
    if (Test-Path -LiteralPath $targetDir) {
      Set-Content -LiteralPath (Join-Path $targetDir '.sharky-repo-root') -Value "$repoRoot" -NoNewline
    }
  }
}

function Get-TauriVersionProps {
  param([string]$Path)

  $props = @{
    VersionName = '1.0.0'
    VersionCode = 1
  }

  if (!(Test-Path -LiteralPath $Path)) {
    return $props
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^tauri\.android\.versionName=(.+)$') {
      $props.VersionName = $Matches[1].Trim()
    } elseif ($line -match '^tauri\.android\.versionCode=(\d+)$') {
      $props.VersionCode = [int]$Matches[1]
    }
  }

  return $props
}

if ($Mode -eq 'build') {
  # Los 3 archivos que version:bump toca — se guarda su contenido ANTES de
  # bumpear para poder revertirlo si el build termina fallando. Un build
  # fallido nunca debe dejar la version subida (rompe versionName/Cargo.toml
  # desincronizados de lo que realmente se publico).
  $versionedFiles = @(
    (Join-Path $repoRoot 'package.json'),
    (Join-Path $repoRoot 'src-tauri\tauri.conf.json'),
    (Join-Path $repoRoot 'src-tauri\Cargo.toml')
  )
  $versionedFilesOriginal = @{}
  foreach ($file in $versionedFiles) {
    $versionedFilesOriginal[$file] = Get-Content -LiteralPath $file -Raw
  }
  function Restore-VersionedFiles {
    foreach ($file in $versionedFiles) {
      Set-Content -LiteralPath $file -Value $versionedFilesOriginal[$file] -NoNewline
    }
    Write-Host 'Build fallido: se revirtio la version (package.json/tauri.conf.json/Cargo.toml).'
  }

  # Sube el patch (X.Y.Z -> X.Y.Z+1) en package.json/tauri.conf.json/Cargo.toml
  # antes de generar el paquete, para que la version visible en la app suba
  # sola con cada build. No toca el versionCode interno de Android (abajo).
  if ($SkipVersionBump) {
    Write-Host 'Version fijada a mano: se omite el auto-incremento de patch.'
  } else {
    npm run version:bump
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar la version antes del build.' }
  }

  # VersionCode: UN solo contador, `release/android/version-code.txt`.
  #
  # Habia dos. `autoIncrementVersionCode` de tauri.conf.json llevaba el suyo en
  # gen/android/tauri.properties —un archivo generado, que ademas estaba
  # vacio— y este script llevaba el otro. Dos contadores que pueden separarse
  # gobernando un numero que Play EXIGE que solo suba es una bomba de relojeria:
  # el dia que el generado gane, la subida se rechaza y hay que adivinar por que.
  # Ahora `autoIncrementVersionCode` esta en false y manda este archivo.
  #
  # Se sigue leyendo tauri.properties como SUELO por si un build antiguo dejo
  # ahi un numero mas alto: bajar el contador rompe las subidas para siempre.
  $tauriVersion = Get-TauriVersionProps -Path $tauriPropsFile
  $baseVersionCode = [int]$tauriVersion.VersionCode
  $lastBuiltVersionCode = if (Test-Path -LiteralPath $androidVersionStateFile) {
    $raw = (Get-Content -LiteralPath $androidVersionStateFile -Raw).Trim()
    if ($raw -match '^\d+$') { [int]$raw } else { 0 }
  } else {
    0
  }

  $nextVersionCode = [Math]::Max($baseVersionCode, $lastBuiltVersionCode) + 1
  $env:SHARKY_ANDROID_VERSION_CODE = "$nextVersionCode"

  # VersionName: se lee directo de tauri.conf.json (ya actualizado arriba por
  # bump-version.mjs), NO del archivo generado — ese todavia tiene el numero
  # viejo hasta que el build de abajo lo regenera, y para entonces ya es tarde
  # para que este env var lo recoja.
  $tauriConfJson = Get-Content -LiteralPath (Join-Path $repoRoot 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
  $env:SHARKY_ANDROID_VERSION_NAME = "$($tauriConfJson.version)"

  # PUERTA: la version que se va a compilar TIENE que tener su entrada en el
  # changelog. Sin esto se publico una 1.9.4 cuyo changelog mas nuevo decia
  # 1.9.3: al actualizar, "Novedades" se abria en una lista que no mencionaba
  # lo que el usuario acababa de instalar. El test unitario ya lo vigila, pero
  # corre ANTES del auto-incremento de version, asi que no puede ver esto.
  $releaseNotesFile = Join-Path $repoRoot 'src/data/release.ts'
  $releaseNotes = Get-Content -LiteralPath $releaseNotesFile -Raw
  if ($releaseNotes -notmatch [regex]::Escape("version: '$($env:SHARKY_ANDROID_VERSION_NAME)'")) {
    Restore-VersionedFiles
    throw "Falta la entrada de $($env:SHARKY_ANDROID_VERSION_NAME) en src/data/release.ts. Agregala antes de empaquetar."
  }

  Write-Host "Android versionName: $($env:SHARKY_ANDROID_VERSION_NAME)"
  Write-Host "Android versionCode: $($env:SHARKY_ANDROID_VERSION_CODE)"

  $androidAppBuild = Join-Path $repoRoot 'src-tauri\gen\android\app\build'
  if (Test-Path -LiteralPath $androidAppBuild) {
    Remove-Item -LiteralPath $androidAppBuild -Recurse -Force
  }

  $jniLibs = Join-Path $repoRoot 'src-tauri\gen\android\app\src\main\jniLibs'
  if (Test-Path -LiteralPath $jniLibs) {
    Remove-Item -LiteralPath $jniLibs -Recurse -Force
  }
}

switch ($Mode) {
  'dev' {
    npm run tauri -- android dev
    Write-CargoTargetStamps
    exit $LASTEXITCODE
  }
  'run' {
    npm run tauri -- android run
    Write-CargoTargetStamps
    exit $LASTEXITCODE
  }
  'build' {
    $buildArgs = @('run', 'tauri', '--', 'android', 'build', '--ci')
    if ($Package -in @('apk', 'both')) { $buildArgs += '--apk' }
    if ($Package -in @('aab', 'both')) { $buildArgs += '--aab' }
    if ($Debug) { $buildArgs += '--debug' }
    if ($Target -ne 'all') { $buildArgs += @('--target', $Target) }
    npm @buildArgs
    if ($LASTEXITCODE -ne 0) {
      Write-CargoTargetStamps
      Restore-VersionedFiles
      exit $LASTEXITCODE
    }

    Write-CargoTargetStamps

    Set-Content -LiteralPath $androidVersionStateFile -Value $env:SHARKY_ANDROID_VERSION_CODE -NoNewline
  }
}
Get-ChildItem -LiteralPath $releaseDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in '.apk', '.aab' } |
  Remove-Item -Force

$apkFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'src-tauri\gen\android\app\build\outputs\apk') -Recurse -Filter '*.apk' -ErrorAction SilentlyContinue)
$aabFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'src-tauri\gen\android\app\build\outputs\bundle') -Recurse -Filter '*.aab' -ErrorAction SilentlyContinue)

foreach ($file in @($apkFiles + $aabFiles)) {
  $kind = if ($file.Extension -eq '.apk') { 'apk' } else { 'aab' }
  $pathLower = $file.FullName.ToLowerInvariant()
  $profile = if ($pathLower -match 'debug') { 'debug' } elseif ($pathLower -match 'release') { 'release' } else { 'build' }
  $abi = if ($file.FullName -match '\\arm64-v8a\\') { 'arm64' } elseif ($file.FullName -match '\\armeabi-v7a\\') { 'armv7' } elseif ($file.FullName -match '\\x86_64\\') { 'x86_64' } elseif ($file.FullName -match '\\x86\\') { 'x86' } else { 'universal' }
  $signed = if ($file.Name -match 'unsigned') { '-unsigned' } else { '' }
  $name = "`$harky-android-$profile-$abi$signed.$kind"
  Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $releaseDir $name) -Force
}

Write-Host ''
Write-Host 'Paquetes Android listos:'
Get-ChildItem -LiteralPath $releaseDir -File | Where-Object { $_.Extension -in '.apk', '.aab' } | ForEach-Object {
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
  Write-Host "  $($_.Name): $($_.FullName)"
  Write-Host "    SHA256: $($hash.Hash)"
}
