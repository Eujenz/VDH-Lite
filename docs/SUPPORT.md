# Support Guide

This guide is for community users and issue reporters.

## Native Host Not Found

Try these steps:

1. Install or reinstall the native host.
2. Close and reopen Chrome.
3. Open the extension popup.
4. Click `Test yt-dlp`.

On Windows, check the registry entry:

```cmd
reg query HKCU\Software\Google\Chrome\NativeMessagingHosts\com.vdhlite.ytdlp
```

The value should point to a JSON manifest under:

```text
%LOCALAPPDATA%\VDH Lite\NativeHost
```

## yt-dlp Or FFmpeg Missing

Open the popup settings and click `Install missing`.

If automatic installation fails:

```powershell
python -m pip install --user -U yt-dlp
winget install --id Gyan.FFmpeg
```

## Downloads Fail

First use the failed job row in the popup:

1. Open the popup.
2. Find the failed download.
3. Read the short explanation and next action.
4. Click `Copy diagnostics`.
5. Paste the diagnostics into the issue report.

The copied diagnostics include:

- VDH Lite extension version
- native host version
- browser user agent
- active tab host
- `yt-dlp` and FFmpeg status
- job status, phase, selected quality, and progress
- error category, explanation, next action, and final error

The copied diagnostics intentionally omit full media URLs by default. They include the site host instead.

Common error categories:

- `auth-required`: the site likely needs sign-in or browser cookies.
- `geo-blocked`: the media is unavailable from the current region or network.
- `network-transient`: the connection timed out, reset, or failed temporarily.
- `disk-full`: the save drive is full.
- `permission-denied`: the save folder is not writable.
- `ffmpeg`: FFmpeg is missing or failed during merge/conversion.
- `binary-missing`: the native host, `yt-dlp`, or another local tool is missing.

If the native host itself is missing, open settings and click `Copy diagnostics`; the popup will still copy extension-side diagnostic details.

## Debug Logs

Native host logs and job state are stored under:

```text
%LOCALAPPDATA%\VDH Lite
```

Do not paste full logs publicly if they contain private URLs, tokens, cookies, or filenames.

## DRM Or Protected Video

VDH Lite does not bypass DRM. If the media is protected, the expected behavior is a clear unsupported message.

## Antivirus Warnings

Native hosts can trigger antivirus warnings because they launch local command-line tools. The project should publish source, checksums, and release notes so users can verify installers before allowing them.

## Where Are Downloads?

The default path is:

```text
%USERPROFILE%\Downloads\VDH Lite
```

The popup settings panel lets users change the download directory.
