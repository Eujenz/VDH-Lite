(function installVdhLitePageProbe() {
  if (window.__vdhLitePageProbeInstalled) return;
  window.__vdhLitePageProbeInstalled = true;

  const MEDIA_URL_PATTERN = /\.(m3u8|mpd|mp4|webm|m4a|mp3|mov|ts)(\?|#|$)/i;

  function post(url, kind) {
    if (typeof url !== "string" || !MEDIA_URL_PATTERN.test(url)) return;
    window.postMessage({
      source: "vdh-lite-page-probe",
      kind,
      url
    }, "*");
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function patchedFetch(input, init) {
      const url = typeof input === "string" ? input : input?.url;
      post(url, "fetch");
      return originalFetch.call(this, input, init);
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    post(url, "xhr");
    return originalOpen.apply(this, arguments);
  };
})();
