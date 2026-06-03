# VDH Lite Architecture

VDH Lite is split into two installable parts:

```text
Chrome extension
  extension/manifest.json
  extension/src/*
  extension/icons/*

Native host
  native/yt_dlp_host.py
  native/yt_dlp_runner.py
  native/install-native-host.ps1
```

The extension runs in Chrome's Manifest V3 environment. It can inspect the active tab, run content scripts, observe granted-site media requests, and display the popup UI. It cannot execute Python, `yt-dlp`, or `ffmpeg` directly.

The native host is a local Windows program registered through Chrome Native Messaging. It receives JSON messages from the extension, validates them, starts `yt-dlp`, stores job state, and returns dependency/download status.

## Runtime Flow

```text
User opens popup
  -> popup asks service worker for media candidates
  -> service worker scans granted active tab and media requests
  -> user chooses a candidate and quality
  -> service worker sends a native message
  -> native host starts yt-dlp runner
  -> popup polls native status and renders progress
```

## Product Packaging

The Chrome Web Store package should contain only:

```text
extension/
```

The native host installer should contain:

```text
native/
install.bat
uninstall.bat
```

The native host installer writes runtime files under:

```text
%LOCALAPPDATA%\VDH Lite\NativeHost
```

and registers:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.vdhlite.ytdlp
```

The source `native/com.vdhlite.ytdlp.json` is a reference manifest only. The actual native messaging manifest is generated during install.

## Review-Friendly Permission Model

VDH Lite uses optional host permissions. The extension can be installed without immediate access to every website. Users grant the current site from the popup before deeper media detection runs.

This supports a safer public product posture:

- `activeTab` for user-initiated active-tab scanning
- `optional_host_permissions` for site-scoped media detection
- `nativeMessaging` for local `yt-dlp` handoff
- `storage` for local settings
- `downloads` for direct browser download fallback
- `webRequest` for media candidate detection on granted sites
- `scripting` for DOM/performance/media probing

## Reference Influences

Parabolic contributes the `yt-dlp` integration model:

- discover before downloading when accuracy matters
- model download options explicitly
- use structured progress output
- keep queue/recovery/history separate
- expose advanced `yt-dlp` options behind settings

Video DownloadHelper contributes the community product model:

- call the native component a public companion/native app
- provide installation and troubleshooting docs
- document unsupported DRM clearly
- include a bug-report path with versions, OS, browser, and logs
- make "where did my download go?" and "native host not recognized" first-class support topics
