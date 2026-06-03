# Privacy Policy Draft

This is a draft for review and publication. It is not legal advice.

VDH Lite is designed to process media detection and downloads locally.

## Data The Extension Uses

The extension may inspect:

- the active tab URL and title
- media-like network requests on HTTP/HTTPS pages
- page media elements and performance entries
- user settings such as download directory and quality choice

## Data Stored Locally

VDH Lite stores settings in Chrome extension storage.

The native host stores recent job state and diagnostic logs under the user's local application data folder.

Examples:

```text
%LOCALAPPDATA%\VDH Lite
%LOCALAPPDATA%\VDH Lite\NativeHost
```

## Data Sent Off Device

VDH Lite does not upload browsing history, detected URLs, logs, or downloaded files to a VDH Lite server.

The native host calls local command-line tools such as `yt-dlp` and `ffmpeg`. Those tools may contact the media website selected by the user to resolve and download media.

## Native Host

The native host is required because browser extensions cannot run Python, `yt-dlp`, or `ffmpeg` directly.

The extension sends download requests to:

```text
com.vdhlite.ytdlp
```

The native host validates the request and executes local commands using argument arrays.

## Permissions

VDH Lite requests the permissions needed for its current media detector. HTTP/HTTPS host permissions are required because Chrome's `webRequest` API needs declared host access for the request patterns it observes.

## DRM And Protected Content

VDH Lite does not bypass DRM or encrypted content protections.

If a site uses DRM, VDH Lite should report that the media is unsupported rather than attempting to work around protection.
