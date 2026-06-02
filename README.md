# VDH Lite Custom

A Chrome MV3 media detector and yt-dlp launcher inspired by the Video DownloadHelper workflow.

This repository is the editable source for the extension. Load this folder directly with Chrome's
`Load unpacked` during development.

## Project Layout

```text
VDH-Lite/
  manifest.json                 Chrome extension manifest
  src/
    service_worker.js           Media request detection and native-message bridge
    content_script.js           DOM/performance media scanner
    page_probe.js               fetch/XHR probe injected into the page context
    popup.html                  Extension popup shell
    popup.css                   Popup UI styles
    popup.js                    Popup UI, quality selection, job status
  native/
    yt_dlp_host.py              Chrome Native Messaging host
    yt_dlp_runner.py            yt-dlp background process runner
    bootstrap.ps1               Installs native host and dependencies
    install-native-host.ps1     Registers the native host for this extension ID
    com.vdhlite.ytdlp.json      Native host manifest
  install.bat                   One-click native host setup
  uninstall.bat                 Removes the native host registry entry
```

## Features

- Detects browser-visible media candidates from `webRequest`, DOM scans, performance entries, and fetch/XHR probes.
- Filters preview media so the real stream is easier to find.
- Parses HLS master playlists when possible and shows quality labels like `1080P` and `720P`.
- Lets the selected quality constrain yt-dlp downloads.
- Starts local `yt-dlp` through Chrome Native Messaging.
- Supports a custom download directory from the popup settings panel.
- Shows recent yt-dlp jobs with overall progress, speed, ETA, and quality.

## Development Setup

1. Double-click `install.bat`.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select this folder: `C:\Users\LeeWei\Documents\VDH-Lite`.
6. Reload the extension after changing `manifest.json`, `src/service_worker.js`, or native host files.

The manifest key pins the development extension ID. The expected ID is:

```text
biohojdpjgpahmcahblcdiafgckglinn
```

`install.bat` rewrites `native/com.vdhlite.ytdlp.json` so Chrome can find the native host in the current repo path.

## Native Dependencies

The extension uses the native host to call:

- `yt-dlp`
- `ffmpeg`

The popup checks dependency status automatically. If something is missing, the settings panel can install it, or you can run:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\bootstrap.ps1
```

## Usage

1. Open a video page and play the video for a few seconds.
2. Open the extension popup.
3. Pick a quality such as `1080P` or `720P`.
4. Click `Download`.
5. Watch progress in the `Downloads` panel.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the VDH-inspired feature backlog and maturity plan.

## Limits

This is not a full Video DownloadHelper or yt-dlp replacement. It detects media URLs visible to the browser and passes them to local yt-dlp. It does not implement site extractors, DRM bypass, cookie decryption, or in-extension FFmpeg muxing.
