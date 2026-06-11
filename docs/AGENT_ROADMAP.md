# Agent Development Roadmap

This roadmap is the implementation guide for future agents. It is based on the current VDH Lite repository, `docs/PARABOLIC_KNOWHOW.md`, `docs/VIDEO_DOWNLOADHELPER_KNOWHOW.md`, and a reference review of VidBee plus Open Video Downloader.

Use this document as the main task sequence. `docs/ROADMAP.md` remains the high-level product backlog.

## Current Baseline

VDH Lite already has:

- Chrome MV3 extension under `extension/`
- popup UI for media candidates, quality selection, dependency status, and recent jobs
- background media detection through `webRequest`, content scripts, performance entries, and page probes
- HTTP/HTTPS host permissions for the current `webRequest` detector
- Windows native host under `native/`
- `yt-dlp` process runner and basic job persistence
- native dependency checks and install attempts for `yt-dlp` / FFmpeg
- community packaging/docs scaffolding

Known gaps:

- progress parsing relies mostly on regex over human-readable `yt-dlp` output
- no native discovery/preflight endpoint yet
- no structured download options schema
- no per-item format table
- no cancel/retry controls
- no concurrency queue/recovery model
- no automated test suite
- no diagnostics copy button
- no DRM/unsupported detection UX

Reference review updates:

- VidBee reinforces a lightweight browser companion model: the extension should detect and hand off, while the local host owns yt-dlp discovery, download options, queue state, retries, and diagnostics.
- VidBee's downloader-core and task-queue patterns support explicit schemas, resilient yt-dlp defaults, queue state projection, retry scheduling, and classified errors.
- Open Video Downloader reinforces a media-card UI: thumbnail/title/host, item-local format selector, state-specific actions, progress phases, expandable diagnostics, and metadata/preferences views.
- Do not port Electron, Tauri, React, Vue, Rust, WXT, or their package layout into VDH Lite. Extract the product and domain patterns into the current MV3 plus Python native-host architecture.

## Agent Working Rules

Before starting any stage:

1. Read the target stage and its acceptance criteria.
2. Run `git status --short` and preserve unrelated user changes.
3. Keep edits scoped to the stage.
4. Prefer small helper functions over broad rewrites.
5. Keep native command execution as argument arrays, never shell-concatenated strings.
6. Validate with the listed checks before finishing.

Recommended baseline validation:

```powershell
python -m py_compile native\yt_dlp_host.py native\yt_dlp_runner.py
powershell -ExecutionPolicy Bypass -File .\scripts\check-release-readiness.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1 -Store
```

## Stage 1: Native Progress And Final Path Hardening

Goal: make download progress stable, machine-readable, and supportable.

Why first: Parabolic's most directly reusable know-how is structured `yt-dlp` progress output and final path tracking. This improves the current user experience without changing detection or UI architecture.

Target files:

- `native/yt_dlp_host.py`
- `native/yt_dlp_runner.py`
- `extension/src/popup.js`
- optional: `docs/SUPPORT.md`

Implementation tasks:

1. Add `--progress`, `--newline`, `--no-color`, `--progress-template`, and `--progress-delta` to the `yt-dlp` command.
2. Use a VDH Lite prefix:

```text
[VDH-Lite] Progress|%(progress.status|)s|%(progress.percent|)s|%(progress._percent_str|)s|%(progress.speed|)s|%(progress.eta|)s|%(progress.downloaded_bytes|)s|%(progress.total_bytes|)s|%(progress.total_bytes_estimate|)s|%(progress.fragment_index|)s|%(progress.fragment_count|)s
```

3. Add `--print after_move:filepath` and, when possible, `--print after_move:format_id`.
4. Parse structured progress lines into:

```json
{
  "phase": "downloading",
  "status": "downloading",
  "downloadedBytes": 123,
  "totalBytes": 456,
  "totalBytesEstimate": 456,
  "percent": 27.0,
  "speedBytes": 1000000,
  "etaSeconds": 12,
  "currentFragment": 1,
  "totalFragments": 10,
  "formatId": null,
  "finalPath": null
}
```

