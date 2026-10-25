import { describe, expect, it } from "vitest";
import { toJsonLdScripts } from "./graph";
import type { JsonLdItem } from "./types";

const parse = (s: { children: string }) => JSON.parse(s.children);

describe("toJsonLdScripts", () => {
  it("returns no scripts for no items", () => {
    expect(toJsonLdScripts([])).toEqual([]);
  });

  it("puts global and page nodes in one script, global first, without @context on nodes", () => {
    const scripts = toJsonLdScripts([
      { "@context": "https://schema.org", "@type": "WebSite", "@id": "https://x.it/#site", name: "S" },
      { "@type": "Article", "@id": "https://x.it/a#a", headline: "H" },
    ]);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.type).toBe("application/ld+json");
    expect(parse(scripts[0]!)).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": "https://x.it/#site", name: "S" },
        { "@type": "Article", "@id": "https://x.it/a#a", headline: "H" },
      ],
    });
  });

  it("emits a graph even for a single node", () => {
    const scripts = toJsonLdScripts([{ "@type": "WebSite", name: "S" }]);
    expect(parse(scripts[0]!)).toEqual({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "WebSite", name: "S" }],
    });
  });

  it("merges nodes with the same @id (later keys win, earlier keys kept, first position)", () => {
    const scripts = toJsonLdScripts([
      { "@type": "Organization", "@id": "#o", name: "G", url: "https://g" },
      { "@type": "WebSite", name: "W" },
      { "@type": "Organization", "@id": "#o", name: "P" },
    ]);
    expect(parse(scripts[0]!)["@graph"]).toEqual([
      { "@type": "Organization", "@id": "#o", name: "P", url: "https://g" },
      { "@type": "WebSite", name: "W" },
    ]);
  });

  it("keeps nodes without @id as separate nodes", () => {
    const scripts = toJsonLdScripts([
      { "@type": "Thing", name: "a" },
      { "@type": "Thing", name: "a" },
    ]);
    expect(parse(scripts[0]!)["@graph"]).toHaveLength(2);
  });

  it("flattens a @graph container", () => {
    const items: JsonLdItem[] = [
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", "@id": "#w", name: "W" },
          { "@type": "Organization", "@id": "#o", name: "O" },
        ],
      },
      { "@type": "Article", headline: "H" },
    ];
    const scripts = toJsonLdScripts(items);
    expect(scripts).toHaveLength(1);
    expect(parse(scripts[0]!)["@graph"]).toEqual([
      { "@type": "WebSite", "@id": "#w", name: "W" },
      { "@type": "Organization", "@id": "#o", name: "O" },
      { "@type": "Article", headline: "H" },
    ]);
  });

  it("treats http://schema.org/ as the default context", () => {
    const scripts = toJsonLdScripts([{ "@context": "http://schema.org/", "@type": "WebSite", name: "W" }]);
    expect(scripts).toHaveLength(1);
    expect(parse(scripts[0]!)["@graph"]).toEqual([{ "@type": "WebSite", name: "W" }]);
  });

  it("emits a foreign-context item as its own script after the graph", () => {
    const foreign = { "@context": "https://example.org/ns", "@type": "X" };
    const scripts = toJsonLdScripts([foreign, { "@type": "WebSite", name: "W" }]);
    expect(scripts).toHaveLength(2);
    expect(parse(scripts[0]!)["@graph"]).toEqual([{ "@type": "WebSite", name: "W" }]);
    expect(parse(scripts[1]!)).toEqual(foreign);
  });

  it("does not let a foreign context inside a container join the graph", () => {
    const scripts = toJsonLdScripts([
      { "@context": { a: "https://a" }, "@graph": [{ "@type": "X" }] },
      { "@type": "WebSite" },
    ]);
    expect(scripts).toHaveLength(2);
    expect(parse(scripts[1]!)).toEqual({ "@context": { a: "https://a" }, "@type": "X" });
  });

  it("escapes hostile strings and round-trips", () => {
    const value = "</script><script>alert(1)</script>";
    const scripts = toJsonLdScripts([{ "@type": "Article", headline: value }]);
    expect(scripts[0]!.children).not.toContain("</script");
    expect(parse(scripts[0]!)["@graph"][0].headline).toBe(value);
  });
});
