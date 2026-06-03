# Chrome Web Store Listing Draft

## Name

VDH Lite

## Short Description

Detect media in the current tab and send downloads to a local yt-dlp native host.

## Detailed Description

VDH Lite helps users detect browser-visible media candidates and download selected media through a local `yt-dlp` native host.

The extension runs in Chrome and shows detected media candidates in a popup. When the user starts a download, the request is sent to a locally installed native host. The native host runs `yt-dlp` and `ffmpeg` on the user's computer.

The native host is required because Chrome extensions cannot directly execute Python scripts or local command-line tools.

## User Flow

1. Install VDH Lite.
2. Open a page with media.
3. Grant site access from the popup if deeper detection is needed.
4. Select a detected media candidate and quality.
5. Start the download through the native host.
6. Monitor local progress in the popup.

## Native Host Disclosure

VDH Lite requires a local native host named:

```text
com.vdhlite.ytdlp
```

The native host is installed separately. It validates extension messages and runs local `yt-dlp`/`ffmpeg` commands only after the user starts a download.

## Privacy Summary

VDH Lite does not upload detected URLs, browsing history, logs, or downloaded files to project servers.

Detected media URLs are used locally to show download candidates and to start user-requested downloads.

## Unsupported Content

VDH Lite does not bypass DRM or encrypted video protections.

## Review Notes

Sensitive permissions are documented in:

```text
packaging/chrome-store/PERMISSION_JUSTIFICATIONS.md
```

The extension uses optional site permissions to avoid install-time access to every website.

## Required Store Assets

- 128x128 icon
- screenshots of popup empty state, detected media, native host missing, and active download
- privacy policy URL
- support URL
- native host installer URL
- permission justifications
