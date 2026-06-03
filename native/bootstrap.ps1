param(
  [string[]]$ExtensionIds = @(),
  [ValidateSet("Chrome", "Edge")]
  [string[]]$Browsers = @("Chrome")
)

$ErrorActionPreference = "Stop"

Write-Host "Installing VDH Lite native host..."
$installScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "install-native-host.ps1"
$installArgs = @("-ExecutionPolicy", "Bypass", "-File", $installScript, "-Browsers")
$installArgs += $Browsers
if ($ExtensionIds.Count -gt 0) {
  $installArgs += "-ExtensionIds"
  $installArgs += $ExtensionIds
}
powershell @installArgs

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
