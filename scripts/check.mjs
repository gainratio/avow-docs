/**
 * Deployment gate for the Avow docs site.
 * Fails on missing metadata, broken internal links, missing sitemap entries, or missing assets.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PAGES = ["", "docs/", "examples/", "security/", "changelog/"];
const issues = [];
const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");

function route(path) {
  return path === "" ? "/" : `/${path}`;
}

for (const path of PAGES) {
  const file = join(ROOT, path, "index.html");
  if (!existsSync(file)) {
    issues.push(`missing page ${file}`);
    continue;
  }
  const html = readFileSync(file, "utf8");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const description = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1]?.trim() ?? "";
  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] ?? "";
  const h1s = html.match(/<h1\b/gi)?.length ?? 0;
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const expected = `https://avow.gainratio.com${route(path)}`;

  if (title.length < 20 || title.length > 75) issues.push(`${route(path)} title length ${title.length}`);
  if (description.length < 50 || description.length > 170) issues.push(`${route(path)} description length ${description.length}`);
  if (canonical !== expected) issues.push(`${route(path)} canonical ${canonical}`);
  if (h1s !== 1) issues.push(`${route(path)} h1 count ${h1s}`);
  if (!html.includes("application/ld+json")) issues.push(`${route(path)} missing JSON-LD`);
  if (!sitemap.includes(`<loc>${expected}</loc>`)) issues.push(`${route(path)} missing from sitemap`);
  if (ids.length !== new Set(ids).size) issues.push(`${route(path)} duplicate id`);
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (href.startsWith("#") && href.length > 1 && !ids.includes(href.slice(1))) {
      issues.push(`${route(path)} missing anchor ${href}`);
    }
    if (href.startsWith("/") && href.includes("#")) {
      const [targetPath, anchor] = href.split("#");
      const targetFile = join(ROOT, targetPath, "index.html");
      if (existsSync(targetFile) && !readFileSync(targetFile, "utf8").includes(`id="${anchor}"`)) {
        issues.push(`${route(path)} missing anchor ${href}`);
      }
    }
  }
  for (const link of html.matchAll(/href="(\/[^"#?]*\/?)"/g)) {
    const target = link[1];
    if (target === "/") continue;
    if (target.startsWith("/assets/")) {
      if (!existsSync(join(ROOT, target))) issues.push(`${route(path)} missing asset ${target}`);
      continue;
    }
    if (!existsSync(join(ROOT, target, "index.html"))) issues.push(`${route(path)} broken link ${target}`);
  }
}

for (const asset of ["assets/site.css", "assets/verify.js", "assets/favicon.svg", "robots.txt", "_headers"]) {
  if (!existsSync(join(ROOT, asset))) issues.push(`missing ${asset}`);
}

if (issues.length > 0) {
  console.error(`Avow site contract failed (${issues.length}):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`Avow site contract passed: ${PAGES.length} pages, metadata, JSON-LD, sitemap, links, anchors, assets.`);
