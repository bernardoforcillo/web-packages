import { mergeMetadata } from "./merge";
import { toHead } from "./head";
import type { Head, Metadata } from "./types";

export type SeoInput<Ctx> = Metadata | ((ctx: Ctx) => Metadata);

export function defineSeo(site: Metadata): {
  rootHead: () => Head;
  seo: <Ctx extends { params?: unknown; loaderData?: unknown } = { params?: unknown; loaderData?: unknown }>(
    input: SeoInput<Ctx>,
  ) => (ctx: Ctx) => Head;
} {
  // alternates (canonical, hreflang) sono solo per pagina: il sito li ignora
  const { alternates: _ignored, ...base } = site;
  return {
    // jsonLd del sito NON va nel root head: TanStack concatena gli script di tutte
    // le route, quindi il grafo del sito comparirebbe due volte (root + pagina).
    // Lo emette seo(), che unisce nodi del sito e della pagina in un solo @graph.
    rootHead: () => {
      const { jsonLd: _jsonLd, ...rootBase } = base;
      return toHead(mergeMetadata(rootBase, {}));
    },
    seo:
      <Ctx extends { params?: unknown; loaderData?: unknown }>(input: SeoInput<Ctx>) =>
      (ctx: Ctx): Head =>
        toHead(mergeMetadata(base, typeof input === "function" ? input(ctx) : input)),
  };
}
