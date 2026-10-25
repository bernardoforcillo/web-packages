import type { MetadataRoute } from "../types";

type Feed = MetadataRoute.Feed;
type Item = MetadataRoute.FeedItem;

const EPOCH = "1970-01-01T00:00:00Z";
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: strips chars illegal in XML 1.0
const ILLEGAL_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

function clean(value: string): string {
  return value.replace(ILLEGAL_XML, "");
}

function escapeXml(value: string): string {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** CDATA section; the sequence `]]>` is split across two sections. */
function cdata(value: string): string {
  return `<![CDATA[${clean(value).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function absolute(url: string, siteUrl?: string): string {
  if (!siteUrl || SCHEME.test(url)) return url;
  try {
    return new URL(url, siteUrl).href;
  } catch {
    return url;
  }
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function toDate(value: string | Date | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** RFC 3339, second precision, UTC. */
function rfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

function itemId(item: Item, siteUrl?: string): string {
  return item.id ?? absolute(item.url, siteUrl);
}

function latest(feed: Feed): string {
  if (feed.updated !== undefined) {
    const own = toDate(feed.updated);
    if (own) return rfc3339(own);
  }
  let max: Date | undefined;
  for (const item of feed.items) {
    for (const d of [toDate(item.date), toDate(item.updated)]) {
      if (d && (!max || d > max)) max = d;
    }
  }
  return max ? rfc3339(max) : EPOCH;
}

const text = (tag: string, value: string, indent: string) =>
  `${indent}<${tag}>${escapeXml(value)}</${tag}>`;

export function rssToXml(feed: Feed, siteUrl?: string): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "  <channel>",
    text("title", feed.title, "    "),
    text("link", absolute(feed.link, siteUrl), "    "),
    text("description", feed.description ?? "", "    "),
  ];
  if (feed.language) lines.push(text("language", feed.language, "    "));
  const updated = toDate(feed.updated);
  if (updated) lines.push(text("lastBuildDate", rfc822(updated), "    "));
  if (siteUrl) {
    lines.push(
      `    <atom:link href="${escapeXml(absolute("/feed.xml", siteUrl))}" rel="self" type="application/rss+xml"/>`,
    );
  }
  for (const item of feed.items) {
    const url = absolute(item.url, siteUrl);
    const id = itemId(item, siteUrl);
    lines.push("    <item>", text("title", item.title, "      "), text("link", url, "      "));
    lines.push(`      <guid isPermaLink="${isUrl(id)}">${escapeXml(id)}</guid>`);
    const date = toDate(item.date);
    if (date) lines.push(text("pubDate", rfc822(date), "      "));
    if (item.summary) lines.push(text("description", item.summary, "      "));
    if (item.content) lines.push(`      <content:encoded>${cdata(item.content)}</content:encoded>`);
    for (const a of item.authors ?? []) {
      lines.push(
        a.email
          ? text("author", `${a.email} (${a.name})`, "      ")
          : text("dc:creator", a.name, "      "),
      );
    }
    for (const tag of item.tags ?? []) lines.push(text("category", tag, "      "));
    lines.push("    </item>");
  }
  lines.push("  </channel>", "</rss>", "");
  return lines.join("\n");
}

export function atomToXml(feed: Feed, siteUrl?: string): string {
  const link = absolute(feed.link, siteUrl);
  const lang = feed.language ? ` xml:lang="${escapeXml(feed.language)}"` : "";
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom"${lang}>`,
    text("id", link, "  "),
    text("title", feed.title, "  "),
    `  <link href="${escapeXml(link)}"/>`,
  ];
  if (siteUrl) {
    lines.push(
      `  <link rel="self" type="application/atom+xml" href="${escapeXml(absolute("/atom.xml", siteUrl))}"/>`,
    );
  }
  if (feed.description) lines.push(text("subtitle", feed.description, "  "));
  lines.push(text("updated", latest(feed), "  "));
  for (const item of feed.items) {
    const url = absolute(item.url, siteUrl);
    const date = toDate(item.date);
    const updated = toDate(item.updated) ?? date;
    lines.push(
      "  <entry>",
      text("id", itemId(item, siteUrl), "    "),
      text("title", item.title, "    "),
      `    <link rel="alternate" href="${escapeXml(url)}"/>`,
      text("updated", updated ? rfc3339(updated) : latest(feed), "    "),
    );
    if (date) lines.push(text("published", rfc3339(date), "    "));
    if (item.summary) lines.push(text("summary", item.summary, "    "));
    if (item.content) lines.push(`    <content type="html">${cdata(item.content)}</content>`);
    for (const a of item.authors ?? []) {
      lines.push("    <author>", text("name", a.name, "      "));
      if (a.email) lines.push(text("email", a.email, "      "));
      if (a.url) lines.push(text("uri", absolute(a.url, siteUrl), "      "));
      lines.push("    </author>");
    }
    for (const tag of item.tags ?? []) lines.push(`    <category term="${escapeXml(tag)}"/>`);
    lines.push("  </entry>");
  }
  lines.push("</feed>", "");
  return lines.join("\n");
}

export function jsonFeedToJson(feed: Feed, siteUrl?: string): string {
  const out: Record<string, unknown> = {
    version: "https://jsonfeed.org/version/1.1",
    title: feed.title,
    home_page_url: absolute(feed.link, siteUrl),
  };
  if (siteUrl) out.feed_url = absolute("/feed.json", siteUrl);
  if (feed.description) out.description = feed.description;
  if (feed.language) out.language = feed.language;
  out.items = feed.items.map((item) => {
    const o: Record<string, unknown> = {
      id: itemId(item, siteUrl),
      url: absolute(item.url, siteUrl),
      title: item.title,
    };
    if (item.content) o.content_html = item.content;
    if (item.contentText) o.content_text = item.contentText;
    if (item.summary) o.summary = item.summary;
    const date = toDate(item.date);
    if (date) o.date_published = rfc3339(date);
    const updated = toDate(item.updated);
    if (updated) o.date_modified = rfc3339(updated);
    if (item.authors?.length) {
      o.authors = item.authors.map((a) => ({
        name: a.name,
        ...(a.url ? { url: absolute(a.url, siteUrl) } : {}),
      }));
    }
    if (item.tags?.length) o.tags = item.tags;
    return o;
  });
  return `${JSON.stringify(out, null, 2)}\n`;
}
