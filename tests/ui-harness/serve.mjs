import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

export function createHarnessServer({ root = process.cwd(), port = 4177 } = {}) {
  const rootDir = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      const pathname = url.pathname === "/" ? "/tests/ui-harness/index.html" : url.pathname;
      const candidate = normalize(join(rootDir, decodeURIComponent(pathname)));
      if (!candidate.startsWith(rootDir)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const body = await readFile(candidate);
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(candidate)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end(error.code === "ENOENT" ? "Not found" : String(error.stack || error));
    }
  });

  return new Promise((resolveServer) => {
    server.listen(port, "127.0.0.1", () => resolveServer(server));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || process.argv[2] || 4177);
  const server = await createHarnessServer({ port });
  const address = server.address();
  console.log(`VDH Lite UI harness: http://127.0.0.1:${address.port}/tests/ui-harness/index.html`);
}
