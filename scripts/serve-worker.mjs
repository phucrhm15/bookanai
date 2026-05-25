/**
 * Production HTTP server for Render/VPS — serves the built TanStack worker on Node.
 * Faster startup than `vite dev` (avoids Render health-check timeout).
 */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const root = path.dirname(fileURLToPath(import.meta.url));
const entry = pathToFileURL(path.join(root, "..", "dist", "server", "index.js")).href;

const { default: handler } = await import(entry);

function toWebRequest(req) {
  const hostHeader = req.headers.host ?? `localhost:${port}`;
  const url = `http://${hostHeader}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function writeResponse(webRes, res) {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  if (webRes.body) {
    Readable.fromWeb(webRes.body).pipe(res);
  } else {
    res.end();
  }
}

const server = createServer(async (req, res) => {
  try {
    const response = await handler.fetch(toWebRequest(req), process.env, {
      waitUntil: (promise) => {
        promise.catch((err) => console.error("[waitUntil]", err));
      },
    });
    await writeResponse(response, res);
  } catch (err) {
    console.error("[serve-worker]", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Internal Server Error");
    }
  }
});

server.listen(port, host, () => {
  console.log(`[serve-worker] listening on http://${host}:${port}`);
});
