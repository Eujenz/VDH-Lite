$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $repoRoot
try {
  python -m py_compile native/yt_dlp_host.py native/yt_dlp_runner.py tests/test_native_host.py tests/test_native_host_integration.py tests/test_release_workflow.py
  if ($LASTEXITCODE -ne 0) { throw "Python compile checks failed." }

  python -m unittest discover -s tests -v
  if ($LASTEXITCODE -ne 0) { throw "Python tests failed." }

  foreach ($script in @(
    "extension/src/service_worker.js",
    "extension/src/popup.js",
    "extension/src/content_script.js",
    "extension/src/page_probe.js",
    "tests/service_worker_cookie_test.mjs"
  )) {
    node --check $script
    if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $script" }
  }

  node tests/service_worker_cookie_test.mjs
  if ($LASTEXITCODE -ne 0) { throw "Cookie isolation test failed." }

  node tests/ui-harness/smoke.mjs
  if ($LASTEXITCODE -ne 0) { throw "UI smoke test failed." }

  powershell -ExecutionPolicy Bypass -File scripts/check-release-readiness.ps1
  if ($LASTEXITCODE -ne 0) { throw "Release readiness check failed." }
} finally {
  Pop-Location
}
