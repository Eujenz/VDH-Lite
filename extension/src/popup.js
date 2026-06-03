const statusEl = document.querySelector("#status");
const statusCard = document.querySelector("#status-card");
const statusDetailEl = document.querySelector("#status-detail");
const pageHostEl = document.querySelector("#page-host");
const mediaSummaryEl = document.querySelector("#media-summary");
const itemsEl = document.querySelector("#items");
const refreshButton = document.querySelector("#refresh");
const clearButton = document.querySelector("#clear");
const grantButton = document.querySelector("#grant");
const commandPanel = document.querySelector("#command-panel");
const commandOutput = document.querySelector("#command-output");
const downloadDirInput = document.querySelector("#download-dir");
const browseDirButton = document.querySelector("#browse-dir");
const resetDirButton = document.querySelector("#reset-dir");
const testNativeButton = document.querySelector("#test-native");
const qualitySelect = document.querySelector("#quality-select");
const runSelectedButton = document.querySelector("#run-selected");
const jobsEl = document.querySelector("#jobs");
const clearJobsButton = document.querySelector("#clear-jobs");
const settingsToggle = document.querySelector("#settings-toggle");
const settingsPanel = document.querySelector("#settings-panel");
const depsStatus = document.querySelector("#deps-status");
const installDepsButton = document.querySelector("#install-deps");

const DEFAULT_DOWNLOAD_DIR = "%USERPROFILE%\\Downloads\\VDH Lite";
let currentItems = [];
let currentQualityOptions = [];
let activeTabInfo = {};
let pendingMediaRefresh = null;

function setStatus(title, detail = "", tone = "") {
  statusEl.textContent = title;
  statusDetailEl.textContent = detail;
  statusCard.classList.remove("ready", "warning", "error");
  if (tone) statusCard.classList.add(tone);
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

function defaultTitleForItem(item) {
  const tabTitle = activeTabInfo.title?.trim();
  if (tabTitle) return tabTitle.replace(/\s+[-|]\s+.*$/, "").slice(0, 140);
  return describeUrl(item.url).name;
}

function labelForMediaType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "media") return "Media";
  if (normalized === "xmlhttprequest") return "XHR";
  if (normalized === "dom") return "Page";
  if (normalized === "other") return "Other";
  return type || "Media";
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

function qualityRank(item) {
  const quality = detectQuality(item);
  const match = quality.match(/^(\d+)P$/);
  if (match) return Number(match[1]) * 1000;
  if (quality === "HLS") return 500000;
  if (quality === "DASH") return 450000;
  return 1000;
}

async function saveSettings() {
  await chrome.storage.local.set({
    downloadDir: downloadDirInput.value.trim() || DEFAULT_DOWNLOAD_DIR
  });
}

async function browseDownloadDir() {
  browseDirButton.disabled = true;
  setStatus("Choosing folder", "Use the Windows folder picker opened by the native host.", "warning");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "native-pick-folder",
      currentPath: downloadDirInput.value.trim() || DEFAULT_DOWNLOAD_DIR
    });

    if (response?.ok && response.path) {
      downloadDirInput.value = response.path;
      await saveSettings();
      setStatus("Save folder updated", response.path, "ready");
      return;
    }

    if (response?.cancelled) {
      setStatus("Folder selection cancelled", "The previous save folder is unchanged.", "warning");
      return;
    }

    setStatus("Folder picker failed", response?.error || "Native host could not open the folder picker.", "error");
  } finally {
    browseDirButton.disabled = false;
  }
}

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    downloadDir: DEFAULT_DOWNLOAD_DIR
  });
  downloadDirInput.value = settings.downloadDir;
}

async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || {};
}

function updatePageHost(tab) {
  try {
    pageHostEl.textContent = tab?.url ? new URL(tab.url).hostname : "Current tab";
  } catch {
    pageHostEl.textContent = "Current tab";
  }
}

