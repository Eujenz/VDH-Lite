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

The extension runs in Chrome's Manifest V3 environment. It can inspect the active tab, run content scripts, observe media-like requests, and display the popup UI. It cannot execute Python, `yt-dlp`, or `ffmpeg` directly.

The native host is a local Windows program registered through Chrome Native Messaging. It receives JSON messages from the extension, validates them, starts `yt-dlp`, stores job state, and returns dependency/download status.

## Runtime Flow

```text
User opens popup
  -> popup asks service worker for media candidates
  -> service worker scans active tab and media requests
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

## Permission Model

VDH Lite's current `webRequest` detector registers listeners for HTTP and HTTPS media requests. Chrome requires those URL patterns to be declared in `host_permissions`; putting them only in `optional_host_permissions` causes service worker startup errors.

The public product posture should therefore be:

- `activeTab` for user-initiated active-tab scanning
- `host_permissions` for HTTP/HTTPS media request detection
- `nativeMessaging` for local `yt-dlp` handoff
- `storage` for local settings
- `downloads` for direct browser download fallback
- `webRequest` for media candidate detection
- `scripting` for DOM/performance/media probing

Future work can revisit a lower-permission detector mode by registering webRequest listeners only after site-specific permission grants, but the current implementation needs install-time host permissions to run reliably.

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
