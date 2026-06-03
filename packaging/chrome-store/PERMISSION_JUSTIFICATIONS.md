# Chrome Web Store Permission Justifications

Use this as the working draft for Chrome Web Store review answers.

## activeTab

VDH Lite uses `activeTab` so a user action in the popup can scan the current tab for visible media elements and performance entries.

## optional_host_permissions

VDH Lite asks for per-site access only when the user grants it from the popup. This lets the extension observe media-like network requests on the current site without requesting install-time access to every website.

## webRequest

VDH Lite uses `webRequest` to detect browser-visible media candidates such as HLS, DASH, MP4, WebM, audio files, and media content types on granted sites.

## scripting

VDH Lite injects content scripts after a user action to inspect media elements, performance entries, and page-context fetch/XHR activity.

## nativeMessaging

VDH Lite uses Native Messaging to communicate with the locally installed `com.vdhlite.ytdlp` native host. This is required because Chrome extensions cannot run Python, `yt-dlp`, or `ffmpeg` directly.

## storage

VDH Lite stores local user settings such as download directory and popup preferences.

## downloads

VDH Lite keeps a direct browser download fallback for URLs that can be downloaded without the native host.

## Data Handling Summary

VDH Lite does not upload detected media URLs, browsing history, downloaded files, or logs to project servers.

Detected URLs are used locally to show candidates and to start user-requested downloads through the native host.
