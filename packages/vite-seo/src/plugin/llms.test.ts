import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { ContentEntry, MetadataRoute } from "../types";
import { llmsFullToTxt, llmsToTxt, markdownForEntry } from "./llms";

const entry = (over: Partial<ContentEntry> = {}): ContentEntry => ({
  slug: "a",
  url: "/blog/a",
  title: "A",
  tags: [],
  body: "Corpo\n",
  file: "a.md",
  ...over,
});

describe("llmsToTxt", () => {
  it("renders the full case exactly", () => {
    const llms: MetadataRoute.Llms = {
      title: "Title",
      summary: "Summary",
      details: "Details",
      sections: [
        {
          title: "Docs",
          links: [
            { title: "Intro", url: "https://x.it/intro", notes: "Note" },
            { title: "Guide", url: "https://x.it/guida" },
          ],
        },
        {
          title: "Extra",
          optional: true,
          links: [{ title: "Other", url: "https://x.it/altro" }],
        },
      ],
    };
    expect(llmsToTxt(llms)).toBe(
      "# Title\n\n> Summary\n\nDetails\n\n## Docs\n\n- [Intro](https://x.it/intro): Note\n- [Guide](https://x.it/guida)\n\n## Optional\n\n- [Other](https://x.it/altro)\n",
    );
  });

  it("has no doubled blank lines without summary/details", () => {
    const out = llmsToTxt({
      title: "T",
      sections: [{ title: "S", links: [{ title: "L", url: "https://x.it/l" }] }],
    });
    expect(out).toBe("# T\n\n## S\n\n- [L](https://x.it/l)\n");
    expect(out).not.toContain("\n\n\n");
  });

  it("handles title only", () => {
    expect(llmsToTxt({ title: "T", sections: [] })).toBe("# T\n");
  });

  it("puts optional sections last under a single Optional heading", () => {
    const out = llmsToTxt({
      title: "T",
      sections: [
        { title: "O1", optional: true, links: [{ title: "a", url: "https://x.it/a" }] },
        { title: "Main", links: [{ title: "m", url: "https://x.it/m" }] },
        { title: "O2", optional: true, links: [{ title: "b", url: "https://x.it/b" }] },
      ],
    });
    expect(out).toBe(
      "# T\n\n## Main\n\n- [m](https://x.it/m)\n\n## Optional\n\n- [a](https://x.it/a)\n- [b](https://x.it/b)\n",
    );
    expect(out.match(/## Optional/g)).toHaveLength(1);
  });

  it("makes relative urls absolute with siteUrl and leaves them otherwise", () => {
    const llms: MetadataRoute.Llms = {
      title: "T",
      sections: [
        {
          title: "S",
          links: [
            { title: "r", url: "/docs/a" },
            { title: "abs", url: "https://other.it/z" },
          ],
        },
      ],
    };
    const withSite = llmsToTxt(llms, "https://x.it");
    expect(withSite).toContain("- [r](https://x.it/docs/a)");
    expect(withSite).toContain("- [abs](https://other.it/z)");
    expect(llmsToTxt(llms)).toContain("- [r](/docs/a)");
    expect(() => llmsToTxt(llms, "not a url")).not.toThrow();
    expect(llmsToTxt(llms, "not a url")).toContain("- [r](/docs/a)");
  });

  it("escapes brackets in link titles", () => {
    const out = llmsToTxt({
      title: "T",
      sections: [{ title: "S", links: [{ title: "a [b] c", url: "https://x.it/a" }] }],
    });
    expect(out).toContain("- [a \\[b\\] c](https://x.it/a)");
  });
});

describe("llmsFullToTxt", () => {
  it("concatenates entries in order separated by a rule", () => {
    const out = llmsFullToTxt(
      [
        entry({ title: "One", url: "/u", body: "Body one\n" }),
        entry({ title: "Two", url: "/d", body: "Body two\n" }),
      ],
      "https://x.it",
    );
    expect(out).toBe(
      "# One\nhttps://x.it/u\n\nBody one\n\n---\n\n# Two\nhttps://x.it/d\n\nBody two\n",
    );
  });

  it("keeps relative url without siteUrl", () => {
    expect(llmsFullToTxt([entry({ body: "x" })])).toBe("# A\n/blog/a\n\nx\n");
  });
});

describe("markdownForEntry", () => {
  it("round-trips a tricky title and keeps the body byte for byte", () => {
    const body = "# H\n\n![i](./img.png) [l](../x)\n  trailing  \n";
    const md = markdownForEntry(
      entry({ title: 'Guide: "advanced" # 2', url: "/blog/a", body }),
    );
    const m = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(md);
    expect(m).not.toBeNull();
    const fm = parse(m![1]);
    expect(fm.title).toBe('Guide: "advanced" # 2');
    expect(fm.url).toBe("/blog/a");
    expect("description" in fm).toBe(false);
    expect("date" in fm).toBe(false);
    expect(m![2]).toBe(body);
  });

  it("includes description and date when present", () => {
    const md = markdownForEntry(entry({ description: "Desc", date: "2026-01-02" }));
    const fm = parse(/^---\n([\s\S]*?)\n---/.exec(md)![1]);
    expect(fm.description).toBe("Desc");
    expect(String(fm.date)).toContain("2026-01-02");
  });
});
