/**
 * Production HTTP for Render/VPS — listen immediately, lazy-load worker (saves RAM on 512MB).
 */
import "./polyfill-cjs-globals.mjs";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const root = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(root, "..");
const clientRoot = path.join(appRoot, "dist", "client");
const entry = pathToFileURL(path.join(appRoot, "dist", "server", "index.js")).href;

let handlerPromise;
let handlerError;

function getHandler() {
  if (handlerError) return Promise.reject(handlerError);
  if (!handlerPromise) {
    handlerPromise = import(entry)
      .then((mod) => {
        console.log("[serve-worker] app bundle loaded");
        return mod.default;
      })
      .catch((err) => {
        handlerError = err;
        console.error("[serve-worker] failed to load app bundle:", err);
        throw err;
      });
  }
  return handlerPromise;
}

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function tryServeStatic(pathname, res) {
  if (
    !pathname.startsWith("/assets/") &&
    pathname !== "/favicon.ico" &&
    !pathname.startsWith("/fonts/")
  ) {
    return false;
  }

  const relative = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const filePath = path.resolve(clientRoot, relative);
  const clientResolved = path.resolve(clientRoot);

  if (filePath !== clientResolved && !filePath.startsWith(`${clientResolved}${path.sep}`)) {
    return false;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  res.statusCode = 200;
  res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
  res.setHeader("cache-control", "public, max-age=31536000, immutable");
  res.end(body);
  return true;
}

function sendHealth(res) {
  const hasClient = fs.existsSync(clientRoot);
  const hasServer = fs.existsSync(path.join(appRoot, "dist", "server", "index.js"));
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      hasClientAssets: hasClient,
      hasServerBundle: hasServer,
      bundleLoaded: Boolean(handlerPromise && !handlerError),
      timestamp: new Date().toISOString(),
    }),
  );
}

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
    const stream = Readable.fromWeb(webRes.body);
    stream.on("error", (err) => {
      console.error("[serve-worker] response stream error:", err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    stream.pipe(res);
  } else {
    res.end();
  }
}

process.on("uncaughtException", (err) => {
  console.error("[serve-worker] uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[serve-worker] unhandledRejection:", err);
});

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;

    if (pathname === "/api/health" && (req.method === "GET" || req.method === "HEAD")) {
      sendHealth(res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      if (tryServeStatic(pathname, res)) return;
    }

    const handler = await getHandler();
    const response = await handler.fetch(toWebRequest(req), process.env, {
      waitUntil: (promise) => {
        promise.catch((err) => console.error("[waitUntil]", err));
      },
    });
    await writeResponse(response, res);
  } catch (err) {
    console.error("[serve-worker] request error:", err);
    if (!res.headersSent) {
      res.statusCode = handlerError ? 503 : 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(handlerError ? "App is starting or failed to load. Retry in a moment." : "Internal Server Error");
    }
  }
});

server.listen(port, host, () => {
  console.log(`[serve-worker] listening on http://${host}:${port}`);
  console.log(`[serve-worker] client: ${fs.existsSync(clientRoot) ? "ok" : "MISSING"}`);
  // Warm bundle in background (non-blocking for Render port bind)
  getHandler().catch(() => {});
});
