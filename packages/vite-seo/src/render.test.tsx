import { createMemoryHistory, createRootRoute, createRoute, createRouter, HeadContent, RouterProvider } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defineSeo } from "./seo";

const site = defineSeo({
  metadataBase: "https://x.it",
  title: { default: "Site", template: "%s | Site" },
  description: "Site desc",
  openGraph: { siteName: "Site", images: [{ url: "/og.png" }] },
  twitter: { card: "summary_large_image", site: "@site" },
  jsonLd: { "@type": "WebSite", "@id": "https://x.it/#website", name: "Site" },
  alternates: { canonical: "/", languages: { en: "/en" } },
});

async function render(): Promise<string> {
  const root = createRootRoute({ head: site.rootHead, component: HeadContent });
  const about = createRoute({
    getParentRoute: () => root,
    path: "/about",
    head: site.seo({
      title: "About",
      alternates: { canonical: "/about", languages: { en: "/en/about" } },
      jsonLd: {
        "@type": "Article",
        "@id": "https://x.it/about#article",
        isPartOf: { "@id": "https://x.it/#website" },
        headline: "</script><script>alert(1)</script>",
      },
    }),
  });
  const router = createRouter({
    routeTree: root.addChildren([about]),
    history: createMemoryHistory({ initialEntries: ["/about"] }),
  });
  await router.load();
  return renderToString(<RouterProvider router={router} />);
}

describe("rendered head through TanStack Router", () => {
  it("dedupes and renders the expected tags", async () => {
    const html = await render();
    expect(html.match(/<link rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('href="https://x.it/about"');
    expect(html).toContain('<meta property="og:title" content="About | Site"');
    expect(html).toContain("<title>About | Site</title>");
    expect(html).not.toContain("About | Site | Site");
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
    expect(html).toContain('"@graph"');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"isPartOf":{"@id":"https://x.it/#website"}');
    expect(html).not.toMatch(/<\/script[^>]*>[^<]*alert/);
    expect(html.match(/<\/script/gi)!.length).toBe(html.match(/<script/gi)!.length);
    expect(html).toContain('hrefLang="en"');
    expect(html).not.toContain("hreflang=");
    expect(html).not.toContain("https://x.it/en\"");
  });
});
