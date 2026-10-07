import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || ".");
const SKIP_DIRS = new Set(["wp-content", "wp-includes", "_tools", "node_modules", ".git", ".vercel", "cms"]);
const MARK = "Bakersfield Office";

const icon = (name) =>
  `<span class="elementor-icon-list-icon"><i aria-hidden="true" class="icofont icofont-${name}"></i></span>`;

const item = (iconName, text, href) => {
  const inner = `${icon(iconName)}<span class="elementor-icon-list-text">${text}</span>`;
  return `<li class="elementor-icon-list-item">${href ? `<a href="${href}">${inner}</a>` : inner}</li>`;
};

const office = (name) =>
  `<li class="elementor-icon-list-item" style="margin-top:10px;"><span class="elementor-icon-list-text" style="font-weight:700;color:#fff;">${name}</span></li>`;

const locations = `<ul class="elementor-icon-list-items">
${office("Taft Office")}
${item("google-map", "702 Garratt Street Taft, CA 93268")}
${item("envelope", "support@landscapingbyjimenez.com", "mailto:support@landscapingbyjimenez.com")}
${item("telephone", "Main Line: (805) 444-9837", "tel:+18054449837")}
${office("Bakersfield Office")}
${item("google-map", "13710 Ivory Chalice Dr<br>Bakersfield, CA 93314<br>United States")}
${item("telephone", "Main Line: (805) 444-9837", "tel:+18054449837")}
</ul>`;

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await htmlFiles(path.join(dir, entry.name))));
    } else if (entry.name === "index.html") out.push(path.join(dir, entry.name));
  }
  return out;
}

const heading = /(elementor-element-2e2ed25e[\s\S]*?<h2 class="elementor-heading-title[^"]*">)Contact Us(<\/h2>)/;
const list = /(elementor-element-31a86824[\s\S]*?<div class="elementor-widget-container">\s*)<ul class="elementor-icon-list-items">[\s\S]*?<\/ul>/;

let updated = 0;
const missed = [];
for (const file of await htmlFiles(ROOT)) {
  const before = await fs.readFile(file, "utf8");
  if (before.includes(MARK)) continue;
  if (!heading.test(before) || !list.test(before)) {
    missed.push(path.relative(ROOT, file));
    continue;
  }
  const after = before.replace(heading, "$1Locations$2").replace(list, `$1${locations}`);
  await fs.writeFile(file, after);
  updated++;
}
console.log(`pages updated: ${updated}`);
if (missed.length) console.log(`footer not found in: ${missed.join(", ")}`);
