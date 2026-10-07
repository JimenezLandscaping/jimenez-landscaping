import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || ".");
const PORT = Number(process.argv[3] || 8765);
const ORIGIN = "https://landscapingbyjimenez.com";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".xml": "application/xml",
};

const rewrite = (text) =>
  text
    .replace(/https?:\\\/\\\/(?:www\.)?landscapingbyjimenez\.com/gi, "")
    .replace(/https?:\/\/(?:www\.)?landscapingbyjimenez\.com/gi, "");

// Lazy-loaded Elementor chunks never appear in the HTML, so the first local
// request for a missing theme/plugin file is filled from the live site and kept.
async function backfill(pathname, search, file) {
  if (!pathname.startsWith("/wp-content/") && !pathname.startsWith("/wp-includes/")) return null;
  const res = await fetch(ORIGIN + pathname + search).catch(() => null);
  if (!res || !res.ok) return null;
  let data = Buffer.from(await res.arrayBuffer());
  if (/\.(css|js|mjs|svg|json)$/i.test(pathname)) data = Buffer.from(rewrite(data.toString("utf8")));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  console.log(`backfilled ${pathname}`);
  return data;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    let rel = pathname.endsWith("/") ? pathname + "index.html" : pathname;
    let file = path.resolve(ROOT, "." + rel);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    let data = await fs.readFile(file).catch(() => null);
    if (!data && !path.extname(rel)) {
      file = path.join(file, "index.html");
      data = await fs.readFile(file).catch(() => null);
    }
    if (!data) data = await backfill(pathname, url.search, file);
    if (!data) {
      console.log(`404 ${pathname}`);
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  })
  .listen(PORT, () => console.log(`ready http://localhost:${PORT}`));
