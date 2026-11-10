import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE, tamperPayloadText, verify } from "../assets/verify.js";

const root = process.cwd();
const pages = [
  ["index.html", "https://avow.gainratio.com/"],
  ["docs/index.html", "https://avow.gainratio.com/docs/"],
  ["examples/index.html", "https://avow.gainratio.com/examples/"],
  ["security/index.html", "https://avow.gainratio.com/security/"],
  ["changelog/index.html", "https://avow.gainratio.com/changelog/"],
];

const failures = [];
function must(condition, message) {
  if (!condition) failures.push(message);
}

const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
const robots = readFileSync(join(root, "robots.txt"), "utf8");
const headers = readFileSync(join(root, "_headers"), "utf8");
const llmsPath = join(root, "llms.txt");
must(existsSync(llmsPath), "llms.txt missing");
const llms = existsSync(llmsPath) ? readFileSync(llmsPath, "utf8") : "";
for (const [, canonical] of pages) {
  must(llms.includes(canonical), `llms.txt missing ${canonical}`);
}
must(llms.includes("https://open-source.gainratio.com/"), "llms.txt missing open-source.gainratio.com");
must(llms.includes("https://github.com/gainratio/avow"), "llms.txt missing github.com/gainratio/avow");

must(robots.includes("Sitemap: https://avow.gainratio.com/sitemap.xml"), "robots.txt missing sitemap");
for (const req of [
  "default-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "max-age=31536000; includeSubDomains",
  "script-src 'self'",
]) {
  must(headers.includes(req), `_headers missing ${req}`);
}

const idsByFile = new Map();
for (const [file] of [...pages, ["404.html", ""]]) {
  const html = readFileSync(join(root, file), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  must(ids.length === new Set(ids).size, `${file}: duplicate id`);
  idsByFile.set(file, new Set(ids));
}

const titles = new Set();
const descriptions = new Set();

for (const [file, canonical] of pages) {
  const html = readFileSync(join(root, file), "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? "";
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1]?.trim() ?? "";
  const canonicalHref = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
  const h1Count = [...html.matchAll(/<h1[\s>]/g)].length;

  must(title.length >= 20 && title.length <= 75, `${file}: title length ${title.length}`);
  must(description.length >= 60 && description.length <= 170, `${file}: description length ${description.length}`);
  must(!titles.has(title), `${file}: duplicate title`);
  must(!descriptions.has(description), `${file}: duplicate description`);
  titles.add(title);
  descriptions.add(description);

  must(canonicalHref === canonical, `${file}: canonical ${canonicalHref} !== ${canonical}`);
  must(h1Count === 1, `${file}: expected 1 h1, found ${h1Count}`);
  must(html.includes('name="robots" content="index,follow"'), `${file}: missing index,follow`);
  must(html.includes('href="#main"'), `${file}: missing skip link`);
  must(/<main\b[^>]*\bid="main"/.test(html), `${file}: missing <main id="main">`);
  for (const og of ["og:type", "og:title", "og:description", "og:url"]) {
    must(html.includes(`property="${og}"`), `${file}: missing ${og}`);
  }
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  must(Boolean(ldMatch), `${file}: missing JSON-LD`);
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      must(ld["@context"] === "https://schema.org", `${file}: JSON-LD missing schema.org context`);
    } catch {
      failures.push(`${file}: invalid JSON-LD`);
    }
  }
  must(sitemap.includes(`<loc>${canonical}</loc>`), `${file}: missing from sitemap.xml`);
  must(!/\sstyle="/i.test(html), `${file}: inline style attribute violates CSP`);
  must(!/\son[a-z]+="/i.test(html), `${file}: inline event handler violates CSP`);
  for (const scriptTag of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = scriptTag[0];
    const isJsonLd = /\btype="application\/ld\+json"/i.test(tag);
    const isVerifierModule =
      file === "index.html" &&
      /\btype="module"/i.test(tag) &&
      /\bsrc="\/assets\/verify\.js"/i.test(tag);
    must(isJsonLd || isVerifierModule, `${file}: disallowed or non-module script tag ${tag}`);
  }
  if (file === "index.html") {
    must(
      /<script\s+type="module"\s+src="\/assets\/verify\.js"\s*><\/script>/.test(html),
      'index.html: verify.js must load as <script type="module" src="/assets/verify.js"></script>',
    );
  }

  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) continue;
    const [pathWithQuery, hash] = href.split("#");
    const rawPath = pathWithQuery.split("?")[0];
    const targetFile =
      rawPath === ""
        ? file
        : rawPath === "/"
          ? "index.html"
          : rawPath.endsWith("/")
            ? `${rawPath.slice(1)}index.html`
            : rawPath.slice(1);
    must(existsSync(join(root, targetFile)), `${file}: broken link ${href}`);
    if (hash) {
      must(idsByFile.get(targetFile)?.has(hash), `${file}: missing anchor #${hash} in ${targetFile}`);
    }
  }
}

const notFound = readFileSync(join(root, "404.html"), "utf8");
must(notFound.includes('name="robots" content="noindex,follow"'), "404.html: missing noindex,follow");
must(notFound.includes('href="#main"'), "404.html: missing skip link");
must(/<main\b[^>]*\bid="main"/.test(notFound), "404.html: missing <main id=\"main\">");
must(!sitemap.includes("404.html"), "sitemap.xml must not list 404.html");

const validOutcome = await verify(SAMPLE.payload);
must(validOutcome.ok === true && validOutcome.reason.includes("avow.verify.ok"), "verify.js: SAMPLE payload failed WebCrypto verification");
const tamperedFromValid = tamperPayloadText(JSON.stringify(SAMPLE.payload));
const tamperedOutcome = await verify(tamperedFromValid);
must(tamperedOutcome.ok === false && tamperedOutcome.reason.includes("payload hash mismatch"), "verify.js: tampered payload did not fail verification");
const tamperedFromInvalid = tamperPayloadText("{not-json");
must(tamperedFromInvalid.approved_by === "mallory", "verify.js: tamperPayloadText did not recover cleanly from malformed JSON");

const distDir = join(root, "dist");
if (existsSync(distDir)) {
  must(existsSync(join(distDir, "llms.txt")), "dist/: missing llms.txt");
  for (const forbidden of [
    "package.json",
    "package-lock.json",
    "README.md",
    "CLAUDE.md",
    "SECURITY.md",
    "LICENSE",
    "scripts",
  ]) {
    must(!readdirSync(distDir).includes(forbidden), `dist/: leaked non-public file ${forbidden}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Checked ${pages.length} pages + 404.html + WebCrypto receipt verifier + headers; 0 issues.`);
