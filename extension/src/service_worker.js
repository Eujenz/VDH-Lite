const MEDIA_TYPES = new Set(["media", "xmlhttprequest", "other"]);
const EXTENSIONS = /\.(m3u8|mpd|mp4|webm|m4a|mp3|mov|ts)(\?|#|$)/i;
const DOWNLOADABLE_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_ITEMS_PER_TAB = 80;
const PLAYLIST_FETCH_LIMIT = 1024 * 1024;

const tabMedia = new Map();
const qualityCache = new Map();
const pendingQualityFetches = new Set();
const requestHeaderCache = new Map();
const nativeHostName = "com.vdhlite.ytdlp";
const FORWARDED_HEADER_NAMES = new Set(["referer", "origin", "user-agent", "accept", "accept-language", "cookie"]);

function setActionBadge(tabId, text, color) {
  if (tabId == null || tabId < 0 || !chrome.action?.setBadgeText) return;
  chrome.action.setBadgeText({ tabId, text });
  if (color && chrome.action.setBadgeBackgroundColor) {
    chrome.action.setBadgeBackgroundColor({ tabId, color });
  }
}

function updateDetectedBadge(tabId) {
  const items = (tabMedia.get(tabId) || []).filter((item) => scoreItem(item) >= 0);
  const count = items.length;
  const text = count ? String(Math.min(count, 99)) : "";
  setActionBadge(tabId, text, "#0f6f83");
}

function updateBadgeFromJobs(jobs = []) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    const failed = jobs.some((job) => job.status === "failed");
    const running = jobs.filter((job) => job.running || job.status === "running" || job.status === "queued").length;
    if (failed) {
      setActionBadge(tab.id, "!", "#b42335");
      return;
    }
    if (running) {
      setActionBadge(tab.id, `↓${Math.min(running, 9)}`, "#0f6f83");
      return;
    }
    updateDetectedBadge(tab.id);
  });
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (!DOWNLOADABLE_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function scoreItem(item) {
  const url = item.url.toLowerCase();
  if (url.includes("preview")) return -1;
  if (url.includes(".m3u8")) return 100;
  if (url.includes(".mpd")) return 95;
  if (url.includes(".mp4") && !url.includes("preview")) return 80;
  if (url.includes(".webm") && !url.includes("preview")) return 75;
  if (url.includes(".m4a") || url.includes(".mp3")) return 60;
  return 30;
}

function detectQualityFromUrl(url) {
  const lowered = String(url || "").toLowerCase();
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

function contentTypeFromHeaders(responseHeaders = []) {
  const header = responseHeaders.find((entry) => entry.name?.toLowerCase() === "content-type");
  return String(header?.value || "").toLowerCase();
}

function headersForDownload(requestHeaders = []) {
  const headers = {};
  for (const header of requestHeaders) {
    const name = String(header.name || "").toLowerCase();
    const value = String(header.value || "");
    if (FORWARDED_HEADER_NAMES.has(name) && value) headers[name] = value;
  }
  return headers;
}

function rememberRequestHeaders(url, headers) {
  requestHeaderCache.set(url, headers);
  if (requestHeaderCache.size > 200) {
    const oldestKey = requestHeaderCache.keys().next().value;
    requestHeaderCache.delete(oldestKey);
  }
}

function detectQualityFromContentType(contentType) {
  if (contentType.includes("application/vnd.apple.mpegurl")) return "HLS";
  if (contentType.includes("application/x-mpegurl")) return "HLS";
  if (contentType.includes("application/dash+xml")) return "DASH";
  if (contentType.includes("video/mp4")) return "MP4";
  if (contentType.includes("video/webm")) return "WEBM";
  if (contentType.includes("audio/")) return "Audio";
  return null;
}

function m3u8QualityInfo(text) {
  const heights = new Set();
  const resolutionPattern = /RESOLUTION=(\d{2,5})x(\d{2,5})/gi;
  let match;
  while ((match = resolutionPattern.exec(text))) {
    heights.add(Number(match[2]));
  }
  if (!heights.size) return null;
  const qualities = [...heights]
    .sort((a, b) => b - a)
    .map((height) => `${height}P`);
  return { quality: qualities[0], qualities };
}

function applyCachedQuality(item) {
  const cached = qualityCache.get(item.url);
  item.quality = cached?.quality || detectQualityFromContentType(item.contentType || "") || detectQualityFromUrl(item.url);
  if (cached?.qualities?.length) item.qualities = cached.qualities;
}

async function hydrateM3u8Quality(tabId, url, force = false) {
  if (qualityCache.has(url) || pendingQualityFetches.has(url)) return;
  if (!force && !url.toLowerCase().includes(".m3u8")) return;
  pendingQualityFetches.add(url);

  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) return;

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > PLAYLIST_FETCH_LIMIT) return;

    const text = await response.text();
    if (text.length > PLAYLIST_FETCH_LIMIT) return;

    const qualityInfo = m3u8QualityInfo(text);
    if (!qualityInfo) return;

    qualityCache.set(url, qualityInfo);
    const items = tabMedia.get(tabId) || [];
    let changed = false;
    for (const item of items) {
      if (item.url === url) {
        item.quality = qualityInfo.quality;
        item.qualities = qualityInfo.qualities;
        changed = true;
      }
    }
    if (changed) tabMedia.set(tabId, items);
  } catch {
    // Some sites block extension-side playlist reads. yt-dlp can still download with referer.
  } finally {
    pendingQualityFetches.delete(url);
  }
}

