const statusEl = document.querySelector("#status");
const statusCard = document.querySelector("#status-card");
const statusDetailEl = document.querySelector("#status-detail");
const pageHostEl = document.querySelector("#page-host");
const mediaSummaryEl = document.querySelector("#media-summary");
const mediaFiltersEl = document.querySelector("#media-filters");
const itemsEl = document.querySelector("#items");
const refreshButton = document.querySelector("#refresh");
const clearButton = document.querySelector("#clear");
const grantButton = document.querySelector("#grant");
const commandPanel = document.querySelector("#command-panel");
const commandOutput = document.querySelector("#command-output");
const languageSelect = document.querySelector("#language-select");
const downloadDirInput = document.querySelector("#download-dir");
const concurrencyLimitInput = document.querySelector("#concurrency-limit");
const browseDirButton = document.querySelector("#browse-dir");
const resetDirButton = document.querySelector("#reset-dir");
const testNativeButton = document.querySelector("#test-native");
const jobsEl = document.querySelector("#jobs");
const clearJobsButton = document.querySelector("#clear-jobs");
const settingsToggle = document.querySelector("#settings-toggle");
const settingsPanel = document.querySelector("#settings-panel");
const depsStatus = document.querySelector("#deps-status");
const installDepsButton = document.querySelector("#install-deps");
const copyDiagnosticsButton = document.querySelector("#copy-diagnostics");
const speedProfileSelect = document.querySelector("#download-speed-profile");

const DEFAULT_DOWNLOAD_DIR = "%USERPROFILE%\\Downloads\\VDH Lite";
const DEFAULT_DOWNLOAD_SPEED_PROFILE = "balanced";
const DEFAULT_LANGUAGE = "en";
const FILTERS = [
  { id: "all" },
  { id: "detected" },
  { id: "active" },
  { id: "finished" },
  { id: "failed" }
];

