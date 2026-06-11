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
const downloadDirInput = document.querySelector("#download-dir");
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

const DEFAULT_DOWNLOAD_DIR = "%USERPROFILE%\\Downloads\\VDH Lite";
const FILTERS = [
  { id: "all", label: "All" },
  { id: "detected", label: "Detected" },
  { id: "active", label: "Active" },
  { id: "finished", label: "Finished" },
  { id: "failed", label: "Failed" }
];

let currentItems = [];
let currentGroups = [];
let currentJobs = [];
let activeTabInfo = {};
let pendingMediaRefresh = null;
let activeFilter = "all";
const selectedGroupQualities = new Map();
const discoveryByGroupId = new Map();
const discoveryErrorsByGroupId = new Map();
const discoveringGroupIds = new Set();

function setStatus(title, detail = "", tone = "") {
  statusEl.textContent = title;
  statusDetailEl.textContent = detail;
  statusCard.classList.remove("ready", "warning", "error");
  if (tone) statusCard.classList.add(tone);
}

function valueOrUnknown(value) {
  return value == null || value === "" ? "unknown" : String(value);
}

function dependencySummary(dep) {
  if (!dep) return "unknown";
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
    setStatus("Diagnostics copied", "Paste them into a support report. Full media URLs are intentionally omitted.", "ready");
  } catch (error) {
    setStatus("Diagnostics copy failed", error?.message || "Could not write to the clipboard.", "error");
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
  if (normalized === "media") return "Media";
  if (normalized === "xmlhttprequest") return "XHR";
  if (normalized === "dom") return "Page";
  if (normalized === "other") return "Other";
  return type || "Media";
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
  if (family === "video") return "Video";
  if (family === "audio") return "Audio";
  return "Media";
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
  return parts.join(" | ") || "Discovered format";
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
  if (job.running || job.status === "running" || job.status === "queued") return "active";
  if (job.status === "failed") return "failed";
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
    button.textContent = `${filter.label} ${counts[filter.id] || 0}`;
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
  qualityBadge.textContent = group.qualities[0] || detectQuality(group.primaryItem);

  const typeBadge = document.createElement("span");
  typeBadge.className = "badge neutral";
  typeBadge.textContent = labelForFamily(group.type);

  const sourceBadge = document.createElement("span");
  sourceBadge.className = "badge source";
  sourceBadge.textContent = group.sourceList.join(" + ") || "Detected";

  meta.append(qualityBadge, typeBadge, sourceBadge);

  if (group.items.length > 1) {
    const groupedBadge = document.createElement("span");
    groupedBadge.className = "badge neutral";
    groupedBadge.textContent = `${group.items.length} sources`;
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
    failedBadge.textContent = "Discovery failed";
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
    jobBadge.textContent = state === "active" ? job.phase || "Active" : state.charAt(0).toUpperCase() + state.slice(1);
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
  label.textContent = "Quality";

  const select = document.createElement("select");
  select.id = selectId;
  select.className = "media-quality-select";

  const preferred = selectedGroupQualities.get(group.id);
  group.qualityOptions.forEach((option, index) => {
    const itemInfo = describeUrl(option.item.url);
    const optionEl = document.createElement("option");
    optionEl.value = String(index);
    optionEl.textContent = option.label || `${option.quality} | ${itemInfo.host || group.host}`;
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
    `Title: ${group.title}`,
    `Host: ${group.host}`,
    `Type: ${labelForFamily(group.type)}`,
    `Qualities: ${group.qualities.join(", ")}`,
    `Sources: ${group.sourceList.join(", ")}`,
    `State: ${stateForGroup(group)}`,
    "",
    "URLs:",
    ...group.items.map((item) => `- ${item.url}`)
  ];

  if (group.discovery) {
    lines.push(
      "",
      "Discovery:",
      `- Source: yt-dlp`,
      `- Title: ${group.discovery.title || group.title}`,
      `- Duration: ${formatDuration(group.duration) || "unknown"}`,
      `- Uploader: ${group.uploader || "unknown"}`,
      `- Formats: ${group.formats?.length || 0}`
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
      "Discovery failed:",
      `- ${group.discoveryError.label || group.discoveryError.category || "Unknown"}`,
      `- ${group.discoveryError.summary || group.discoveryError.error || "No details"}`
    );
  }

  if (job) {
    lines.push(
      "",
      "Job:",
      `- Status: ${job.status || "unknown"}`,
      `- Phase: ${job.phase || "unknown"}`,
      `- Quality: ${job.quality || "unknown"}`,
      `- Percent: ${job.percent ?? "unknown"}`,
      `- Final path: ${job.finalPath || "unknown"}`,
      `- Error category: ${job.errorCategory || "unknown"}`,
      `- Error summary: ${job.errorSummary || "unknown"}`,
      `- Next action: ${job.nextAction || "unknown"}`,
      `- Error: ${job.lastError || "none"}`
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
  setStatus("Loading formats", "Asking yt-dlp for title, metadata, and available formats.", "warning");
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
      setStatus("Formats loaded", `${count} yt-dlp format${count === 1 ? "" : "s"} found.`, "ready");
    } else {
      discoveryErrorsByGroupId.set(group.id, response || { error: "Discovery failed" });
      setStatus(
        "Format discovery failed",
        response?.summary || response?.error || "Direct download fallback is still available.",
        "warning"
      );
    }
  } catch (error) {
    discoveryErrorsByGroupId.set(group.id, { error: error?.message || "Discovery failed" });
    setStatus("Format discovery failed", error?.message || "Direct download fallback is still available.", "warning");
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
  downloadButton.textContent = state === "failed" ? "Retry" : "Download";
  downloadButton.addEventListener("click", () => {
    const option = selectedOptionForGroup(group, select);
    runNativeDownload(option.item, option);
  });

  const discoverButton = document.createElement("button");
  discoverButton.type = "button";
  discoverButton.className = "secondary";
  discoverButton.textContent = discovering ? "Loading" : group.discovery ? "Formats" : "Formats";
  discoverButton.disabled = discovering;
  discoverButton.addEventListener("click", () => discoverFormats(group));

  const detailsButton = document.createElement("button");
  detailsButton.type = "button";
  detailsButton.className = "secondary";
  detailsButton.textContent = "Details";
  detailsButton.addEventListener("click", () => showCandidateDetails(group, job));

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "secondary";
  removeButton.textContent = "Remove";
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
    ? `${currentGroups.length} candidate${currentGroups.length === 1 ? "" : "s"} grouped from ${currentItems.length} source${currentItems.length === 1 ? "" : "s"}`
    : "No candidates found";

  if (currentGroups.length && !preserveStatus) updateMediaStatus(currentGroups);

  if (!currentGroups.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Play the video for a few seconds, then refresh. Grant site access if detection is blocked.";
    itemsEl.append(empty);
    return;
  }

  if (!visibleGroups.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = `No ${activeFilter} media candidates in this tab.`;
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
      `${counts.active} download${counts.active === 1 ? "" : "s"} running`,
      "Monitor progress below or start another media card.",
      "ready"
    );
    return;
  }
  if (counts.failed) {
    setStatus(
      `${counts.failed} download${counts.failed === 1 ? "" : "s"} need attention`,
      "Open the failed card details or retry with another quality.",
      "error"
    );
    return;
  }
  setStatus("Media detected", "Choose a media card quality, then download.", "ready");
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
    downloadDir: downloadDirInput.value.trim() || DEFAULT_DOWNLOAD_DIR
  });

  if (response?.ok) {
    setStatus("Download started", `Native job ${response.jobId || response.pid} is running.`, "ready");
    await refreshJobs();
  } else {
    setStatus("Download failed to start", response?.error || "Unknown native host error.", "error");
  }
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
      : job.phase
        ? job.phase
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
    if (job.phase) {
      const phaseBadge = document.createElement("span");
      phaseBadge.className = "badge neutral";
      phaseBadge.textContent = job.phase;
      meta.append(phaseBadge);
    }
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
    if (job.finalPath) {
      const pathText = document.createElement("span");
      pathText.className = "job-path";
      pathText.textContent = `Saved: ${job.finalPath}`;
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
      diagnosticsButton.textContent = "Copy diagnostics";
      diagnosticsButton.addEventListener("click", () => copyDiagnostics(job));
      meta.append(diagnosticsButton);
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
  selectedGroupQualities.clear();
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

mediaFiltersEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter || "all";
  renderMediaView();
});

async function testNativeHost() {
  const response = await chrome.runtime.sendMessage({ type: "native-ping" });
  setStatus(
    response?.ok ? `Native host ready (${response.version})` : "Native host error",
    response?.ok ? response.defaultDownloadDir || "Ready for local downloads." : response?.error || "Unknown error.",
    response?.ok ? "ready" : "error"
  );
}

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
