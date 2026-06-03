(function () {
  try {
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

    var vdhMediaPattern = /\.(m3u8|mpd|mp4|webm|m4a|mp3|mov|ts)(\?|#|$)/i;

    var vdhIsDownloadableUrl = function (url) {
      try {
        var parsed = new URL(url, location.href);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch (error) {
        return false;
      }
    };

    var vdhReport = function (url, source) {
      if (!source) source = "dom";
      if (!url) return;
      if (String(url).toLowerCase().indexOf("preview") !== -1) return;
      if (!vdhIsDownloadableUrl(url)) return;
      try {
        if (!chrome || !chrome.runtime || !chrome.runtime.id) return;
        chrome.runtime.sendMessage({ type: "content-media-candidate", url: url, source: source }, function () {
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

    var vdhScanDom = function () {
      try {
        var elements = document.querySelectorAll(vdhSelector);
        for (var i = 0; i < elements.length; i++) {
          var element = elements[i];
          vdhReport(element.currentSrc || element.src || element.href, "dom");
        }
      } catch (error) {
        // Ignore transient DOM access errors during navigation.
      }
    };

    var vdhScanPerformance = function () {
      try {
        var entries = performance.getEntriesByType("resource");
        for (var i = 0; i < entries.length; i++) {
          if (vdhMediaPattern.test(entries[i].name)) vdhReport(entries[i].name, "performance");
        }
      } catch (error) {
        // Ignore transient performance API errors.
      }
    };

    var vdhScanAll = function () {
      vdhScanDom();
      vdhScanPerformance();
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
      vdhScanAll();
      return;
    }

    globalThis.__vdhLiteContentInstalled = true;
    vdhScanAll();
    vdhInstallBridge();

    try {
      var root = document.documentElement || document.body;
      if (root) {
        new MutationObserver(vdhScanAll).observe(root, {
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
