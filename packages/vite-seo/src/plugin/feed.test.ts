import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import type { MetadataRoute } from "../types";
import { atomToXml, jsonFeedToJson, rssToXml } from "./feed";

const nasty: MetadataRoute.Feed = {
  title: 'A & B <C> "D"',
  link: "https://x.it/",
  description: "desc ]]> & <b>",
  language: "it",
  items: [
    {
      title: 'A & B <C> "D"',
      url: "https://x.it/a",
      summary: "sum ]]> mary & <i>",
      content: "<p>html ]]> & more</p>",
      contentText: "raw ]]> text",
      date: new Date("2026-01-02T03:04:05Z"),
      authors: [{ name: "Ann & Co", email: "a@x.it" }, { name: "Bob" }],
      tags: ["t&1", "t2"],
    },
  ],
};

const plain = (xml: string) => new XMLParser({ ignoreAttributes: false }).parse(xml);

describe("well-formedness", () => {
  it.each([
    ["rss", rssToXml],
    ["atom", atomToXml],
  ])("%s with hostile input is valid XML", (_n, fn) => {
    const xml = fn(nasty, "https://x.it");
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(XMLValidator.validate(fn({ ...nasty, items: [] }))).toBe(true);
  });
  it("strips illegal control characters", () => {
    const xml = rssToXml({ title: "a\u0001b", link: "/", items: [] });
    expect(XMLValidator.validate(xml)).toBe(true);
  });
});

describe("rssToXml", () => {
  const xml = rssToXml(nasty, "https://x.it");
  it("has root, namespaces, self link", () => {
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('rel="self"');
    expect(rssToXml(nasty)).not.toContain('rel="self"');
  });
  it("escapes text and splits ]]> in CDATA", () => {
    const doc = plain(xml).rss.channel;
    expect(doc.title).toBe('A & B <C> "D"');
    expect(doc.item.description).toBe("sum ]]> mary & <i>");
    expect(doc.item["content:encoded"]).toBe("<p>html ]]> & more</p>");
    expect(xml).toContain("]]]]><![CDATA[>");
    expect(xml).not.toContain("raw");
  });
  it("uses RFC 822 dates from Date and ISO string", () => {
    expect(xml).toContain("<pubDate>Fri, 02 Jan 2026 03:04:05 GMT</pubDate>");
    const x = rssToXml({
      title: "t",
      link: "/",
      items: [{ title: "i", url: "/i", date: "2026-01-02T03:04:05Z" }],
    });
    expect(x).toContain("<pubDate>Fri, 02 Jan 2026 03:04:05 GMT</pubDate>");
  });
  it("guid permalink true for URL, false otherwise", () => {
    expect(xml).toContain('<guid isPermaLink="true">https://x.it/a</guid>');
    const x = rssToXml({
      title: "t",
      link: "/",
      items: [
        { title: "i", url: "/i", id: "urn:x:1" },
        { title: "j", url: "/j", id: "abc" },
      ],
    });
    expect(x).toContain('<guid isPermaLink="false">abc</guid>');
    expect(x).toContain('<guid isPermaLink="false">urn:x:1</guid>');
  });
  it("author only with email, otherwise dc:creator", () => {
    expect(xml).toContain("<author>a@x.it (Ann &amp; Co)</author>");
    expect(xml).toContain("<dc:creator>Bob</dc:creator>");
    expect(xml).not.toContain("<dc:creator>Ann");
  });
  it("categories", () => {
    expect(xml).toContain("<category>t&amp;1</category>");
    expect(xml).toContain("<category>t2</category>");
  });
  it("omits pubDate when invalid date and never throws", () => {
    const x = rssToXml({ title: "t", link: "/", items: [{ title: "i", url: "/i", date: "nope" }] });
    expect(x).not.toContain("pubDate");
  });
  it("absolutizes relative urls with siteUrl, keeps them without", () => {
    const f: MetadataRoute.Feed = { title: "t", link: "/", items: [{ title: "i", url: "/p/1" }] };
    expect(rssToXml(f, "https://x.it")).toContain("<link>https://x.it/p/1</link>");
    expect(rssToXml(f, "https://x.it")).toContain("<link>https://x.it/</link>");
    expect(rssToXml(f)).toContain("<link>/p/1</link>");
    expect(rssToXml(f, "not a url")).toContain("<link>/p/1</link>");
  });
  it("is deterministic", () => {
    expect(rssToXml(nasty, "https://x.it")).toBe(rssToXml(nasty, "https://x.it"));
  });
});

