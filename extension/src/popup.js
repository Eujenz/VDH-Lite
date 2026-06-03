const statusEl = document.querySelector("#status");
const itemsEl = document.querySelector("#items");
const refreshButton = document.querySelector("#refresh");
const clearButton = document.querySelector("#clear");
const grantButton = document.querySelector("#grant");
const commandPanel = document.querySelector("#command-panel");
const commandOutput = document.querySelector("#command-output");
const downloadDirInput = document.querySelector("#download-dir");
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
  if (tabTitle) return tabTitle.slice(0, 140);
  return describeUrl(item.url).name;
}

function detectQuality(itemOrUrl) {
  if (typeof itemOrUrl === "object" && itemOrUrl?.quality) return itemOrUrl.quality;
  const url = typeof itemOrUrl === "string" ? itemOrUrl : itemOrUrl?.url || "";
  const lowered = url.toLowerCase();
  const resolution = lowered.match(/(?:^|\/)(\d{3,4})x(\d{3,4})(?:\/|$)/);
  if (resolution) return `${resolution[2]}P`;
  const pResolution = lowered.match(/(?:^|\/)(2160|1440|1080|720|540|480|360|240)p(?:\/|\.|-|_|$)/);
  if (pResolution) return `${pResolution[1]}P`;
  if (lowered.includes(".m3u8")) return "HLS";
  if (lowered.includes(".mpd")) return "DASH";
  return "Media";
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
    title: tab.title || info.name,
    host: info.host,
    quality,
    downloadDir: downloadDirInput.value.trim() || DEFAULT_DOWNLOAD_DIR
  });

  if (response?.ok) {
    statusEl.textContent = `Started yt-dlp pid ${response.pid}`;
    await refreshJobs();
  } else {
    statusEl.textContent = `yt-dlp failed: ${response?.error || "unknown error"}`;
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
    jobsEl.textContent = "No active downloads";
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
    meta.className = "meta";
    const label = job.running
      ? "Running"
      : job.status === "failed"
        ? "Failed"
      : job.status === "finished"
          ? "Finished"
          : "Unknown";
    meta.textContent = `${label}${job.speedText ? ` | ${job.speedText}` : ""}${job.etaText ? ` | ETA ${job.etaText}` : ""}${job.quality ? ` | ${job.quality}` : ""}${job.lastError ? ` | ${job.lastError}` : ""}`;

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
    return;
  }
  const yt = response.ytDlp?.installed ? "yt-dlp OK" : "yt-dlp missing";
  const ff = response.ffmpeg?.installed ? "FFmpeg OK" : "FFmpeg missing";
  depsStatus.textContent = `${yt} | ${ff}`;
  const ready = response.ytDlp?.installed && response.ffmpeg?.installed;
  installDepsButton.hidden = ready;
  installDepsButton.disabled = ready;
}

async function checkDependencies() {
  const response = await chrome.runtime.sendMessage({ type: "native-deps" });
  renderDeps(response);
  return response;
}

async function listMedia() {
  activeTabInfo = await getActiveTabInfo();
  const response = await chrome.runtime.sendMessage({ type: "list-media" });
  const items = response.items || [];
  currentItems = items;
  itemsEl.innerHTML = "";
  renderQualitySelect(items);
  statusEl.textContent = items.length
    ? `Detected ${items.length} media candidates`
    : "No media candidates yet";

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
    meta.className = "meta";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = detectQuality(item);
    meta.append(badge, document.createTextNode(`${item.type} | ${info.host}`));

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
  statusEl.textContent = granted ? `Granted ${origin}` : "Site permission was not granted";
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
  statusEl.textContent = response?.ok
    ? `yt-dlp host ready (${response.version})`
    : `Native host error: ${response?.error || "unknown error"}`;
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
  const response = await chrome.runtime.sendMessage({ type: "native-install-deps" });
  if (!response?.ok) {
    depsStatus.textContent = `Install failed: ${response?.error || "unknown error"}`;
    installDepsButton.disabled = false;
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
