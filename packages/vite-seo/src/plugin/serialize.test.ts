import { describe, expect, it } from "vitest";
import { manifestToJson, robotsToTxt, sitemapToXml } from "./serialize";

describe("sitemapToXml", () => {
  it("emits urlset, loc, lastmod, priority, changefreq", () => {
    const xml = sitemapToXml([
      {
        url: "https://x.it/",
        lastModified: new Date("2026-01-02"),
        priority: 0.8,
        changeFrequency: "weekly",
      },
    ]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain("<loc>https://x.it/</loc>");
    expect(xml).toContain("<lastmod>2026-01-02T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<priority>0.8</priority>");
    expect(xml).toContain("<changefreq>weekly</changefreq>");
  });

  it("passes string lastModified as-is", () => {
    const xml = sitemapToXml([{ url: "https://x.it/", lastModified: "2026-02-03" }]);
    expect(xml).toContain("<lastmod>2026-02-03</lastmod>");
  });

  it("escapes XML special characters in text nodes", () => {
    const xml = sitemapToXml([{ url: "https://x.it/?a=1&b=<2>" }]);
    expect(xml).toContain("<loc>https://x.it/?a=1&amp;b=&lt;2&gt;</loc>");
  });

  it("escapes quotes in alternate attributes", () => {
    const xml = sitemapToXml([
      { url: "https://x.it/", alternates: { languages: { it: 'https://x.it/it"?a&b' } } },
    ]);
    expect(xml).toContain("&quot;");
    expect(xml).toContain("&amp;b");
  });
});

describe("robotsToTxt", () => {
  it("matches the exact expected output", () => {
    expect(
      robotsToTxt({
        rules: [{ userAgent: "*", allow: "/", disallow: ["/a", "/b"] }],
        sitemap: "https://x.it/sitemap.xml",
      }),
    ).toBe(
      "User-Agent: *\nAllow: /\nDisallow: /a\nDisallow: /b\n\nSitemap: https://x.it/sitemap.xml\n",
    );
  });

  it("defaults userAgent to *", () => {
    expect(robotsToTxt({ rules: { disallow: "/x" } })).toBe("User-Agent: *\nDisallow: /x\n");
  });
});

describe("manifestToJson", () => {
  it("is valid 2-space JSON and keeps all fields", () => {
    const m = { name: "N", icons: [{ src: "/i.png", sizes: "192x192" }] };
    const json = manifestToJson(m);
    expect(JSON.parse(json)).toEqual(m);
    expect(json).toBe(JSON.stringify(m, null, 2));
  });
});
