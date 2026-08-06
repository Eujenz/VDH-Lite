param(
  [string[]]$ExtensionIds = @(),
  [ValidateSet("Chrome", "Edge")]
  [string[]]$Browsers = @("Chrome"),
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "VDH Lite\NativeHost")
)

$ErrorActionPreference = "Stop"

$nativeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $nativeDir
$extensionManifestPath = Join-Path $repoRoot "extension\manifest.json"
$extensionIdsPath = Join-Path $nativeDir "extension-ids.json"
$runtimeManifestPath = Join-Path $InstallRoot "com.vdhlite.ytdlp.json"
$runtimeCmdPath = Join-Path $InstallRoot "com.vdhlite.ytdlp.cmd"
$pythonPath = (Get-Command python -ErrorAction Stop).Source

function Get-ChromeExtensionIdFromKey($base64Key) {
  $bytes = [Convert]::FromBase64String($base64Key)
  $sha = New-Object System.Security.Cryptography.SHA256Managed
  $hash = $sha.ComputeHash($bytes)
  $alphabet = "abcdefghijklmnop"
  $id = ""
  foreach ($b in $hash[0..15]) {
    $id += $alphabet[($b -shr 4)]
    $id += $alphabet[($b -band 15)]
  }
  return $id
}

function Get-ExtensionIdsFromManifest($path) {
  if (-not (Test-Path $path)) {
    return @()
  }

  $manifest = Get-Content -Raw -Path $path | ConvertFrom-Json
  if ($manifest.key) {
    return @(Get-ChromeExtensionIdFromKey $manifest.key)
  }

  return @()
}

function Get-ConfiguredExtensionIds($path) {
  if (-not (Test-Path $path)) {
    return @()
  }
  $config = Get-Content -Raw -Path $path | ConvertFrom-Json
  return @($config.development) + @($config.published)
}

if ($ExtensionIds.Count -eq 0) {
  $ExtensionIds = @(Get-ConfiguredExtensionIds $extensionIdsPath)
  $ExtensionIds += @(Get-ExtensionIdsFromManifest $extensionManifestPath)
}
$ExtensionIds = @($ExtensionIds | Where-Object { $_ -match '^[a-p]{32}$' } | Sort-Object -Unique)
if ($ExtensionIds.Count -eq 0) {
  throw "No valid extension IDs are configured. Update native\extension-ids.json or pass -ExtensionIds."
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
Copy-Item -Path (Join-Path $nativeDir "yt_dlp_host.py") -Destination $InstallRoot -Force
Copy-Item -Path (Join-Path $nativeDir "yt_dlp_runner.py") -Destination $InstallRoot -Force

@"
@echo off
"$pythonPath" "%~dp0yt_dlp_host.py"
"@ | Set-Content -Path $runtimeCmdPath -Encoding ASCII

$allowedOrigins = @()
foreach ($id in $ExtensionIds) {
  $allowedOrigins += "chrome-extension://$id/"
}

$manifest = [ordered]@{
  name = "com.vdhlite.ytdlp"
  description = "VDH Lite yt-dlp native host"
  path = $runtimeCmdPath
  type = "stdio"
  allowed_origins = $allowedOrigins
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $runtimeManifestPath -Encoding ASCII

$browserRegistryKeys = @{
  Chrome = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.vdhlite.ytdlp"
  Edge = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.vdhlite.ytdlp"
}

foreach ($browser in $Browsers) {
  $key = $browserRegistryKeys[$browser]
  New-Item -Path $key -Force | Out-Null
  Set-Item -Path $key -Value $runtimeManifestPath
  Write-Host "Registered native host for $browser."
}

Write-Host "Installed native host: com.vdhlite.ytdlp"
Write-Host "Install root: $InstallRoot"
Write-Host "Allowed extension IDs: $($ExtensionIds -join ', ')"
Write-Host "Manifest: $runtimeManifestPath"
