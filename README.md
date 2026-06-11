# VDH Lite

A Chrome Manifest V3 media detector and local `yt-dlp` launcher inspired by Video DownloadHelper, VidBee, Open Video Downloader, and Parabolic.

VDH Lite is built as a community-ready browser extension plus a local native host. The browser extension detects browser-visible media candidates and shows the popup UI. The native host runs on the user's machine and starts `yt-dlp`/`ffmpeg` through Chrome Native Messaging.

## Project Layout

```text
VDH-Lite/
  extension/                    Chrome extension package root
    manifest.json               MV3 manifest
    src/                        service worker, popup, content scripts
    icons/                      extension icons
  native/                       Windows native messaging host
    yt_dlp_host.py              Native host JSON message handler
    yt_dlp_runner.py            Background yt-dlp runner
    install-native-host.ps1     Runtime native host installer
    uninstall-native-host.ps1   Runtime native host uninstaller
  scripts/
    package-extension.ps1       Build extension zip
    check-release-readiness.ps1 Public-release sanity checks
  packaging/chrome-store/       Store review notes and permission justifications
  docs/                         Install, support, privacy, roadmap, know-how
  install.bat                   One-click native host setup for Windows
  uninstall.bat                 Removes native host registration/runtime files
```

## Features

- Detects media candidates from network responses, DOM scans, performance entries, and page-context fetch/XHR probes.
- Declares HTTP/HTTPS host permissions so the `webRequest` detector can observe media requests.
- Filters preview media so the real stream is easier to find.
- Groups related sources into media cards with per-item quality/format choices and filter chips.
- Parses HLS master playlists when possible and shows quality labels like `1080P` and `720P`.
- Uses native `yt-dlp --dump-single-json` discovery to load real title, thumbnail, and format options when available.
- Starts local `yt-dlp` through Chrome Native Messaging.
- Uses resilient `yt-dlp` defaults for continuing downloads, retries, fragment retries, retry sleep, socket timeout, merge format, and Windows-safe filenames.
- Parses structured `yt-dlp --progress-template` progress before falling back to human-readable output.
- Shows download phase, speed, ETA, selected quality/format, final output path, and classified failure guidance.
- Checks local `yt-dlp`, `ffmpeg`, and native host health from the popup.
- Stores recent local download jobs with queue state, cancel/retry controls, concurrency limit, and completed-history cleanup.

## Current Status

### 2026-06-11 Checkpoint

Today's work moved VDH Lite toward a lightweight browser companion with a stronger native downloader core:

- Popup UX now presents detected media as grouped media cards instead of a raw URL list. Each card can show title, host, source type, status, details, and a local quality/format picker.
- Candidate filtering now covers detected, active, finished, and failed states so the popup stays scannable as jobs accumulate.
- Native progress now uses `yt-dlp --progress-template`, phase detection, and final path reporting so downloads can show `downloading`, `merging`, `remuxing`, `reencoding`, `finalizing`, or `finished`.
- Discovery now calls `yt-dlp --dump-single-json` so format choices can come from yt-dlp metadata instead of URL guesses only.
- The native downloader now applies VidBee-style stable defaults such as `--continue`, retries, fragment retries, retry sleep, socket timeout, safe Windows filenames, filename trimming, and merge output fallback.
- Jobs now support queueing, cancel, retry, a default concurrency limit of 2, and completed/failed/stopped history cleanup while preserving active work.
- Failed jobs now carry classified guidance for cases such as auth/cookies, geo block, disk full, permission denied, FFmpeg issues, transient network errors, stalls, and user cancellation.

Chrome extension installation was not available on the current device during this pass. UI/UX validation therefore uses the local harness in `tests/ui-harness`, which runs the popup as a normal web page with mocked Chrome extension APIs.

```powershell
node tests\ui-harness\serve.mjs
```

Then open:

```text
http://127.0.0.1:4177/tests/ui-harness/index.html
```

Optional smoke test:

```powershell
node tests\ui-harness\smoke.mjs
```

The smoke test requires Playwright. Real unpacked-extension installation, Chrome Native Messaging E2E, and site-by-site download QA are still the next validation checkpoint.

## Development Setup

1. Double-click `install.bat`.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select:

```text
C:\Users\LeeWei\Documents\VDH-Lite\extension
```

6. Open the extension popup and click `Test yt-dlp`.

The development manifest key pins the extension ID:

```text
biohojdpjgpahmcahblcdiafgckglinn
```

## Community Distribution Model

Chrome extensions cannot directly run Python scripts or local tools. Public releases should therefore ship two parts:

1. A Chrome Web Store extension package from `extension/`.
2. A native host installer from `native/` and the root install scripts.

See:

- [Architecture](docs/ARCHITECTURE.md)
- [Installation Guide](docs/INSTALL.md)
- [Privacy Policy Draft](docs/PRIVACY.md)
- [Support Guide](docs/SUPPORT.md)
- [Chrome Store Permission Justifications](packaging/chrome-store/PERMISSION_JUSTIFICATIONS.md)

## Packaging

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-release-readiness.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1 -Store
```

The extension zip is written to `dist/`.

## Reference Know-How

This repo tracks implementation lessons from mature downloader projects:

- [Parabolic Know-How](docs/PARABOLIC_KNOWHOW.md)
- [Video DownloadHelper Know-How](docs/VIDEO_DOWNLOADHELPER_KNOWHOW.md)

Parabolic informs the `yt-dlp` integration model: discovery, structured download options, progress parsing, queues, and recovery.

Video DownloadHelper informs the public product model: companion/native app installation, support docs, DRM messaging, troubleshooting, and community distribution.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).
