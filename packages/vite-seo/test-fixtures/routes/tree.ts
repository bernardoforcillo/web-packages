import { createRootRoute, createRoute } from "@tanstack/react-router";
import { defineSeo } from "../../src/seo";

export const site = defineSeo({
  metadataBase: "https://x.it",
  title: { default: "Sito", template: "%s | Sito" },
});

function build(withExtras: boolean) {
const root = createRootRoute({ head: site.rootHead });

const index = createRoute({
  getParentRoute: () => root,
  path: "/",
  head: site.seo({ title: "Home", description: "D", alternates: { canonical: "/" } }),
});

const about = createRoute({
  getParentRoute: () => root,
  path: "/about",
  head: site.seo({
    title: "About",
    description: "D",
    alternates: { canonical: "/about" },
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage" },
    cache: { revalidate: 60 },
  }),
});

const post = createRoute({
  getParentRoute: () => root,
  path: "/posts/$postId",
  loader: () => ({ title: "T" }),
  head: site.seo<{ loaderData?: { title: string } }>(({ loaderData }) => ({ title: loaderData!.title })),
});

const stats = createRoute({
  getParentRoute: () => root,
  path: "/stats",
  beforeLoad: () => ({}),
  head: site.seo({ title: "Stats" }),
});

const plain = createRoute({ getParentRoute: () => root, path: "/plain" });

return root.addChildren(withExtras ? [index, about, post, stats, plain] : [index, about, post]);
}

/** Esattamente le route di crates/vite-serve/tests/fixtures/seo-routes.json. */
export const sharedTree = build(false);

/** Albero completo, con /stats (beforeLoad) e /plain (senza head). */
export const routeTree = build(true);

const throwingRoot = createRootRoute();
const boom = createRoute({
  getParentRoute: () => throwingRoot,
  path: "/boom",
  head: () => {
    throw new Error("boom");
  },
});
export const throwingTree = throwingRoot.addChildren([boom]);
