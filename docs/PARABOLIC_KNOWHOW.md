# Parabolic Know-How Extraction

Source repository: https://github.com/NickvisionApps/Parabolic

Inspected commit: `5ff1cf39c3f8e620797d5a004d272800aecbc29c`

Purpose: extract engineering patterns from Parabolic that are useful for VDH Lite, especially around `yt-dlp`, media discovery, download progress, queueing, recovery, and browser integration.

## High-Value Patterns

### 1. Separate Detection, Discovery, And Download

Parabolic does not treat a detected URL as enough information to download blindly. Its flow is:

1. Accept a URL from the UI or browser extension.
2. Run `yt-dlp --dump-single-json --skip-download` for discovery.
3. Parse formats, subtitles, thumbnail, duration, playlist entries, and title.
4. Convert the selected media/options into a download command.
5. Track progress through structured process output.

For VDH Lite, this suggests a two-stage model:

- Extension-side detector finds likely media URLs quickly.
- Native host performs an optional `yt-dlp` preflight before final download.

This would improve title quality, format selection, subtitles, playlist handling, and failure messages.

### 2. Use A Structured Download Options Model

Parabolic wraps all user choices in a `DownloadOptions` object:

- URL
- save folder and filename
- file type/container
- playlist position
- exact video/audio format
- selected video resolution or audio bitrate
- subtitle languages
- chapter split / description export
- time-frame clipping
- postprocessor arguments
- credentials

VDH Lite currently sends a smaller native message. A stronger next step is to define a native request schema such as:

```json
{
  "type": "download",
  "url": "...",
  "referer": "...",
  "title": "...",
  "downloadDir": "...",
  "format": {
    "height": 1080,
    "fileType": "mp4",
    "videoFormatId": null,
    "audioFormatId": null
  },
  "subtitles": [],
  "postprocess": {
    "embedMetadata": true,
    "embedThumbnail": false
  }
}
```

This keeps the popup and native host from growing a pile of loosely related string parameters.

### 3. Prefer `yt-dlp --progress-template`

Parabolic uses:

```text
--progress
--newline
--progress-template
[Parabolic] Progress;%(progress.status)s;%(progress.downloaded_bytes)s;%(progress.total_bytes)s;%(progress.total_bytes_estimate)s;%(progress.speed)s;%(progress.eta)s
--progress-delta
.75
```

That is better than parsing normal `[download] 12.3% ...` lines because the output shape is stable and machine-readable.

VDH Lite should adopt the same idea with its own prefix, for example:

```text
[VDH-Lite] Progress;%(progress.status)s;%(progress.downloaded_bytes)s;%(progress.total_bytes)s;%(progress.total_bytes_estimate)s;%(progress.speed)s;%(progress.eta)s
```

Then `native/yt_dlp_host.py` can parse semicolon-separated fields instead of relying on multiple regexes.

### 4. Print The Final File Path

Parabolic adds:

```text
--print after_move:filepath
```

After a successful download, it reads the final path from the last useful output lines. This matters because `yt-dlp` may remux, recode, rename, or move the file after download.

VDH Lite should store final output path in each job record rather than guessing from the title/template.

### 5. Queue And Recovery Are First-Class

Parabolic keeps separate collections for:

- downloading
- queued
- completed

It also stores recoverable downloads before they start, removes them after completion, and offers recovery after a crash.

VDH Lite already stores recent jobs. The next maturity jump is:

- add explicit `queued`, `running`, `finished`, `failed`, `stopped` states
- add a concurrency limit
- persist pending/running job options
- offer retry for failed jobs
- keep orphan cleanup bounded

### 6. Discovery Should Parse More Than Resolution

Parabolic turns `yt-dlp` JSON into media models containing:

- safe title
- playlist position
- duration
- thumbnail URL
- media type
- available formats
- subtitles
- codec
- FPS
- bitrate
- resolution
- audio language
- audio description flag

VDH Lite currently infers quality mostly from URLs and HLS playlists. Keep that fast path, but add native preflight when the user wants accurate choices.

Recommended model for popup display:

```text
title
site/host
duration
thumbnail
formats[]
subtitles[]
sourceUrl
webpageUrl
referer
```

### 7. Format Selection Needs Fallback Chains

Parabolic builds resilient `--format` selectors. For a selected video height, the pattern is roughly:

```text
bestvideo*[height=1080]+bestaudio/
bestvideo*[height<=1080]+bestaudio/
bestvideo*+bestaudio/
best
```

VDH Lite already uses a simpler height selector. It should evolve toward:

- exact height first
- width/height fallback when needed
- less-than-or-equal fallback
- final `best` fallback
- separate audio selector
- avoid fragile single-format assumptions

Parabolic also avoids OPUS in some Windows + YouTube + non-WEBM cases when no preferred audio codec is set. This is worth testing before adopting, but it is a useful compatibility clue.

### 8. File Type Drives Postprocessing

Parabolic maps output type to `yt-dlp` behavior:

- audio outputs use `--extract-audio`, `--audio-quality 0`, and optionally `--audio-format`
- video containers use `--remux-video`
- some containers use `--recode-video`
- subtitles can be written, converted, and embedded only when the target type supports it
- thumbnails and metadata are optional postprocessors

For VDH Lite, a practical near-term set is:

