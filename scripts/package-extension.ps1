param(
  [string]$OutputDir = "dist",
  [switch]$Store
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$extensionDir = Join-Path $repoRoot "extension"
$manifestPath = Join-Path $extensionDir "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "Extension manifest not found: $manifestPath"
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$distDir = Join-Path $repoRoot $OutputDir
$packageFlavor = "dev"
if ($Store) {
  $packageFlavor = "store"
}
$zipPath = Join-Path $distDir "vdh-lite-extension-$($manifest.version)-$packageFlavor.zip"
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "vdh-lite-extension-package"

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
if (Test-Path $stagingDir) {
  Remove-Item -LiteralPath $stagingDir -Recurse -Force
}

Copy-Item -Path $extensionDir -Destination $stagingDir -Recurse

if ($Store) {
  $stagedManifestPath = Join-Path $stagingDir "manifest.json"
  $stagedManifest = Get-Content -Raw -Path $stagedManifestPath | ConvertFrom-Json
  $stagedManifest.PSObject.Properties.Remove("key")
  $stagedManifest | ConvertTo-Json -Depth 8 | Set-Content -Path $stagedManifestPath -Encoding ASCII
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $stagingDir -Recurse -Force

Write-Host "Packaged extension:"
Write-Host $zipPath
