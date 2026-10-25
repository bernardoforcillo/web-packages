import { describe, expect, it } from "vitest";
import { defineSeo } from "./seo";

const site = { title: { default: "S", template: "%s | S" } };

describe("defineSeo", () => {
  it("merges static page metadata", () => {
    const { seo } = defineSeo(site);
    expect(seo({ title: "P" })({}).meta).toContainEqual({ title: "P | S" });
  });
  it("accepts a function of loaderData", () => {
    const { seo } = defineSeo(site);
    const h = seo<{ loaderData: { name: string } }>(({ loaderData }) => ({ title: loaderData.name }))({
      loaderData: { name: "X" },
    });
    expect(h.meta).toContainEqual({ title: "X | S" });
  });
  it("does not throw when loaderData is undefined", () => {
    const { seo } = defineSeo(site);
    const h = seo<{ loaderData: { name: string } | undefined }>(({ loaderData }) => ({ title: loaderData?.name }))({
      loaderData: undefined,
    });
    expect(h.meta).toContainEqual({ title: "S" });
  });
  it("rootHead returns site defaults only", () => {
    const { rootHead } = defineSeo(site);
    expect(rootHead().meta).toEqual([{ title: "S" }]);
  });
});

describe("alternates are page-only", () => {
  const withAlt = { ...site, metadataBase: "https://x.it", alternates: { canonical: "/", languages: { en: "/en" } } };
  it("seo() does not inherit site alternates", () => {
    const { seo } = defineSeo(withAlt);
    const links = seo({ alternates: { canonical: "/about" } })({}).links;
    expect(links.filter((l) => l.rel === "canonical")).toEqual([{ rel: "canonical", href: "https://x.it/about" }]);
    expect(links.some((l) => l.rel === "alternate")).toBe(false);
  });
  it("rootHead emits no canonical/alternate", () => {
    const { rootHead } = defineSeo(withAlt);
    expect(rootHead().links.filter((l) => l.rel === "canonical" || l.rel === "alternate")).toEqual([]);
  });
});

describe("json-ld graph", () => {
  it("merges site and page nodes into one @graph, merging by @id", () => {
    const { seo, rootHead } = defineSeo({
      ...site,
      jsonLd: { "@type": "WebSite", "@id": "https://x.it/#site", name: "S" },
    });
    const scripts = seo({
      jsonLd: [
        { "@type": "WebSite", "@id": "https://x.it/#site", name: "S2" },
        { "@type": "Article", "@id": "https://x.it/a#a", isPartOf: { "@id": "https://x.it/#site" }, headline: "H" },
      ],
    })({}).scripts;
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0]!.children)).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": "https://x.it/#site", name: "S2" },
        { "@type": "Article", "@id": "https://x.it/a#a", isPartOf: { "@id": "https://x.it/#site" }, headline: "H" },
      ],
    });
    // il root head non emette JSON-LD: lo fa seo(), altrimenti il grafo sarebbe duplicato
    expect(rootHead().scripts).toEqual([]);
  });
});
