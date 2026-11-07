# avow.gainratio.com

Source for the Avow documentation site: landing page, browser receipt verifier, docs, examples, security, and changelog.

## Check

```sh
node scripts/check.mjs
```

The check fails on missing metadata, JSON-LD, sitemap entries, internal links, or assets.

## Deploy

```sh
npm run build && npm run check
npx wrangler pages deploy dist --project-name avow-docs --branch main
```

`dist/` contains only the public web assets. The custom domain `avow.gainratio.com` is attached to the `avow-docs` Cloudflare Pages project.