5. Add phase detection for `initializing`, `downloading`, `merging`, `remuxing`, `reencoding`, and `finalizing`.
6. Keep current regex parsing as fallback for legacy output, destination lines, and fragment hints.
7. Store final output path and final format id in the job record after successful completion.
8. Surface phase, final path, and clear failure reason in popup job rows.
9. Ensure `clear-jobs` does not delete active/running jobs.

Acceptance criteria:

- Popup progress no longer depends only on `[download] 12.3%` regex lines.
- Completed jobs show `percent: 100`, `phase: finished`, and `finalPath` when available.
- Failed jobs show the final useful error line.
- Running jobs show a useful phase even while percent is indeterminate.
- Existing quality download path still works.
- Job JSON remains bounded.

Validation:

```powershell
python -m py_compile native\yt_dlp_host.py native\yt_dlp_runner.py
powershell -ExecutionPolicy Bypass -File .\scripts\check-release-readiness.ps1
```

Suggested manual smoke test:

1. Load `extension/` unpacked in Chrome.
2. Run `install.bat`.
3. Start one small `yt-dlp` supported download.
4. Confirm progress, speed, ETA, finish status, and final path.

## Stage 2: Native Discovery Preflight

Goal: let the native host ask `yt-dlp` what media/formats are available before downloading.

Why now: VDH Lite currently infers quality from URLs and HLS playlists. Parabolic shows that discovery should be a first-class step when accuracy matters.

Target files:

- `native/yt_dlp_host.py`
- `extension/src/service_worker.js`
- `extension/src/popup.js`
- optional: `extension/src/popup.html`, `extension/src/popup.css`

Implementation tasks:

1. Add native message type:

```json
{
  "type": "discover",
  "url": "...",
  "referer": "...",
  "originUrl": "..."
}
```

2. Run:

```text
yt-dlp --ignore-config --dump-single-json --skip-download --ignore-errors --no-warnings
```

3. Include `--ffmpeg-location` when FFmpeg is known.
4. Include `--referer` when valid.
5. Parse JSON into a compact response:

```json
{
  "ok": true,
  "title": "...",
  "webpageUrl": "...",
  "duration": 123,
  "thumbnail": "...",
  "media": [
    {
      "title": "...",
      "url": "...",
      "playlistPosition": -1,
      "formats": [
        {
          "id": "...",
          "height": 1080,
          "fps": 30,
          "abr": null,
          "ext": "mp4",
          "vcodec": "avc1",
          "acodec": "mp4a",
          "filesize": null
        }
      ],
      "subtitles": [],
      "thumbnail": "..."
    }
  ]
}
```

6. Keep large JSON out of popup state; return only needed fields.
7. Normalize formats into `video`, `audio`, and `best` style choices so the popup can render an item-local selector.
8. Add popup action or automatic "details loading" path for selected candidate.
9. Show discovery failures as actionable messages, not raw stack traces.

Acceptance criteria:

- Native host supports `discover`.
- Popup can show discovered title and at least one format/quality from `yt-dlp`.
- Failed discovery does not block direct download fallback.
- Discovery can include thumbnail, duration, uploader/host, and a compact format list when available.
- Private data is not logged beyond existing diagnostic logs.

Validation:

```powershell
python -m py_compile native\yt_dlp_host.py
```

Manual smoke:

1. Select a detected media candidate.
2. Trigger discovery.
3. Confirm title, duration, thumbnail URL or fallback, and format count.

## Stage 3: Structured Download Options And Format Selection

Goal: replace loose quality-only native messages with explicit download options.

Why now: Parabolic's `DownloadOptions` model prevents the native host from becoming a pile of unrelated string parameters.

Target files:

- `native/yt_dlp_host.py`
- `extension/src/popup.js`
- `extension/src/service_worker.js`
- optional: `docs/ARCHITECTURE.md`

Implementation tasks:

1. Define a native request schema:

