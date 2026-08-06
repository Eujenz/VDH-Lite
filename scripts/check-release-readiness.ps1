param([switch]$Store)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

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

function Require-Path($path, $message) {
  if (-not (Test-Path $path)) {
    $errors.Add($message)
  }
}

$manifestPath = Join-Path $repoRoot "extension\manifest.json"
$extensionIdsPath = Join-Path $repoRoot "native\extension-ids.json"
Require-Path $manifestPath "Missing extension manifest at extension\manifest.json."
Require-Path (Join-Path $repoRoot "native\yt_dlp_host.py") "Missing native host script."
Require-Path (Join-Path $repoRoot "native\install-native-host.ps1") "Missing native host installer."
Require-Path (Join-Path $repoRoot "docs\INSTALL.md") "Missing community install guide."
Require-Path (Join-Path $repoRoot "docs\PRIVACY.md") "Missing privacy policy draft."
Require-Path (Join-Path $repoRoot "packaging\chrome-store\PERMISSION_JUSTIFICATIONS.md") "Missing Chrome Web Store permission justifications."
Require-Path (Join-Path $repoRoot "packaging\chrome-store\STORE_LISTING_DRAFT.md") "Missing Chrome Web Store listing draft."
Require-Path $extensionIdsPath "Missing extension ID configuration."

if (Test-Path $manifestPath) {
  $manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
  if ($manifest.name -match "Custom") {
    $warnings.Add("Manifest name still contains 'Custom'.")
  }
  if ($manifest.key) {
    $warnings.Add("Manifest key is present. Before a formal Store build, confirm it is the dashboard public key and resolves to a configured published ID.")
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
    $warnings.Add("Manifest uses install-time host_permissions. Ensure Chrome Web Store host permission justification is current.")
  }
  foreach ($permission in @($manifest.permissions)) {
    if ($permission -in @("nativeMessaging", "webRequest", "scripting", "downloads", "cookies")) {
      $warnings.Add("Sensitive permission declared: $permission. Ensure store justification is current.")
    }
  }
}

if ($Store -and (Test-Path $extensionIdsPath)) {
  $extensionIds = Get-Content -Raw -Path $extensionIdsPath | ConvertFrom-Json
  $publishedIds = @($extensionIds.published | Where-Object { $_ -match '^[a-p]{32}$' })
  if ($publishedIds.Count -eq 0) {
    $errors.Add("No published Chrome Web Store extension ID is configured.")
  }
  if (-not $manifest.key) {
    $errors.Add("Manifest key is required after the Chrome Web Store public key is known.")
  } elseif ($publishedIds.Count -gt 0) {
    $manifestId = Get-ChromeExtensionIdFromKey $manifest.key
    if ($manifestId -notin $publishedIds) {
      $errors.Add("Manifest key resolves to $manifestId, which is not listed as a published extension ID.")
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
