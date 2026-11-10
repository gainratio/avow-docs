#!/usr/bin/env node
/**
 * Real-browser runtime gate for avow.gainratio.com.
 * Serves dist/ with exact _headers CSP and exercises Verify -> Tamper -> Reset in Chromium.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const DIST = join(process.cwd(), "dist");
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function parseHeadersFile(raw) {
  const rules = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
    } else if (current) {
      const idx = line.indexOf(":");
      if (idx > 0) current.headers.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
    }
  }
  return rules;
}

function matchesPattern(pattern, pathname) {
  if (pattern === "/*") return true;
  if (pattern.endsWith("/*")) return pathname.startsWith(pattern.slice(0, -1));
  return pathname === pattern;
}

function resolveDistFile(pathname) {
  const clean = pathname.split("?")[0];
  if (clean === "/") return { file: join(DIST, "index.html"), status: 200 };
  const direct = join(DIST, clean.slice(1));
  if (existsSync(direct) && statSync(direct).isFile()) return { file: direct, status: 200 };
  const indexFile = join(direct, "index.html");
  if (existsSync(indexFile) && statSync(indexFile).isFile()) return { file: indexFile, status: 200 };
  return { file: join(DIST, "404.html"), status: 404 };
}

const headerRules = parseHeadersFile(readFileSync(join(DIST, "_headers"), "utf8"));
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const { file, status } = resolveDistFile(url.pathname);
  for (const rule of headerRules) {
    if (matchesPattern(rule.pattern, status === 404 ? "/404.html" : url.pathname)) {
      for (const [k, v] of rule.headers) res.setHeader(k, v);
    }
  }
  res.statusCode = status;
  res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  await page.addInitScript(() => {
    globalThis.__cspViolations = [];
    globalThis.addEventListener("securitypolicyviolation", (event) => {
      globalThis.__cspViolations.push(`${event.violatedDirective}:${event.blockedURI}`);
    });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const initialPayload = await page.locator("#receipt-payload").inputValue();
  if (!initialPayload.includes('"approved_by": "dana"')) {
    throw new Error(`Expected non-empty initial receipt payload, got: ${initialPayload}`);
  }

  await page.click("#verify");
  await page.waitForFunction(() => document.querySelector("#demo-result")?.classList.contains("ok"));
  const verifyText = await page.locator("#demo-result").textContent();
  if (!verifyText?.includes("avow.verify.ok")) {
    throw new Error(`Unexpected #verify output: ${verifyText}`);
  }

  await page.click("#tamper");
  await page.waitForFunction(() => document.querySelector("#demo-result")?.classList.contains("bad"));
  const tamperedPayload = await page.locator("#receipt-payload").inputValue();
  const tamperText = await page.locator("#demo-result").textContent();
  if (!tamperedPayload.includes('"approved_by": "mallory"') || !tamperText?.includes("payload hash mismatch")) {
    throw new Error(`Unexpected #tamper state: payload=${tamperedPayload} result=${tamperText}`);
  }

  await page.click("#reset");
  await page.waitForFunction(() => document.querySelector("#demo-result")?.classList.contains("idle"));
  const resetPayload = await page.locator("#receipt-payload").inputValue();
  const resetText = await page.locator("#demo-result").textContent();
  if (!resetPayload.includes('"approved_by": "dana"') || !resetText?.includes("Receipt restored")) {
    throw new Error(`Unexpected #reset state: payload=${resetPayload} result=${resetText}`);
  }

  const cspViolations = await page.evaluate(() => globalThis.__cspViolations);
  if (cspViolations.length > 0) errors.push(`CSP violations: ${cspViolations.join(", ")}`);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log("Browser runtime gate passed: 0 pageerror, 0 console.error, 0 CSP violations, Verify -> Tamper -> Reset verified.");
} finally {
  await browser.close();
  server.close();
}
