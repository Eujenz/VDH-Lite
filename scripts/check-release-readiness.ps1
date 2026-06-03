$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Require-Path($path, $message) {
  if (-not (Test-Path $path)) {
    $errors.Add($message)
  }
}

$manifestPath = Join-Path $repoRoot "extension\manifest.json"
Require-Path $manifestPath "Missing extension manifest at extension\manifest.json."
Require-Path (Join-Path $repoRoot "native\yt_dlp_host.py") "Missing native host script."
Require-Path (Join-Path $repoRoot "native\install-native-host.ps1") "Missing native host installer."
Require-Path (Join-Path $repoRoot "docs\INSTALL.md") "Missing community install guide."
Require-Path (Join-Path $repoRoot "docs\PRIVACY.md") "Missing privacy policy draft."
Require-Path (Join-Path $repoRoot "packaging\chrome-store\PERMISSION_JUSTIFICATIONS.md") "Missing Chrome Web Store permission justifications."
Require-Path (Join-Path $repoRoot "packaging\chrome-store\STORE_LISTING_DRAFT.md") "Missing Chrome Web Store listing draft."

if (Test-Path $manifestPath) {
  $manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
  if ($manifest.name -match "Custom") {
    $warnings.Add("Manifest name still contains 'Custom'.")
  }
  if ($manifest.key) {
    $warnings.Add("Development manifest key is present. Use scripts\package-extension.ps1 -Store for a Chrome Web Store upload zip.")
  }
  if (-not $manifest.icons."128") {
    $errors.Add("Manifest is missing a 128px icon.")
  }
  foreach ($size in @("16", "32", "48", "128")) {
    if ($manifest.icons.$size) {
      Require-Path (Join-Path $repoRoot "extension\$($manifest.icons.$size)") "Missing icon declared for $size px."
    }
  }
  if ($manifest.host_permissions) {
    $warnings.Add("Manifest uses install-time host_permissions. Prefer optional_host_permissions for review-friendly site grants.")
  }
  foreach ($permission in @($manifest.permissions)) {
    if ($permission -in @("nativeMessaging", "webRequest", "scripting", "downloads")) {
      $warnings.Add("Sensitive permission declared: $permission. Ensure store justification is current.")
    }
  }
}

$nativeManifestPath = Join-Path $repoRoot "native\com.vdhlite.ytdlp.json"
if (Test-Path $nativeManifestPath) {
  $nativeManifestText = Get-Content -Raw -Path $nativeManifestPath
  if ($nativeManifestText -match [regex]::Escape($repoRoot)) {
    $errors.Add("Source native manifest contains this machine's repo path.")
  }
}

Write-Host "Release readiness check"
Write-Host "Errors: $($errors.Count)"
foreach ($errorItem in $errors) {
  Write-Host "  - $errorItem"
}

Write-Host "Warnings: $($warnings.Count)"
foreach ($warningItem in $warnings) {
  Write-Host "  - $warningItem"
}

if ($errors.Count -gt 0) {
  exit 1
}
