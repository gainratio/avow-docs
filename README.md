# avow.gainratio.com

Source for the Avow documentation site: landing page, browser receipt verifier, docs, examples, security, and changelog.

## Check

```sh
node scripts/check.mjs
```

The check fails on missing metadata, JSON-LD, sitemap entries, internal links, or assets.

## Deploy

```sh
npx wrangler pages deploy . --project-name avow-docs --branch main
```

The custom domain `avow.gainratio.com` is attached to the `avow-docs` Cloudflare Pages project.
