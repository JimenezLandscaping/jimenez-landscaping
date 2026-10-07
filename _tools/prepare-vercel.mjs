import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || ".");
const ORIGIN = "https://landscapingbyjimenez.com";
const SKIP_DIRS = new Set(["wp-content", "wp-includes", "_tools", "node_modules", ".git", ".vercel", "cms"]);
const CREDIT_MARK = "cms-credit";

const credit = `
<div class="${CREDIT_MARK}" style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:14px 16px 18px;font-family:Roboto,sans-serif;font-size:14px;color:#cfcfcf;text-align:center;">
  <span>Site design by</span>
  <a href="https://contractormarketingshop.com" target="_blank" rel="noopener" aria-label="The Contractor Marketing Shop" style="display:inline-flex;"><img src="/cms/cms-logo.png" alt="The Contractor Marketing Shop" style="height:42px;width:auto;" onerror="this.remove()"></a>
</div>`;

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await htmlFiles(path.join(dir, entry.name))));
    } else if (entry.name === "index.html") out.push(path.join(dir, entry.name));
  }
  return out;
}

function addCredit(html) {
  if (html.includes(CREDIT_MARK)) return html;
  const copyright = /(<h2[^>]*>\s*Copyright &copy;[^<]*<\/h2>\s*<\/div>)/;
  if (copyright.test(html)) return html.replace(copyright, `$1${credit}`);
  return html.replace(/<\/body>/i, `${credit}\n</body>`);
}

function absoluteMeta(html) {
  return html
    .replace(/(<link[^>]+rel=["']canonical["'][^>]+href=["'])(\/[^"']*)/i, `$1${ORIGIN}$2`)
    .replace(/(<meta[^>]+property=["']og:url["'][^>]+content=["'])(\/[^"']*)/i, `$1${ORIGIN}$2`)
    .replace(/(<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["'])(\/[^"']*)/gi, `$1${ORIGIN}$2`)
    .replace(/(<meta[^>]+name=["']twitter:image["'][^>]+content=["'])(\/[^"']*)/i, `$1${ORIGIN}$2`);
}

// Elementor loads widget scripts on demand, so they never appear in the HTML.
// Pull every chunk named in the runtimes so the Vercel build is self-contained.
async function fetchChunks() {
  const bases = [
    "wp-content/plugins/elementor/assets/js",
    "wp-content/plugins/elementor-pro/assets/js",
  ];
  let added = 0;
  for (const base of bases) {
    const dir = path.join(ROOT, ...base.split("/"));
    const sources = (await fs.readdir(dir).catch(() => []))
      .filter((f) => /runtime.*\.min\.js$|^frontend.*\.min\.js$/.test(f));
    const names = new Set();
    for (const f of sources) {
      const text = await fs.readFile(path.join(dir, f), "utf8");
      for (const m of text.matchAll(/["'`]((?:chunks\/)?[\w.-]+?\.(?:bundle\.)?min\.js)["'`]/g)) names.add(m[1]);
    }
    for (const name of names) {
      const candidates = name.startsWith("chunks/") ? [name] : [name, `chunks/${name}`];
      for (const rel of candidates) {
        const file = path.join(dir, ...rel.split("/"));
        if (await fs.stat(file).catch(() => null)) break;
        const res = await fetch(`${ORIGIN}/${base}/${rel}`).catch(() => null);
        if (!res || !res.ok) continue;
        await fs.mkdir(path.dirname(file), { recursive: true });
        const text = (await res.text()).replace(/https?:\/\/(?:www\.)?landscapingbyjimenez\.com/gi, "");
        await fs.writeFile(file, text);
        added++;
        break;
      }
    }
  }
  return added;
}

const files = await htmlFiles(ROOT);
const urls = [];
for (const file of files) {
  const before = await fs.readFile(file, "utf8");
  const after = absoluteMeta(addCredit(before));
  if (after !== before) await fs.writeFile(file, after);
  const rel = path.relative(ROOT, path.dirname(file)).split(path.sep).join("/");
  urls.push(rel ? `${ORIGIN}/${rel}/` : `${ORIGIN}/`);
}

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.sort().map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
await fs.writeFile(path.join(ROOT, "sitemap.xml"), sitemap);
await fs.writeFile(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
await fs.mkdir(path.join(ROOT, "cms"), { recursive: true });

const chunks = await fetchChunks();
console.log(`pages updated: ${files.length}`);
console.log(`elementor chunks added: ${chunks}`);
console.log(`sitemap urls: ${urls.length}`);