const I18N = {
  en: {
    "brand.currentTab": "Current tab",
    "button.grantSite": "Grant site",
    "button.browse": "Browse",
    "button.reset": "Reset",
    "button.testNative": "Test native host",
    "button.installMissing": "Install missing",
    "button.copyDiagnostics": "Copy diagnostics",
    "button.refresh": "Refresh",
    "button.clear": "Clear",
    "button.clearFinished": "Clear finished",
    "button.download": "Download",
    "button.retry": "Retry",
    "button.cancel": "Cancel",
    "button.formats": "Formats",
    "button.details": "Details",
    "button.remove": "Remove",
    "button.loading": "Loading",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.saveFolder": "Save folder",
    "settings.concurrentDownloads": "Concurrent downloads",
    "settings.downloadSpeed": "Download speed",
    "speed.polite": "Polite - 2 fragments",
    "speed.balanced": "Balanced - 4 fragments",
    "speed.fast": "Fast - 8 fragments",
    "speed.burst": "Burst - 12 fragments",
    "deps.checking": "Checking dependencies...",
    "media.title": "Detected media",
    "media.scanning": "Scanning current tab...",
    "media.filters": "Media filters",
    "jobs.title": "Downloads",
    "jobs.subtitle": "Recent native host jobs",
    "details.downloadDetails": "Download details",
    "status.loading": "Loading...",
    "status.loading.detail": "Checking native host and scanning the active tab.",
    "status.diagnosticsCopied": "Diagnostics copied",
    "status.diagnosticsCopied.detail": "Paste them into a support report. Full media URLs are intentionally omitted.",
    "status.diagnosticsCopyFailed": "Diagnostics copy failed",
    "status.clipboardFailed.detail": "Could not write to the clipboard.",
    "status.chooseFolder": "Choosing folder",
    "status.chooseFolder.detail": "Use the Windows folder picker opened by the native host.",
    "status.saveFolderUpdated": "Save folder updated",
    "status.folderSelectionCancelled": "Folder selection cancelled",
    "status.folderSelectionCancelled.detail": "The previous save folder is unchanged.",
    "status.folderPickerFailed": "Folder picker failed",
    "status.folderPickerFailed.detail": "Native host could not open the folder picker.",
    "status.loadingFormats": "Loading formats",
    "status.loadingFormats.detail": "Asking yt-dlp for title, metadata, and available formats.",
    "status.formatsLoaded": "Formats loaded",
    "status.formatsLoaded.detail.one": "{count} yt-dlp format found.",
    "status.formatsLoaded.detail.other": "{count} yt-dlp formats found.",
    "status.formatDiscoveryFailed": "Format discovery failed",
    "status.directDownloadFallback": "Direct download fallback is still available.",
    "status.mediaDetected": "Media detected",
    "status.mediaDetected.detail": "Choose a media card quality, then download.",
    "status.downloadsRunning.one": "{count} download running",
    "status.downloadsRunning.other": "{count} downloads running",
    "status.downloadsRunning.detail": "Monitor progress below or start another media card.",
    "status.downloadsNeedAttention.one": "{count} download needs attention",
    "status.downloadsNeedAttention.other": "{count} downloads need attention",
    "status.downloadsNeedAttention.detail": "Open the failed card details or retry with another quality.",
    "status.downloadQueued": "Download queued",
    "status.downloadQueued.detail": "Native job {jobId} will start when a slot is free.",
    "status.downloadStarted": "Download started",
    "status.downloadStarted.detail": "Native job {jobId} is running.",
    "status.downloadStartFailed": "Download failed to start",
    "status.cancellingDownload": "Cancelling download",
    "status.downloadCancelled": "Download cancelled",
    "status.cancelFailed": "Cancel failed",
    "status.cancelFailed.detail": "Native host could not cancel this job.",
    "status.retryingDownload": "Retrying download",
    "status.retryQueued": "Retry queued",
    "status.retryStarted": "Retry started",
    "status.retryStatus.detail": "Native job {jobId} is {status}.",
    "status.retryFailed": "Retry failed",
    "status.retryFailed.detail": "Native host could not retry this job.",
    "status.nativeMissing": "Native host is not connected",
    "status.nativeMissing.detail": "Install the VDH Lite native host, then test again.",
    "status.readyToDetect": "Ready to detect media",
    "status.readyToDetect.detail": "Grant this site if no media appears automatically.",
    "status.nativeNeedsDependencies": "Native host needs dependencies",
    "status.siteAccessGranted": "Site access granted",
    "status.siteAccessDenied": "Site access was not granted",
    "status.siteAccessDenied.detail": "VDH Lite can still use active-tab scanning after a user action.",
    "status.nativeReady": "Native host ready ({version})",
    "status.nativeError": "Native host error",
    "status.nativeReady.detail": "Ready for local downloads.",
    "status.installingDependencies": "Installing dependencies",
    "status.installingDependencies.detail": "This can take several minutes on a fresh machine.",
    "status.dependencyInstallFailed": "Dependency install failed",
    "status.languageUpdated": "Language updated",
    "status.languageUpdated.detail": "Popup text is now shown in English.",
    "filter.all": "All",
    "filter.detected": "Detected",
    "filter.active": "Active",
    "filter.finished": "Finished",
    "filter.failed": "Failed",
    "label.media": "Media",
    "label.xhr": "XHR",
    "label.page": "Page",
    "label.other": "Other",
    "label.video": "Video",
    "label.audio": "Audio",
    "label.qualityUnknown": "Quality unknown",
    "label.detected": "Detected",
    "label.sources.one": "{count} source",
    "label.sources.other": "{count} sources",
    "label.discoveryFailed": "Discovery failed",
    "label.active": "Active",
    "label.quality": "Quality",
    "label.discoveredFormat": "Discovered format",
    "label.saved": "Saved: {path}",
    "label.eta": "ETA {value}",
    "label.doneIn": "Done in {value}",
    "label.fragment": "fragment {value}",
    "label.pid": "PID {pid}",
    "state.queued": "Queued",
    "state.stopping": "Stopping",
    "state.stopped": "Stopped",
    "state.running": "Running",
    "state.failed": "Failed",
    "state.finished": "Finished",
    "state.ready": "Ready",
    "state.unknown": "Unknown",
    "empty.noDownloads": "No downloads yet",
    "empty.noCandidates": "Play the video for a few seconds, then refresh. Grant site access if detection is blocked.",
    "empty.noFiltered": "No {filter} media candidates in this tab.",
    "summary.noCandidates": "No candidates found",
    "summary.candidates.one": "{count} candidate grouped from {sources} source",
    "summary.candidates.other": "{count} candidates grouped from {sources} sources",
    "deps.nativeMissing": "Native host missing: {error}",
    "deps.ytOk": "yt-dlp OK",
    "deps.ytMissing": "yt-dlp missing",
    "deps.ffmpegOk": "FFmpeg OK",
    "deps.ffmpegMissing": "FFmpeg missing",
    "deps.installing": "Installing missing dependencies...",
    "deps.installFailed": "Install failed: {error}",
    "details.title": "Title",
    "details.host": "Host",
    "details.type": "Type",
    "details.qualities": "Qualities",
    "details.sources": "Sources",
    "details.state": "State",
    "details.urls": "URLs",
    "details.discovery": "Discovery",
    "details.source": "Source",
    "details.duration": "Duration",
    "details.uploader": "Uploader",
    "details.formats": "Formats",
    "details.discoveryFailed": "Discovery failed",
    "details.noDetails": "No details",
    "details.job": "Job",
    "details.status": "Status",
    "details.phase": "Phase",
    "details.quality": "Quality",
    "details.percent": "Percent",
    "details.finalPath": "Final path",
    "details.errorCategory": "Error category",
    "details.errorSummary": "Error summary",
    "details.nextAction": "Next action",
    "details.error": "Error",
    "value.unknown": "unknown",
    "value.none": "none"
  },
  "zh-Hant": {
    "brand.currentTab": "目前分頁",
    "button.grantSite": "授權網站",
    "button.browse": "瀏覽",
    "button.reset": "重設",
    "button.testNative": "測試本機主機",
    "button.installMissing": "安裝缺少項目",
    "button.copyDiagnostics": "複製診斷",
    "button.refresh": "重新整理",
    "button.clear": "清除",
    "button.clearFinished": "清除已完成",
    "button.download": "下載",
    "button.retry": "重試",
    "button.cancel": "取消",
    "button.formats": "格式",
    "button.details": "詳細資料",
    "button.remove": "移除",
    "button.loading": "載入中",
    "settings.title": "設定",
    "settings.language": "語言",
    "settings.saveFolder": "儲存資料夾",
    "settings.concurrentDownloads": "同時下載數",
    "settings.downloadSpeed": "下載速度",
    "speed.polite": "禮貌模式 - 2 個片段",
    "speed.balanced": "平衡模式 - 4 個片段",
    "speed.fast": "快速模式 - 8 個片段",
    "speed.burst": "爆發模式 - 12 個片段",
    "deps.checking": "正在檢查相依項目...",
    "media.title": "偵測到的媒體",
    "media.scanning": "正在掃描目前分頁...",
    "media.filters": "媒體篩選器",
    "jobs.title": "下載",
    "jobs.subtitle": "最近的本機主機工作",
    "details.downloadDetails": "下載詳細資料",
    "status.loading": "載入中...",
    "status.loading.detail": "正在檢查本機主機並掃描目前分頁。",
    "status.diagnosticsCopied": "已複製診斷",
    "status.diagnosticsCopied.detail": "可將內容貼到支援回報。完整媒體網址已刻意省略。",
    "status.diagnosticsCopyFailed": "複製診斷失敗",
    "status.clipboardFailed.detail": "無法寫入剪貼簿。",
    "status.chooseFolder": "選擇資料夾",
    "status.chooseFolder.detail": "請使用本機主機開啟的 Windows 資料夾選擇器。",
    "status.saveFolderUpdated": "儲存資料夾已更新",
    "status.folderSelectionCancelled": "已取消選擇資料夾",
    "status.folderSelectionCancelled.detail": "先前的儲存資料夾保持不變。",
    "status.folderPickerFailed": "資料夾選擇器失敗",
    "status.folderPickerFailed.detail": "本機主機無法開啟資料夾選擇器。",
    "status.loadingFormats": "正在載入格式",
    "status.loadingFormats.detail": "正在請 yt-dlp 讀取標題、中繼資料與可用格式。",
    "status.formatsLoaded": "格式已載入",
    "status.formatsLoaded.detail.one": "找到 {count} 個 yt-dlp 格式。",
    "status.formatsLoaded.detail.other": "找到 {count} 個 yt-dlp 格式。",
    "status.formatDiscoveryFailed": "格式探測失敗",
    "status.directDownloadFallback": "仍可使用直接下載備援。",
    "status.mediaDetected": "已偵測到媒體",
    "status.mediaDetected.detail": "選擇媒體卡片的畫質後即可下載。",
    "status.downloadsRunning.one": "{count} 個下載執行中",
    "status.downloadsRunning.other": "{count} 個下載執行中",
    "status.downloadsRunning.detail": "可在下方監看進度，或啟動另一張媒體卡片。",
    "status.downloadsNeedAttention.one": "{count} 個下載需要處理",
    "status.downloadsNeedAttention.other": "{count} 個下載需要處理",
    "status.downloadsNeedAttention.detail": "開啟失敗卡片的詳細資料，或改用其他畫質重試。",
    "status.downloadQueued": "下載已排入佇列",
    "status.downloadQueued.detail": "本機工作 {jobId} 會在有空位時開始。",
    "status.downloadStarted": "下載已開始",
    "status.downloadStarted.detail": "本機工作 {jobId} 正在執行。",
    "status.downloadStartFailed": "下載無法開始",
    "status.cancellingDownload": "正在取消下載",
    "status.downloadCancelled": "下載已取消",
    "status.cancelFailed": "取消失敗",
    "status.cancelFailed.detail": "本機主機無法取消這個工作。",
    "status.retryingDownload": "正在重試下載",
    "status.retryQueued": "重試已排入佇列",
    "status.retryStarted": "重試已開始",
    "status.retryStatus.detail": "本機工作 {jobId} 目前狀態為 {status}。",
    "status.retryFailed": "重試失敗",
    "status.retryFailed.detail": "本機主機無法重試這個工作。",
    "status.nativeMissing": "本機主機未連線",
    "status.nativeMissing.detail": "請安裝 VDH Lite 本機主機後再測試。",
    "status.readyToDetect": "已準備好偵測媒體",
    "status.readyToDetect.detail": "若沒有自動出現媒體，請授權此網站。",
    "status.nativeNeedsDependencies": "本機主機需要相依項目",
    "status.siteAccessGranted": "已授權網站存取",
    "status.siteAccessDenied": "未授權網站存取",
    "status.siteAccessDenied.detail": "使用者操作後，VDH Lite 仍可使用 active-tab 掃描。",
    "status.nativeReady": "本機主機就緒（{version}）",
    "status.nativeError": "本機主機錯誤",
    "status.nativeReady.detail": "已可進行本機下載。",
    "status.installingDependencies": "正在安裝相依項目",
    "status.installingDependencies.detail": "初次安裝可能需要數分鐘。",
    "status.dependencyInstallFailed": "相依項目安裝失敗",
    "status.languageUpdated": "語言已更新",
    "status.languageUpdated.detail": "Popup 文字現在會以繁體中文顯示。",
    "filter.all": "全部",
    "filter.detected": "已偵測",
    "filter.active": "進行中",
    "filter.finished": "已完成",
    "filter.failed": "失敗",
    "label.media": "媒體",
    "label.xhr": "XHR",
    "label.page": "頁面",
    "label.other": "其他",
    "label.video": "影片",
    "label.audio": "音訊",
    "label.qualityUnknown": "未知畫質",
    "label.detected": "已偵測",
    "label.sources.one": "{count} 個來源",
    "label.sources.other": "{count} 個來源",
    "label.discoveryFailed": "探測失敗",
    "label.active": "進行中",
    "label.quality": "畫質",
    "label.discoveredFormat": "探測到的格式",
    "label.saved": "已儲存：{path}",
    "label.eta": "剩餘 {value}",
    "label.doneIn": "完成時間 {value}",
    "label.fragment": "片段 {value}",
    "label.pid": "PID {pid}",
    "state.queued": "佇列中",
    "state.stopping": "停止中",
    "state.stopped": "已停止",
    "state.running": "執行中",
    "state.failed": "失敗",
    "state.finished": "已完成",
    "state.ready": "就緒",
    "state.unknown": "未知",
    "empty.noDownloads": "尚無下載",
    "empty.noCandidates": "播放影片幾秒後再重新整理。若偵測受阻，請授權網站存取。",
    "empty.noFiltered": "此分頁沒有「{filter}」媒體候選項目。",
    "summary.noCandidates": "找不到候選項目",
    "summary.candidates.one": "{count} 個候選項目，來自 {sources} 個來源",
    "summary.candidates.other": "{count} 個候選項目，來自 {sources} 個來源",
    "deps.nativeMissing": "找不到本機主機：{error}",
    "deps.ytOk": "yt-dlp 正常",
    "deps.ytMissing": "缺少 yt-dlp",
    "deps.ffmpegOk": "FFmpeg 正常",
    "deps.ffmpegMissing": "缺少 FFmpeg",
    "deps.installing": "正在安裝缺少的相依項目...",
    "deps.installFailed": "安裝失敗：{error}",
    "details.title": "標題",
    "details.host": "主機",
    "details.type": "類型",
    "details.qualities": "畫質",
    "details.sources": "來源",
    "details.state": "狀態",
    "details.urls": "網址",
    "details.discovery": "探測",
    "details.source": "來源",
    "details.duration": "長度",
    "details.uploader": "上傳者",
    "details.formats": "格式",
    "details.discoveryFailed": "探測失敗",
    "details.noDetails": "沒有詳細資料",
    "details.job": "工作",
    "details.status": "狀態",
    "details.phase": "階段",
    "details.quality": "畫質",
    "details.percent": "百分比",
    "details.finalPath": "最終路徑",
    "details.errorCategory": "錯誤類別",
    "details.errorSummary": "錯誤摘要",
    "details.nextAction": "下一步",
    "details.error": "錯誤",
    "value.unknown": "未知",
    "value.none": "無"
  }
};

