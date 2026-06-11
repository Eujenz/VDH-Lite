function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDownloadJob(message) {
  const now = new Date().toISOString().slice(0, 19);
  return {
    id: `harness-${Date.now()}`,
    pid: Math.floor(1000 + Math.random() * 8000),
    status: "running",
    running: true,
    title: message.title || message.host || "Harness download",
    host: message.host || "example.test",
    quality: message.quality || "Best",
    url: message.url,
    percent: 0,
    phase: "queued",
    startedAt: now
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
      downloadDir: "%USERPROFILE%\\Downloads\\VDH Lite"
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
          case "native-diagnostics":
            return diagnosticsForState(state, message.jobId || null);
          case "native-clear-jobs":
            state.jobs = state.jobs.filter((job) => job.running || job.status === "running");
            return { ok: true };
          case "native-pick-folder":
            return { ok: true, cancelled: true };
          case "native-download": {
            const job = createDownloadJob(message);
            state.jobs.unshift(job);
            return {
              ok: true,
              jobId: job.id,
              pid: job.pid
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
