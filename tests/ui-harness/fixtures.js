const THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90' viewBox='0 0 160 90'%3E%3Crect width='160' height='90' fill='%230f6f83'/%3E%3Cpath d='M68 28v34l30-17z' fill='white'/%3E%3C/svg%3E";

const baseTab = {
  id: 42,
  title: "Sample Cooking Stream - Example Video",
  url: "https://watch.example.test/videos/sample-cooking-stream"
};

const hlsItem = {
  url: "https://cdn.example.test/hls/sample-cooking-stream/1080p/master.m3u8?token=abc",
  type: "xmlhttprequest",
  contentType: "application/vnd.apple.mpegurl",
  quality: "1080P",
  qualities: ["1080P", "720P", "480P"],
  thumbnail: THUMBNAIL,
  originUrl: baseTab.url,
  requestHeaders: {
    referer: baseTab.url
  },
  timeStamp: 1000
};

const hlsVariantItem = {
  url: "https://cdn.example.test/hls/sample-cooking-stream/720p/master.m3u8?token=def",
  type: "xmlhttprequest",
  contentType: "application/x-mpegurl",
  quality: "720P",
  qualities: ["720P", "480P"],
  originUrl: baseTab.url,
  requestHeaders: {
    referer: baseTab.url
  },
  timeStamp: 990
};

const mp4Item = {
  url: "https://media.example.test/downloads/sample-cooking-stream-720p.mp4",
  type: "media",
  contentType: "video/mp4",
  quality: "720P",
  originUrl: baseTab.url,
  timeStamp: 900
};

const audioItem = {
  url: "https://audio.example.test/podcast/sample-cooking-stream-128k.mp3",
  type: "media",
  contentType: "audio/mpeg",
  quality: "Audio",
  originUrl: baseTab.url,
  timeStamp: 820
};

export const SCENARIOS = {
  empty: {
    label: "Empty",
    tab: baseTab,
    items: [],
    jobs: []
  },
  detected: {
    label: "Detected media",
    tab: baseTab,
    items: [hlsItem, hlsVariantItem, mp4Item, audioItem],
    jobs: []
  },
  active: {
    label: "Active download",
    tab: baseTab,
    items: [hlsItem, hlsVariantItem, mp4Item],
    jobs: [
      {
        id: "job-active",
        pid: 1234,
        status: "running",
        running: true,
        title: "Sample Cooking Stream",
        host: "cdn.example.test",
        quality: "1080P",
        url: hlsItem.url,
        percent: 42.5,
        speedText: "3.20 MB/s",
        etaText: "00:18",
        phase: "downloading",
        startedAt: "2026-06-11T10:00:00"
      }
    ]
  },
  failed: {
    label: "Failed download",
    tab: baseTab,
    items: [hlsItem, mp4Item],
    jobs: [
      {
        id: "job-failed",
        pid: 4321,
        status: "failed",
        running: false,
        title: "Sample Cooking Stream",
        host: "cdn.example.test",
        quality: "1080P",
        url: hlsItem.url,
        percent: 13,
        phase: "failed",
        errorCategory: "auth-required",
        errorLabel: "Sign-in or cookies required",
        errorSummary: "The site rejected the request or needs a signed-in browser session.",
        nextAction: "Open the page in the browser, confirm it plays, then retry.",
        retryable: false,
        lastError: "ERROR: HTTP Error 403: Forbidden",
        elapsedText: "0:09",
        startedAt: "2026-06-11T10:00:00"
      }
    ]
  },
  finished: {
    label: "Finished download",
    tab: baseTab,
    items: [hlsItem, mp4Item],
    jobs: [
      {
        id: "job-finished",
        pid: 5678,
        status: "finished",
        running: false,
        title: "Sample Cooking Stream",
        host: "cdn.example.test",
        quality: "720P",
        url: mp4Item.url,
        percent: 100,
        phase: "finished",
        finalPath: "C:\\Users\\demo\\Downloads\\VDH Lite\\Sample Cooking Stream - abc123.mp4",
        elapsedText: "1:22",
        startedAt: "2026-06-11T10:00:00",
        finishedAt: "2026-06-11T10:01:22"
      }
    ]
  }
};
