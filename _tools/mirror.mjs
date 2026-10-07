import fs from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://landscapingbyjimenez.com";
const HOST = "landscapingbyjimenez.com";
const OUT = path.resolve(process.argv[2] || ".");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const SKIP_PAGE = /(\/feed\/?$|\/wp-json|\/wp-admin|xmlrpc\.php|wp-login\.php|\/embed\/?$)/;
const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|json|mp4|webm|pdf|xml|xsl)$/i;
const TEXT_ASSET = /\.(css|js|mjs|svg|json)$/i;

const pageQueue = ["/"];
const seenPages = new Set();
const seenAssets = new Set();
const assetQueue = [];
const failures = [];

const normalize = (raw) =>
  raw.replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/\\+$/, "").trim();

function parse(raw, base) {
  if (!raw || /^(data:|mailto:|tel:|javascript:|#)/i.test(raw)) return null;
  try {
    const u = new URL(normalize(raw), base);
    if (u.hostname.replace(/^www\./, "") !== HOST) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

const isAsset = (u) =>
  u.pathname.startsWith("/wp-content/") || u.pathname.startsWith("/wp-includes/") || ASSET_EXT.test(u.pathname);

function enqueue(u) {
  if (isAsset(u)) {
    if (!seenAssets.has(u.pathname)) {
      seenAssets.add(u.pathname);
      assetQueue.push(u.origin + u.pathname + u.search);
    }
    return;
  }
  if (u.search || SKIP_PAGE.test(u.pathname)) return;
  let p = u.pathname.endsWith("/") ? u.pathname : u.pathname + "/";
  if (!seenPages.has(p) && !pageQueue.includes(p)) pageQueue.push(p);
}

function localFile(pathname, page) {
  let p = decodeURIComponent(pathname);
  if (page) p = (p.endsWith("/") ? p : p + "/") + "index.html";
  else if (p.endsWith("/")) p += "index.html";
  return path.join(OUT, ...p.split("/").filter(Boolean));
}

function rewrite(text) {
  return text
    .replace(/(["'])https?:\\\/\\\/(?:www\.)?landscapingbyjimenez\.com\1/gi, "$1\\/$1")
    .replace(/(["'])https?:\/\/(?:www\.)?landscapingbyjimenez\.com\1/gi, "$1/$1")
    .replace(/https?:\\\/\\\/(?:www\.)?landscapingbyjimenez\.com/gi, "")
    .replace(/https?:\/\/(?:www\.)?landscapingbyjimenez\.com/gi, "")
    .replace(/(["'(\s])\/\/(?:www\.)?landscapingbyjimenez\.com/gi, "$1");
}

function collect(text, base) {
  const found = new Set();
  let m;
  const attr = /(?:src|href|data-src|data-lazy-src|data-bg|data-background|data-url|poster|action)\s*=\s*["']([^"']+)["']/gi;
  while ((m = attr.exec(text))) found.add(m[1]);
  const sets = /(?:srcset|data-srcset|data-lazy-srcset)\s*=\s*["']([^"']+)["']/gi;
  while ((m = sets.exec(text)))
    m[1].split(",").forEach((s) => {
      const t = s.trim().split(/\s+/)[0];
      if (t) found.add(t);
    });
  const css = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;
  while ((m = css.exec(text))) found.add(m[1]);
  const imp = /@import\s+['"]([^'"]+)['"]/gi;
  while ((m = imp.exec(text))) found.add(m[1]);
  const abs = /https?:\\?\/\\?\/(?:www\.)?landscapingbyjimenez\.com[^"'\s<>)]*/gi;
  while ((m = abs.exec(text))) found.add(m[0]);
  for (const raw of found) {
    const u = parse(raw, base);
    if (u) enqueue(u);
  }
}

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      return await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    } catch (e) {
      if (i === 2) throw e;
    }
  }
}

async function save(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

async function seedSitemaps(url, depth = 0) {
  if (depth > 2) return;
  try {
    const res = await get(url);
    if (!res.ok) return;
    const xml = await res.text();
    for (const [, loc] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      if (/\.xml$/i.test(loc)) await seedSitemaps(loc, depth + 1);
      else {
        const u = parse(loc, ORIGIN);
        if (u) enqueue(u);
      }
    }
  } catch {}
}

async function crawlPages() {
  while (pageQueue.length && seenPages.size < 250) {
    const p = pageQueue.shift();
    if (seenPages.has(p)) continue;
    seenPages.add(p);
    try {
      const res = await get(ORIGIN + p);
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.includes("text/html")) {
        failures.push(`page ${res.status} ${p}`);
        continue;
      }
      const html = await res.text();
      collect(html, ORIGIN + p);
      await save(localFile(p, true), rewrite(html));
      console.log(`page ${p}`);
    } catch (e) {
      failures.push(`page ERR ${p} ${e.message}`);
    }
  }
}

async function downloadAssets() {
  const worker = async () => {
    while (assetQueue.length) {
      const url = assetQueue.shift();
      const u = new URL(url);
      try {
        const res = await get(url);
        if (!res.ok) {
          failures.push(`asset ${res.status} ${u.pathname}`);
          continue;
        }
        const file = localFile(u.pathname, false);
        if (TEXT_ASSET.test(u.pathname)) {
          const text = await res.text();
          if (/\.css$/i.test(u.pathname)) collect(text, url);
          await save(file, rewrite(text));
        } else {
          await save(file, Buffer.from(await res.arrayBuffer()));
        }
      } catch (e) {
        failures.push(`asset ERR ${u.pathname} ${e.message}`);
      }
    }
  };
  while (assetQueue.length) await Promise.all(Array.from({ length: 10 }, worker));
}

await seedSitemaps(`${ORIGIN}/sitemap_index.xml`);
await seedSitemaps(`${ORIGIN}/page-sitemap.xml`);
await seedSitemaps(`${ORIGIN}/post-sitemap.xml`);
await crawlPages();
await downloadAssets();

console.log(`\nPAGES ${seenPages.size}  ASSETS ${seenAssets.size}  FAILURES ${failures.length}`);
for (const f of failures) console.log("  " + f);
