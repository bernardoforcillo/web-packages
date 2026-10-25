import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadContent } from "./content";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vite-seo-content-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(rel: string, text: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

describe("loadContent", () => {
  it("parses a full frontmatter", async () => {
    write(
      "content/blog/ciao.md",
      "---\ntitle: Hello\ndescription: Desc\ndate: 2026-03-04T10:00:00Z\nupdated: 2026-03-05T10:00:00Z\ntags: [a, b]\n---\nBody here\n",
    );
    const [e] = await loadContent({ dir: "content" }, root);
    expect(e).toMatchObject({
      slug: "blog/ciao",
      url: "/blog/ciao",
      title: "Hello",
      description: "Desc",
      date: "2026-03-04T10:00:00.000Z",
      updated: "2026-03-05T10:00:00.000Z",
      tags: ["a", "b"],
      body: "Body here\n",
    });
    expect(e.file).toBe(join(root, "content", "blog", "ciao.md"));
  });

  it("derives URLs from paths", async () => {
    write("c/index.md", "# Home");
    write("c/blog/index.md", "# Blog");
    write("c/blog/ciao.md", "# Hello");
    const urls = (await loadContent({ dir: "c" }, root)).map((e) => e.url).sort();
    expect(urls).toEqual(["/", "/blog", "/blog/ciao"]);
  });

  it("applies baseUrl", async () => {
    write("c/blog/ciao.md", "# Hello");
    write("c/index.md", "# Home");
    const urls = (await loadContent({ dir: "c", baseUrl: "/docs" }, root)).map((e) => e.url).sort();
    expect(urls).toEqual(["/docs", "/docs/blog/ciao"]);
  });

  it("honours url override", async () => {
    write("c/a.md", "---\nurl: /custom\n---\n# A");
    const [e] = await loadContent({ dir: "c" }, root);
    expect(e.url).toBe("/custom");
  });

  it("derives title from H1 then file name", async () => {
    write("c/a.md", "intro\n\n# From title\n");
    write("c/my-file.md", "no title");
    const m = Object.fromEntries((await loadContent({ dir: "c" }, root)).map((e) => [e.slug, e.title]));
    expect(m).toEqual({ a: "From title", "my-file": "my-file" });
  });

  it("excludes drafts", async () => {
    write("c/a.md", "---\ndraft: true\n---\n# A");
    write("c/b.md", "# B");
    expect((await loadContent({ dir: "c" }, root)).map((e) => e.slug)).toEqual(["b"]);
  });

  it("handles BOM and CRLF", async () => {
    write("c/a.md", "﻿---\r\ntitle: T\r\n---\r\nBody\r\n");
    const [e] = await loadContent({ dir: "c" }, root);
    expect(e.title).toBe("T");
    expect(e.body).toBe("Body\r\n");
  });

  it("uses whole text when no frontmatter", async () => {
    write("c/a.md", "# T\n\ntesto\n");
    const [e] = await loadContent({ dir: "c" }, root);
    expect(e.body).toBe("# T\n\ntesto\n");
  });

  it("does not mistake --- in the body for frontmatter", async () => {
    write("c/a.md", "# T\n\n---\n\nfoo: bar\n---\n");
    const [e] = await loadContent({ dir: "c" }, root);
    expect(e.title).toBe("T");
    expect(e.body).toBe("# T\n\n---\n\nfoo: bar\n---\n");
  });

  it("normalizes unquoted YAML dates", async () => {
    write("c/a.md", "---\ndate: 2026-01-02\n---\nx");
    const [e] = await loadContent({ dir: "c" }, root);
    expect(e.date).toBe("2026-01-02T00:00:00.000Z");
  });

  it("wraps a single tag string", async () => {
    write("c/a.md", "---\ntags: single\n---\nx");
    const [e] = await loadContent({ dir: "c" }, root);
    expect(e.tags).toEqual(["single"]);
  });

  it("errors on duplicate URLs naming both files", async () => {
    write("c/a.md", "---\nurl: /x\n---\n");
    write("c/b.md", "---\nurl: /x\n---\n");
    await expect(loadContent({ dir: "c" }, root)).rejects.toThrow(/a\.md[\s\S]*b\.md/);
  });

  it("errors on invalid YAML naming the file", async () => {
    write("c/bad.md", "---\ntitle: [unclosed\n---\nx");
    await expect(loadContent({ dir: "c" }, root)).rejects.toThrow(/bad\.md/);
  });

  it("errors on missing directory naming it", async () => {
    await expect(loadContent({ dir: "nope" }, root)).rejects.toThrow(/nope/);
  });

  it("ignores dotfiles and node_modules", async () => {
    write("c/.hidden/a.md", "# a");
    write("c/.b.md", "# b");
    write("c/node_modules/x/c.md", "# c");
    write("c/ok.md", "# ok");
    expect((await loadContent({ dir: "c" }, root)).map((e) => e.slug)).toEqual(["ok"]);
  });

  it("sorts by date desc, undated last, then title", async () => {
    write("c/old.md", "---\ndate: 2025-01-01\n---\n# Old");
    write("c/new.md", "---\ndate: 2026-01-01\n---\n# New");
    write("c/zeta.md", "# Zeta");
    write("c/alpha.md", "# Alpha");
    expect((await loadContent({ dir: "c" }, root)).map((e) => e.slug)).toEqual(["new", "old", "alpha", "zeta"]);
  });

  it("normalises url overrides before the duplicate check", async () => {
    write("c/a.md", "---\nurl: /x/\n---\n# A");
    write("c/b.md", "---\nurl: x\n---\n# B");
    await expect(loadContent({ dir: "c" }, root)).rejects.toThrow(/Duplicate content URL "\/x"/);
  });

  it("normalises a bare override and a baseUrl without leading slash", async () => {
    write("c/a.md", "---\nurl: y/\n---\n# A");
    write("c/b.md", "# B");
    const urls = (await loadContent({ dir: "c", baseUrl: "docs/" }, root)).map((e) => e.url).sort();
    expect(urls).toEqual(["/docs/b", "/y"]);
  });

  it("collides an /x/ override with x.md", async () => {
    write("c/a.md", "---\nurl: /x/\n---\n# A");
    write("c/x.md", "# X");
    await expect(loadContent({ dir: "c" }, root)).rejects.toThrow(/Duplicate content URL/);
  });
});