```json
{
  "type": "download",
  "url": "...",
  "referer": "...",
  "title": "...",
  "host": "...",
  "downloadDir": "...",
  "options": {
    "height": 1080,
    "fileType": "mp4",
    "videoFormatId": null,
    "audioFormatId": null,
    "audioOnly": false,
    "subtitles": [],
    "embedMetadata": true,
    "embedThumbnail": false,
    "container": "auto",
    "proxy": null,
    "cookiesFromBrowser": null,
    "cookiesPath": null
  }
}
```

2. Maintain backwards compatibility with the current `quality` field until popup migration is complete.
3. Build resilient format selectors:

- exact height
- height less than or equal
- best video plus best audio
- final best fallback

4. Add output modes:

- generic video
- MP4 video
- MP3 audio
- M4A audio

5. Add safe filename/path handling:

- sanitize invalid characters
- enforce max filename length
- avoid Windows max path issues
- decide collision strategy

6. Add resilient yt-dlp defaults inspired by VidBee:

- `--continue`
- `--retries 30`
- `--fragment-retries 30`
- `--retry-sleep 2`
- `--socket-timeout 30`
- `--windows-filenames` and bounded filename length on Windows

7. Add optional cookies, proxy, and config path support behind advanced settings.
8. Add partial download awareness before force-overwrite behavior.

Acceptance criteria:

- Native host validates the options object.
- Bad option values are rejected with clear errors.
- MP4 and audio extraction modes work for supported media.
- Cookie/proxy/config settings are optional and redacted from logs/diagnostics.
- Existing height-based download still works.

Validation:

```powershell
python -m py_compile native\yt_dlp_host.py
```

## Stage 4: Candidate Grouping And Per-Item Quality UX

Goal: make the popup feel like a downloader product rather than a raw URL list.

Why now: Video DownloadHelper's core UX is a compact candidate list, and Open Video Downloader shows how much clearer a media-card flow is than a raw URL list. VDH Lite already detects candidates, but the current UI still asks users to reason about raw URLs.

Target files:

- `extension/src/service_worker.js`
- `extension/src/popup.js`
- `extension/src/popup.html`
- `extension/src/popup.css`

Implementation tasks:

1. Introduce a normalized candidate model:

```json
{
  "id": "...",
  "sourceUrl": "...",
  "pageUrl": "...",
  "host": "...",
  "title": "...",
  "type": "hls|dash|video|audio|unknown",
  "qualities": [],
  "formats": [],
  "thumbnail": null,
  "score": 100,
  "detectedAt": 0,
  "sources": ["webRequest", "dom"]
}
```

2. Group duplicates by canonical URL and media family.
3. Collapse HLS variants under one item when possible.
4. Add relative URL resolution for HLS playlists.
5. Keep preview/sample media hidden by default.
6. Add optional setting to show filtered candidates.
7. Replace the global quality dropdown with a media-card item-local selector.
8. Use media cards with:

- title and host as the first scan targets
- optional thumbnail or stable placeholder
- type/quality chips
- one primary Download action
- secondary actions for details, clear/remove, and retry when applicable

9. Add filter chips when useful: `All`, `Detected`, `Active`, `Finished`, `Failed`.
10. Add extension badge states:

- detected media count
- running downloads
- failed downloads

Acceptance criteria:

- Duplicate URLs do not spam the popup.
- Per-item quality selection works.
- The popup can be scanned by title, host, and quality.
- The first visible screen prioritizes detected candidates over settings and raw job internals.
- Detection still works after popup close/reopen while tab remains open.

