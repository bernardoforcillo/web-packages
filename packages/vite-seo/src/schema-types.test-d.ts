import { defineSeo } from "./index";
import type { JsonLdGraph, Schema, Thing } from "./index";

const site = defineSeo({ title: "S" });

const typed: Schema.Article = { "@type": "Article", headline: "x" };
const asThing: Thing = typed;

site.seo({ jsonLd: typed });
site.seo({ jsonLd: asThing });
site.seo({ jsonLd: { "@type": "Article", headline: "x" } });
site.seo({ jsonLd: [typed, { "@type": "WebSite", name: "n" }] });

const graph: JsonLdGraph = {
  "@context": "https://schema.org",
  "@graph": [typed, { "@type": "WebSite", name: "n" }],
};
site.seo({ jsonLd: graph });
site.seo({ jsonLd: [graph, typed] });
