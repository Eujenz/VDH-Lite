$ErrorActionPreference = "Stop"

Write-Host "Installing VDH Lite Custom native host..."
powershell -ExecutionPolicy Bypass -File (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "install-native-host.ps1")

Write-Host "Checking yt-dlp..."
if (-not (Get-Command yt-dlp -ErrorAction SilentlyContinue)) {
  Write-Host "Installing yt-dlp with pip..."
  python -m pip install --user -U yt-dlp
}

Write-Host "Checking FFmpeg..."
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Installing FFmpeg with winget..."
    winget install --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements --silent
  } else {
    Write-Host "winget not found. Please install FFmpeg manually."
  }
}

Write-Host "Done. Reload the Chrome extension."
