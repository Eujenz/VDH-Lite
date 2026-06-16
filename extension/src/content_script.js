(function () {
  try {
    var vdhMaxSeenUrls = 500;
    var vdhSelector = [
      "video[src]",
      "audio[src]",
      "source[src]",
      "a[href$='.mp4']",
      "a[href$='.webm']",
      "a[href$='.m3u8']",
      "a[href$='.mpd']",
      "a[href$='.mp3']",
      "a[href$='.m4a']"
    ].join(",");

    var vdhMediaPattern = /\.(m3u8|mpd|mp4|webm|m4a|mp3|mov)(\?|#|$)/i;
    var vdhSeenUrls = globalThis.__vdhLiteSeenUrls || new Set();
    var vdhPendingMutations = [];
    var vdhScanScheduled = false;
    var vdhNeedsFullScan = false;
    var vdhLastResourceIndex = globalThis.__vdhLiteLastResourceIndex || 0;
    globalThis.__vdhLiteSeenUrls = vdhSeenUrls;

    var vdhNormalizeDownloadableUrl = function (url) {
      try {
        var parsed = new URL(url, location.href);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return parsed.href;
      } catch (error) {
        return null;
      }
    };

    var vdhReport = function (url, source) {
      if (!source) source = "dom";
      if (!url) return;
      if (String(url).toLowerCase().indexOf("preview") !== -1) return;
      var normalizedUrl = vdhNormalizeDownloadableUrl(url);
      if (!normalizedUrl) return;
      if (vdhSeenUrls.has(normalizedUrl)) return;
      vdhSeenUrls.add(normalizedUrl);
      if (vdhSeenUrls.size > vdhMaxSeenUrls) {
        vdhSeenUrls.delete(vdhSeenUrls.values().next().value);
      }
      try {
        if (!chrome || !chrome.runtime || !chrome.runtime.id) return;
        chrome.runtime.sendMessage({ type: "content-media-candidate", url: normalizedUrl, source: source }, function () {
          try {
            // Reading lastError marks expected disconnect/reload errors as handled.
            var ignored = chrome.runtime.lastError;
          } catch (error) {
            // The extension context can be invalidated before the callback runs.
          }
        });
      } catch (error) {
        // The extension context can be invalidated during reload/navigation.
      }
    };

    var vdhReportElement = function (element) {
      if (!element) return;
      vdhReport(element.currentSrc || element.src || element.href, "dom");
    };

    var vdhScanNode = function (node) {
      try {
        if (!node || node.nodeType !== 1) return;
        if (node.matches && node.matches(vdhSelector)) vdhReportElement(node);
        if (!node.querySelectorAll) return;
        var elements = node.querySelectorAll(vdhSelector);
        for (var i = 0; i < elements.length; i++) {
          vdhReportElement(elements[i]);
        }
      } catch (error) {
        // Ignore transient DOM access errors during navigation.
      }
    };

    var vdhScanDom = function () {
      try {
        var elements = document.querySelectorAll(vdhSelector);
        for (var i = 0; i < elements.length; i++) {
          vdhReportElement(elements[i]);
        }
      } catch (error) {
        // Ignore transient DOM access errors during navigation.
      }
    };

    var vdhReportPerformanceEntry = function (entry) {
      if (entry && vdhMediaPattern.test(entry.name)) vdhReport(entry.name, "performance");
    };

    var vdhScanPerformance = function () {
      try {
        var entries = performance.getEntriesByType("resource");
        for (var i = vdhLastResourceIndex; i < entries.length; i++) {
          vdhReportPerformanceEntry(entries[i]);
        }
        vdhLastResourceIndex = entries.length;
        globalThis.__vdhLiteLastResourceIndex = vdhLastResourceIndex;
      } catch (error) {
        // Ignore transient performance API errors.
      }
    };

    var vdhScanAll = function () {
      vdhScanDom();
      vdhScanPerformance();
    };

    var vdhScanMutations = function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === "attributes") {
          vdhScanNode(mutation.target);
          continue;
        }
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          vdhScanNode(mutation.addedNodes[j]);
        }
      }
    };

    var vdhRunScheduledScan = function () {
      vdhScanScheduled = false;
      var mutations = vdhPendingMutations.splice(0);
      var needsFullScan = vdhNeedsFullScan;
      vdhNeedsFullScan = false;
      if (needsFullScan) {
        vdhScanAll();
        return;
      }
      vdhScanMutations(mutations);
      vdhScanPerformance();
    };

    var vdhScheduleScan = function (mutations, fullScan) {
      if (fullScan) vdhNeedsFullScan = true;
      if (mutations && mutations.length) {
        for (var i = 0; i < mutations.length; i++) vdhPendingMutations.push(mutations[i]);
      }
      if (vdhScanScheduled) return;
      vdhScanScheduled = true;
      setTimeout(function () {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(vdhRunScheduledScan, { timeout: 1000 });
        } else {
          vdhRunScheduledScan();
        }
      }, 250);
    };

    var vdhInstallPerformanceObserver = function () {
      try {
        if (globalThis.__vdhLitePerformanceObserverInstalled) return;
        if (typeof PerformanceObserver !== "function") return;
        globalThis.__vdhLitePerformanceObserverInstalled = true;
        var observer = new PerformanceObserver(function (list) {
          var entries = list.getEntries();
          for (var i = 0; i < entries.length; i++) {
            vdhReportPerformanceEntry(entries[i]);
          }
        });
        observer.observe({ entryTypes: ["resource"] });
      } catch (error) {
        // PerformanceObserver may be unavailable or blocked on some documents.
      }
    };

    var vdhInstallBridge = function () {
      try {
        if (globalThis.__vdhLiteBridgeInstalled) return;
        globalThis.__vdhLiteBridgeInstalled = true;
        window.addEventListener("message", function (event) {
          try {
            if (event.source !== window) return;
            if (!event.data || event.data.source !== "vdh-lite-page-probe") return;
            vdhReport(event.data.url, event.data.kind || "page-probe");
          } catch (error) {
            // Ignore malformed page messages.
          }
        });
      } catch (error) {
        // Ignore bridge install failures.
      }
    };

    if (globalThis.__vdhLiteContentInstalled) {
      vdhScheduleScan(null, true);
      return;
    }

    globalThis.__vdhLiteContentInstalled = true;
    vdhScheduleScan(null, true);
    vdhInstallPerformanceObserver();
    vdhInstallBridge();

    try {
      var root = document.documentElement || document.body;
      if (root) {
        new MutationObserver(function (mutations) {
          vdhScheduleScan(mutations, false);
        }).observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["src", "href"]
        });
      }
    } catch (error) {
      // Some documents may not be observable; initial scan still ran.
    }
  } catch (error) {
    // Last-resort guard: content script must never break the page or extension UI.
  }
})();
