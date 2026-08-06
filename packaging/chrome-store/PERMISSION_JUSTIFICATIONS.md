# Chrome Web Store Permission Justifications

Use this as the working draft for Chrome Web Store review answers.

## activeTab

VDH Lite uses `activeTab` so a user action in the popup can scan the current tab for visible media elements and performance entries.

## host_permissions

VDH Lite declares HTTP/HTTPS host permissions because its `webRequest` detector registers listeners for media-like requests across browser pages. Chrome requires these request URL patterns to be declared in the manifest host permissions for the listener to run.

## webRequest

VDH Lite uses `webRequest` to detect browser-visible media candidates such as HLS, DASH, MP4, WebM, audio files, and media content types.

## scripting

VDH Lite injects content scripts after a user action to inspect media elements, performance entries, and page-context fetch/XHR activity.

## nativeMessaging

VDH Lite uses Native Messaging to communicate with the locally installed `com.vdhlite.ytdlp` native host. This is required because Chrome extensions cannot run Python, `yt-dlp`, or `ffmpeg` directly.

## storage

VDH Lite stores local user settings such as download directory and popup preferences.

## downloads

VDH Lite keeps a direct browser download fallback for URLs that can be downloaded without the native host.

## cookies

VDH Lite reads cookies only for the exact media or webpage URL the user chooses to discover or download. Matching cookies may be forwarded locally to the native host so authenticated media requests behave like the browser request. Cookies are never substituted across domains, are not uploaded to VDH Lite servers, are excluded from persistent job history, and any temporary native-host credential file becomes unusable after 15 minutes and is deleted during native-host maintenance.

## Data Handling Summary

VDH Lite does not upload detected media URLs, browsing history, downloaded files, or logs to project servers.

Detected URLs and matching request metadata are used locally to show candidates and to start user-requested downloads through the native host.
