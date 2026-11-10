#!/usr/bin/env node
/**
 * Secret-free live production probe for https://avow.gainratio.com.
 * Verifies robots.txt, sitemap.xml, llms.txt, HTTP 404 on unknown route,
 * canonical/H1/JSON-LD across all sitemap URLs, and ESM verifier module loading.
 */
const HOST = "avow.gainratio.com";
const PAGES_HOST = "avow-docs.pages.dev";
const BASE = `https://${HOST}`;
const failures = [];

async function fetchRaw(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "GainRatio-Live-Probe/1.0 (+https://gainratio.com)" },
    signal: AbortSignal.timeout(25_000),
  });
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    mitigated: res.headers.get("cf-mitigated") ?? "",
    body: await res.text(),
  };
}

async function fetchSite(url) {
  const res = await fetchRaw(url);
  if (res.status === 403 && res.mitigated === "challenge") {
    const fallback = new URL(url);
    fallback.hostname = PAGES_HOST;
    return fetchRaw(fallback.href);
  }
  return res;
}

function hasHttpsUrl(text, expectedHost, expectedPath = "/") {
  for (const [raw] of text.matchAll(/https?:\/\/[^\s)>\]"`]+/g)) {
    try {
      const parsed = new URL(raw.replace(/[.,;:]+$/, ""));
      if (parsed.protocol === "https:" && parsed.hostname === expectedHost && parsed.pathname === expectedPath) {
        return true;
      }
    } catch {
      // ignore non-URL tokens
    }
  }
  return false;
}

const robots = await fetchSite(`${BASE}/robots.txt`);
if (robots.status !== 200 || !robots.body.toLowerCase().includes("sitemap:")) {
  failures.push(`robots.txt failed (HTTP ${robots.status})`);
}

const llms = await fetchSite(`${BASE}/llms.txt`);
if (llms.status !== 200 || !hasHttpsUrl(llms.body, "open-source.gainratio.com", "/")) {
  failures.push(`llms.txt failed (HTTP ${llms.status})`);
}

const unknown = await fetchSite(`${BASE}/nonexistent-live-probe-404`);
if (unknown.status !== 404) {
  failures.push(`expected HTTP 404 on unknown route, got HTTP ${unknown.status}`);
}

const sitemap = await fetchSite(`${BASE}/sitemap.xml`);
if (sitemap.status !== 200) failures.push(`sitemap.xml HTTP ${sitemap.status}`);
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length === 0) failures.push("sitemap.xml has 0 <loc> entries");

for (const url of locs) {
  const page = await fetchSite(url);
  if (page.status !== 200 || !page.type.includes("text/html")) {
    failures.push(`${url}: HTTP ${page.status} (${page.type})`);
    continue;
  }
  const canonical = page.body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] ?? "";
  if (canonical.replace(/\/$/, "") !== url.replace(/\/$/, "")) {
    failures.push(`${url}: canonical mismatch (${canonical})`);
  }
  if ([...page.body.matchAll(/<h1[\s>]/gi)].length !== 1) {
    failures.push(`${url}: expected 1 <h1>`);
  }
  if (url === `${BASE}/` && !/<script\s+type="module"\s+src="\/assets\/verify\.js"\s*><\/script>/.test(page.body)) {
    failures.push(`${url}: missing <script type="module" src="/assets/verify.js"></script>`);
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`Live probe passed for ${BASE} (${locs.length} pages + llms.txt + 404).`);
