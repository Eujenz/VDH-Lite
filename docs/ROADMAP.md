# VDH Lite Custom Roadmap

This roadmap tracks the work needed to grow VDH Lite Custom from a personal alpha tool into a mature Chrome extension. It borrows product patterns from Video DownloadHelper while keeping this project centered on yt-dlp, explicit permissions, and a local native host.

## Product Direction

VDH Lite Custom should feel like a practical downloader companion:

- Detect the right media candidate without making the user inspect raw URLs.
- Present quality, format, size, speed, ETA, and download state clearly.
- Hand off complex extraction and muxing to yt-dlp/FFmpeg.
- Keep site permissions, native dependencies, and local paths understandable.
- Fail honestly, with actionable recovery steps.

## Milestone 1: Reliable Daily Use

- [ ] Candidate grouping: collapse duplicate URLs and related HLS variants into one media item.
- [ ] Better naming: derive clean titles from page metadata, `og:title`, document title, and yt-dlp metadata when available.
- [ ] Quality labels: show `1080P`, `720P`, audio-only, container, codec, and HLS/DASH only when resolution is unknown.
- [ ] HLS variant parsing: resolve relative playlist URLs and parse bandwidth/codecs/audio tracks.
- [ ] Download status: show overall progress first, then speed, ETA, quality, and current phase.
- [ ] Failure status: surface yt-dlp exit code and the final useful error line instead of `unknown`.
- [ ] Clear history behavior: keep active downloads, clear completed/failed/stopped only.
- [ ] Preview filtering: hide low-value preview/thumbnail/sample media by default, with a settings toggle to show them.
- [ ] Settings panel cleanup: keep path, dependency checks, and advanced options behind the gear.
- [ ] Reload resilience: keep recent candidates and running jobs visible after popup close/reopen.

## Milestone 2: VDH-Inspired UX

- [ ] Primary popup layout: compact media list with title, site, quality chips, and one clear Download action.
- [ ] Download queue panel: separate `Active`, `Finished`, and `Failed` sections.
- [ ] Quality picker: let each media item expand into available qualities instead of relying only on the global selector.
- [ ] Per-site authorization state: show whether the current site is granted and provide one-click grant/revoke guidance.
- [ ] Badge states: extension icon badge for detected media count, running downloads, and failed jobs.
- [ ] Notifications: optional Chrome notification for finish/failure.
- [ ] Context menu: add `Download with VDH Lite` for media links and the current page.
- [ ] Keyboard and accessibility pass: focus states, labels, ARIA names, and predictable tab order.
- [ ] Empty states: clear messages for no media, missing native host, missing yt-dlp, and blocked playlist parsing.
- [ ] Visual polish: consistent spacing, reduced text clutter, and stronger state colors for running/finished/failed.

## Milestone 3: yt-dlp Integration Depth

- [ ] Metadata preflight: ask yt-dlp for available formats before downloading when the candidate URL supports it.
- [ ] Format table: display resolution, FPS, codec, audio availability, filesize, and estimated bitrate.
- [ ] Smart defaults: choose best video+audio under selected height, falling back cleanly.
- [ ] Cookie support: optional browser cookie export or documented manual cookie file path.
- [ ] Referer/origin handling: preserve page referer, initiator, and user agent for downloads.
- [ ] Subtitle support: optional subtitle discovery/download for yt-dlp supported sites.
- [ ] Audio extraction mode: add MP3/M4A download mode using yt-dlp postprocessors.
- [ ] Filename templates: configurable template with safe defaults.
- [ ] Destination rules: per-site or per-profile download folders.
- [ ] Cancel/retry controls: stop a running yt-dlp job and retry failed downloads.

## Milestone 4: Native Host Maturity

- [ ] Installer hardening: validate Python, pip, yt-dlp, FFmpeg, PATH, and registry state.
- [ ] Portable install mode: support a repo-local Python/yt-dlp path when possible.
- [ ] Version report: popup should show extension version, host version, yt-dlp version, and FFmpeg version.
- [ ] Auto-update check: detect outdated yt-dlp and offer update.
- [ ] Log policy: no per-download user logs by default; keep minimal diagnostic logs only when debug mode is enabled.
- [ ] Job store cleanup: keep bounded history and remove orphaned progress/spec files.
- [ ] Security review: validate all native messages and avoid command injection through strict argument arrays.
- [ ] Cross-browser notes: document Edge/Chrome compatibility and native host registry differences if supported.
- [ ] Signed release workflow: prepare zip/crx artifacts without committing generated packages.

## Milestone 5: Detection Coverage

- [ ] Network heuristics: improve media detection from response headers and content types.
- [ ] Blob URL tracing: capture source network URL behind video `blob:` playback when possible.
- [ ] MediaSource awareness: detect MSE streams and link them back to segment playlists.
- [ ] MPD parsing: extract DASH representations and show quality choices.
- [ ] Audio/video pair handling: recognize separate audio/video tracks.
- [ ] Site compatibility notes: maintain a tested-sites matrix with known behavior and limitations.
- [ ] DRM detection: identify likely DRM/encrypted streams and show a clear unsupported message.
- [ ] Large playlist handling: avoid heavy extension fetches and delegate complex probing to native yt-dlp.

## Milestone 6: Testing And Release Quality

- [ ] Add unit tests for URL quality parsing and playlist parsing.
- [ ] Add Python tests for native message handling, filename sanitization, and progress parsing.
- [ ] Add fixture-based tests for yt-dlp progress output.
- [ ] Add manual QA checklist for Chrome load, site grant, candidate detection, download start, finish, failure, clear history.
- [ ] Add lint/format scripts for JS and Python.
- [ ] Add release checklist for version bump, install test, zip generation, and smoke test.
- [ ] Add privacy/security documentation for Chrome Web Store readiness.
- [ ] Add screenshots or short demo GIFs for README once UI stabilizes.

## Backlog

- [ ] Multi-download queue with concurrency limit.
- [ ] Batch download all selected qualities/items.
- [ ] Per-download rename prompt before starting.
- [ ] Import/export settings.
- [ ] Dark/light theme following system preference.
- [ ] Optional advanced command preview for power users.
- [ ] Native host diagnostics page.
- [ ] Extension options page for settings that do not fit in the popup.

## Near-Term Recommended Order

1. Candidate grouping and per-item quality picker.
2. Better filename and metadata preflight.
3. Cancel/retry controls.
4. Failure messages and bounded job cleanup.
5. Unit tests for parsing/progress logic.
