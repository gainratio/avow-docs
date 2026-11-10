# avow.gainratio.com — Documentation & Browser Receipt Verifier

Static documentation site and live in-browser receipt verifier for [**Avow**](https://github.com/gainratio/avow) (`avow` on PyPI, `@gainratio/avow` on npm).

**What problem this solves.** When a team records an important decision — like approving a software release or passing a safety check — a plain database row or file checksum isn't enough, because anyone who edits the file can recompute the checksum too. Avow turns any JSON record into a portable signed receipt that anyone can verify on their own computer without an account, a server, or an internet connection.

**What this repo is.** The zero-backend web site served at [avow.gainratio.com](https://avow.gainratio.com/), including an interactive verifier on the home page where you can verify a real receipt, tamper with one field, and watch the signature check fail right inside your browser tab.

## Run locally in one command

```sh
npm ci && npm run gate
```

That builds the clean `dist/` directory, checks every page's links and security headers, and opens a real headless Chromium browser to verify a sample receipt, tamper with it, and reset it with zero console errors.

---

## Under the hood (for developers)

### Site map & architecture

| Path | Purpose |
|---|---|
| `index.html` | Landing page + interactive browser receipt verifier (`assets/verify.js`) |
| `docs/index.html` | Install, CLI (`keygen`, `sign`, `verify`, `ledger`), Python & TypeScript APIs, error codes |
| `examples/index.html` | Copyable CLI, Python, TypeScript, ledger, and tamper-refusal examples |
| `security/index.html` | Threat model, key-handling rules, caller-owned replay boundaries, private reporting |
| `changelog/index.html` | Compatibility and release notes (`0.5.0`–`0.5.3`) |
| `404.html` | Custom not-found page (`noindex,follow`, excluded from `sitemap.xml`) |
| `llms.txt` | Structured plain-text index for AI coding assistants and search crawlers |
| `_headers` | Strict Content-Security-Policy (`default-src 'none'; script-src 'self'`), HSTS, COOP/CORP |
| `scripts/build.mjs` | Explicit allowlist copier into `dist/` (never leaks repo metadata) |
| `scripts/check.mjs` | Static SEO, HTML structure, anchor, CSP, and WebCrypto unit gate |
| `scripts/verify-browser.mjs` | Playwright Chromium e2e gate serving `dist/` with exact `_headers` CSP |
| `scripts/live-probe.mjs` | Secret-free production probe (`https://avow.gainratio.com`) |

### Cryptographic verification in the browser

`assets/verify.js` is an ES module (`<script type="module" src="/assets/verify.js"></script>`) using the browser's built-in WebCrypto API (`crypto.subtle.digest("SHA-256", ...)` and `crypto.subtle.verify({ name: "Ed25519" }, ...)`) over RFC 8785 Canonical JSON (JCS — a deterministic byte ordering for JSON so key order and whitespace never alter signatures). No network calls (`connect-src 'none'`) and zero runtime npm dependencies ship to the browser.

### Deploy

```sh
npm run gate
npx wrangler pages deploy dist --project-name avow-docs --branch main
```

- **Library source:** [github.com/gainratio/avow](https://github.com/gainratio/avow)
- **Open-source hub:** [open-source.gainratio.com/avow/](https://open-source.gainratio.com/avow/)
- **License:** [MIT](./LICENSE)
