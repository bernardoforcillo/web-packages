import { afterEach, describe, expect, it, vi } from "vitest";
import { edgeAll, edgeOk } from "../../test-fixtures/prerender/edge";
import { okTree, tree } from "../../test-fixtures/prerender/tree";
import { htmlToMarkdown, prerenderRoutes } from "./prerender";

const base = { url: "https://x.it/blog/" };

describe("htmlToMarkdown", () => {
  it("takes content from main, dropping nav/footer/script/style", () => {
    const { markdown } = htmlToMarkdown(
      "<body><nav>NAV</nav><header>HEAD</header><main><p>keep</p><script>S</script><style>.a{}</style></main><footer>FOOT</footer></body>",
      base,
    );
    expect(markdown).toBe("keep");
  });
  it("drops nav/footer/aside/svg/template/noscript inside the chosen container", () => {
    const { markdown } = htmlToMarkdown(
      "<main><p>a</p><aside>SIDE</aside><svg><title>SVG</title></svg><template>TPL</template><noscript>NOS</noscript><footer>F</footer></main>",
      base,
    );
    expect(markdown).toBe("a");
  });
  it("falls back to article, then body", () => {
    expect(htmlToMarkdown("<body><nav>N</nav><article><p>art</p></article><p>other</p></body>", base).markdown).toBe("art");
    expect(htmlToMarkdown("<body><nav>N</nav><p>body text</p><footer>F</footer></body>", base).markdown).toBe("body text");
  });
  it("renders headings h1..h6 as atx", () => {
    const { markdown } = htmlToMarkdown("<main><h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6></main>", base);
    expect(markdown).toBe("# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f");
  });
  it("renders nested lists with - markers", () => {
    const { markdown } = htmlToMarkdown("<main><ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul></main>", base);
    expect(markdown).toMatch(/^-\s+one\n\s+-\s+nested\n-\s+two$/);
  });
  it("renders tables as GFM tables", () => {
    const { markdown } = htmlToMarkdown(
      "<main><table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr></tbody></table></main>",
      base,
    );
    expect(markdown).toBe("| Name | Value |\n| --- | --- |\n| a | 1 |");
  });
  it("keeps < and & in fenced code blocks", () => {
    const { markdown } = htmlToMarkdown("<main><pre><code>if (a &lt; b &amp;&amp; c) {}</code></pre></main>", base);
    expect(markdown).toBe("```\nif (a < b && c) {}\n```");
  });
  it("makes links absolute against site and route", () => {
    const withSite = { ...base, siteUrl: "https://x.it" };
    expect(htmlToMarkdown('<main><a href="/x">t</a></main>', withSite).markdown).toBe("[t](https://x.it/x)");
    expect(htmlToMarkdown('<main><a href="/x">t</a></main>', base).markdown).toBe("[t](/x)");
    expect(htmlToMarkdown('<main><a href="../y">t</a></main>', withSite).markdown).toBe("[t](https://x.it/y)");
    expect(htmlToMarkdown('<main><a href="z">t</a></main>', base).markdown).toBe("[t](https://x.it/blog/z)");
  });
  it("leaves fragments, mailto, tel and absolute urls untouched", () => {
    const b = { ...base, siteUrl: "https://x.it" };
    const { markdown } = htmlToMarkdown(
      '<main><a href="#f">a</a> <a href="mailto:a@b.it">b</a> <a href="tel:+39">c</a> <a href="https://o.com/p">d</a></main>',
      b,
    );
    expect(markdown).toBe("[a](#f) [b](mailto:a@b.it) [c](tel:+39) [d](https://o.com/p)");
  });
  it("rewrites image sources to absolute urls", () => {
    expect(htmlToMarkdown('<main><img src="/i/a.png" alt="pic"></main>', { ...base, siteUrl: "https://x.it" }).markdown).toBe(
      "![pic](https://x.it/i/a.png)",
    );
    expect(htmlToMarkdown('<main><img src="a.png" alt="pic"></main>', base).markdown).toBe("![pic](https://x.it/blog/a.png)");
  });
  it("decodes html entities", () => {
    expect(htmlToMarkdown("<main><p>Fish &amp; chips &mdash; caf&eacute;</p></main>", base).markdown).toBe("Fish & chips — café");
  });
  it("takes the title from the first h1", () => {
    expect(htmlToMarkdown("<main><h1>Hello <em>x</em></h1><h1>Two</h1></main>", base).title).toBe("Hello x");
    expect(htmlToMarkdown("<main><p>no heading</p></main>", base).title).toBeUndefined();
  });
  it("returns empty markdown for empty input", () => {
    expect(htmlToMarkdown("", base)).toEqual({ markdown: "" });
  });
});

