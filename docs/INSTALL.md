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

Native Messaging requires the exact extension ID in `allowed_origins`; wildcards are not supported. The release configuration is stored in:

```text
native/extension-ids.json
```

For the first Chrome Web Store upload, create a bootstrap package:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1 -StoreBootstrap
```

Upload it without publishing, then copy the dashboard Item ID into the `published` list in `native/extension-ids.json`. Copy the dashboard public key into `extension/manifest.json` as `key`; this keeps the unpacked development build aligned with the published ID. Keep `native/extension-ids.json` beside the native installer in public companion packages.

After those values are configured, build the release package with `-Store`. The packaging script refuses to create a formal Store package while the published ID is missing.

To override configured IDs for a custom installation:

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

For the first dashboard upload, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1 -StoreBootstrap
```

After the dashboard ID and public key are configured, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1 -Store
```

Only `-StoreBootstrap` removes the development `key` from the staged manifest. A formal `-Store` package retains the dashboard public key and refuses to build until a published ID is configured. Neither mode modifies the source manifest.