Validation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1 -Store
```

## Stage 5: Queue, Cancel, Retry, And Recovery

Goal: make downloads manageable across multiple jobs and failures.

Why now: once discovery and options are stronger, users will start more downloads. Parabolic's queue/recovery model becomes important.

Target files:

- `native/yt_dlp_host.py`
- `native/yt_dlp_runner.py`
- `extension/src/service_worker.js`
- `extension/src/popup.js`
- `extension/src/popup.css`

Implementation tasks:

1. Add job states:

```text
queued
running
stopping
stopped
finished
failed
unknown
```

2. Add native messages:

```json
{ "type": "cancel", "jobId": "..." }
{ "type": "retry", "jobId": "..." }
{ "type": "retry-failed" }
{ "type": "clear-completed" }
```

3. Persist original download request per job for retry.
4. Add a concurrency limit setting.
5. Keep queued jobs in native job state.
6. Add an error category field to jobs so retry controls can distinguish retryable and non-retryable failures.
7. Recover queued/running jobs on native restart as retryable, not silently lost.
8. Update popup sections:

- Active
- Queued
- Finished
- Failed

Acceptance criteria:

- Users can cancel a running job.
- Failed jobs can be retried.
- Clearing history preserves active and queued jobs.
- Retry controls are shown only when a job category is plausibly retryable.
- Native host restart does not erase recoverable job intent.

Validation:

```powershell
python -m py_compile native\yt_dlp_host.py native\yt_dlp_runner.py
```

## Stage 6: Diagnostics And Community Support UX

Goal: reduce support friction before public release.

Why now: Video DownloadHelper's support know-how is clear: native app problems and failed downloads need structured diagnostics.

Target files:

- `extension/src/popup.html`
- `extension/src/popup.js`
- `extension/src/popup.css`
- `native/yt_dlp_host.py`
- `docs/SUPPORT.md`

Implementation tasks:

1. Add "Copy diagnostics" button in settings or failed job rows.
2. Include sanitized:

- extension version
- native host version
- browser name/version when available
- host path
- log dir
- `yt-dlp` version
- FFmpeg version
- job status
- last error
- site host

3. Avoid copying full private URLs by default; include host only unless user opts in.
4. Add native diagnostic message:

```json
{ "type": "diagnostics" }
```

5. Add a native error classifier for:

- `http-429`
- `auth-required`
- `geo-blocked`
- `not-found`
- `disk-full`
- `permission-denied`
- `binary-missing`
- `ffmpeg`
- `network-transient`
- `stalled`
- `cancelled-by-user`
- `unknown`

6. Map categories to UI actions such as import cookies, choose folder, retry, free disk, set proxy, report issue, or remove task.
7. Add clearer native missing/install messages:

- native host not installed
- native host installed but `yt-dlp` missing
- FFmpeg missing
- browser restart may be required

8. Update support docs with diagnostics workflow.

Acceptance criteria:

- A failed download row can produce useful issue-template content.
- Diagnostics do not include cookies or tokens.
- Common failures show a short explanation and at least one sensible next action.
- Missing native host flow is understandable to a non-developer.

Validation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-release-readiness.ps1
```

## Stage 7: Advanced yt-dlp Features

Goal: expose useful `yt-dlp` power features without overwhelming the popup.

Why now: advanced features should come after core stability, discovery, options, and support paths.

Target files:

- `native/yt_dlp_host.py`
- `extension/src/popup.js`
- optional: future `extension/src/options.html`
- optional: future `extension/src/options.js`

Implementation tasks:

1. Add advanced settings storage for:

- cookies file path
- cookies from browser
- proxy URL
- extra discovery args
- extra download args
- SponsorBlock toggle
- subtitle download/embed toggle
- metadata embed toggle
- thumbnail embed toggle

2. Keep power-user settings behind an advanced panel or options page.
3. Validate user-provided args before merging them.
4. Do not allow shell injection.
5. Document risks in `docs/SUPPORT.md` or a new advanced settings doc.

Acceptance criteria:

- Advanced settings are optional and off by default unless safe.
- Invalid paths/args fail with clear errors.
- Store review docs still explain data handling.

## Stage 8: Detection Coverage And Unsupported Media

Goal: improve media detection while being honest about unsupported content.

Why now: after core native flow is robust, deeper detection can be added without masking failures as UX bugs.

Target files:

- `extension/src/service_worker.js`
- `extension/src/content_script.js`
- `extension/src/page_probe.js`
- `extension/src/popup.js`

Implementation tasks:

1. Add MPD/DASH representation parsing.
2. Improve HLS parser:

- relative URL resolution
- bandwidth
- codecs
- audio tracks

3. Add MediaSource/blob awareness where feasible.
4. Detect likely DRM/encrypted media signals:

- EME APIs in page probe
- encrypted init data events if observable
- license request URL patterns where visible