describe("prerenderRoutes", () => {
  const common = { root: process.cwd(), siteUrl: "https://x.it", load: async () => ({}) };

  it("renders only static routes", async () => {
    const { pages, warnings } = await prerenderRoutes(okTree, common);
    expect(pages.map((p) => p.url).sort()).toEqual(["/", "/ctx", "/docs/guide"]);
    expect(warnings).toEqual([]);
    const text = JSON.stringify(pages);
    expect(text).not.toContain("LOADER-PAGE");
    expect(text).not.toContain("PARAM-PAGE");
  });

  it("fills the entry fields and converts the content", async () => {
    const { pages } = await prerenderRoutes(okTree, common);
    const home = pages.find((p) => p.url === "/")!;
    expect(home).toMatchObject({ slug: "", url: "/", title: "Home Title", file: "prerender:/", tags: [] });
    expect(home.body).toContain("# Welcome");
    expect(home.body).toContain("Fish & chips");
    expect(home.body).not.toContain("NAVLINK");
    expect(home.body).not.toContain("FOOTER-TEXT");

    const guide = pages.find((p) => p.url === "/docs/guide")!;
    expect(guide.slug).toBe("docs/guide");
    expect(guide.title).toBe("Guide");
    expect(guide.file).toBe("prerender:/docs/guide");
    expect(guide.body).toContain("| Name | Value |");
    expect(guide.body).toContain("if (a < b && c) { x(); }");
    expect(guide.body).toContain("[abs](https://x.it/x)");
    expect(guide.body).toContain("[rel](https://x.it/y)");
    expect(guide.body).toContain("![pic](https://x.it/img/a.png)");
    expect(guide.body).not.toContain("SCRIPT_TEXT");
  });

  it("skips a route that throws with a warning naming the path", async () => {
    const { pages, warnings } = await prerenderRoutes(tree, common);
    expect(pages.map((p) => p.url)).not.toContain("/boom");
    expect(pages.map((p) => p.url)).toContain("/");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("/boom");
  });

  it("rejects naming the path in strict mode", async () => {
    await expect(prerenderRoutes(tree, { ...common, strict: true })).rejects.toThrow(/\/boom/);
  });

  it("uses the custom createRouter module", async () => {
    const mod = await import("../../test-fixtures/prerender/custom-router");
    const load = vi.fn(async () => mod as unknown as Record<string, unknown>);
    const plain = await prerenderRoutes(okTree, common);
    expect(plain.pages.find((p) => p.url === "/ctx")!.body).toContain("Env: default");
    const { pages, warnings } = await prerenderRoutes(okTree, { ...common, createRouter: "/src/router.tsx", load });
    expect(load).toHaveBeenCalledWith("/src/router.tsx");
    expect(warnings).toEqual([]);
    expect(pages.find((p) => p.url === "/ctx")!.body).toContain("Env: custom");
  });

  it("fails clearly when the createRouter module has no createRouter export", async () => {
    await expect(
      prerenderRoutes(okTree, { ...common, createRouter: "/r.ts", load: async () => ({}) }),
    ).rejects.toThrow(/createRouter/);
  });
});

describe("prerenderRoutes edge cases", () => {
  const common = { root: process.cwd(), siteUrl: "https://x.it", load: async () => ({}) };

  it("normalises trailing slashes, dedupes layout+index, ignores header h1 for titles", async () => {
    const { pages, warnings } = await prerenderRoutes(edgeOk, common);
    expect(warnings).toEqual([]);
    expect(pages.map((p) => p.url).sort()).toEqual(["/docs", "/noh1", "/trail", "/withh1"]);
    const docs = pages.find((p) => p.url === "/docs")!;
    expect(docs.slug).toBe("docs");
    expect(docs.file).toBe("prerender:/docs");
    expect(docs.body).toContain("DOCS-INDEX");
    expect(pages.find((p) => p.url === "/trail")!.body).toContain("TRAIL-PAGE");
    expect(pages.find((p) => p.url === "/noh1")!.title).toBe("https://x.it/noh1");
    expect(pages.find((p) => p.url === "/withh1")!.title).toBe("Real Title");
    expect(JSON.stringify(pages)).not.toContain("SITE");
  });

  it("warns and skips redirecting and empty routes, naming the path and the reason", async () => {
    const { pages, warnings } = await prerenderRoutes(edgeAll, common);
    expect(pages.map((p) => p.url).sort()).toEqual(["/docs", "/noh1", "/trail", "/withh1"]);
    expect(warnings).toHaveLength(2);
    expect(warnings.find((w) => w.includes('"/go"'))).toBeDefined();
    expect(warnings.find((w) => w.includes('"/empty"'))).toMatch(/empty output/);
  });

  it("rejects in strict mode naming the path", async () => {
    await expect(prerenderRoutes(edgeAll, { ...common, strict: true })).rejects.toThrow(/\/(go|empty)/);
  });
});

describe("htmlToMarkdown title scope", () => {
  it("ignores an h1 in a dropped header", () => {
    expect(htmlToMarkdown("<body><header><h1>SITE</h1></header><main><p>x</p></main></body>", base).title).toBeUndefined();
  });
});

describe("prerenderRoutes without react-dom/server", () => {
  afterEach(() => {
    vi.doUnmock("react-dom/server");
    vi.resetModules();
  });
  it("says so when react-dom/server cannot be imported", async () => {
    vi.resetModules();
    vi.doMock("react-dom/server", () => {
      throw new Error("Cannot find module");
    });
    const { prerenderRoutes: fresh } = await import("./prerender");
    await expect(fresh(okTree, { root: process.cwd(), load: async () => ({}) })).rejects.toThrow(/react-dom\/server/);
  });
});
