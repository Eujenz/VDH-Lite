# Installation Guide

VDH Lite has two parts:

1. The Chrome extension.
2. The local native host that runs `yt-dlp` and `ffmpeg`.

The extension can be loaded or installed from a package. The native host must be installed separately because Chrome extensions cannot execute Python scripts or local command-line tools by themselves.

## Development Install

1. Run `install.bat`.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select this folder:

```text
C:\Users\LeeWei\Documents\VDH-Lite\extension
```

6. Open the extension popup.
7. Click `Test yt-dlp`.

## Native Host Install

The native installer registers:

```text
com.vdhlite.ytdlp
```

It copies runtime host files to:

```text
%LOCALAPPDATA%\VDH Lite\NativeHost
```

Then it writes the Chrome Native Messaging registry entry under:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.vdhlite.ytdlp
```

## Store Or Community Install

For a public release, distribute:

- the extension through Chrome Web Store or a signed/reviewed package
- the native host installer through GitHub Releases or a project website

Expected user flow:

1. Install the browser extension.
2. Open the popup.
3. If native host is missing, follow the native installer link.
4. Install or update the native host.
5. Return to the popup and click `Test yt-dlp`.

## Published Extension ID

During local development, the manifest key produces this extension ID:

```text
biohojdpjgpahmcahblcdiafgckglinn
```

For a Chrome Web Store release, the final extension ID may differ. After the store ID is known, install the native host with:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\install-native-host.ps1 -ExtensionIds "PUBLISHED_EXTENSION_ID"
```

Multiple IDs can be passed for development, Chrome Store, and Edge Store builds:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\install-native-host.ps1 -ExtensionIds "DEV_ID","STORE_ID"
```

## Uninstall

Run:

```text
uninstall.bat
```

This removes the native messaging registration and runtime native host files.

## Packaging The Extension

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1
```

The zip is written to:

```text
dist/
```

For a Chrome Web Store upload package, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1 -Store
```

This removes the development `key` from the staged manifest before zipping. It does not modify the source manifest.