async function runNativeDownload(item, qualityOverride) {
  await saveSettings();
  settingsPanel.hidden = true;
  const tab = await getActiveTabInfo();
  activeTabInfo = tab;
  const info = describeUrl(item.url);
  const quality = qualityOverride || detectQuality(item);
  const response = await chrome.runtime.sendMessage({
    type: "native-download",
    url: item.url,
    referer: item.originUrl || tab.url || "",
    originUrl: item.originUrl || tab.url || "",
    userAgent: navigator.userAgent || "",
    requestHeaders: item.requestHeaders || {},
    title: tab.title || info.name,
    host: info.host,
    quality,
    downloadDir: downloadDirInput.value.trim() || DEFAULT_DOWNLOAD_DIR
  });

  if (response?.ok) {
    setStatus("Download started", `Native job ${response.jobId || response.pid} is running.`, "ready");
    await refreshJobs();
  } else {
    setStatus("Download failed to start", response?.error || "Unknown native host error.", "error");
  }
}

function renderQualitySelect(items) {
  qualitySelect.innerHTML = "";
  currentQualityOptions = [];
  const sorted = [...items].sort((a, b) => qualityRank(b) - qualityRank(a));
  for (const item of sorted) {
    const qualities = Array.isArray(item.qualities) && item.qualities.length
      ? item.qualities
      : [detectQuality(item)];
    for (const quality of qualities) {
      const optionIndex = currentQualityOptions.push({ item, quality }) - 1;
      const option = document.createElement("option");
      option.value = String(optionIndex);
      option.textContent = `${quality} | ${defaultTitleForItem(item)}`;
      qualitySelect.append(option);
    }
  }
  runSelectedButton.disabled = currentQualityOptions.length === 0;
}

function renderJobs(jobs) {
  jobsEl.innerHTML = "";
  if (!jobs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No downloads yet";
    jobsEl.append(empty);
    return;
  }

  for (const job of jobs) {
    const row = document.createElement("div");
    row.className = "job";
    if (job.status === "failed") row.classList.add("failed");
    if (job.status === "finished") row.classList.add("finished");

    const head = document.createElement("div");
    head.className = "job-head";
    const title = document.createElement("strong");
    title.textContent = job.title || job.host || `PID ${job.pid}`;
    const state = document.createElement("span");
    const detailText = job.percent != null
      ? `${job.percent}%`
      : job.status === "failed"
      ? "failed"
      : job.totalFragments
      ? `${job.currentFragment || 0}/${job.totalFragments}`
      : job.currentFragment
        ? `fragment ${job.currentFragment}`
        : job.status || "running";
    state.textContent = detailText;
    head.append(title, state);

    const progress = document.createElement("div");
    progress.className = "progress";
    const bar = document.createElement("span");
    bar.style.width = `${job.percent || 0}%`;
    progress.append(bar);

    const meta = document.createElement("div");
    meta.className = "meta job-tags";
    const label = job.running
      ? "Running"
      : job.status === "failed"
        ? "Failed"
      : job.status === "finished"
          ? "Finished"
          : "Unknown";
    const statusBadge = document.createElement("span");
    statusBadge.className = `badge ${job.status === "failed" ? "danger" : job.status === "finished" ? "success" : "neutral"}`;
    statusBadge.textContent = label;
    meta.append(statusBadge);
    if (job.quality) {
      const qualityBadge = document.createElement("span");
      qualityBadge.className = "badge quality-badge";
      qualityBadge.textContent = job.quality;
      meta.append(qualityBadge);
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
      etaBadge.textContent = `ETA ${job.etaText}`;
      meta.append(etaBadge);
    }
    if (!job.running && job.elapsedText) {
      const elapsedBadge = document.createElement("span");
      elapsedBadge.className = "badge neutral";
      elapsedBadge.textContent = `Done in ${job.elapsedText}`;
      meta.append(elapsedBadge);
    }
    if (job.lastError) {
      const errorText = document.createElement("span");
      errorText.className = "job-error";
      errorText.textContent = job.lastError;
      meta.append(errorText);
    }

    row.append(head, progress, meta);
    jobsEl.append(row);
  }
}

async function refreshJobs() {
  const response = await chrome.runtime.sendMessage({ type: "native-status" });
  if (response?.ok) renderJobs(response.jobs || []);
}

