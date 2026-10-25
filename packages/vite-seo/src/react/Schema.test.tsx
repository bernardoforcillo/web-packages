import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Product, Thing } from "../schema";
import { jsonLdString, toJsonLd } from "../schema/jsonld";
import { Schema } from "./Schema";

const product: Product = {
  "@type": "Product",
  name: "Kruvi </script>",
  image: ["https://example.com/a.png"],
  offers: {
    "@type": "Offer",
    price: 29.99,
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
  },
};

describe("jsonld", () => {
  it("adds @context and escapes script-breaking characters", () => {
    expect(toJsonLd(product)["@context"]).toBe("https://schema.org");
    expect(jsonLdString(product)).not.toContain("</script>");
  });

  it("merges several nodes into one @graph", () => {
    const org: Thing = { "@type": "Organization", name: "Kruvi" };
    const out = toJsonLd([product, org]);
    expect(out["@graph"]).toHaveLength(2);
  });
});

describe("<Schema>", () => {
  it("renders JSON-LD by default", () => {
    const html = renderToStaticMarkup(<Schema data={product} />);
    expect(html).toContain('<script type="application/ld+json">');
  });

  it("renders Microdata with nested scopes and links", () => {
    const html = renderToStaticMarkup(<Schema data={product} format="microdata" />);
    expect(html).toContain('itemType="https://schema.org/Product"');
    expect(html).toContain('itemProp="offers"');
    expect(html).toContain('<meta itemProp="price" content="29.99"/>');
    expect(html).toContain('<link itemProp="availability" href="https://schema.org/InStock"/>');
    expect(html).toContain('<link itemProp="image" href="https://example.com/a.png"/>');
  });

  it("renders RDFa with vocab only on the root", () => {
    const html = renderToStaticMarkup(<Schema data={product} format="rdfa" />);
    expect(html.match(/vocab=/g)).toHaveLength(1);
    expect(html).toContain('typeof="Product"');
    expect(html).toContain('property="offers"');
    expect(html).toContain('<meta property="priceCurrency" content="EUR"/>');
  });
});
