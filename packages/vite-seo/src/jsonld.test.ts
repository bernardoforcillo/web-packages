import { describe, expect, it } from "vitest";
import {
  article,
  breadcrumbList,
  faqPage,
  organization,
  product,
  webSite,
} from "./jsonld";

const CTX = "https://schema.org";

describe("article", () => {
  it("includes all fields", () => {
    const r = article({
      headline: "H",
      datePublished: "2024-01-01",
      dateModified: "2024-02-01",
      author: [{ name: "A", url: "https://a.com" }, { name: "B" }],
      image: ["https://x/1.png", "https://x/2.png"],
      description: "D",
    });
    expect(r["@context"]).toBe(CTX);
    expect(r["@type"]).toBe("Article");
    expect(r.headline).toBe("H");
    expect(r.datePublished).toBe("2024-01-01");
    expect(r.dateModified).toBe("2024-02-01");
    expect(r.image).toEqual(["https://x/1.png", "https://x/2.png"]);
    expect(r.description).toBe("D");
    expect(r.author).toEqual([
      { "@type": "Person", name: "A", url: "https://a.com" },
      { "@type": "Person", name: "B" },
    ]);
  });
  it("single author becomes one Person; only required fields", () => {
    const r = article({ headline: "H", author: { name: "A" } });
    expect(r.author).toEqual({ "@type": "Person", name: "A" });
    const min = article({ headline: "H" });
    expect(Object.keys(min).sort()).toEqual(["@context", "@type", "headline"]);
  });
});

describe("product", () => {
  it("includes all fields", () => {
    const r = product({
      name: "P",
      description: "D",
      image: "https://x/p.png",
      sku: "S1",
      brand: "Acme",
      offers: {
        price: 9.99,
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        url: "https://x/p",
      },
    });
    expect(r["@context"]).toBe(CTX);
    expect(r["@type"]).toBe("Product");
    expect(r.brand).toEqual({ "@type": "Brand", name: "Acme" });
    expect(r.offers).toEqual({
      "@type": "Offer",
      price: 9.99,
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      url: "https://x/p",
    });
    expect(r.sku).toBe("S1");
  });
  it("only required fields; offers without optionals", () => {
    const min = product({ name: "P" });
    expect(Object.keys(min).sort()).toEqual(["@context", "@type", "name"]);
    const r = product({ name: "P", offers: { price: "5", priceCurrency: "USD" } });
    expect(r.offers).toEqual({ "@type": "Offer", price: "5", priceCurrency: "USD" });
    expect(Object.keys(r.offers as object)).not.toContain("availability");
  });
});

describe("faqPage", () => {
  it("builds Question/Answer entities", () => {
    const r = faqPage([{ question: "Q?", answer: "A." }]);
    expect(r["@context"]).toBe(CTX);
    expect(r["@type"]).toBe("FAQPage");
    expect(r.mainEntity).toEqual([
      {
        "@type": "Question",
        name: "Q?",
        acceptedAnswer: { "@type": "Answer", text: "A." },
      },
    ]);
  });
  it("empty list", () => {
    expect(faqPage([]).mainEntity).toEqual([]);
  });
});

describe("breadcrumbList", () => {
  it("positions start at 1", () => {
    const r = breadcrumbList([
      { name: "Home", url: "https://x/" },
      { name: "Blog", url: "https://x/blog" },
    ]);
    expect(r["@context"]).toBe(CTX);
    expect(r["@type"]).toBe("BreadcrumbList");
    expect(r.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://x/" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://x/blog" },
    ]);
  });
  it("empty list", () => {
    expect(breadcrumbList([]).itemListElement).toEqual([]);
  });
});

describe("organization", () => {
  it("includes all fields", () => {
    const r = organization({
      name: "O",
      url: "https://o.com",
      logo: "https://o.com/l.png",
      sameAs: ["https://twitter.com/o"],
    });
    expect(r["@context"]).toBe(CTX);
    expect(r["@type"]).toBe("Organization");
    expect(r.logo).toBe("https://o.com/l.png");
    expect(r.sameAs).toEqual(["https://twitter.com/o"]);
  });
  it("only required fields", () => {
    const r = organization({ name: "O", url: "https://o.com" });
    expect(Object.keys(r).sort()).toEqual(["@context", "@type", "name", "url"]);
  });
});

describe("webSite", () => {
  it("builds WebSite", () => {
    const r = webSite({ name: "W", url: "https://w.com" });
    expect(r).toEqual({
      "@context": CTX,
      "@type": "WebSite",
      name: "W",
      url: "https://w.com",
    });
  });
});

describe("id option", () => {
  it("emits @id right after @type, only when provided", () => {
    const cases: Record<string, [Record<string, unknown>, Record<string, unknown>]> = {
      article: [article({ headline: "H", id: "#a" }), article({ headline: "H" })],
      product: [product({ name: "P", id: "#a" }), product({ name: "P" })],
      faqPage: [faqPage([], "#a"), faqPage([])],
      breadcrumbList: [breadcrumbList([], "#a"), breadcrumbList([])],
      organization: [organization({ name: "O", url: "u", id: "#a" }), organization({ name: "O", url: "u" })],
      webSite: [webSite({ name: "W", url: "u", id: "#a" }), webSite({ name: "W", url: "u" })],
    };
    for (const [name, [withId, without]] of Object.entries(cases)) {
      const keys = Object.keys(withId);
      expect(withId["@id"], name).toBe("#a");
      expect(keys.indexOf("@id"), name).toBe(keys.indexOf("@type") + 1);
      expect("@id" in without, name).toBe(false);
    }
  });
});
