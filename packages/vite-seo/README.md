# @bernardoforcillo/vite-seo

API Metadata in stile Next.js per TanStack Router e Vite: descrivi titolo,
Open Graph, Twitter, canonical, JSON-LD e ottieni il `head` per la tua route.
Un plugin Vite genera `sitemap.xml`, `robots.txt` e `manifest.webmanifest`.

## Installazione

```sh
pnpm add @bernardoforcillo/vite-seo
```

`@tanstack/react-router` (^1) è una peer dependency; `vite` (>=6) serve solo per
il plugin (`@bernardoforcillo/vite-seo/vite`) ed è opzionale.

## Uso

Crea un'unica istanza con `defineSeo`, passando i metadati di default del sito.
Restituisce `rootHead` e `seo`.

```ts
// src/seo.ts
import { defineSeo } from "@bernardoforcillo/vite-seo";

export const site = defineSeo({
  metadataBase: "https://example.com",
  title: { default: "Il mio sito", template: "%s | Il mio sito" },
  description: "Descrizione di default",
  openGraph: { siteName: "Il mio sito", type: "website" },
  twitter: { card: "summary_large_image" },
});
```

Nella route root usa `site.rootHead` come `head`:

```tsx
// src/routes/__root.tsx
import { createRootRoute } from "@tanstack/react-router";
import { site } from "../seo";

export const Route = createRootRoute({
  head: site.rootHead,
});
```

In una pagina usa `site.seo(...)`, in forma oggetto:

```tsx
// src/routes/about.tsx
import { createFileRoute } from "@tanstack/react-router";
import { site } from "../seo";

export const Route = createFileRoute("/about")({
  head: site.seo({
    title: "Chi siamo",
    description: "La nostra storia",
    alternates: { canonical: "/about" },
  }),
});
```

oppure in forma funzione, per usare `loaderData` (o `params`):

```tsx
// src/routes/posts.$id.tsx
import { createFileRoute } from "@tanstack/react-router";
import { site } from "../seo";

type Post = { title: string; summary: string };

export const Route = createFileRoute("/posts/$id")({
  loader: async (): Promise<Post> => ({ title: "Ciao", summary: "Un articolo" }),
  head: site.seo<{ loaderData?: Post }>((ctx) => ({
    title: ctx.loaderData?.title,
    description: ctx.loaderData?.summary,
  })),
});
```

### Titolo e template

`title` accetta una stringa oppure `{ default, template, absolute }`.

- Una stringa nella pagina (`title: "Chi siamo"`) viene inserita nel `template`
  del sito: `"%s | Il mio sito"` produce `Chi siamo | Il mio sito`.
- `default` è il titolo usato quando la pagina non ne definisce uno.
- `absolute` ignora il template.

### JSON-LD

Passa i nodi schema.org con `jsonLd`. Il JSON-LD è emesso **come un unico
`@graph`**: i nodi del sito (in `defineSeo`) e quelli della pagina (in
`seo(...)`) finiscono in un solo `<script type="application/ld+json">`, prima
quelli del sito. Un solo nodo produce comunque un `@graph`.

```tsx
import { defineSeo, article, webSite } from "@bernardoforcillo/vite-seo";

const site = defineSeo({
  jsonLd: webSite({ id: "https://example.com/#website", name: "Il mio sito", url: "https://example.com" }),
});

head: site.seo({
  title: "Il mio articolo",
  jsonLd: article({
    id: "https://example.com/blog/post#article",
    headline: "Il mio articolo",
    datePublished: "2026-10-24",
    author: { name: "Bernardo Forcillo" },
    // collega il nodo della pagina a quello del sito
    isPartOf: { "@id": "https://example.com/#website" },
  }),
}),
```

Risultato: `{"@context":"https://schema.org","@graph":[<WebSite>,<Article>]}`.

- **Unione per `@id`**: i nodi con lo stesso `@id` diventano uno solo (merge
  superficiale, le chiavi successive — quelle della pagina — vincono; la
  posizione è quella della prima occorrenza). I nodi senza `@id` non vengono
  mai uniti.
