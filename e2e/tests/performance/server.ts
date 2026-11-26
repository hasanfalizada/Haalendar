// +++===+++ 2026-11-26 17:40 +04 — Hasan Alizada — HAAL-143 (D-128). A server for the measurements: the files of the
// production build (frontend/dist) gzip-compressed, as the installation's Caddy sends them (`vite preview` sends them
// uncompressed, which a slow network would count against the app); everything else — the pages' fallback and the
// API — goes to the preview server, with the request's Origin set to the preview's own (the API's CSRF check).
import { readFileSync, statSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = resolve(fileURLToPath(import.meta.url), "../../../../frontend/dist");
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

export interface Measured {
  url: string;
  close: () => Promise<void>;
}

export async function serveBuild(preview: string): Promise<Measured> {
  const target = new URL(preview);
  const compressed = new Map<string, Buffer>();
  const server: Server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/"));
    const file = join(DIST, path);
    const isAsset = path !== "/" && file.startsWith(DIST) && statSync(file, { throwIfNoEntry: false })?.isFile();
    if (isAsset && path !== "/index.html" && !path.endsWith("sw.js")) {
      const type = TYPES[extname(file)] ?? "application/octet-stream";
      const zip = !/^(image\/png|font\/woff2)$/.test(type);
      let body = compressed.get(file);
      if (!body) {
        const raw = readFileSync(file);
        body = zip ? gzipSync(raw, { level: 6 }) : raw;
        compressed.set(file, body);
      }
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "public, max-age=31536000, immutable",
        ...(zip ? { "content-encoding": "gzip" } : {}),
      });
      res.end(body);
      return;
    }
    const headers = { ...req.headers, host: target.host, ...(req.headers.origin ? { origin: target.origin } : {}) };
    const forward = request(
      { host: target.hostname, port: target.port, path: req.url, method: req.method, headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    forward.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(forward);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://localhost:${String(port)}`,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(() => {
          done();
        });
      }),
  };
}
