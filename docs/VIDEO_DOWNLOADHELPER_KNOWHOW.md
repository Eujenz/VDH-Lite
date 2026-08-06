# Video DownloadHelper Know-How Extraction

Source repository: https://github.com/aclap-dev/video-downloadhelper

Inspected repository commit: `a657e487b0bdd4ff0c7cdb04aa39284340d884be`

Source wiki: https://github.com/aclap-dev/video-downloadhelper/wiki

Inspected wiki commit: `facf5d701b6999fa3f666d47a2e4685505c95a6f`

Note: the public repository is mostly a product/documentation entry point. The most useful know-how comes from the public wiki and the way Video DownloadHelper explains its companion application to users.

## Product Patterns To Reuse

### 1. Treat The Native App As A Product

Video DownloadHelper does not hide its local helper behind implementation details. It gives the local app a product-facing name, explains why it exists, and links users to installers.

VDH Lite should do the same:

- call it the "VDH Lite Native Host"
- explain that browser extensions cannot run `yt-dlp` directly
- publish installer links separately from the extension package
- provide update and uninstall instructions

### 2. Make Native Host Troubleshooting First-Class

VDH support docs focus heavily on "companion app not recognized" because that is the most common failure point for a browser extension plus native app.

VDH Lite should maintain a dedicated troubleshooting path:

- native host not installed
- native host registered but manifest path is missing
- browser was not restarted after install
- Python missing
- `yt-dlp` missing
- `ffmpeg` missing
- antivirus blocked the native host

### 3. Ask For Actionable Bug Reports

Video DownloadHelper asks users to include browser, OS, architecture, installed helper version, and the failing video page.

VDH Lite should ask for:

- extension version
- native host version
- browser and version
- Windows version
- native host install path
- `yt-dlp --version`
- `ffmpeg -version`
- page URL
- selected quality
- final popup error

This turns vague "download failed" reports into fixable issues.

### 4. Document Unsupported DRM Clearly

Video DownloadHelper states that DRM-protected media is not supported and should not be bypassed.

VDH Lite should include the same product stance:

- do not attempt DRM bypass
- detect likely protected streams when possible
- show a clear unsupported message
- include this in privacy/support/store docs

### 5. Provide A "Where Are My Downloads?" Answer

Download tools often receive support requests because users cannot find files.

VDH Lite should expose:

- current download directory in popup settings
- default path in docs
- final output path per completed job
- future "open folder" action

### 6. Smart Naming Is A Mature Feature

Video DownloadHelper documents a rule-based smart naming system using templates, host rules, CSS selectors, max length, and replacement rules.

VDH Lite can start smaller:

- safe default filename from page title or `yt-dlp` title
- max length handling
- `%title`, `%hostname`, `%id`, `%quality` template tokens
- per-host rules later

### 7. Public Support Surface Matters

Video DownloadHelper routes users to:

- documentation wiki
- discussions/Q&A
- bug report details
- beta versions
- companion app installers

VDH Lite should prepare:

- `docs/INSTALL.md`
- `docs/SUPPORT.md`
- `docs/PRIVACY.md`
- GitHub Issues templates
- GitHub Releases for native host installers
- Store listing permission justifications

## Implementation Ideas For VDH Lite

### Native Status Endpoint

Expose a richer native status payload:

```json
{
  "ok": true,
  "hostVersion": "1.1.0",
  "installRoot": "%LOCALAPPDATA%\\VDH Lite\\NativeHost",
  "ytDlp": {
    "installed": true,
    "path": "...",
    "version": "..."
  },
  "ffmpeg": {
    "installed": true,
    "path": "...",
    "version": "..."
  }
}
```

### Copy Bug Details

Add a future popup button that copies sanitized diagnostics:

- extension version
- host version
- dependency status
- current job status
- last error
- current site host

Do not include cookies, tokens, or full private URLs without warning.

### User-Facing Native Host Installer

Current `install.bat` is good for development. For public release, add:

- signed installer when possible
- checksums
- release notes
- architecture notes
- "close Chrome before upgrade" guidance
- uninstall path

## Immediate Changes Applied To This Repo

- Extension source moved to `extension/`.
- Native host install now writes runtime files under `%LOCALAPPDATA%`.
- Source native manifest no longer contains a local absolute path.
- Product docs now include install, privacy, support, architecture, and store permission notes.

## Summary

Video DownloadHelper's strongest reusable know-how is its support and distribution model:

- make the native app understandable
- provide clear installer links
- prepare troubleshooting docs before users need them
- explain unsupported DRM plainly
- collect useful diagnostics for failed downloads

For VDH Lite, this is as important as the code. A downloader extension becomes community-ready when installation failure, permission confusion, and failed-download support are designed into the product.
