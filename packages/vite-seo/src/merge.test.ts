import { describe, expect, it } from "vitest";
import { toHead } from "./head";
import { mergeMetadata, resolveTitle } from "./merge";

describe("mergeMetadata", () => {
  it("lets the page override simple fields", () => {
    expect(mergeMetadata({ description: "A" }, { description: "B" }).description).toBe("B");
  });

  it("concatenates jsonLd with base first", () => {
    const merged = mergeMetadata(
      { jsonLd: { "@type": "WebSite" } },
      { jsonLd: { "@type": "Article" } },
    );
    expect(merged.jsonLd).toEqual([{ "@type": "WebSite" }, { "@type": "Article" }]);
  });

  it("merges openGraph and twitter field by field", () => {
    const merged = mergeMetadata(
      { openGraph: { siteName: "Site", title: "Base" }, twitter: { site: "@s", title: "B" } },
      { openGraph: { title: "Page" }, twitter: { title: "P" } },
    );
    expect(merged.openGraph).toEqual({ siteName: "Site", title: "Page" });
    expect(merged.twitter).toEqual({ site: "@s", title: "P" });
  });

  it("applies the base template to the page title", () => {
    const merged = mergeMetadata({ title: { default: "Site", template: "%s | Site" } }, { title: "Home" });
    expect(resolveTitle(merged.title)).toBe("Home | Site");
  });

  it("ignores the template for absolute titles", () => {
    const merged = mergeMetadata(
      { title: { default: "Site", template: "%s | Site" } },
      { title: { absolute: "Home" } },
    );
    expect(resolveTitle(merged.title)).toBe("Home");
  });

  it("falls back to the default when the page title is empty", () => {
    const merged = mergeMetadata({ title: { default: "Site", template: "%s | Site" } }, { title: "" });
    expect(resolveTitle(merged.title)).toBe("Site");
  });

  it("preserves the template for later levels", () => {
    const l1 = mergeMetadata({ title: { default: "Site", template: "%s | Site" } }, { title: "A" });
    const l2 = mergeMetadata(l1, { title: "B" });
    expect(resolveTitle(l2.title)).toBe("B | Site");
  });
});

describe("resolveTitle", () => {
  it("returns default", () => {
    expect(resolveTitle({ default: "Site", template: "%s | Site" })).toBe("Site");
  });
  it("returns undefined for no title", () => {
    expect(resolveTitle(undefined)).toBeUndefined();
  });
});

describe("fix wave", () => {
  it("R1: does not interpret $ sequences in the page title", () => {
    const t = "Win $$$ and $& and $`";
    const m = mergeMetadata({ title: { default: "Site", template: "%s | Site" } }, { title: t });
    expect(resolveTitle(m.title)).toBe(`${t} | Site`);
  });
  it("R2: page title/description override inherited og/twitter ones; og.url never inherited", () => {
    const site = {
      openGraph: { title: "Site OG", description: "D", url: "https://x.it/", siteName: "S" },
      twitter: { title: "T", description: "TD", site: "@s" },
    };
    const m = mergeMetadata(site, { title: "About", description: "Desc" });
    expect(m.openGraph).toEqual({ siteName: "S" });
    expect(m.twitter).toEqual({ site: "@s" });
    const h = toHead(m).meta;
    expect(h).toContainEqual({ property: "og:title", content: "About" });
    expect(h).toContainEqual({ property: "og:site_name", content: "S" });
    expect(h.some((x) => x.property === "og:url")).toBe(false);
    expect(mergeMetadata(site, { openGraph: { url: "/p" } }).openGraph?.url).toBe("/p");
    expect(mergeMetadata(site, { title: "About", openGraph: { title: "Own" } }).openGraph?.title).toBe("Own");
  });
  it("R4: undefined nested page values do not clobber site values", () => {
    const site = { openGraph: { siteName: "S", images: "/a.png" }, alternates: { canonical: "/x" } };
    const m = mergeMetadata(site, { openGraph: { images: undefined, siteName: undefined }, alternates: { canonical: undefined } });
    expect(m.openGraph).toEqual({ siteName: "S", images: "/a.png" });
    expect(m.alternates).toEqual({ canonical: "/x" });
    const h = toHead(m).meta;
    expect(h).toContainEqual({ property: "og:image", content: "/a.png" });
  });
});
