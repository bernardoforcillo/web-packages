# @bernardoforcillo/vite-seo

Next.js-style Metadata API for TanStack Router and Vite: describe the title,
Open Graph, Twitter, canonical and JSON-LD of a page and get the `head` for your
route. A Vite plugin generates `sitemap.xml`, `robots.txt`,
`manifest.webmanifest`, RSS/Atom/JSON feeds, `llms.txt` / `llms-full.txt` and a
markdown version of every page, plus a `seo-routes.json` manifest for the
[`vite-serve`](../../crates/vite-serve/readme.md) server.

## Installation

```sh
pnpm add @bernardoforcillo/vite-seo
```

`@tanstack/react-router` (^1) is a peer dependency. `vite` (>=6) is only needed
for the plugin (`@bernardoforcillo/vite-seo/vite`) and is optional. `react` and
`react-dom` (^19) are optional peers, used only by the markdown prerender (see
[Markdown prerender](#markdown-prerender)).

## Usage

Create a single instance with `defineSeo`, passing the site-wide default
metadata. It returns `rootHead` and `seo`.

```ts
// src/seo.ts
import { defineSeo } from "@bernardoforcillo/vite-seo";

export const site = defineSeo({
  metadataBase: "https://example.com",
  title: { default: "My site", template: "%s | My site" },
  description: "Default description",
  openGraph: { siteName: "My site", type: "website" },
  twitter: { card: "summary_large_image" },
});
```

In the root route use `site.rootHead` as the `head`:

```tsx
// src/routes/__root.tsx
import { createRootRoute } from "@tanstack/react-router";
import { site } from "../seo";

export const Route = createRootRoute({
  head: site.rootHead,
});
```

In a page use `site.seo(...)`, in object form:

```tsx
// src/routes/about.tsx
import { createFileRoute } from "@tanstack/react-router";
import { site } from "../seo";

export const Route = createFileRoute("/about")({
  head: site.seo({
    title: "About us",
    description: "Our story",
    alternates: { canonical: "/about" },
  }),
});
```

or in function form, to use `loaderData` (or `params`):

```tsx
// src/routes/posts.$id.tsx
import { createFileRoute } from "@tanstack/react-router";
import { site } from "../seo";

type Post = { title: string; summary: string };

export const Route = createFileRoute("/posts/$id")({
  loader: async (): Promise<Post> => ({ title: "Hello", summary: "A post" }),
  head: site.seo<{ loaderData?: Post }>((ctx) => ({
    title: ctx.loaderData?.title,
    description: ctx.loaderData?.summary,
  })),
});
```

The default context type has optional `params` and `loaderData`, both
`unknown`. Narrow `loaderData` yourself by passing the generic, as in
`site.seo<{ loaderData?: Post }>(...)`.

### Title and template

`title` accepts a string or `{ default, template, absolute }`.

- A string in the page (`title: "About us"`) is inserted into the site
  `template`: `"%s | My site"` produces `About us | My site`.
- `default` is the title used when the page does not define one.
- `absolute` ignores the template.

### JSON-LD

Pass schema.org nodes with `jsonLd`. JSON-LD is emitted **as a single
`@graph`**: the site nodes (in `defineSeo`) and the page nodes (in `seo(...)`)
end up in one `<script type="application/ld+json">`, site nodes first. A single
node still produces a `@graph`.

```tsx
import { defineSeo, article, webSite } from "@bernardoforcillo/vite-seo";

const site = defineSeo({
  jsonLd: webSite({ id: "https://example.com/#website", name: "My site", url: "https://example.com" }),
});

head: site.seo({
  title: "My article",
  jsonLd: article({
    id: "https://example.com/blog/post#article",
    headline: "My article",
    datePublished: "2026-10-24",
    author: { name: "Bernardo Forcillo" },
    // link the page node to the site node
    isPartOf: { "@id": "https://example.com/#website" },
  }),
}),
```

Result: `{"@context":"https://schema.org","@graph":[<WebSite>,<Article>]}`.

- **Merge by `@id`**: nodes sharing the same `@id` become one (shallow merge;
  later keys, that is the page ones, win; the position is that of the first
  occurrence). Nodes without `@id` are never merged.
- **Containers**: you can also pass `{ "@context"?, "@graph": [...] }`; its
  nodes are flattened into the graph.
- **Different `@context`**: a node whose `@context` is not
  `https://schema.org` (or `http://schema.org`) cannot join the graph and is
  emitted in a separate `<script>` after the graph. On graph nodes the
  `@context` is removed (the graph carries it).
- **Root head**: `rootHead()` emits no JSON-LD. TanStack Router concatenates the
  scripts of all routes, so the site graph would appear twice (root and page);
  `seo(...)` emits it together with the page nodes. A route without `seo(...)`
  therefore has no JSON-LD.
- **Helpers**: `article`, `product`, `faqPage`, `breadcrumbList`,
  `organization` and `webSite`. They accept an optional `id`, emitted as `@id`
  (right after `@type`) only when present; for `faqPage` and `breadcrumbList`
  it is the second argument: `faqPage(items, "https://example.com/faq#faq")`.
- The serializer escapes `<` so the output is safe inside a `<script>`.

#### schema.org types

Types are exported as types only (no runtime code):
`import type { Schema, Thing } from "@bernardoforcillo/vite-seo"`, for example
`const post: Schema.Article = { "@type": "Article", headline: "..." }`.

Known limit: to keep old object literals compiling
(`{ "@type": "Article", headline: "x" }`), `JsonLdObject` also accepts a generic
record, so the compiler does **not** reject properties with the wrong type (for
example `headline: 5`). The schema.org types are there for autocompletion.

### `cache` directive

`cache: { revalidate: 60 }` or `cache: false` is reserved: the directive is
reported in the result of `head()` (`head.cache`) and carried into
`seo-routes.json`, but TanStack Router drops unknown keys on the server path.
By itself it has no effect; [`vite-serve`](../../crates/vite-serve/readme.md)
turns it into a `Cache-Control` header.

## Vite plugin

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { viteSeo } from "@bernardoforcillo/vite-seo/vite";

export default defineConfig({
  plugins: [
    viteSeo({
      siteUrl: "https://example.com",
      content: { dir: "content" },
    }),
  ],
});
```

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `dir` | `"src"` | Folder (relative to the Vite root) holding the convention files. |
| `siteUrl` | none | Site origin, for example `https://example.com`. Used for the automatic `Sitemap:` line in `robots.txt` and to absolutise URLs in feeds, `llms.txt` and prerendered links. It must be an origin (no path). `metadataBase` is not read at build time. |
| `routeTree` | `src/routeTree.gen.ts` if it exists | Module exporting `routeTree`, relative to the Vite root or absolute. |
| `content` | none | `{ dir, baseUrl? }`: folder of markdown files, see [Content](#content). |
| `markdown.prerender` | on when a route tree exists | `false`, `true` or `{ createRouter?, strict? }`, see [Markdown prerender](#markdown-prerender). |

In dev, generated files are served by a middleware; in a build they are emitted
as assets.

## Convention files

Create the files in the `src` folder (configurable with `dir`). Each default
export can be a value or a function (also async). Types live in `MetadataRoute`.
When it is a function it receives the [context argument](#the-context-argument).

### Sitemap, robots and manifest

```ts
// src/sitemap.ts
import type { MetadataRoute } from "@bernardoforcillo/vite-seo";

export default (): MetadataRoute.Sitemap => [
  { url: "https://example.com/", lastModified: new Date(), priority: 1 },
  { url: "https://example.com/about", changeFrequency: "monthly" },
];
```

```ts
// src/robots.ts
import type { MetadataRoute } from "@bernardoforcillo/vite-seo";

export default (): MetadataRoute.Robots => ({
  rules: { userAgent: "*", allow: "/", disallow: "/admin" },
});
```

```ts
// src/manifest.ts
import type { MetadataRoute } from "@bernardoforcillo/vite-seo";

export default (): MetadataRoute.Manifest => ({
  name: "My site",
  short_name: "Site",
  start_url: "/",
  display: "standalone",
  icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
});
```

With `siteUrl` set, if `sitemap.ts` exists and `robots.ts` does not declare
`sitemap`, the line `Sitemap: https://example.com/sitemap.xml` is appended to
`robots.txt` automatically. If `manifest.ts` exists, a `<link rel="manifest">`
is also injected into the HTML.

### Content

The `content` option points at a folder of markdown files with YAML
frontmatter. They become entries available to the convention files, the feed,
`llms.txt` and the per-page `.md` output.

```md
---
title: "Hello: world & co"
description: A short greeting
date: 2026-03-04T10:00:00Z
tags: [greetings, intro]
---
# Hello

Post body.
```

Frontmatter fields: `title`, `description`, `date`, `updated`, `tags` (a list
or a single value), `url` (overrides the derived URL) and `draft` (`true` skips
the file). The title falls back to the first `# heading`, then to the last segment of the slug (`index.md` gives "index").

- The URL comes from the path inside `dir`: `blog/hello.md` is `/blog/hello`,
  `blog/index.md` is `/blog`, `index.md` is `/`. `baseUrl` prefixes the URL
  (and the output path): `content: { dir: "content", baseUrl: "/docs" }`.
- Entries are sorted by `date` descending, then by title.
- An invalid date, invalid YAML or two entries with the same URL fail the build
  with a message naming the files.
- Each entry has this shape (`ContentEntry`): `slug`, `url`, `title`,
  `description?`, `date?`, `updated?` (ISO 8601 strings), `tags`, `body`, `file`.

### Feed

`src/feed.ts` produces `feed.xml` (RSS 2.0) and optionally `atom.xml` (Atom 1.0)
and `feed.json` (JSON Feed 1.1). Pick the formats with `formats` (default
`["rss"]`).

```ts
// src/feed.ts
import type { ConventionContext, MetadataRoute } from "@bernardoforcillo/vite-seo";

export default (ctx: ConventionContext): MetadataRoute.Feed => ({
  title: "My site",
  link: ctx.siteUrl ?? "/",
  description: "Latest posts",
  formats: ["rss", "atom", "json"],
  items: ctx.content.map((e) => ({
    title: e.title,
    url: e.url,
    summary: e.description,
    date: e.date,
    tags: e.tags,
  })),
});
```

A feed item accepts `title`, `url`, `id?`, `summary?`, `content?`,
`contentText?`, `date?`, `updated?`, `authors?` (`{ name, email?, url? }[]`) and
`tags?`. The feed itself accepts `title`, `link`, `description?`, `language?`,
`updated?` and `formats?`. Relative URLs are made absolute with `siteUrl`.
Text is escaped, illegal XML characters are removed and `]]>` inside CDATA is
split safely.

**Link discovery**: for every emitted format the plugin injects
`<link rel="alternate" type="application/rss+xml" title="..." href="/feed.xml">`
(or `application/atom+xml` / `application/feed+json`) into the HTML `<head>`.

### `llms.txt`

`src/llms.ts` produces `llms.txt` following [llmstxt.org](https://llmstxt.org):

```ts
// src/llms.ts
import type { ConventionContext, MetadataRoute } from "@bernardoforcillo/vite-seo";

export default (ctx: ConventionContext): MetadataRoute.Llms => ({
  title: "My site",
  summary: "What this site is about",
  sections: [
    {
      title: "Posts",
      links: ctx.content.map((e) => ({ title: e.title, url: e.url, notes: e.description })),
    },
    { title: "Extras", optional: true, links: [{ title: "About", url: "/about" }] },
  ],
});
```

Output: `# title`, a `> summary` blockquote, optional `details` paragraphs, then one
`## Section` per section with `- [title](url): notes` lines. Sections marked
`optional` are merged into a final `## Optional` section. URLs are made
absolute with `siteUrl`.

`llms-full.txt` is emitted when `llms.ts` exists **and** there is at least one
content entry or prerendered page. It contains, for each entry, `# title`, the
absolute URL and the markdown body, separated by `---`: content entries first
(non-draft, date descending), then prerendered pages not covered by content.

### The context argument

A convention function receives one argument (`ConventionContext`):

| Field | Meaning |
| --- | --- |
| `content` | Entries read from the `content` folder (empty without the option). |
| `pages` | Pages obtained from the markdown prerender (empty if it is off or skipped). Same shape as `content`; `file` is `prerender:<url>`. |
| `siteUrl` | The `siteUrl` option, when set. |

This applies to `sitemap.ts`, `robots.ts`, `manifest.ts`, `feed.ts` and
`llms.ts`. Values that are not functions receive nothing. Feeds usually use
`content` only: site pages are not feed entries.

## Markdown prerender

With a route tree (`src/routeTree.gen.ts` or `routeTree`), the plugin renders
every **static** route to HTML, converts it to markdown and emits it as a
`.md` file, so `vite-serve` can answer `Accept: text/markdown`. It is **on by
default**; turn it off with `markdown: { prerender: false }`.

```ts
viteSeo({
  siteUrl: "https://example.com",
  markdown: {
    prerender: {
      // module exporting createRouter(): your real router (with context/providers)
      createRouter: "src/router.tsx",
      // fail the build on the first route that cannot be prerendered
      strict: true,
    },
  },
});
```

- **`createRouter`**: path (relative to the Vite root) of a module exporting a
  function `createRouter()`. It must use a **memory history**, because the router
  is moved with `router.history.replace(path)` in Node. Without it a plain router
  is created from the route tree.
- **`strict`**: by default a route that fails produces a build warning and is
  skipped; with `strict: true` the first failure fails the build.
- **Optional peers**: the prerender imports `react` and `react-dom/server`. If
  they are missing and the prerender is only on by default, it is skipped with a
  warning; if you enabled it explicitly (`true` or an object), the build fails.
- **Output**: the content of `<main>` (or `<article>`, or `<body>`) is converted
  to markdown after dropping `nav`, `header`, `footer`, `aside`, `script`,
  `style`, `noscript`, `svg` and `template`. Tables become GFM tables; relative
  links and images are resolved (absolute with `siteUrl`). The page title is the
  route `head` title, else the first `<h1>`, else the absolute route URL.
- **Skipped (with a warning)**: dynamic routes (parameters, `loader`,
  `beforeLoad` or a failing `head`), routes that fail to load or render,
  redirects, not-found matches, and pages that render empty (client-only
  content). Dynamic routes stay out until server rendering exists.
- Pages whose URL is already covered by a content entry are not prerendered
  again: content wins.

### Per-page `.md` files

For every content entry and prerendered page the plugin emits a markdown file in
the build output: `/` is `index.md`, `/about` is `about.md`, and an entry
coming from an `index.md` source is `<url>/index.md`. Each file starts with
generated frontmatter (`title`, `url`, and `description` / `date` when present)
followed by the body. A `.md` that would overwrite a generated file (`feed.xml`,
`llms.txt`, `sitemap.xml`, `seo-routes.json`, ...) fails the build; so does two
entries mapping to the same file.

`vite-serve` serves them at their direct URL (`/blog/hello.md`) and through
`Accept: text/markdown` on `/blog/hello`.

## Route manifest (`seo-routes.json`)

In a build the plugin also emits `seo-routes.json` in `outDir`, a manifest that
describes the site routes and their `head`, meant to be read by a Rust server
([`vite-serve`](../../crates/vite-serve/readme.md)). It is produced from
`routeTree` (by default `src/routeTree.gen.ts`, if it exists; otherwise the
manifest is not emitted).

Contract, `version: 1`:

```json
{
  "version": 1,
  "routes": [
    { "path": "/about", "dynamic": false, "head": { "meta": [], "links": [], "scripts": [] } },
    { "path": "/posts/$postId", "dynamic": true }
  ]
}
```

- `path`: full route path, with parameters in TanStack form (`$postId`).
- `dynamic`: `true` if the route has parameters, a `loader` or a `beforeLoad`
  (along its chain), or if its `head` fails when evaluated. Static routes whose
  merged head is empty are left out of `routes` altogether.
- `head`: present only when `dynamic` is `false`. Dynamic routes carry no
  `head`. A static route is emitted with the merged `head` of the whole chain,
  from the root to the leaf (later entries replace those with the same key).

### The `head` of a route

Full example of a static route:

```json
{
  "path": "/about",
  "dynamic": false,
  "head": {
    "meta": [
      { "title": "About | Site" },
      { "name": "description", "content": "About us" },
      { "property": "og:title", "content": "About | Site" }
    ],
    "links": [
      { "rel": "canonical", "href": "https://example.com/about" },
      { "rel": "alternate", "hrefLang": "en", "href": "https://example.com/en/about" }
    ],
    "scripts": [
      { "type": "application/ld+json", "children": "{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"WebPage\"}]}" }
    ],
    "cache": { "revalidate": 60 }
  }
}
```

- `meta`: list of attribute to value maps. An entry with only the `title` key
  becomes `<title>`; all others become `<meta>`.
- `links`: list of attribute to value maps, rendered as `<link>`. The language
  attribute is written `hrefLang` (not `hreflang`), as in React.
- `scripts`: list of `{ type, children }`, rendered as `<script type="...">`.
  For JSON-LD, `children` is the already serialized JSON string (with `<`
  escaped as `\u003c`).
- `cache`: optional. `false` means "do not cache" (`no-store`);
  `{ "revalidate": n }` means a shared cache of `n` seconds
  (`public, s-maxage=n`). The value is only carried in the manifest: whoever
  reads it applies it, and the server configuration can override it.
- Unknown keys are not allowed in routes and in `head`: the format is closed,
  and a breaking change means a new `version` number.

### JSON Schema

The contract is described by a JSON Schema (draft 2020-12) in the repository, in
[`schema/seo-routes.schema.json`](schema/seo-routes.schema.json). Use it to
validate the file in CI or in an editor, for example with `ajv`:

```sh
npx ajv-cli validate --spec=draft2020 \
  -s node_modules/@bernardoforcillo/vite-seo/schema/seo-routes.schema.json \
  -d dist/seo-routes.json
```

The schema forbids a `head` on dynamic routes and requires it on static ones.
Note: the `schema/` folder is currently not part of the published package (the
`files` field of `package.json` lists only `dist` and `changelog.md`), so the
command above only works if you add it to `files` or use the file from the
repository.

### `routeTree` option

The `routeTree` option names the module exporting `routeTree`, relative to the
Vite root or absolute:

```ts
viteSeo({ routeTree: "src/routeTree.gen.ts" });
```

If the module fails to load or does not export `routeTree`, the build fails with
an error naming the file.

## Differences from Next

`seo` is bound to the instance created by `defineSeo`: it inherits the site
defaults from there, with no global state. You can have several independent
instances.

## Known limits

- **`alternates` per page only.** `canonical` and `languages` are declared in
  the `seo(...)` of each page; in `defineSeo` they are ignored, so `rootHead()`
  emits neither canonical nor hreflang links.
- **Several `openGraph.images`.** TanStack deduplicates meta tags by `property`,
  so with several images only the last `og:image` survives.
- **Dev serves direct URLs only.** In `vite dev` the generated files
  (`/feed.xml`, `/atom.xml`, `/feed.json`, `/llms.txt`, `/llms-full.txt`,
  `/page.md`, ...) are served at their direct URL. There is no `Accept`
  negotiation (that lives in `vite-serve`) and no hot reload of content files:
  restart the dev server after editing them.
- **No user aliases or plugins in the build-time loader.** Convention files, the
  route tree and the `createRouter` module are loaded with a minimal Vite SSR
  loader that does **not** apply your aliases or plugins. Use relative imports.
- **`siteUrl` must be an origin** (`https://example.com`), not a URL with a path.
- **Vite `base`.** The dev middleware and the links injected into the HTML
  ignore Vite's `base` option: paths are always at the root (`/sitemap.xml`,
  `/robots.txt`, `/manifest.webmanifest`, `/feed.xml`, ...).
- **Content collisions.** The plugin does not check collisions between `.md`
  outputs and other files already in `dist`.
