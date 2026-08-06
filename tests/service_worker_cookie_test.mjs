import assert from "node:assert/strict";

let onMessage;
let nativePayload;
const cookieQueries = [];

globalThis.chrome = {
  action: {
    setBadgeText() {},
    setBadgeBackgroundColor() {}
  },
  cookies: {
    getAll(details, callback) {
      cookieQueries.push({ ...details });
      const host = new URL(details.url).hostname;
      callback(host === "authenticated-media.example"
        ? [{ name: "media_session", value: "media-secret" }]
        : []);
    }
  },
  runtime: {
    lastError: null,
    getManifest() {
      return { name: "VDH Lite", version: "test", manifest_version: 3 };
    },
    onMessage: {
      addListener(listener) {
        onMessage = listener;
      }
    },
    sendNativeMessage(_host, payload, callback) {
      nativePayload = payload;
      callback({ ok: true });
    }
  },
  tabs: {
    query(_query, callback) {
      callback([{ id: 1, url: "https://page.example/watch" }]);
    },
    onRemoved: { addListener() {} }
  },
  webRequest: {
    onResponseStarted: { addListener() {} },
    onBeforeSendHeaders: { addListener() {} }
  },
  downloads: { download() {} }
};

await import(new URL("../extension/src/service_worker.js", import.meta.url).href);

function send(message) {
  return new Promise((resolve, reject) => {
    try {
      const keepAlive = onMessage(message, {}, resolve);
      assert.equal(keepAlive, true);
    } catch (error) {
      reject(error);
    }
  });
}

await send({
  type: "native-download",
  url: "https://public-media.example/video.m3u8",
  referer: "https://page.example/watch",
  originUrl: "https://page.example/watch"
});

assert.equal(nativePayload.requestHeaders.cookie, undefined);
assert.ok(cookieQueries.length > 0);
assert.ok(cookieQueries.every((query) => new URL(query.url).hostname === "public-media.example"));

cookieQueries.length = 0;
await send({
  type: "native-download",
  url: "https://authenticated-media.example/video.m3u8",
  referer: "https://page.example/watch",
  originUrl: "https://page.example/watch"
});

assert.equal(nativePayload.requestHeaders.cookie, "media_session=media-secret");
assert.ok(cookieQueries.every((query) => new URL(query.url).hostname === "authenticated-media.example"));

console.log("Service worker cookie isolation test passed.");
