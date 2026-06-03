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

When reporting a failed download, include:

- VDH Lite extension version
- native host version
- browser and browser version
- Windows version
- page URL
- selected quality
- whether the native host test passes
- the final error shown in the popup

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
