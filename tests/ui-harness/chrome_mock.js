function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDownloadJob(message, queued = false) {
  const now = new Date().toISOString().slice(0, 19);
  return {
    id: `harness-${Date.now()}`,
    pid: queued ? null : Math.floor(1000 + Math.random() * 8000),
    status: queued ? "queued" : "running",
    running: !queued,
    title: message.title || message.host || "Harness download",
    host: message.host || "example.test",
    quality: message.quality || "Best",
    formatLabel: message.formatLabel || "",
    formatSelector: message.formatSelector || "",
    duration: message.duration || null,
    url: message.url,
    percent: 0,
    phase: queued ? "queued" : "initializing",
    retryable: true,
    request: { ...message },
    queuedAt: now,
    startedAt: queued ? null : now
  };
}

function downloadMessageFromJob(job) {
  if (job.request) return { ...job.request };
  return {
    url: job.url,
    title: job.title,
    host: job.host,
    quality: job.quality,
    downloadDir: "%USERPROFILE%\\Downloads\\VDH Lite"
  };
}

function updateHarnessDataset(message) {
  const dataset = document.documentElement.dataset;
  dataset.harnessLastMessage = message?.type || "";
  if (message?.type === "native-discover") {
    dataset.harnessLastDiscoveryUrl = message.url || "";
  }
  if (message?.type === "native-download") {
    dataset.harnessLastDownloadUrl = message.url || "";
    dataset.harnessLastDownloadFormatLabel = message.formatLabel || "";
    dataset.harnessLastDownloadFormatSelector = message.formatSelector || "";
    dataset.harnessLastDownloadDuration = message.duration ? String(message.duration) : "";
  }
}

function discoveryForMessage(state, message) {
  const item = state.items.find((candidate) => candidate.url === message.url) || state.items[0] || {};
  return {
    ok: true,
    source: "yt-dlp",
    title: "Sample Cooking Stream (yt-dlp)",
    webpageUrl: state.tab.url,
    duration: 194,
    thumbnail: item.thumbnail || null,
    uploader: "Example Studio",
    media: [
      {
        title: "Sample Cooking Stream (yt-dlp)",
        url: state.tab.url,
        webpageUrl: state.tab.url,
        playlistPosition: -1,
        duration: 194,
        uploader: "Example Studio",
        thumbnail: item.thumbnail || null,
        formats: [
          {
            id: "137",
            height: 1080,
            width: 1920,
            fps: 30,
            abr: null,
            tbr: 4200,
            ext: "mp4",
            vcodec: "avc1.640028",
            acodec: "none",
            filesize: 102400000,
            protocol: "https"
          },
          {
            id: "136",
            height: 720,
            width: 1280,
            fps: 30,
            abr: null,
            tbr: 2400,
            ext: "mp4",
            vcodec: "avc1.4d401f",
            acodec: "none",
            filesize: 68200000,
            protocol: "https"
          },
          {
            id: "140",
            height: null,
            width: null,
            fps: null,
            abr: 128,
            tbr: 128,
            ext: "m4a",
            vcodec: "none",
            acodec: "mp4a.40.2",
            filesize: 4200000,
            protocol: "https"
          }
        ],
        formatChoices: [
          {
            id: "best",
            label: "Best available",
            quality: "Best",
            kind: "best",
            selector: "bv*+ba/b",
            source: "yt-dlp"
          },
          {
            id: "height-1080",
            label: "1080P from yt-dlp formats",
            quality: "1080P",
            kind: "video",
            height: 1080,
            selector: "bv*[height<=1080]+ba/b[height<=1080]/best[height<=1080]/best",
            source: "yt-dlp"
          },
          {
            id: "height-720",
            label: "720P from yt-dlp formats",
            quality: "720P",
            kind: "video",
            height: 720,
            selector: "bv*[height<=720]+ba/b[height<=720]/best[height<=720]/best",
            source: "yt-dlp"
          },
          {
            id: "audio",
            label: "Audio | M4A | 128k",
            quality: "Audio",
            kind: "audio",
            formatId: "140",
            selector: "ba/bestaudio/best",
            source: "yt-dlp"
          }
        ],
        subtitles: [{ language: "en", exts: ["vtt"] }]
      }
    ]
  };
}

function diagnosticsForState(state, jobId) {
  const jobs = (jobId ? state.jobs.filter((job) => job.id === jobId) : state.jobs).map((job) => ({
    id: job.id,
    status: job.status,
    phase: job.phase,
    title: job.title,
    siteHost: job.host,
    quality: job.quality,
    percent: job.percent,
    elapsedText: job.elapsedText,
    finalFilename: job.finalPath ? job.finalPath.split(/[\\/]/).pop() : null,
    errorCategory: job.errorCategory || "unknown",
    errorLabel: job.errorLabel || "Unknown failure",
    errorSummary: job.errorSummary || "Harness diagnostic summary",
    nextAction: job.nextAction || "Copy diagnostics and include them in a support report.",
    retryable: Boolean(job.retryable),
    lastError: job.lastError || null
  }));

  return {
    ok: true,
    nativeConnected: true,
    hostVersion: "harness",
    hostPath: "C:\\Users\\demo\\AppData\\Local\\VDH Lite\\NativeHost\\yt_dlp_host.py",
    logDir: "C:\\Users\\demo\\AppData\\Local\\VDH Lite",
    deps: {
      ytDlp: { installed: true, version: "yt-dlp harness" },
      ffmpeg: { installed: true, version: "ffmpeg harness" }
    },
    extension: {
      name: "VDH Lite",
      version: "harness",
      manifestVersion: 3
    },
    browser: {
      userAgent: navigator.userAgent
    },
    activeTabHost: state.tab.url ? new URL(state.tab.url).hostname : "",
    jobs
  };
}

