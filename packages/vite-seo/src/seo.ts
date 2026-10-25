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
  // alternates (canonical, hreflang) are per-page only: the site ignores them
  const { alternates: _ignored, ...base } = site;
  return {
    // The site's jsonLd must NOT go in the root head: TanStack concatenates the scripts of all
    // routes, so the site graph would appear twice (root + page).
    // seo() emits it, merging site and page nodes into a single @graph.
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