- **Contenitori**: puoi passare anche `{ "@context"?, "@graph": [...] }`; i
  suoi nodi vengono appiattiti nel grafo.
- **`@context` diverso**: un nodo con un `@context` diverso da
  `https://schema.org` (o `http://schema.org`) non può entrare nel grafo e viene
  emesso in uno `<script>` a parte, dopo il grafo. Sui nodi del grafo il
  `@context` viene rimosso (resta quello del grafo).
- **Root head**: `rootHead()` non emette JSON-LD. TanStack Router concatena gli
  script di tutte le route, quindi il grafo del sito comparirebbe due volte;
  lo emette `seo(...)` insieme ai nodi della pagina. Una route senza `seo(...)`
  non ha quindi JSON-LD.
- **Helper**: `article`, `product`, `faqPage`, `breadcrumbList`,
  `organization` e `webSite`. Accettano un `id` opzionale, emesso come `@id`
  (subito dopo `@type`) solo se presente; per `faqPage` e `breadcrumbList` è il
  secondo argomento: `faqPage(items, "https://example.com/faq#faq")`.
- Il serializzatore esegue l'escape di `<` per l'inserimento in uno `<script>`.

#### Tipi schema.org

I tipi sono esportati solo come tipi (nessun codice a runtime):
`import type { Schema, Thing } from "@bernardoforcillo/vite-seo"`, ad esempio
`const post: Schema.Article = { "@type": "Article", headline: "…" }`.

Limite noto: per mantenere compilabili i vecchi oggetti letterali
(`{ "@type": "Article", headline: "x" }`), `JsonLdObject` accetta anche un
record generico, quindi il compilatore **non rifiuta** proprietà con tipo
sbagliato (ad esempio `headline: 5`). I tipi schema.org servono
all'autocompletamento.

### Direttiva `cache`

`cache: { revalidate: 60 }` oppure `cache: false` è riservata: la direttiva è
riportata nel risultato di `head()` (`head.cache`), ma TanStack Router scarta le
chiavi sconosciute sul percorso server. Come il server SSR la legga è definito
nella Parte 3 (non ancora disponibile). Per ora non produce alcun effetto.

## Sitemap, robots e manifest

Crea i file nella cartella `src` (configurabile con `dir`). L'export di default
può essere un valore o una funzione (anche asincrona). I tipi sono in
`MetadataRoute`.

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
  name: "Il mio sito",
  short_name: "Sito",
  start_url: "/",
  display: "standalone",
  icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
});
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { viteSeo } from "@bernardoforcillo/vite-seo/vite";

export default defineConfig({
  plugins: [viteSeo({ siteUrl: "https://example.com" })],
});
```

L'opzione `siteUrl` del plugin è obbligatoria per la riga `Sitemap:` automatica
in `robots.txt` (`metadataBase` non viene letto in fase di build). Con `siteUrl`, se esiste `sitemap.ts` e `robots.ts` non dichiara `sitemap`, la
riga `Sitemap: https://example.com/sitemap.xml` viene aggiunta in automatico a
`robots.txt`. In dev i file sono serviti da un middleware; in build vengono
emessi come asset. Se esiste `manifest.ts`, viene inserito anche il
`<link rel="manifest">` nell'HTML.

## Differenze da Next

`seo` è legato all'istanza creata da `defineSeo`: eredita i default del sito da
lì, senza alcuno stato globale. Si possono avere più istanze indipendenti.

## Limiti noti

- **`alternates` solo per pagina.** `canonical` e `languages` si dichiarano in
  `seo(...)` di ogni pagina; in `defineSeo` vengono ignorati, quindi `rootHead()`
  non emette né canonical né link hreflang.
- **Più `openGraph.images`.** TanStack deduplica i meta per `property`, quindi con
  più immagini sopravvive solo l'ultimo `og:image`.
- **Tipo del contesto.** Il tipo di default del contesto ha `params` e
  `loaderData` opzionali e `unknown`. Restringi `loaderData` da solo oppure passa
  il generico `Ctx`, come in `site.seo<{ loaderData?: Post }>(...)`.