let currentItems = [];
let currentGroups = [];
let currentJobs = [];
let activeTabInfo = {};
let pendingMediaRefresh = null;
let activeFilter = "all";
let currentLanguage = DEFAULT_LANGUAGE;
const selectedGroupQualities = new Map();
const discoveryByGroupId = new Map();
const discoveryErrorsByGroupId = new Map();
const discoveringGroupIds = new Set();

function normalizeLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "zh-hant" || key === "zh-tw" || key === "zh_hant" || key.startsWith("zh")) return "zh-Hant";
  return DEFAULT_LANGUAGE;
}

function tr(key, vars = {}) {
  const dictionary = I18N[currentLanguage] || I18N[DEFAULT_LANGUAGE];
  const fallback = I18N[DEFAULT_LANGUAGE][key] || key;
  const template = dictionary[key] || fallback;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

function trCount(baseKey, count, vars = {}) {
  const suffix = count === 1 ? "one" : "other";
  return tr(`${baseKey}.${suffix}`, { count, ...vars });
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage === "zh-Hant" ? "zh-Hant" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    if (element.id === "page-host" && element.dataset.dynamicHost === "true") return;
    element.textContent = tr(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.title = tr(element.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", tr(element.dataset.i18nAriaLabel));
  });
}

function translateStatus(value) {
  const key = String(value || "unknown").toLowerCase();
  return tr(`state.${key}`);
}

function filterLabel(id) {
  return tr(`filter.${id}`);
}

function setStatus(title, detail = "", tone = "") {
  statusEl.textContent = title;
  statusDetailEl.textContent = detail;
  statusCard.classList.remove("ready", "warning", "error");
  if (tone) statusCard.classList.add(tone);
}

function valueOrUnknown(value) {
  return value == null || value === "" ? tr("value.unknown") : String(value);
}

function dependencySummary(dep) {
  if (!dep) return tr("value.unknown");
  if (!dep.installed) return "missing";
  return dep.version || dep.path || "installed";
}

function formatDiagnostics(payload, sourceJob = null) {
  const lines = [
    "VDH Lite Diagnostics",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Extension",
    `- Name: ${valueOrUnknown(payload.extension?.name)}`,
    `- Version: ${valueOrUnknown(payload.extension?.version)}`,
    `- Manifest: ${valueOrUnknown(payload.extension?.manifestVersion)}`,
    `- Active tab host: ${valueOrUnknown(payload.activeTabHost)}`,
    "",
    "Browser",
    `- User agent: ${valueOrUnknown(payload.browser?.userAgent)}`,
    "",
    "Native host",
    `- Connected: ${payload.nativeConnected === false ? "no" : "yes"}`,
    `- Version: ${valueOrUnknown(payload.hostVersion || payload.deps?.hostVersion)}`,
    `- Host path: ${valueOrUnknown(payload.hostPath || payload.deps?.hostPath)}`,
    `- Log dir: ${valueOrUnknown(payload.logDir || payload.deps?.logDir)}`,
    `- Native error: ${valueOrUnknown(payload.nativeError || payload.error)}`,
    "",
    "Dependencies",
    `- yt-dlp: ${dependencySummary(payload.deps?.ytDlp)}`,
    `- FFmpeg: ${dependencySummary(payload.deps?.ffmpeg)}`
  ];

  const jobs = payload.jobs?.length ? payload.jobs : sourceJob ? [sourceJob] : [];
  if (jobs.length) {
    lines.push("", "Jobs");
    for (const job of jobs) {
      lines.push(
        `- ID: ${valueOrUnknown(job.id)}`,
        `  Status: ${valueOrUnknown(job.status)}`,
        `  Phase: ${valueOrUnknown(job.phase)}`,
        `  Site host: ${valueOrUnknown(job.siteHost || job.host)}`,
        `  Quality: ${valueOrUnknown(job.quality)}`,
        `  Percent: ${valueOrUnknown(job.percent)}`,
        `  Final file: ${valueOrUnknown(job.finalFilename || (job.finalPath ? job.finalPath.split(/[\\/]/).pop() : ""))}`,
        `  Error category: ${valueOrUnknown(job.errorCategory)}`,
        `  Error label: ${valueOrUnknown(job.errorLabel)}`,
        `  Summary: ${valueOrUnknown(job.errorSummary)}`,
        `  Next action: ${valueOrUnknown(job.nextAction)}`,
        `  Last error: ${valueOrUnknown(job.lastError)}`
      );
    }
  }

  return lines.join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  commandOutput.value = text;
  commandPanel.hidden = false;
  commandOutput.focus();
  commandOutput.select();
  document.execCommand("copy");
}

async function copyDiagnostics(job = null) {
  const button = job ? null : copyDiagnosticsButton;
  if (button) button.disabled = true;
  try {
    const payload = await chrome.runtime.sendMessage({
      type: "native-diagnostics",
      jobId: job?.id || null
    });
    const text = formatDiagnostics(payload || {}, job);
    await copyText(text);
    commandOutput.value = text;
    commandPanel.hidden = false;
    setStatus(tr("status.diagnosticsCopied"), tr("status.diagnosticsCopied.detail"), "ready");
  } catch (error) {
    setStatus(tr("status.diagnosticsCopyFailed"), error?.message || tr("status.clipboardFailed.detail"), "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function describeUrl(url) {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
    return {
      name: decodeURIComponent(name).slice(0, 140),
      host: parsed.hostname
    };
  } catch {
    return { name: url, host: "" };
  }
}

function isHttpUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function defaultTitleForItem(item) {
  const itemTitle = String(item?.title || item?.name || "").trim();
  if (itemTitle) return itemTitle.slice(0, 140);
  const tabTitle = activeTabInfo.title?.trim();
  if (tabTitle) return tabTitle.replace(/\s+[-|]\s+.*$/, "").slice(0, 140);
  return describeUrl(item.url).name;
}

function labelForMediaType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "media") return tr("label.media");
  if (normalized === "xmlhttprequest") return "XHR";
  if (normalized === "dom") return tr("label.page");
  if (normalized === "other") return tr("label.other");
  return type || tr("label.media");
}

