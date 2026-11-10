# CLAUDE.md — avow-docs (`avow.gainratio.com`)

Canonical agent instructions for the Avow documentation and browser-verifier repository (`gainratio/avow-docs`).

## Status & Portfolio Pointers

- **Live URL:** `https://avow.gainratio.com/` (Cloudflare Pages project `avow-docs`)
- **Upstream library repo:** `https://github.com/gainratio/avow` (PyPI `avow`, npm `@gainratio/avow`, current release `0.5.3`)
- **Portfolio hub:** `https://open-source.gainratio.com/avow/`
- **Portfolio engineering standard §8 (WASM):** Not applicable — static HTML/CSS plus native WebCrypto ES module (`assets/verify.js`), zero WASM or bundled runtime dependencies.
- **Portfolio engineering standard §3.1–§3.4:** §3.1 covered via WebCrypto tamper/malformed-JSON checks + strict `default-src 'none'` CSP; §3.2–§3.4 N/A (no LLM drafts, scores, or generated PDFs).

## Stack & Layout

- **Runtime:** Node 22+ (build/verification scripts only; zero runtime dependencies in `dist/`).
- **Pages:** `index.html`, `docs/index.html`, `examples/index.html`, `security/index.html`, `changelog/index.html`, `404.html`.
- **Public root artifacts:** `_headers`, `robots.txt`, `sitemap.xml`, `llms.txt`, `favicon.ico`.
- **Scripts:**
  - `scripts/build.mjs` — copies explicit allowlist (`ROOT_FILES` + `DIRS`) into `dist/`.
  - `scripts/check.mjs` — static SEO/metadata/JSON-LD/link/CSP/script-module/WebCrypto check.
  - `scripts/verify-browser.mjs` — serves `dist/` with exact `_headers` CSP and drives Verify → Tamper → Reset in headless Chromium (`playwright`).
  - `scripts/live-probe.mjs` — secret-free production health probe (`live-probe.yml`).

## Core Invariants

1. **Strict CSP (`default-src 'none'; script-src 'self'; connect-src 'none'`).** No inline styles, no inline event handlers, no external fonts/scripts/trackers. Only `<script type="application/ld+json">` data blocks and `<script type="module" src="/assets/verify.js"></script>` on `index.html` are permitted.
2. **Explicit `dist/` allowlist.** Every new public root file (`llms.txt`, etc.) must be added to `ROOT_FILES` in `scripts/build.mjs`; repo files (`package.json`, `CLAUDE.md`, `README.md`, `scripts/`) must never enter `dist/`.
3. **Claims match `gainratio/avow`.** Install commands (`avow[cli]>=0.5.3`, `@gainratio/avow`), error codes, and schema (`avow.receipt/v1`) must match the published library.

## Quality Gates (Non-Negotiable)

Run `npm run gate` before every commit (`build` → `check` → `test` in real Chromium):

- **Scar (2026-11-10 — ESM loaded as classic script):** `assets/verify.js` used `export` so Node's `check.mjs` could unit-test `verify()`, while `index.html` loaded `<script src="/assets/verify.js" defer></script>` without `type="module"`. Node unit checks passed 100%, while every real browser threw `SyntaxError: Unexpected token 'export'` and left the interactive verifier dead on `https://avow.gainratio.com/`. Both `scripts/check.mjs` (module tag assertion) and `scripts/verify-browser.mjs` (headless Chromium driving `#verify` → `#tamper` → `#reset` under exact `_headers` CSP with zero `pageerror` / `console.error`) now block any recurrence.
- **Scar (allowlist drift):** Static files added at repo root 404 on Cloudflare Pages if omitted from `scripts/build.mjs` `ROOT_FILES`. `scripts/check.mjs` asserts `dist/llms.txt` exists and non-public files stay excluded.

## Commands

```sh
npm ci                 # install pinned Playwright dev dependency
npm run build          # populate dist/ from explicit allowlist
npm run check          # static SEO, links, CSP, module-tag, and WebCrypto checks
npm test               # headless Chromium runtime check against dist/ + _headers CSP
npm run gate           # full local & CI gate (build + check + test)
npm run probe:live     # probe live https://avow.gainratio.com
```
