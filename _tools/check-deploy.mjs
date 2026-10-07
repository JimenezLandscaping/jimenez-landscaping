import fs from "node:fs/promises";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
const sitemap = await fs.readFile("sitemap.xml", "utf8");
const paths = [...sitemap.matchAll(/<loc>https:\/\/landscapingbyjimenez\.com([^<]*)<\/loc>/g)].map((m) => m[1]);

const assets = new Set();
const problems = [];
for (const p of paths) {
  const res = await fetch(BASE + p);
  const html = res.ok ? await res.text() : "";
  const checks = {
    status: res.status === 200,
    credit: html.includes("Site design by</span>"),
    logoLink: html.includes('href="https://contractormarketingshop.com"'),
    year: html.includes("Copyright &copy; 2026"),
    noPowered: !html.includes("Powered by Jimenez"),
    noTypo: !/Lisenced|CONSULATION/.test(html),
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  console.log(`${failed.length ? "FAIL" : "ok  "} ${res.status} ${p}${failed.length ? "  -> " + failed.join(", ") : ""}`);
  if (failed.length) problems.push(p);
  for (const m of html.matchAll(/(?:src|href)=["'](\/(?:wp-content|wp-includes|cms)\/[^"'?#]+)/g)) assets.add(m[1]);
}

const missing = [];
const list = [...assets];
for (let i = 0; i < list.length; i += 20) {
  await Promise.all(
    list.slice(i, i + 20).map(async (a) => {
      const r = await fetch(BASE + a, { method: "HEAD" });
      if (!r.ok) missing.push(`${r.status} ${a}`);
    })
  );
}

console.log(`\npages checked: ${paths.length}, page problems: ${problems.length}`);
console.log(`linked files checked: ${list.length}, missing: ${missing.length}`);
missing.slice(0, 40).forEach((m) => console.log("  " + m));
