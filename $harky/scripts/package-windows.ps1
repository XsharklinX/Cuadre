$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $projectRoot 'release\windows'
$targetDir = Join-Path $projectRoot 'src-tauri\target\release'
$bundleDir = Join-Path $targetDir 'bundle\nsis'
$temporaryDrive = $null
$previousCargoTargetDir = $env:CARGO_TARGET_DIR

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

if ($projectRoot.Contains('$')) {
  $temporaryDrive = @('Z:', 'Y:', 'X:', 'W:', 'V:') |
    Where-Object { -not (Test-Path "$_\") } |
    Select-Object -First 1

  if (-not $temporaryDrive) {
    throw 'No hay una letra de unidad disponible para empaquetar con NSIS.'
  }

  subst.exe $temporaryDrive $projectRoot
  $env:CARGO_TARGET_DIR = "$temporaryDrive\src-tauri\target"
}

Push-Location $projectRoot
try {
  npm run tauri:build -- --bundles nsis
  if ($LASTEXITCODE -ne 0) {
    throw "Tauri build fallo con codigo de salida $LASTEXITCODE."
  }
} finally {
  Pop-Location
  $env:CARGO_TARGET_DIR = $previousCargoTargetDir
  if ($temporaryDrive) {
    subst.exe $temporaryDrive /D
  }
}

$portableSource = Join-Path $targetDir 'sharky.exe'
$portableTarget = Join-Path $releaseDir '$harky-portable.exe'
Copy-Item -LiteralPath $portableSource -Destination $portableTarget -Force

$installer = Get-ChildItem -LiteralPath $bundleDir -Filter '*.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw 'No se encontro el instalador NSIS generado por Tauri.'
}

$installerTarget = Join-Path $releaseDir '$harky-setup.exe'
Copy-Item -LiteralPath $installer.FullName -Destination $installerTarget -Force

$artifacts = @($installerTarget, $portableTarget) | ForEach-Object {
  $item = Get-Item -LiteralPath $_
  $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
  [PSCustomObject]@{
    Name = $item.Name
    Path = $item.FullName
    SizeBytes = $item.Length
    SHA256 = $hash.Hash
  }
}

Write-Host ''
Write-Host 'Paquetes Windows listos:'
$artifacts | ForEach-Object {
  Write-Host "  $($_.Name): $($_.Path)"
  Write-Host "    SHA256: $($_.SHA256)"
}
