# VDH Lite

A Chrome Manifest V3 media detector and local `yt-dlp` launcher inspired by Video DownloadHelper and Parabolic.

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
- Uses optional host permissions so users can grant site access intentionally.
- Filters preview media so the real stream is easier to find.
- Parses HLS master playlists when possible and shows quality labels like `1080P` and `720P`.
- Starts local `yt-dlp` through Chrome Native Messaging.
- Checks local `yt-dlp`, `ffmpeg`, and native host health from the popup.
- Stores recent local download jobs with progress, speed, ETA, quality, and failure state.

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
