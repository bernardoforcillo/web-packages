import type { MetadataRoute } from "../types";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

export function sitemapToXml(sitemap: MetadataRoute.Sitemap): string {
  const hasAlternates = sitemap.some((e) => e.alternates?.languages);
  const ns =
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' +
    (hasAlternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : "");
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<urlset ${ns}>`];
  for (const e of sitemap) {
    lines.push("  <url>", `    <loc>${esc(e.url)}</loc>`);
    for (const [lang, href] of Object.entries(e.alternates?.languages ?? {})) {
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="${esc(lang)}" href="${esc(href)}" />`,
      );
    }
    if (e.lastModified !== undefined) {
      const d = e.lastModified instanceof Date ? e.lastModified.toISOString() : e.lastModified;
      lines.push(`    <lastmod>${esc(d)}</lastmod>`);
    }
    if (e.changeFrequency !== undefined) {
      lines.push(`    <changefreq>${esc(e.changeFrequency)}</changefreq>`);
    }
    if (e.priority !== undefined) {
      lines.push(`    <priority>${e.priority}</priority>`);
    }
    lines.push("  </url>");
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}

export function robotsToTxt(robots: MetadataRoute.Robots): string {
  const blocks = toArray(robots.rules).map((rule) => {
    const lines: string[] = [];
    const agents = toArray(rule.userAgent);
    for (const a of agents.length ? agents : ["*"]) lines.push(`User-Agent: ${a}`);
    for (const a of toArray(rule.allow)) lines.push(`Allow: ${a}`);
    for (const d of toArray(rule.disallow)) lines.push(`Disallow: ${d}`);
    if (rule.crawlDelay !== undefined) lines.push(`Crawl-delay: ${rule.crawlDelay}`);
    return lines.join("\n");
  });
  const tail: string[] = [];
  for (const s of toArray(robots.sitemap)) tail.push(`Sitemap: ${s}`);
  if (robots.host) tail.push(`Host: ${robots.host}`);
  const parts = [...blocks];
  if (tail.length) parts.push(tail.join("\n"));
  return parts.join("\n\n") + "\n";
}

export function manifestToJson(manifest: MetadataRoute.Manifest): string {
  return JSON.stringify(manifest, null, 2);
}
