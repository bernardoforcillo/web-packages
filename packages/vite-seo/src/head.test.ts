import { describe, expect, it } from "vitest";
import { toHead } from "./head";
import { serializeJsonLd } from "./jsonld";

describe("toHead", () => {
  it("emits title and description", () => {
    const { meta } = toHead({ title: "T", description: "D" });
    expect(meta).toContainEqual({ title: "T" });
    expect(meta).toContainEqual({ name: "description", content: "D" });
  });

  it("emits open graph with image, relative without metadataBase", () => {
    const { meta } = toHead({ openGraph: { title: "T", images: "/a.png" } });
    expect(meta).toContainEqual({ property: "og:title", content: "T" });
    expect(meta).toContainEqual({ property: "og:image", content: "/a.png" });
  });

  it("absolutizes image with metadataBase", () => {
    const { meta } = toHead({ metadataBase: "https://x.it", openGraph: { images: "/a.png" } });
    expect(meta).toContainEqual({ property: "og:image", content: "https://x.it/a.png" });
    const m2 = toHead({ metadataBase: new URL("https://x.it"), openGraph: { images: [{ url: "/b.png" }] } });
    expect(m2.meta).toContainEqual({ property: "og:image", content: "https://x.it/b.png" });
  });

  it("emits twitter tags", () => {
    const { meta } = toHead({ twitter: { card: "summary_large_image", site: "@x" } });
    expect(meta).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
    expect(meta).toContainEqual({ name: "twitter:site", content: "@x" });
  });

  it("derives og/twitter title and description from base fields", () => {
    const { meta } = toHead({ title: "T", description: "D", openGraph: {}, twitter: {} });
    expect(meta).toContainEqual({ property: "og:title", content: "T" });
    expect(meta).toContainEqual({ property: "og:description", content: "D" });
    expect(meta).toContainEqual({ name: "twitter:title", content: "T" });
    expect(meta).toContainEqual({ name: "twitter:description", content: "D" });
  });

  it("emits canonical and hreflang links", () => {
    const { links } = toHead({
      metadataBase: "https://x.it",
      alternates: { canonical: "/p", languages: { en: "/en/p" } },
    });
    expect(links).toContainEqual({ rel: "canonical", href: "https://x.it/p" });
    expect(links).toContainEqual({ rel: "alternate", href: "https://x.it/en/p", hrefLang: "en" });
  });

  it("keeps canonical relative without metadataBase", () => {
    expect(toHead({ alternates: { canonical: "/p" } }).links).toContainEqual({ rel: "canonical", href: "/p" });
  });

  it("emits robots", () => {
    const { meta } = toHead({ robots: { index: false, follow: false } });
    expect(meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
    expect(toHead({ robots: "noarchive" }).meta).toContainEqual({ name: "robots", content: "noarchive" });
  });

  it("emits json-ld as a single @graph script", () => {
    const { scripts } = toHead({ jsonLd: [{ "@type": "A" }, { "@type": "B" }] });
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toEqual({
      type: "application/ld+json",
      children: JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "A" }, { "@type": "B" }] }),
    });
  });

  it("emits no script without json-ld", () => {
    expect(toHead({ title: "T" }).scripts).toEqual([]);
  });

  it("passes cache through", () => {
    expect(toHead({ cache: { revalidate: 60 } }).cache).toEqual({ revalidate: 60 });
  });
});

describe("serializeJsonLd", () => {
  it("neutralises closing script tags and round-trips", () => {
    const data = { "@type": "Article", headline: "</script><script>alert(1)</script>" };
    const out = serializeJsonLd(data);
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual(data);
  });
});