function renderDeps(response) {
  if (!response?.ok) {
    depsStatus.textContent = `Native host missing: ${response?.error || "unknown error"}`;
    installDepsButton.disabled = true;
    setStatus("Native host is not connected", "Install the VDH Lite native host, then test again.", "error");
    return;
  }
  const yt = response.ytDlp?.installed ? "yt-dlp OK" : "yt-dlp missing";
  const ff = response.ffmpeg?.installed ? "FFmpeg OK" : "FFmpeg missing";
  depsStatus.textContent = `${yt} | ${ff}`;
  const ready = response.ytDlp?.installed && response.ffmpeg?.installed;
  installDepsButton.hidden = ready;
  installDepsButton.disabled = ready;
  if (ready) {
    setStatus("Ready to detect media", "Grant this site if no media appears automatically.", "ready");
  } else {
    setStatus("Native host needs dependencies", depsStatus.textContent, "warning");
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
  itemsEl.innerHTML = "";
  renderQualitySelect(items);
  mediaSummaryEl.textContent = items.length
    ? `${items.length} candidate${items.length === 1 ? "" : "s"} found`
    : "No candidates found";
  if (items.length) {
    setStatus("Media detected", "Choose a candidate or use quick download.", "ready");
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "item";

    const details = document.createElement("div");
    const url = document.createElement("div");
    url.className = "url";

    const info = describeUrl(item.url);
    url.textContent = defaultTitleForItem(item);
    url.title = item.url;

    const meta = document.createElement("div");
    meta.className = "meta media-tags";
    const badge = document.createElement("span");
    badge.className = "badge quality-badge";
    badge.textContent = detectQuality(item);
    const typeBadge = document.createElement("span");
    typeBadge.className = "badge neutral";
    typeBadge.textContent = labelForMediaType(item.type);
    const source = document.createElement("span");
    source.className = "badge source";
    source.textContent = info.host;
    meta.append(badge, typeBadge, source);

    details.append(url, meta);

    const actions = document.createElement("div");
    actions.className = "actions";

    const runYtDlp = document.createElement("button");
    runYtDlp.type = "button";
    runYtDlp.textContent = "Download";
    runYtDlp.addEventListener("click", () => {
      runNativeDownload(item, detectQuality(item));
    });

    actions.append(runYtDlp);
    li.append(details, actions);
    itemsEl.append(li);
  }

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Play the video for a few seconds, then refresh. Grant site access if detection is blocked.";
    itemsEl.append(empty);
  }

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
    granted ? "Site access granted" : "Site access was not granted",
    granted ? origin : "VDH Lite can still use active-tab scanning after a user action.",
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
  await listMedia();
});

clearJobsButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "native-clear-jobs" });
  await refreshJobs();
});

grantButton.addEventListener("click", async () => {
  await grantCurrentSite();
  await listMedia();
});

downloadDirInput.addEventListener("change", saveSettings);
browseDirButton.addEventListener("click", browseDownloadDir);

resetDirButton.addEventListener("click", async () => {
  downloadDirInput.value = DEFAULT_DOWNLOAD_DIR;
  await saveSettings();
});

testNativeButton.addEventListener("click", async () => {
  await testNativeHost();
  await checkDependencies();
});

async function testNativeHost() {
  const response = await chrome.runtime.sendMessage({ type: "native-ping" });
  setStatus(
    response?.ok ? `Native host ready (${response.version})` : "Native host error",
    response?.ok ? response.defaultDownloadDir || "Ready for local downloads." : response?.error || "Unknown error.",
    response?.ok ? "ready" : "error"
  );
}

runSelectedButton.addEventListener("click", () => {
  const selected = currentQualityOptions[Number(qualitySelect.value)];
  if (selected?.item) runNativeDownload(selected.item, selected.quality);
});

settingsToggle.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

installDepsButton.addEventListener("click", async () => {
  installDepsButton.disabled = true;
  depsStatus.textContent = "Installing missing dependencies...";
  setStatus("Installing dependencies", "This can take several minutes on a fresh machine.", "warning");
  const response = await chrome.runtime.sendMessage({ type: "native-install-deps" });
  if (!response?.ok) {
    depsStatus.textContent = `Install failed: ${response?.error || "unknown error"}`;
    installDepsButton.disabled = false;
    setStatus("Dependency install failed", response?.error || "Unknown error.", "error");
    return;
  }
  renderDeps(response.deps);
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