- video generic / MP4
- audio MP3 / M4A
- embed metadata toggle
- subtitle download toggle

### 9. Robust Path Handling

Parabolic sanitizes filenames and guards path length:

- replace invalid filename characters
- apply Windows filename rules
- trim filename length
- fall back to the downloads folder if the path becomes too long

VDH Lite already sanitizes components, but should add:

- max path handling
- final filename length budget
- better title fallback from `yt-dlp` discovery
- collision behavior: overwrite, no-overwrite, or auto-number

### 10. Do Not Force Overwrite When Partials Exist

Parabolic checks for partial files before adding `--force-overwrites`.

Reason: if a partial download exists, forcing overwrite can destroy resumable data.

VDH Lite should consider partial patterns:

```text
*.part*
*.ytdl
*.vtt
*.srt
*.ass
*.lrc
```

Then choose between resume, overwrite, or user-visible conflict.

### 11. Cookies, Proxy, And Extra Args Are Advanced Settings

Parabolic supports:

- `--cookies-from-browser`
- manual `--cookies` path
- `--proxy`
- user-provided discovery args
- user-provided download args

These are valuable for real-world sites, but they should live behind an advanced settings section in VDH Lite. The native host must still build command arguments as arrays, not shell strings.

### 12. Extension Can Be Low-Permission

Parabolic's browser extension is intentionally small:

- `activeTab`
- `contextMenus`
- `storage`
- open current tab/link with a custom `parabolic://` URL
- optional YouTube playlist parameter trimming
- keyboard shortcut

VDH Lite needs broader permissions because it detects media requests, but Parabolic's pattern is useful as an additional low-friction action:

- add a context menu: `Download current page with VDH Lite`
- add a context menu for links/media links
- optionally trim YouTube `list` and `index` parameters
- keep this path separate from network candidate detection

### 13. Keep User Preferences As Sticky Defaults

Parabolic remembers previous choices:

- save folder
- previous file type
- previous audio/video format
- previous subtitle languages
- previous split-chapter setting
- previous postprocessor argument
- previous playlist ordering and numbering

VDH Lite should remember:

- last download directory
- last selected quality
- last output mode
- whether to use native preflight
- whether to embed metadata/subtitles

### 14. Thumbnail Cache Is Simple But Useful

Parabolic maps media URLs to thumbnail URLs and caches image bytes. If no thumbnail exists, it uses a default thumbnail.

VDH Lite can use `yt-dlp` discovery thumbnail URLs to make the popup easier to scan, but should keep this optional and bounded to avoid popup latency.

## Recommended VDH Lite Implementation Order

### Phase 1: Native Progress Hardening

- Add `--progress-template` with a VDH Lite prefix.
- Parse semicolon progress fields in `native/yt_dlp_host.py`.
- Keep regex fallback only for older output or aria2c.
- Add `--print after_move:filepath`.
- Store `finalPath`, `phase`, `speedBytes`, `etaSeconds`, and `downloadedBytes` in job records.

### Phase 2: Native Discovery Preflight

- Add a native message type: `discover`.
- Run `yt-dlp --dump-single-json --skip-download --ignore-errors --no-warnings`.
- Return compact media metadata to the popup.
- Use discovery results to offer true format choices.

### Phase 3: Download Options Schema

- Replace loose quality-only download requests with a structured options object.
- Support selected height, output file type, exact format IDs, audio mode, and subtitles.
- Keep command construction in Python argument arrays.

### Phase 4: Queue, Retry, And Recovery

- Add job states: `queued`, `running`, `paused`, `stopped`, `finished`, `failed`.
- Add concurrency limit.
- Persist queued/running options.
- Add retry failed and clear completed.

### Phase 5: Advanced `yt-dlp` Features

- Cookies from browser or cookies file.
- Proxy URL.
- Audio extraction.
- Subtitle download/embed.
- Metadata and thumbnail embed.
- SponsorBlock.
- Optional aria2c acceleration.

## What Not To Copy Directly

- Parabolic is a full desktop app with .NET, GNOME, and WinUI layers. VDH Lite should not copy that architecture wholesale.
- The custom URI scheme is useful, but Native Messaging is already the better bridge for VDH Lite's Chrome extension.
- Do not copy UI complexity before improving native reliability.
- Do not expose every advanced `yt-dlp` option in the popup; keep power-user settings behind an advanced panel.

## Immediate Code Targets In VDH Lite

- `native/yt_dlp_host.py`
  - improve command arguments
  - parse structured progress
  - store final output path
  - add discovery endpoint

- `native/yt_dlp_runner.py`
  - stream output with structured progress support
  - preserve exit code and final path

- `src/service_worker.js`
  - add context menu path for current page/link
  - optionally call native discovery for selected candidate

- `src/popup.js`
  - display native discovery metadata
  - present per-item format choices
  - add retry/cancel controls

## Summary

The most reusable Parabolic know-how is not its UI, but its disciplined `yt-dlp` integration:

- discover first when accuracy matters
- model download options explicitly
- use structured progress output
- store final file paths
- maintain queue/recovery/history
- make advanced `yt-dlp` features optional and controlled

For VDH Lite, the highest-return first change is replacing regex-only progress parsing with `--progress-template` and adding `--print after_move:filepath`.