function mediaFamily(itemOrUrl) {
  const item = typeof itemOrUrl === "object" ? itemOrUrl : { url: itemOrUrl };
  const url = String(item?.url || "").toLowerCase();
  const contentType = String(item?.contentType || "").toLowerCase();
  if (contentType.includes("application/vnd.apple.mpegurl") || contentType.includes("application/x-mpegurl")) return "hls";
  if (contentType.includes("application/dash+xml")) return "dash";
  if (contentType.includes("audio/")) return "audio";
  if (contentType.includes("video/")) return "video";
  if (url.includes(".m3u8")) return "hls";
  if (url.includes(".mpd")) return "dash";
  if (/\.(m4a|mp3|aac|ogg)(\?|#|$)/i.test(url)) return "audio";
  if (/\.(mp4|webm|mov|mkv|ts|m4s)(\?|#|$)/i.test(url)) return "video";
  return "unknown";
}

function labelForFamily(family) {
  if (family === "hls") return "HLS";
  if (family === "dash") return "DASH";
  if (family === "video") return tr("label.video");
  if (family === "audio") return tr("label.audio");
  return tr("label.media");
}

function detectQuality(itemOrUrl) {
  if (typeof itemOrUrl === "object" && itemOrUrl?.quality) return itemOrUrl.quality;
  const url = typeof itemOrUrl === "string" ? itemOrUrl : itemOrUrl?.url || "";
  const contentType = typeof itemOrUrl === "object" ? String(itemOrUrl?.contentType || "").toLowerCase() : "";
  if (contentType.includes("application/vnd.apple.mpegurl") || contentType.includes("application/x-mpegurl")) return "HLS";
  if (contentType.includes("application/dash+xml")) return "DASH";
  if (contentType.includes("video/mp4")) return "MP4";
  if (contentType.includes("video/webm")) return "WEBM";
  if (contentType.includes("audio/")) return "Audio";
  const lowered = url.toLowerCase();
  const resolution = lowered.match(/(?:^|\/)(\d{3,4})x(\d{3,4})(?:\/|$)/);
  if (resolution) return `${resolution[2]}P`;
  const pResolution = lowered.match(/(?:^|\/)(2160|1440|1080|720|540|480|360|240)p(?:\/|\.|-|_|$)/);
  if (pResolution) return `${pResolution[1]}P`;
  if (lowered.includes(".m3u8")) return "HLS";
  if (lowered.includes(".mpd")) return "DASH";
  if (lowered.includes(".mp4")) return "MP4";
  if (lowered.includes(".webm")) return "WEBM";
  return "Quality unknown";
}

function qualityRank(itemOrQuality) {
  const quality = typeof itemOrQuality === "string" ? itemOrQuality : detectQuality(itemOrQuality);
  const match = String(quality).match(/^(\d+)P$/i);
  if (match) return Number(match[1]) * 1000;
  if (quality === "HLS") return 500000;
  if (quality === "DASH") return 450000;
  if (quality === "MP4") return 300000;
  if (quality === "WEBM") return 250000;
  if (quality === "Audio") return 150000;
  return 1000;
}

function displayQuality(quality) {
  if (quality === "Audio") return tr("label.audio");
  if (quality === "Quality unknown") return tr("label.qualityUnknown");
  return quality;
}

function normalizeMediaPath(pathname) {
  const parts = String(pathname || "").split("/").map((part) => {
    const normalized = part
      .replace(/(^|[-_.])(?:2160|1440|1080|720|540|480|360|240)p(?=[-_.]|$)/ig, "$1:quality")
      .replace(/^\d{3,4}x\d{3,4}$/i, ":quality");
    if (/^(?:2160|1440|1080|720|540|480|360|240)p?$/i.test(normalized)) return ":quality";
    if (/^(?:seg|segment|chunk)[-_.]?\d+\.(?:ts|m4s)$/i.test(normalized)) return ":segment";
    return normalized;
  });
  return parts.join("/");
}

function groupKeyForItem(item) {
  try {
    const parsed = new URL(item.url);
    parsed.hash = "";
    parsed.search = "";
    return `${mediaFamily(item)}|${parsed.hostname}|${normalizeMediaPath(parsed.pathname)}`;
  } catch {
    return `${mediaFamily(item)}|${String(item.url || "")}`;
  }
}

function sourceLabelForItem(item) {
  return item.source || labelForMediaType(item.type);
}

function qualityOptionsForItem(item) {
  const values = new Set();
  if (Array.isArray(item.qualities)) {
    for (const quality of item.qualities) {
      if (quality) values.add(String(quality));
    }
  }
  values.add(detectQuality(item));
  return [...values];
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  const rounded = Math.round(value);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours) return `${hours}:${String(mins).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${mins}:${String(rest).padStart(2, "0")}`;
}

function formatChoiceLabel(choice) {
  const parts = [];
  if (choice.label) parts.push(choice.label);
  else if (choice.quality) parts.push(choice.quality);
  if (choice.source === "yt-dlp") parts.push("yt-dlp");
  return parts.join(" | ") || tr("label.discoveredFormat");
}

function preferredDiscoveryUrl(group, item, tab) {
  return [group.pageUrl, item?.originUrl, tab?.url, item?.url].find(isHttpUrl) || item?.url || "";
}

function itemForDiscoveredDownload(group, media, discovery) {
  const fallbackItem = group.primaryItem || group.items[0];
  const url = [media?.webpageUrl, media?.url, discovery?.webpageUrl, group.pageUrl, fallbackItem?.url].find(isHttpUrl);
  if (!url) return fallbackItem;
  return {
    ...fallbackItem,
    url,
    originUrl: group.pageUrl || fallbackItem?.originUrl || url,
    requestHeaders: fallbackItem?.requestHeaders || {}
  };
}

function applyDiscoveryToGroup(group) {
  const discovery = discoveryByGroupId.get(group.id);
  const discoveryError = discoveryErrorsByGroupId.get(group.id);
  if (discoveryError) group.discoveryError = discoveryError;
  if (!discovery?.ok) return group;

  const media = Array.isArray(discovery.media) && discovery.media.length ? discovery.media[0] : null;
  group.discovery = discovery;
  group.title = media?.title || discovery.title || group.title;
  group.thumbnail = media?.thumbnail || discovery.thumbnail || group.thumbnail;
  group.duration = media?.duration || discovery.duration || null;
  group.uploader = media?.uploader || discovery.uploader || "";
  group.formats = media?.formats || [];
  const downloadItem = itemForDiscoveredDownload(group, media, discovery);
  if (downloadItem?.url) {
    group.urls.add(downloadItem.url);
    group.host = describeUrl(downloadItem.url).host || group.host;
  }

  const choices = Array.isArray(media?.formatChoices) ? media.formatChoices : [];
  if (choices.length) {
    group.qualityOptions = choices.map((choice) => ({
      item: downloadItem,
      quality: choice.quality || choice.label || "Best",
      label: formatChoiceLabel(choice),
      formatId: choice.formatId || "",
      formatSelector: choice.selector || "",
      formatLabel: choice.label || "",
      kind: choice.kind || "",
      source: choice.source || "yt-dlp"
    }));
    group.qualities = group.qualityOptions.map((option) => option.quality);
    group.score += 25;
  }

  return group;
}

function buildCandidateGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const key = groupKeyForItem(item);
    const info = describeUrl(item.url);
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        sourceUrl: item.url,
        pageUrl: item.originUrl || activeTabInfo.url || "",
        host: info.host,
        title: defaultTitleForItem(item),
        type: mediaFamily(item),
        thumbnail: item.thumbnail || null,
        detectedAt: item.timeStamp || Date.now(),
        score: qualityRank(item),
        sources: new Set(),
        urls: new Set(),
        items: [],
        optionMap: new Map()
      });
    }

    const group = groups.get(key);
    group.items.push(item);
    group.urls.add(item.url);
    group.sources.add(sourceLabelForItem(item));
    if (item.thumbnail && !group.thumbnail) group.thumbnail = item.thumbnail;
    if ((item.timeStamp || 0) > group.detectedAt) group.detectedAt = item.timeStamp;
    if (qualityRank(item) > group.score) {
      group.score = qualityRank(item);
      group.sourceUrl = item.url;
      group.title = defaultTitleForItem(item);
      group.host = info.host;
    }

    for (const quality of qualityOptionsForItem(item)) {
      const existing = group.optionMap.get(quality);
      if (!existing || qualityRank(item) > qualityRank(existing.item)) {
        group.optionMap.set(quality, { quality, item });
      }
    }
  }

  return [...groups.values()]
    .map((group) => {
      const options = [...group.optionMap.values()].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
      group.qualityOptions = options.length ? options : [{ quality: "Best", item: group.items[0] }];
      group.qualities = group.qualityOptions.map((option) => option.quality);
      group.primaryItem = group.qualityOptions[0]?.item || group.items[0];
      group.sourceList = [...group.sources];
      return applyDiscoveryToGroup(group);
    })
    .sort((a, b) => b.score - a.score || b.detectedAt - a.detectedAt);
}