describe("atomToXml", () => {
  const xml = atomToXml(nasty, "https://x.it");
  it("has root and entries", () => {
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    const doc = plain(xml).feed;
    expect(doc.title).toBe('A & B <C> "D"');
    expect(doc.entry.summary).toBe("sum ]]> mary & <i>");
    expect(doc.entry.content["#text"]).toBe("<p>html ]]> & more</p>");
    expect(xml).not.toContain("raw");
    expect(doc.entry.published).toBe("2026-01-02T03:04:05Z");
  });
  it("entry id = id or url", () => {
    expect(plain(xml).feed.entry.id).toBe("https://x.it/a");
    const x = atomToXml({ title: "t", link: "/", items: [{ title: "i", url: "/i", id: "my-id" }] });
    expect(plain(x).feed.entry.id).toBe("my-id");
  });
  it("feed updated precedence", () => {
    const base = { title: "t", link: "/" };
    const items = [
      { title: "a", url: "/a", date: "2026-01-01T00:00:00Z" },
      {
        title: "b",
        url: "/b",
        date: "2026-01-01T00:00:00Z",
        updated: new Date("2026-03-01T00:00:00Z"),
      },
    ];
    expect(plain(atomToXml({ ...base, updated: "2025-05-05T00:00:00Z", items })).feed.updated).toBe(
      "2025-05-05T00:00:00Z",
    );
    expect(plain(atomToXml({ ...base, items })).feed.updated).toBe("2026-03-01T00:00:00Z");
    expect(plain(atomToXml({ ...base, items: [] })).feed.updated).toBe("1970-01-01T00:00:00Z");
    expect(plain(atomToXml({ ...base, items: [{ title: "a", url: "/a" }] })).feed.updated).toBe(
      "1970-01-01T00:00:00Z",
    );
  });
  it("authors and categories", () => {
    const e = plain(xml).feed.entry;
    expect(e.author[0].name).toBe("Ann & Co");
    expect(e.author[0].email).toBe("a@x.it");
    expect(e.category[0]["@_term"]).toBe("t&1");
  });
  it("absolute urls and deterministic", () => {
    const f: MetadataRoute.Feed = { title: "t", link: "/", items: [{ title: "i", url: "/p/1" }] };
    expect(atomToXml(f, "https://x.it")).toContain('href="https://x.it/p/1"');
    expect(atomToXml(f)).toContain('href="/p/1"');
    expect(atomToXml(nasty, "https://x.it")).toBe(atomToXml(nasty, "https://x.it"));
  });
});

describe("jsonFeedToJson", () => {
  const out = jsonFeedToJson(nasty, "https://x.it");
  const j = JSON.parse(out);
  it("emits JSON Feed 1.1", () => {
    expect(j.version).toBe("https://jsonfeed.org/version/1.1");
    expect(j.title).toBe('A & B <C> "D"');
    expect(j.home_page_url).toBe("https://x.it/");
    expect(j.feed_url).toBe("https://x.it/feed.json");
  });
  it("maps item fields", () => {
    const i = j.items[0];
    expect(i.id).toBe("https://x.it/a");
    expect(i.url).toBe("https://x.it/a");
    expect(i.content_html).toBe("<p>html ]]> & more</p>");
    expect(i.content_text).toBe("raw ]]> text");
    expect(i.summary).toBe("sum ]]> mary & <i>");
    expect(i.tags).toEqual(["t&1", "t2"]);
    expect(i.authors).toEqual([{ name: "Ann & Co" }, { name: "Bob" }]);
    expect(i.date_published).toBe("2026-01-02T03:04:05Z");
  });
  it("omits absent keys", () => {
    const k = JSON.parse(
      jsonFeedToJson({ title: "t", link: "/", items: [{ title: "i", url: "/i" }] }),
    ).items[0];
    expect("date_published" in k).toBe(false);
    expect("content_html" in k).toBe(false);
    expect("content_text" in k).toBe(false);
  });
  it("absolutizes and is deterministic", () => {
    const f: MetadataRoute.Feed = { title: "t", link: "/", items: [{ title: "i", url: "/p/1" }] };
    expect(JSON.parse(jsonFeedToJson(f, "https://x.it")).items[0].url).toBe("https://x.it/p/1");
    expect(JSON.parse(jsonFeedToJson(f)).items[0].url).toBe("/p/1");
    expect(jsonFeedToJson(nasty, "https://x.it")).toBe(out);
  });
});
