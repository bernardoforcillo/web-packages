# @bernardoforcillo/vite-seo

## 0.1.0

### Minor Changes

- 1bc6fab: Generate `sitemap.xml`, `robots.txt` and `manifest.webmanifest` from `sitemap.ts`, `robots.ts` and `manifest.ts` convention files.
- 1bc6fab: Load markdown content and generate RSS, Atom and JSON feeds, `llms.txt`, `llms-full.txt`, prerendered markdown and a `.md` file per page.
- 1bc6fab: Emit JSON-LD as a single `@graph` merged by `@id`, add typed schema.org nodes and give the JSON-LD helpers an optional `id`.
- 1bc6fab: Add a Next-style Metadata API, `defineSeo` and `seo()`, that builds the TanStack Router `head` from site defaults and per-page metadata.
- 1bc6fab: Emit `seo-routes.json` with the static route heads and ship a JSON Schema describing it.
