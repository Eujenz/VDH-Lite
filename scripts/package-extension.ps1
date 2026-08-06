param(
  [string]$OutputDir = "dist",
  [switch]$Store,
  [switch]$StoreBootstrap
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$extensionDir = Join-Path $repoRoot "extension"
$manifestPath = Join-Path $extensionDir "manifest.json"
$extensionIdsPath = Join-Path $repoRoot "native\extension-ids.json"

function Get-ChromeExtensionIdFromKey($base64Key) {
  $bytes = [Convert]::FromBase64String($base64Key)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash($bytes)
  } finally {
    $sha.Dispose()
  }
  $alphabet = "abcdefghijklmnop"
  $id = ""
  foreach ($b in $hash[0..15]) {
    $id += $alphabet[($b -shr 4)]
    $id += $alphabet[($b -band 15)]
  }
  return $id
}

if ($Store -and $StoreBootstrap) {
  throw "Choose either -Store or -StoreBootstrap, not both."
}

if (-not (Test-Path $manifestPath)) {
  throw "Extension manifest not found: $manifestPath"
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$distDir = Join-Path $repoRoot $OutputDir
$packageFlavor = "dev"
if ($Store) {
  $packageFlavor = "store"
} elseif ($StoreBootstrap) {
  $packageFlavor = "store-bootstrap"
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
  if (-not (Test-Path $extensionIdsPath)) {
    throw "Missing extension ID configuration: $extensionIdsPath"
  }
  $extensionIds = Get-Content -Raw -Path $extensionIdsPath | ConvertFrom-Json
  $publishedIds = @($extensionIds.published | Where-Object { $_ -match '^[a-p]{32}$' })
  if ($publishedIds.Count -eq 0) {
    throw "No published Chrome Web Store ID is configured. Upload a -StoreBootstrap package first, then add the dashboard Item ID and public key."
  }
  if (-not $manifest.key) {
    throw "The Store manifest key is missing. Add the public key from the Chrome Web Store dashboard so development and published IDs remain consistent."
  }
  $manifestId = Get-ChromeExtensionIdFromKey $manifest.key
  if ($manifestId -notin $publishedIds) {
    throw "The manifest key resolves to $manifestId, which is not listed as a published extension ID. Replace it with the Chrome Web Store dashboard public key."
  }
}

if ($StoreBootstrap) {
  $stagedManifestPath = Join-Path $stagingDir "manifest.json"
  $stagedManifest = Get-Content -Raw -Path $stagedManifestPath | ConvertFrom-Json
  $stagedManifest.PSObject.Properties.Remove("key")
  $stagedManifest | ConvertTo-Json -Depth 8 | Set-Content -Path $stagedManifestPath -Encoding ASCII
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $stagingDir -Recurse -Force

Write-Host "Packaged extension:"
Write-Host $zipPath
