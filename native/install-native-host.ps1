$ErrorActionPreference = "Stop"

$nativeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionDir = Split-Path -Parent $nativeDir
$extensionManifestPath = Join-Path $extensionDir "manifest.json"
$manifestPath = Join-Path $nativeDir "com.vdhlite.ytdlp.json"
$cmdPath = Join-Path $nativeDir "com.vdhlite.ytdlp.cmd"
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

@"
@echo off
"$pythonPath" "%~dp0yt_dlp_host.py"
"@ | Set-Content -Path $cmdPath -Encoding ASCII

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$extensionManifest = Get-Content -Raw -Path $extensionManifestPath | ConvertFrom-Json
$extensionId = Get-ChromeExtensionIdFromKey $extensionManifest.key
$manifest.path = $cmdPath
$manifest.allowed_origins = @("chrome-extension://$extensionId/")
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $manifestPath -Encoding UTF8

$key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.vdhlite.ytdlp"
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name "(default)" -Value $manifestPath

Write-Host "Installed native host: com.vdhlite.ytdlp"
Write-Host "Allowed extension: $extensionId"
Write-Host "Manifest: $manifestPath"