function looksLikeMedia(details) {
  if (!MEDIA_TYPES.has(details.type)) return false;
  if (EXTENSIONS.test(details.url)) return true;

  const contentType = contentTypeFromHeaders(details.responseHeaders || []);
  return (
    contentType.includes("video/") ||
    contentType.includes("audio/") ||
    contentType.includes("application/vnd.apple.mpegurl") ||
    contentType.includes("application/x-mpegurl") ||
    contentType.includes("application/dash+xml")
  );
}

function pushMedia(tabId, item) {
  if (tabId < 0) return;
  if (item.url && item.url.toLowerCase().includes("preview")) return;
  applyCachedQuality(item);
  const current = tabMedia.get(tabId) || [];
  if (current.some((existing) => existing.url === item.url)) return;
  current.unshift(item);
  tabMedia.set(tabId, current.slice(0, MAX_ITEMS_PER_TAB));
  updateDetectedBadge(tabId);
  hydrateM3u8Quality(tabId, item.url, item.quality === "HLS");
}

chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    const url = normalizeUrl(details.url);
    if (!url || !looksLikeMedia(details)) return;

    pushMedia(details.tabId, {
      url,
      type: details.type,
      contentType: contentTypeFromHeaders(details.responseHeaders || []),
      requestHeaders: requestHeaderCache.get(url) || {},
      method: details.method,
      timeStamp: details.timeStamp,
      originUrl: details.initiator || null
    });
  },
  { urls: ["http://*/*", "https://*/*"], types: [...MEDIA_TYPES] },
  ["responseHeaders"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const url = normalizeUrl(details.url);
    if (!url) return;
    rememberRequestHeaders(url, headersForDownload(details.requestHeaders || []));
  },
  { urls: ["http://*/*", "https://*/*"], types: [...MEDIA_TYPES] },
  ["requestHeaders", "extraHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabMedia.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "content-media-candidate" && sender.tab?.id != null) {
    const url = normalizeUrl(message.url);
    if (url) {
      pushMedia(sender.tab.id, {
        url,
        type: message.source || "dom",
        method: "GET",
        timeStamp: Date.now(),
        originUrl: sender.tab.url || null
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "list-media") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      const items = tab ? tabMedia.get(tab.id) || [] : [];
      if (tab) updateDetectedBadge(tab.id);
      sendResponse({ items: [...items].filter((item) => scoreItem(item) >= 0).sort((a, b) => scoreItem(b) - scoreItem(a)) });
    });
    return true;
  }

  if (message?.type === "clear-media") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) tabMedia.delete(tab.id);
      if (tab) updateDetectedBadge(tab.id);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === "remove-media") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      const urls = new Set(Array.isArray(message.urls) ? message.urls : [message.url].filter(Boolean));
      if (tab && urls.size) {
        const items = tabMedia.get(tab.id) || [];
        tabMedia.set(tab.id, items.filter((item) => !urls.has(item.url)));
        updateDetectedBadge(tab.id);
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === "download" && typeof message.url === "string") {
    chrome.downloads.download({
      url: message.url,
      saveAs: true
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "native-ping") {
    chrome.runtime.sendNativeMessage(nativeHostName, { type: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || { ok: false, error: "Native host returned no response" });
    });
    return true;
  }

  if (message?.type === "native-download" && typeof message.url === "string") {
    chrome.runtime.sendNativeMessage(nativeHostName, { ...message, type: "download" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || { ok: false, error: "Native host returned no response" });
    });
    return true;
  }

  if (message?.type === "native-status") {
    chrome.runtime.sendNativeMessage(nativeHostName, { type: "status" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      if (response?.ok) updateBadgeFromJobs(response.jobs || []);
      sendResponse(response || { ok: false, error: "Native host returned no response" });
    });
    return true;
  }

  if (message?.type === "native-pick-folder") {
    chrome.runtime.sendNativeMessage(
      nativeHostName,
      { type: "pick-folder", currentPath: message.currentPath || "" },
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse(response || { ok: false, error: "Native host returned no response" });
      }
    );
    return true;
  }

  if (message?.type === "native-deps") {
    chrome.runtime.sendNativeMessage(nativeHostName, { type: "deps" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || { ok: false, error: "Native host returned no response" });
    });
    return true;
  }

  if (message?.type === "native-install-deps") {
    chrome.runtime.sendNativeMessage(nativeHostName, { type: "install-deps" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || { ok: false, error: "Native host returned no response" });
    });
    return true;
  }

  if (message?.type === "native-clear-jobs") {
    chrome.runtime.sendNativeMessage(nativeHostName, { type: "clear-jobs" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || { ok: false, error: "Native host returned no response" });
    });
    return true;
  }

  return false;
});
