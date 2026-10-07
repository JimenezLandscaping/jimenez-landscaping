// Run this once the real domain (landscapingbyjimenez.com) points at Vercel:
//   node _tools/remove-noindex.mjs
// It removes the temporary noindex: the X-Robots-Tag header in vercel.json
// and the noindex robots meta tag (marked TEMP-NOINDEX) on every page.
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SKIP = new Set(["wp-content", "wp-includes", "_tools", "node_modules", ".git", ".vercel", "cms"]);

const vercelPath = path.join(ROOT, "vercel.json");
const vercel = JSON.parse(await fs.readFile(vercelPath, "utf8"));
vercel.headers = (vercel.headers || []).filter(
  (h) => !(h.headers || []).some((x) => x.key === "X-Robots-Tag"),
);
await fs.writeFile(vercelPath, JSON.stringify(vercel, null, 2) + "\n");

async function pages(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) out.push(...(await pages(path.join(dir, e.name)))); }
    else if (e.name === "index.html") out.push(path.join(dir, e.name));
  }
  return out;
}
let n = 0;
for (const f of await pages(ROOT)) {
  const s = await fs.readFile(f, "utf8");
  const t = s.replace(/content="noindex, follow, ([^"]*)"\/><!-- TEMP-NOINDEX -->/g, 'content="index, follow, $1"/>');
  if (t !== s) { await fs.writeFile(f, t); n++; }
}
console.log(`vercel.json header removed; pages restored to index: ${n}`);