5. Show unsupported DRM/protected message.
6. Add tested-sites matrix doc:

```text
docs/TESTED_SITES.md
```

Acceptance criteria:

- DASH qualities can be shown for basic MPD files.
- Likely DRM does not appear as a normal downloadable candidate.
- Popup explains unsupported protected media clearly.

## Stage 9: Automated Tests And Release Quality

Goal: make future agent changes safer.

Why now: after core models stabilize, tests should lock behavior down.

Target files:

- `tests/`
- `scripts/`
- `native/`
- `extension/src/`

Implementation tasks:

1. Add Python tests for:

- filename sanitization
- progress parsing
- native message validation
- job state transitions
- format selector construction
- error classification

2. Add JavaScript tests for:

- URL normalization
- quality detection
- candidate scoring/grouping
- HLS/MPD parser fixtures
- popup candidate projection from grouped media

3. Add fixture files:

```text
tests/fixtures/yt-dlp-progress.txt
tests/fixtures/master.m3u8
tests/fixtures/basic.mpd
tests/fixtures/yt-dlp-errors.txt
```

4. Add a single validation script:

```powershell
scripts\validate.ps1
```

5. Make release readiness run test checks when available.

Acceptance criteria:

- A future agent can run one command before handoff.
- Core parsing and native logic have fixture coverage.
- Extension package still builds.

## Stage 10: Public Release Readiness

Goal: prepare a public beta release.

Target files:

- `README.md`
- `docs/INSTALL.md`
- `docs/PRIVACY.md`
- `docs/SUPPORT.md`
- `packaging/chrome-store/*`
- `scripts/*`
- future installer packaging files

Implementation tasks:

1. Add release checklist:

```text
docs/RELEASE_CHECKLIST.md
```

2. Add native host installer packaging plan.
3. Add checksums instructions.
4. Prepare screenshots:

- empty popup
- detected media
- active download
- native host missing/settings

5. Confirm Chrome Store package excludes development `key`.
6. Confirm native installer supports published extension ID.
7. Confirm privacy policy and permission justifications match actual behavior.

Acceptance criteria:

- Store zip builds from `extension/`.
- Native host install instructions work for a clean Windows user profile.
- Privacy/support docs are accurate.
- Known limitations are documented.

## Recommended Agent Sequence

User priority update: UI/UX should lead the next development passes. Keep native reliability in view, but make the popup easier to understand before expanding deeper `yt-dlp` behavior.

Work in this order unless the user explicitly reprioritizes:

1. Stage 4: Candidate grouping and per-item quality UX.
2. Stage 1: Native progress and final path hardening.
3. Stage 6: Diagnostics and community support UX.
4. Stage 2: Native discovery preflight.
5. Stage 3: Structured download options and format selection.
6. Stage 5: Queue, cancel, retry, and recovery.
7. Stage 9: Automated tests and release quality.
8. Stage 8: Detection coverage and unsupported media.
9. Stage 7: Advanced `yt-dlp` features.
10. Stage 10: Public release readiness.

Reasoning: users should immediately understand whether VDH Lite is ready, what it detected, what will be downloaded, and what to do when nothing appears. Once the popup has a stable media-card model, structured progress and diagnostics can deepen the same UI before discovery and richer download options arrive.

## First Agent Task Template

Use this prompt for the next implementation agent:

```text
Read docs/AGENT_ROADMAP.md, docs/VIDEO_DOWNLOADHELPER_KNOWHOW.md, and docs/ARCHITECTURE.md.
Use the VidBee and Open Video Downloader reference patterns summarized in docs/ROADMAP.md and docs/AGENT_ROADMAP.md.
Implement Stage 4 only: candidate grouping and per-item quality UX.
Keep changes scoped to the listed target files.
Preserve existing native download behavior.
Validate with scripts/package-extension.ps1 -Store and scripts/check-release-readiness.ps1.
Report changed files, verification results, and any manual smoke-test gaps.
```

## Handoff Checklist For Each Stage

Each agent should finish with:

- changed files
- implemented tasks
- skipped tasks and why
- validation commands and outputs summarized
- manual test status
- remaining risks
- next recommended stage