export function installChromeMock(scenario) {
  const state = {
    tab: clone(scenario.tab),
    items: clone(scenario.items),
    jobs: clone(scenario.jobs),
    settings: {
      uiLanguage: "en",
      downloadDir: "%USERPROFILE%\\Downloads\\VDH Lite",
      concurrencyLimit: 2
    },
    messages: [],
    clipboardText: "",
    badge: {
      text: "",
      color: ""
    }
  };

  window.__VDH_LITE_HARNESS__ = state;
  try {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(text) {
          state.clipboardText = text;
        }
      }
    });
  } catch {
    // Browser fallback copy path will still display diagnostics in the textarea.
  }

  window.chrome = {
    action: {
      setBadgeText(args) {
        state.badge.text = args?.text || "";
      },
      setBadgeBackgroundColor(args) {
        state.badge.color = args?.color || "";
      }
    },
    permissions: {
      async request() {
        return true;
      }
    },
    scripting: {
      async executeScript() {
        return [];
      }
    },
    storage: {
      local: {
        async get(defaults = {}) {
          return { ...defaults, ...state.settings };
        },
        async set(values = {}) {
          state.settings = { ...state.settings, ...values };
        }
      }
    },
    tabs: {
      async query() {
        return [clone(state.tab)];
      }
    },
    runtime: {
      lastError: null,
      async sendMessage(message) {
        state.messages.push(clone(message));
        updateHarnessDataset(message);

        switch (message?.type) {
          case "list-media":
            return { items: clone(state.items) };
          case "clear-media":
            state.items = [];
            return { ok: true };
          case "remove-media": {
            const urls = new Set(Array.isArray(message.urls) ? message.urls : [message.url].filter(Boolean));
            state.items = state.items.filter((item) => !urls.has(item.url));
            return { ok: true };
          }
          case "native-ping":
            return {
              ok: true,
              version: "harness",
              defaultDownloadDir: state.settings.downloadDir
            };
          case "native-deps":
            return {
              ok: true,
              hostVersion: "harness",
              ytDlp: { installed: true, version: "yt-dlp harness" },
              ffmpeg: { installed: true, version: "ffmpeg harness" }
            };
          case "native-install-deps":
            return {
              ok: true,
              deps: {
                ok: true,
                ytDlp: { installed: true },
                ffmpeg: { installed: true }
              }
            };
          case "native-status":
            return { ok: true, jobs: clone(state.jobs) };
          case "native-discover":
            return discoveryForMessage(state, message);
          case "native-diagnostics":
            return diagnosticsForState(state, message.jobId || null);
          case "native-cancel-job": {
            const job = state.jobs.find((candidate) => candidate.id === message.jobId);
            if (!job) return { ok: false, error: "Job not found." };
            job.status = "stopped";
            job.running = false;
            job.phase = "stopped";
            job.retryable = true;
            job.lastError = "Cancelled by user.";
            return { ok: true, jobId: job.id, status: job.status };
          }
          case "native-retry-job": {
            const job = state.jobs.find((candidate) => candidate.id === message.jobId);
            if (!job) return { ok: false, error: "Job not found." };
            const running = state.jobs.filter((candidate) => candidate.running || candidate.status === "running").length;
            const limit = Math.max(1, Math.min(4, Number(message.concurrencyLimit || state.settings.concurrencyLimit || 2)));
            const retry = createDownloadJob(downloadMessageFromJob(job), running >= limit);
            retry.retryOf = job.id;
            state.jobs.unshift(retry);
            return { ok: true, jobId: retry.id, status: retry.status, pid: retry.pid };
          }
          case "native-clear-jobs":
          case "native-clear-completed":
            state.jobs = state.jobs.filter((job) => job.running || job.status === "running" || job.status === "queued");
            return { ok: true };
          case "native-pick-folder":
            return { ok: true, cancelled: true };
          case "native-download": {
            const running = state.jobs.filter((candidate) => candidate.running || candidate.status === "running").length;
            const limit = Math.max(1, Math.min(4, Number(message.concurrencyLimit || state.settings.concurrencyLimit || 2)));
            const job = createDownloadJob(message, running >= limit);
            state.jobs.unshift(job);
            return {
              ok: true,
              jobId: job.id,
              pid: job.pid,
              status: job.status,
              queued: job.status === "queued"
            };
          }
          default:
            return { ok: false, error: `Unhandled harness message: ${message?.type || "unknown"}` };
        }
      }
    }
  };

  return state;
}
