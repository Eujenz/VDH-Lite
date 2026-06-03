param(
  [ValidateSet("Chrome", "Edge")]
  [string[]]$Browsers = @("Chrome"),
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "VDH Lite\NativeHost"),
  [switch]$KeepFiles
)

$ErrorActionPreference = "Stop"

$browserRegistryKeys = @{
  Chrome = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.vdhlite.ytdlp"
  Edge = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.vdhlite.ytdlp"
}

foreach ($browser in $Browsers) {
  $key = $browserRegistryKeys[$browser]
  if (Test-Path $key) {
    Remove-Item -Path $key -Force
    Write-Host "Removed native host registration for $browser."
  } else {
    Write-Host "No native host registration found for $browser."
  }
}

if (-not $KeepFiles -and (Test-Path $InstallRoot)) {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
  Write-Host "Removed native host files: $InstallRoot"
}