- **Import nei file di convenzione.** `sitemap.ts`, `robots.ts` e `manifest.ts`
  vengono caricati in build con un loader SSR di Vite minimale, che **non**
  applica alias né plugin dell'utente. Usa import relativi.
- **`base` di Vite.** Il middleware di dev e il link al manifest ignorano
  l'opzione `base` di Vite: i percorsi sono sempre alla radice
  (`/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`).

## Server Rust

In build il plugin emette anche `seo-routes.json` in `outDir`, un manifest che
descrive le route del sito e il loro `head`, pensato per essere letto da un
server Rust. Il file è prodotto da `routeTree` (per default
`src/routeTree.gen.ts`, se esiste; altrimenti il manifest non viene emesso).

Contratto, `version: 1`:

```json
{
  "version": 1,
  "routes": [
    { "path": "/about", "dynamic": false, "head": { "meta": [], "links": [], "scripts": [] } },
    { "path": "/posts/$postId", "dynamic": true }
  ]
}
```

- `path`: percorso completo della route, con i parametri nella forma TanStack
  (`$postId`).
- `dynamic`: `true` se la route ha parametri, un `loader` o un `beforeLoad`
  (lungo la sua catena), oppure se il suo `head` fallisce quando viene valutato.
- `head`: presente solo se `dynamic` è `false`. Le route dinamiche non portano
  alcun `head`. Una route statica viene emessa con il `head` unito dell'intera
  catena, dalla root alla foglia (le voci successive sostituiscono quelle con la
  stessa chiave).

### Il `head` di una route

Esempio completo di una route statica:

```json
{
  "path": "/about",
  "dynamic": false,
  "head": {
    "meta": [
      { "title": "About | Sito" },
      { "name": "description", "content": "Chi siamo" },
      { "property": "og:title", "content": "About | Sito" }
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

- `meta`: elenco di mappe attributo → valore. Una voce con la sola chiave
  `title` diventa `<title>`; tutte le altre diventano `<meta>`.
- `links`: elenco di mappe attributo → valore, resi come `<link>`. L'attributo
  delle lingue si scrive `hrefLang` (non `hreflang`), come in React.
- `scripts`: elenco di `{ type, children }`, resi come `<script type="…">`. Per
  il JSON-LD, `children` è la stringa JSON già serializzata (con `<` scritto
  come `<`).
- `cache`: opzionale. `false` indica «non mettere in cache» (`no-store`);
  `{ "revalidate": n }` indica una cache condivisa di `n` secondi
  (`public, s-maxage=n`). Il valore viene solo trasportato nel manifest: lo
  applica chi lo legge, e può essere sovrascritto dalla configurazione del
  server.
- Non sono ammesse chiavi sconosciute nelle route e nel `head`: il formato è
  chiuso, e un cambio incompatibile comporta un nuovo numero di `version`.

### Schema JSON

Il contratto è descritto da uno JSON Schema (draft 2020-12) nel repository, in
[`schema/seo-routes.schema.json`](schema/seo-routes.schema.json). Serve per
validare il file in CI o in un editor, per esempio con `ajv`:

```sh
npx ajv-cli validate --spec=draft2020 \
  -s node_modules/@bernardoforcillo/vite-seo/schema/seo-routes.schema.json \
  -d dist/seo-routes.json
```

Lo schema vieta un `head` sulle route dinamiche e lo richiede su quelle
statiche. Nota: la cartella `schema/` oggi non è inclusa nel pacchetto
pubblicato (il campo `files` di `package.json` elenca solo `dist`), quindi il
comando sopra funziona solo se la aggiungi a `files` o se usi il file dal
repository.

### Opzione `routeTree`

L'opzione `routeTree` indica il modulo che esporta `routeTree`, relativo alla
root di Vite oppure assoluto:

```ts
viteSeo({ routeTree: "src/routeTree.gen.ts" });
```

Se il modulo non si carica o non esporta `routeTree`, la build fallisce con un
errore che nomina il file.

Limite noto: il modulo è caricato con lo stesso loader SSR minimale dei file di
convenzione, quindi alias e plugin dell'utente **non** sono applicati. Usa
import relativi nella route tree.
