import assert from "node:assert/strict";
import { createHarnessServer } from "./serve.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Install it or run this harness through the Codex Browser plugin.");
  process.exit(2);
}

const server = await createHarnessServer({ port: 0 });
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/tests/ui-harness/index.html`;
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 520, height: 720 } });

  await page.goto(`${baseUrl}?scenario=detected`);
  await page.waitForSelector(".media-card");
  assert.equal(await page.locator(".media-card").count(), 3);
  assert.equal(await page.locator(".media-quality-select").count(), 3);
  assert.match(await page.locator("#media-summary").innerText(), /3 candidates grouped from 4 sources/);

  await page.locator("#settings-toggle").click();
  await page.locator("#language-select").selectOption("zh-Hant");
  assert.equal(await page.locator("#settings-panel .section-heading").innerText(), "設定");
  assert.equal(await page.locator("#refresh").innerText(), "重新整理");
  assert.match(await page.locator("#media-summary").innerText(), /3 個候選項目，來自 4 個來源/);
  await page.locator("#language-select").selectOption("en");
  assert.equal(await page.locator("#refresh").innerText(), "Refresh");

  await page.locator(".media-card").first().locator("button", { hasText: "Details" }).click();
  assert.equal(await page.locator("#command-panel").isVisible(), true);
  assert.match(await page.locator("#command-output").inputValue(), /URLs:/);

  await page.locator(".media-card").first().locator("button", { hasText: "Formats" }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".media-quality-select option")].some((option) =>
      option.textContent.includes("yt-dlp")
    )
  );
  assert.match(await page.locator(".media-card").first().locator(".media-title strong").innerText(), /\(yt-dlp\)/);
  assert.match(await page.locator(".media-card").first().locator(".badge.success").innerText(), /yt-dlp/);
  const discoveredDataset = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  assert.equal(discoveredDataset.harnessLastDiscoveryUrl, "https://watch.example.test/videos/sample-cooking-stream");

  await page.locator(".media-card").first().locator("button", { hasText: "Download" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.harnessLastDownloadFormatSelector === "bv*+ba/b");
  const discoveredPayload = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  assert.equal(discoveredPayload.harnessLastDownloadUrl, "https://watch.example.test/videos/sample-cooking-stream");
  assert.equal(discoveredPayload.harnessLastDownloadFormatSelector, "bv*+ba/b");
  assert.equal(discoveredPayload.harnessLastDownloadFormatLabel, "Best available");
  assert.equal(await page.locator(".job .inline-action", { hasText: "Cancel" }).innerText(), "Cancel");
  await page.locator(".job .inline-action", { hasText: "Cancel" }).click();
  await page.waitForSelector(".job.stopped");
  assert.equal(await page.locator(".job.stopped .inline-action", { hasText: "Retry" }).innerText(), "Retry");

  await page.goto(`${baseUrl}?scenario=failed`);
  await page.waitForSelector(".media-card.failed");
  await page.locator("[data-filter='failed']").click();
  assert.equal(await page.locator(".media-card.failed").count(), 1);
  assert.equal(await page.locator(".media-card.failed button").first().innerText(), "Retry");
  await page.waitForSelector(".job-guidance");
  assert.match(await page.locator(".job-guidance").innerText(), /Sign-in or cookies required/);
  assert.equal(await page.locator(".job .inline-action").innerText(), "Copy diagnostics");

  await page.goto(`${baseUrl}?scenario=empty`);
  await page.waitForSelector(".empty-state");
  assert.match(await page.locator("#media-summary").innerText(), /No candidates found/);

  await page.goto(`${baseUrl}?scenario=finished`);
  await page.waitForSelector(".job-path");
  assert.match(await page.locator(".job-path").innerText(), /Saved:/);
} finally {
  await browser.close();
  server.close();
}

console.log("UI harness smoke test passed.");