function stateForJob(job) {
  if (!job) return "detected";
  if (job.running || job.status === "running" || job.status === "queued" || job.status === "stopping") return "active";
  if (job.status === "failed" || job.status === "stopped" || job.status === "unknown") return "failed";
  if (job.status === "finished") return "finished";
  return "detected";
}

function jobForGroup(group) {
  const jobs = currentJobs.filter((job) => group.urls.has(job.url));
  if (!jobs.length) return null;
  const priority = { active: 4, failed: 3, finished: 2, detected: 1 };
  return jobs.sort((a, b) => {
    const stateDelta = priority[stateForJob(b)] - priority[stateForJob(a)];
    if (stateDelta) return stateDelta;
    return String(b.startedAt || "").localeCompare(String(a.startedAt || ""));
  })[0];
}

function stateForGroup(group) {
  return stateForJob(jobForGroup(group));
}

function filterMatches(group) {
  if (activeFilter === "all") return true;
  return stateForGroup(group) === activeFilter;
}

function countGroupsByState(groups) {
  const counts = { all: groups.length, detected: 0, active: 0, finished: 0, failed: 0 };
  for (const group of groups) {
    counts[stateForGroup(group)] += 1;
  }
  return counts;
}

function renderFilterChips(groups) {
  if (!mediaFiltersEl) return;
  const counts = countGroupsByState(groups);
  mediaFiltersEl.innerHTML = "";
  for (const filter of FILTERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${activeFilter === filter.id ? " active" : ""}`;
    button.dataset.filter = filter.id;
    button.textContent = `${filterLabel(filter.id)} ${counts[filter.id] || 0}`;
    button.disabled = filter.id !== "all" && !counts[filter.id];
    mediaFiltersEl.append(button);
  }
}

function renderThumbnail(group) {
  const thumb = document.createElement("div");
  thumb.className = "media-thumb";
  if (group.thumbnail) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = group.thumbnail;
    thumb.append(img);
  } else {
    thumb.textContent = labelForFamily(group.type);
  }
  return thumb;
}

function renderBadges(group, job) {
  const meta = document.createElement("div");
  meta.className = "meta media-tags";

  const qualityBadge = document.createElement("span");
  qualityBadge.className = "badge quality-badge";
  qualityBadge.textContent = displayQuality(group.qualities[0] || detectQuality(group.primaryItem));

  const typeBadge = document.createElement("span");
  typeBadge.className = "badge neutral";
  typeBadge.textContent = labelForFamily(group.type);

  const sourceBadge = document.createElement("span");
  sourceBadge.className = "badge source";
  sourceBadge.textContent = group.sourceList.join(" + ") || tr("label.detected");

  meta.append(qualityBadge, typeBadge, sourceBadge);

  if (group.items.length > 1) {
    const groupedBadge = document.createElement("span");
    groupedBadge.className = "badge neutral";
    groupedBadge.textContent = trCount("label.sources", group.items.length);
    meta.append(groupedBadge);
  }

  if (group.discovery) {
    const discoveredBadge = document.createElement("span");
    discoveredBadge.className = "badge success";
    discoveredBadge.textContent = "yt-dlp";
    meta.append(discoveredBadge);
  } else if (group.discoveryError) {
    const failedBadge = document.createElement("span");
    failedBadge.className = "badge danger";
    failedBadge.textContent = tr("label.discoveryFailed");
    meta.append(failedBadge);
  }

  if (group.duration) {
    const durationBadge = document.createElement("span");
    durationBadge.className = "badge neutral";
    durationBadge.textContent = formatDuration(group.duration);
    meta.append(durationBadge);
  }

  if (group.uploader) {
    const uploaderBadge = document.createElement("span");
    uploaderBadge.className = "badge neutral";
    uploaderBadge.textContent = group.uploader;
    meta.append(uploaderBadge);
  }

  if (job) {
    const state = stateForJob(job);
    const jobBadge = document.createElement("span");
    jobBadge.className = `badge ${state === "failed" ? "danger" : state === "finished" ? "success" : "neutral"}`;
    jobBadge.textContent = state === "active" ? job.phase || tr("label.active") : filterLabel(state);
    meta.append(jobBadge);
  }

  return meta;
}

function selectedOptionForGroup(group, select) {
  const option = group.qualityOptions[Number(select.value)] || group.qualityOptions[0];
  return option || { quality: detectQuality(group.primaryItem), item: group.primaryItem };
}

function renderQualityPicker(group) {
  const row = document.createElement("div");
  row.className = "quality-row";

  const label = document.createElement("label");
  const selectId = `quality-${Math.abs(hashString(group.id))}`;
  label.setAttribute("for", selectId);
  label.textContent = tr("label.quality");

  const select = document.createElement("select");
  select.id = selectId;
  select.className = "media-quality-select";

  const preferred = selectedGroupQualities.get(group.id);
  group.qualityOptions.forEach((option, index) => {
    const itemInfo = describeUrl(option.item.url);
    const optionEl = document.createElement("option");
    optionEl.value = String(index);
    optionEl.textContent = option.label || `${displayQuality(option.quality)} | ${itemInfo.host || group.host}`;
    if (preferred === option.quality) optionEl.selected = true;
    select.append(optionEl);
  });

  select.addEventListener("change", () => {
    const option = selectedOptionForGroup(group, select);
    selectedGroupQualities.set(group.id, option.quality);
  });

  row.append(label, select);
  return { row, select };
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function showCandidateDetails(group, job) {
  const lines = [
    `${tr("details.title")}: ${group.title}`,
    `${tr("details.host")}: ${group.host}`,
    `${tr("details.type")}: ${labelForFamily(group.type)}`,
    `${tr("details.qualities")}: ${group.qualities.map(displayQuality).join(", ")}`,
    `${tr("details.sources")}: ${group.sourceList.join(", ")}`,
    `${tr("details.state")}: ${filterLabel(stateForGroup(group))}`,
    "",
    `${tr("details.urls")}:`,
    ...group.items.map((item) => `- ${item.url}`)
  ];

  if (group.discovery) {
    lines.push(
      "",
      `${tr("details.discovery")}:`,
      `- ${tr("details.source")}: yt-dlp`,
      `- ${tr("details.title")}: ${group.discovery.title || group.title}`,
      `- ${tr("details.duration")}: ${formatDuration(group.duration) || tr("value.unknown")}`,
      `- ${tr("details.uploader")}: ${group.uploader || tr("value.unknown")}`,
      `- ${tr("details.formats")}: ${group.formats?.length || 0}`
    );
    for (const format of (group.formats || []).slice(0, 8)) {
      const label = [format.id, format.height ? `${format.height}P` : "", format.ext, format.vcodec, format.acodec]
        .filter(Boolean)
        .join(" | ");
      lines.push(`  - ${label}`);
    }
  }

  if (group.discoveryError) {
    lines.push(
      "",
      `${tr("details.discoveryFailed")}:`,
      `- ${group.discoveryError.label || group.discoveryError.category || tr("state.unknown")}`,
      `- ${group.discoveryError.summary || group.discoveryError.error || tr("details.noDetails")}`
    );
  }

  if (job) {
    lines.push(
      "",
      `${tr("details.job")}:`,
      `- ${tr("details.status")}: ${translateStatus(job.status)}`,
      `- ${tr("details.phase")}: ${job.phase || tr("value.unknown")}`,
      `- ${tr("details.quality")}: ${displayQuality(job.quality) || tr("value.unknown")}`,
      `- ${tr("details.percent")}: ${job.percent ?? tr("value.unknown")}`,
      `- ${tr("details.finalPath")}: ${job.finalPath || tr("value.unknown")}`,
      `- ${tr("details.errorCategory")}: ${job.errorCategory || tr("value.unknown")}`,
      `- ${tr("details.errorSummary")}: ${job.errorSummary || tr("value.unknown")}`,
      `- ${tr("details.nextAction")}: ${job.nextAction || tr("value.unknown")}`,
      `- ${tr("details.error")}: ${job.lastError || tr("value.none")}`
    );
  }

  commandOutput.value = lines.join("\n");
  commandPanel.hidden = false;
}

async function removeCandidate(group) {
  const urls = group.items.map((item) => item.url);
  await chrome.runtime.sendMessage({ type: "remove-media", urls });
  selectedGroupQualities.delete(group.id);
  discoveryByGroupId.delete(group.id);
  discoveryErrorsByGroupId.delete(group.id);
  await listMedia();
}

async function discoverFormats(group) {
  const item = group.primaryItem || group.items[0];
  if (!item?.url || discoveringGroupIds.has(group.id)) return;

  discoveringGroupIds.add(group.id);
  discoveryByGroupId.delete(group.id);
  discoveryErrorsByGroupId.delete(group.id);
  setStatus(tr("status.loadingFormats"), tr("status.loadingFormats.detail"), "warning");
  renderMediaView({ preserveStatus: true });

  try {
    const tab = await getActiveTabInfo();
    const discoveryUrl = preferredDiscoveryUrl(group, item, tab);
    const response = await chrome.runtime.sendMessage({
      type: "native-discover",
      url: discoveryUrl,
      referer: item.originUrl || group.pageUrl || tab.url || "",
      originUrl: group.pageUrl || item.originUrl || tab.url || "",
      userAgent: navigator.userAgent || "",
      requestHeaders: item.requestHeaders || {}
    });

    if (response?.ok) {
      discoveryByGroupId.set(group.id, response);
      discoveryErrorsByGroupId.delete(group.id);
      const media = Array.isArray(response.media) ? response.media[0] : null;
      const count = media?.formats?.length || 0;
      setStatus(tr("status.formatsLoaded"), trCount("status.formatsLoaded.detail", count), "ready");
    } else {
      discoveryErrorsByGroupId.set(group.id, response || { error: tr("label.discoveryFailed") });
      setStatus(
        tr("status.formatDiscoveryFailed"),
        response?.summary || response?.error || tr("status.directDownloadFallback"),
        "warning"
      );
    }
  } catch (error) {
    discoveryErrorsByGroupId.set(group.id, { error: error?.message || tr("label.discoveryFailed") });
    setStatus(tr("status.formatDiscoveryFailed"), error?.message || tr("status.directDownloadFallback"), "warning");
  } finally {
    discoveringGroupIds.delete(group.id);
    renderMediaView({ preserveStatus: true });
  }
}

function renderMediaCard(group) {
  const job = jobForGroup(group);
  const state = stateForJob(job);
  const discovering = discoveringGroupIds.has(group.id);
  const li = document.createElement("li");
  li.className = `item media-card ${state}`;

  const thumb = renderThumbnail(group);

  const content = document.createElement("div");
  content.className = "media-content";

  const title = document.createElement("div");
  title.className = "media-title";
  const titleText = document.createElement("strong");
  titleText.textContent = group.title;
  titleText.title = group.title;
  const hostText = document.createElement("span");
  hostText.textContent = group.host || describeUrl(group.sourceUrl).host;
  title.append(titleText, hostText);

  const meta = renderBadges(group, job);
  const { row: qualityRow, select } = renderQualityPicker(group);
  content.append(title, meta, qualityRow);

  const actions = document.createElement("div");
  actions.className = "actions";

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.textContent = state === "failed" ? tr("button.retry") : tr("button.download");
  downloadButton.addEventListener("click", () => {
    const option = selectedOptionForGroup(group, select);
    runNativeDownload(option.item, option);
  });

  const discoverButton = document.createElement("button");
  discoverButton.type = "button";
  discoverButton.className = "secondary";
  discoverButton.textContent = discovering ? tr("button.loading") : tr("button.formats");
  discoverButton.disabled = discovering;
  discoverButton.addEventListener("click", () => discoverFormats(group));

  const detailsButton = document.createElement("button");
  detailsButton.type = "button";
  detailsButton.className = "secondary";
  detailsButton.textContent = tr("button.details");
  detailsButton.addEventListener("click", () => showCandidateDetails(group, job));

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "secondary";
  removeButton.textContent = tr("button.remove");
  removeButton.addEventListener("click", () => removeCandidate(group));

  actions.append(downloadButton, discoverButton, detailsButton, removeButton);
  li.append(thumb, content, actions);
  return li;
}

function renderMediaView({ preserveStatus = false } = {}) {
  currentGroups = buildCandidateGroups(currentItems);
  renderFilterChips(currentGroups);
  itemsEl.innerHTML = "";

  const visibleGroups = currentGroups.filter(filterMatches);
  mediaSummaryEl.textContent = currentGroups.length
    ? trCount("summary.candidates", currentGroups.length, { sources: currentItems.length })
    : tr("summary.noCandidates");

  if (currentGroups.length && !preserveStatus) updateMediaStatus(currentGroups);

  if (!currentGroups.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = tr("empty.noCandidates");
    itemsEl.append(empty);
    return;
  }

  if (!visibleGroups.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = tr("empty.noFiltered", { filter: filterLabel(activeFilter) });
    itemsEl.append(empty);
    return;
  }

  for (const group of visibleGroups) {
    itemsEl.append(renderMediaCard(group));
  }
}

function updateMediaStatus(groups) {
  const counts = countGroupsByState(groups);
  if (counts.active) {
    setStatus(
      trCount("status.downloadsRunning", counts.active),
      tr("status.downloadsRunning.detail"),
      "ready"
    );
    return;
  }
  if (counts.failed) {
    setStatus(
      trCount("status.downloadsNeedAttention", counts.failed),
      tr("status.downloadsNeedAttention.detail"),
      "error"
    );
    return;
  }
  setStatus(tr("status.mediaDetected"), tr("status.mediaDetected.detail"), "ready");
}

function concurrencyLimitValue() {
  const value = Number.parseInt(concurrencyLimitInput.value, 10);
  if (!Number.isFinite(value)) return 2;
  return Math.max(1, Math.min(4, value));
}

async function saveSettings() {
  concurrencyLimitInput.value = String(concurrencyLimitValue());
  await chrome.storage.local.set({
    uiLanguage: currentLanguage,
    downloadDir: downloadDirInput.value.trim() || DEFAULT_DOWNLOAD_DIR,
    concurrencyLimit: concurrencyLimitValue(),
    downloadSpeedProfile: speedProfileSelect?.value || DEFAULT_DOWNLOAD_SPEED_PROFILE
  });
}

async function browseDownloadDir() {
  browseDirButton.disabled = true;
  setStatus(tr("status.chooseFolder"), tr("status.chooseFolder.detail"), "warning");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "native-pick-folder",
      currentPath: downloadDirInput.value.trim() || DEFAULT_DOWNLOAD_DIR
    });

    if (response?.ok && response.path) {
      downloadDirInput.value = response.path;
      await saveSettings();
      setStatus(tr("status.saveFolderUpdated"), response.path, "ready");
      return;
    }

    if (response?.cancelled) {
      setStatus(tr("status.folderSelectionCancelled"), tr("status.folderSelectionCancelled.detail"), "warning");
      return;
    }

    setStatus(tr("status.folderPickerFailed"), response?.error || tr("status.folderPickerFailed.detail"), "error");
  } finally {
    browseDirButton.disabled = false;
  }
}

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    uiLanguage: DEFAULT_LANGUAGE,
    downloadDir: DEFAULT_DOWNLOAD_DIR,
    concurrencyLimit: 2,
    downloadSpeedProfile: DEFAULT_DOWNLOAD_SPEED_PROFILE
  });
  currentLanguage = normalizeLanguage(settings.uiLanguage);
  if (languageSelect) languageSelect.value = currentLanguage;
  applyStaticTranslations();
  downloadDirInput.value = settings.downloadDir;
  concurrencyLimitInput.value = String(Math.max(1, Math.min(4, Number.parseInt(settings.concurrencyLimit, 10) || 2)));
  if (speedProfileSelect) speedProfileSelect.value = settings.downloadSpeedProfile || DEFAULT_DOWNLOAD_SPEED_PROFILE;
}

async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || {};
}

function normalizeDownloadChoice(item, qualityOrOption) {
  if (typeof qualityOrOption === "object" && qualityOrOption) {
    return {
      quality: qualityOrOption.quality || detectQuality(item),
      formatId: qualityOrOption.formatId || "",
      formatSelector: qualityOrOption.formatSelector || "",
      formatLabel: qualityOrOption.formatLabel || qualityOrOption.label || ""
    };
  }

  return {
    quality: qualityOrOption || detectQuality(item),
    formatId: "",
    formatSelector: "",
    formatLabel: ""
  };
}

function updatePageHost(tab) {
  try {
    pageHostEl.dataset.dynamicHost = tab?.url ? "true" : "false";
    pageHostEl.textContent = tab?.url ? new URL(tab.url).hostname : tr("brand.currentTab");
  } catch {
    pageHostEl.dataset.dynamicHost = "false";
    pageHostEl.textContent = tr("brand.currentTab");
  }
}

async function runNativeDownload(item, qualityOverride) {
  await saveSettings();
  settingsPanel.hidden = true;
  const tab = await getActiveTabInfo();
  activeTabInfo = tab;
  const info = describeUrl(item.url);
  const downloadChoice = normalizeDownloadChoice(item, qualityOverride);
  const response = await chrome.runtime.sendMessage({
    type: "native-download",
    url: item.url,
    referer: item.originUrl || tab.url || "",
    originUrl: item.originUrl || tab.url || "",
    userAgent: navigator.userAgent || "",
    requestHeaders: item.requestHeaders || {},
    title: tab.title || info.name,
    host: info.host,
    quality: downloadChoice.quality,
    formatId: downloadChoice.formatId,
    formatSelector: downloadChoice.formatSelector,
    formatLabel: downloadChoice.formatLabel,
    downloadSpeedProfile: speedProfileSelect?.value || DEFAULT_DOWNLOAD_SPEED_PROFILE,
    downloadDir: downloadDirInput.value.trim() || DEFAULT_DOWNLOAD_DIR,
    concurrencyLimit: concurrencyLimitValue()
  });

  if (response?.ok) {
    setStatus(
      response.queued ? tr("status.downloadQueued") : tr("status.downloadStarted"),
      response.queued
        ? tr("status.downloadQueued.detail", { jobId: response.jobId })
        : tr("status.downloadStarted.detail", { jobId: response.jobId || response.pid }),
      "ready"
    );
    await refreshJobs();
  } else {
    setStatus(tr("status.downloadStartFailed"), response?.error || tr("status.nativeError"), "error");
  }
}

function canCancelJob(job) {
  return job?.status === "queued" || job?.status === "running" || job?.status === "stopping" || job?.running;
}

function canRetryJob(job) {
  return Boolean(job?.retryable) && ["failed", "stopped", "unknown"].includes(job.status);
}

function jobStatusLabel(job) {
  if (job.status === "queued") return tr("state.queued");
  if (job.status === "stopping") return tr("state.stopping");
  if (job.status === "stopped") return tr("state.stopped");
  if (job.running) return tr("state.running");
  if (job.status === "failed") return tr("state.failed");
  if (job.status === "finished") return tr("state.finished");
  return tr("state.unknown");
}

async function cancelNativeJob(job) {
  if (!job?.id) return;
  setStatus(tr("status.cancellingDownload"), job.title || job.id, "warning");
  const response = await chrome.runtime.sendMessage({
    type: "native-cancel-job",
    jobId: job.id,
    concurrencyLimit: concurrencyLimitValue()
  });
  if (response?.ok) {
    setStatus(tr("status.downloadCancelled"), response.status || job.id, "ready");
    await refreshJobs();
  } else {
    setStatus(tr("status.cancelFailed"), response?.error || tr("status.cancelFailed.detail"), "error");
  }
}

async function retryNativeJob(job) {
  if (!job?.id) return;
  setStatus(tr("status.retryingDownload"), job.title || job.id, "warning");
  const response = await chrome.runtime.sendMessage({
    type: "native-retry-job",
    jobId: job.id,
    concurrencyLimit: concurrencyLimitValue()
  });
  if (response?.ok) {
    setStatus(
      response.status === "queued" ? tr("status.retryQueued") : tr("status.retryStarted"),
      tr("status.retryStatus.detail", { jobId: response.jobId, status: response.status ? translateStatus(response.status) : tr("state.ready") }),
      "ready"
    );
    await refreshJobs();
  } else {
    setStatus(tr("status.retryFailed"), response?.error || tr("status.retryFailed.detail"), "error");
  }
}

function renderJobs(jobs) {
  jobsEl.innerHTML = "";
  if (!jobs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = tr("empty.noDownloads");
    jobsEl.append(empty);
    return;
  }

  for (const job of jobs) {
    const row = document.createElement("div");
    row.className = "job";
    if (job.status === "failed") row.classList.add("failed");
    if (job.status === "finished") row.classList.add("finished");
    if (job.status === "queued") row.classList.add("queued");
    if (job.status === "stopped") row.classList.add("stopped");

    const head = document.createElement("div");
    head.className = "job-head";
    const title = document.createElement("strong");
    title.textContent = job.title || job.host || tr("label.pid", { pid: job.pid });
    const state = document.createElement("span");
    const detailText = job.percent != null
      ? `${job.percent}%`
      : job.phase
        ? job.phase
        : job.status === "failed"
          ? tr("state.failed").toLowerCase()
          : job.totalFragments
            ? `${job.currentFragment || 0}/${job.totalFragments}`
            : job.currentFragment
              ? tr("label.fragment", { value: job.currentFragment })
              : job.status ? translateStatus(job.status).toLowerCase() : tr("state.running").toLowerCase();
    state.textContent = detailText;
    head.append(title, state);

    const progress = document.createElement("div");
    progress.className = "progress";
    const bar = document.createElement("span");
    bar.style.width = `${job.percent || 0}%`;
    progress.append(bar);

    const meta = document.createElement("div");
    meta.className = "meta job-tags";
    const label = jobStatusLabel(job);
    const statusBadge = document.createElement("span");
    statusBadge.className = `badge ${job.status === "failed" ? "danger" : job.status === "finished" ? "success" : "neutral"}`;
    statusBadge.textContent = label;
    meta.append(statusBadge);
    if (job.phase) {
      const phaseBadge = document.createElement("span");
      phaseBadge.className = "badge neutral";
      phaseBadge.textContent = job.phase;
      meta.append(phaseBadge);
    }
    if (job.quality) {
      const qualityBadge = document.createElement("span");
      qualityBadge.className = "badge quality-badge";
      qualityBadge.textContent = displayQuality(job.quality);
      meta.append(qualityBadge);
    }
    if (job.speedProfileLabel) {
      const speedProfileBadge = document.createElement("span");
      speedProfileBadge.className = "badge neutral";
      speedProfileBadge.textContent = `${job.speedProfileLabel} x${job.concurrentFragments || "?"}`;
      meta.append(speedProfileBadge);
    }
    if (job.speedText) {
      const speedBadge = document.createElement("span");
      speedBadge.className = "badge neutral";
      speedBadge.textContent = job.speedText;
      meta.append(speedBadge);
    }
    if (job.etaText) {
      const etaBadge = document.createElement("span");
      etaBadge.className = "badge neutral";
      etaBadge.textContent = tr("label.eta", { value: job.etaText });
      meta.append(etaBadge);
    }
    if (!job.running && job.elapsedText) {
      const elapsedBadge = document.createElement("span");
      elapsedBadge.className = "badge neutral";
      elapsedBadge.textContent = tr("label.doneIn", { value: job.elapsedText });
      meta.append(elapsedBadge);
    }
    if (job.finalPath) {
      const pathText = document.createElement("span");
      pathText.className = "job-path";
      pathText.textContent = tr("label.saved", { path: job.finalPath });
      pathText.title = job.finalPath;
      meta.append(pathText);
    }
    if (job.errorSummary || job.nextAction) {
      const guidance = document.createElement("span");
      guidance.className = "job-guidance";
      guidance.textContent = [job.errorLabel || job.errorCategory, job.errorSummary, job.nextAction]
        .filter(Boolean)
        .join(" | ");
      meta.append(guidance);
    }
    if (job.lastError) {
      const errorText = document.createElement("span");
      errorText.className = "job-error";
      errorText.textContent = job.lastError;
      meta.append(errorText);
    }
    if (job.status === "failed") {
      const diagnosticsButton = document.createElement("button");
      diagnosticsButton.type = "button";
      diagnosticsButton.className = "secondary inline-action";
      diagnosticsButton.textContent = tr("button.copyDiagnostics");
      diagnosticsButton.addEventListener("click", () => copyDiagnostics(job));
      meta.append(diagnosticsButton);
    }
    if (canCancelJob(job)) {
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "secondary inline-action";
      cancelButton.textContent = tr("button.cancel");
      cancelButton.addEventListener("click", () => cancelNativeJob(job));
      meta.append(cancelButton);
    }
    if (canRetryJob(job)) {
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "secondary inline-action";
      retryButton.textContent = tr("button.retry");
      retryButton.addEventListener("click", () => retryNativeJob(job));
      meta.append(retryButton);
    }

    row.append(head, progress, meta);
    jobsEl.append(row);
  }
}

async function refreshJobs() {
  const response = await chrome.runtime.sendMessage({ type: "native-status" });
  if (response?.ok) {
    currentJobs = response.jobs || [];
    renderJobs(currentJobs);
    if (currentItems.length) renderMediaView();
  }
}

function renderDeps(response) {
  if (!response?.ok) {
    depsStatus.textContent = tr("deps.nativeMissing", { error: response?.error || tr("value.unknown") });
    installDepsButton.disabled = true;
    setStatus(tr("status.nativeMissing"), tr("status.nativeMissing.detail"), "error");
    return;
  }
  const yt = response.ytDlp?.installed ? tr("deps.ytOk") : tr("deps.ytMissing");
  const ff = response.ffmpeg?.installed ? tr("deps.ffmpegOk") : tr("deps.ffmpegMissing");
  depsStatus.textContent = `${yt} | ${ff}`;
  const ready = response.ytDlp?.installed && response.ffmpeg?.installed;
  installDepsButton.hidden = ready;
  installDepsButton.disabled = ready;
  if (ready) {
    setStatus(tr("status.readyToDetect"), tr("status.readyToDetect.detail"), "ready");
  } else {
    setStatus(tr("status.nativeNeedsDependencies"), depsStatus.textContent, "warning");
  }
}

async function checkDependencies() {
  const response = await chrome.runtime.sendMessage({ type: "native-deps" });
  renderDeps(response);
  return response;
}

async function listMedia() {
  activeTabInfo = await getActiveTabInfo();
  updatePageHost(activeTabInfo);
  const response = await chrome.runtime.sendMessage({ type: "list-media" });
  const items = response.items || [];
  currentItems = items;
  renderMediaView();

  const unresolvedPlaylists = items.some((item) => detectQuality(item) === "HLS");
  if (unresolvedPlaylists && !pendingMediaRefresh) {
    pendingMediaRefresh = setTimeout(async () => {
      pendingMediaRefresh = null;
      await listMedia();
    }, 1500);
  }
}

async function scanCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content_script.js"]
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/page_probe.js"],
    world: "MAIN"
  });
}

async function grantCurrentSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:\/\//.test(tab.url)) return;
  const origin = new URL(tab.url).origin + "/*";
  const granted = await chrome.permissions.request({ origins: [origin] });
  setStatus(
    granted ? tr("status.siteAccessGranted") : tr("status.siteAccessDenied"),
    granted ? origin : tr("status.siteAccessDenied.detail"),
    granted ? "ready" : "warning"
  );
  if (granted) await scanCurrentTab();
}

refreshButton.addEventListener("click", async () => {
  await scanCurrentTab();
  await listMedia();
});

clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clear-media" });
  selectedGroupQualities.clear();
  await listMedia();
});

clearJobsButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "native-clear-completed" });
  await refreshJobs();
});

grantButton.addEventListener("click", async () => {
  await grantCurrentSite();
  await listMedia();
});

downloadDirInput.addEventListener("change", saveSettings);
languageSelect.addEventListener("change", async () => {
  currentLanguage = normalizeLanguage(languageSelect.value);
  applyStaticTranslations();
  renderJobs(currentJobs);
  renderMediaView({ preserveStatus: true });
  setStatus(tr("status.languageUpdated"), tr("status.languageUpdated.detail"), "ready");
  await saveSettings();
});
concurrencyLimitInput.addEventListener("change", saveSettings);
browseDirButton.addEventListener("click", browseDownloadDir);
if (speedProfileSelect) speedProfileSelect.addEventListener("change", saveSettings);

resetDirButton.addEventListener("click", async () => {
  downloadDirInput.value = DEFAULT_DOWNLOAD_DIR;
  if (speedProfileSelect) speedProfileSelect.value = DEFAULT_DOWNLOAD_SPEED_PROFILE;
  await saveSettings();
});

testNativeButton.addEventListener("click", async () => {
  await testNativeHost();
  await checkDependencies();
});

mediaFiltersEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter || "all";
  renderMediaView();
});

async function testNativeHost() {
  const response = await chrome.runtime.sendMessage({ type: "native-ping" });
  setStatus(
    response?.ok ? tr("status.nativeReady", { version: response.version }) : tr("status.nativeError"),
    response?.ok ? response.defaultDownloadDir || tr("status.nativeReady.detail") : response?.error || tr("value.unknown"),
    response?.ok ? "ready" : "error"
  );
}

settingsToggle.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

installDepsButton.addEventListener("click", async () => {
  installDepsButton.disabled = true;
  depsStatus.textContent = tr("deps.installing");
  setStatus(tr("status.installingDependencies"), tr("status.installingDependencies.detail"), "warning");
  const response = await chrome.runtime.sendMessage({ type: "native-install-deps" });
  if (!response?.ok) {
    depsStatus.textContent = tr("deps.installFailed", { error: response?.error || tr("value.unknown") });
    installDepsButton.disabled = false;
    setStatus(tr("status.dependencyInstallFailed"), response?.error || tr("value.unknown"), "error");
    return;
  }
  renderDeps(response.deps);
});

copyDiagnosticsButton.addEventListener("click", () => {
  copyDiagnostics();
});

loadSettings()
  .then(() => {
    settingsPanel.hidden = true;
  })
  .then(testNativeHost)
  .then(checkDependencies)
  .then(scanCurrentTab)
  .then(listMedia)
  .finally(refreshJobs);

setInterval(refreshJobs, 3000);
