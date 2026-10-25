import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLValidator } from "fast-xml-parser";
import { build, createLogger, createServer } from "vite";
import type { Rollup } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viteSeo } from "./index";
import { PrerenderDependencyError, prerenderRoutes } from "./prerender";

vi.mock("./prerender", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./prerender")>();
  return { ...actual, prerenderRoutes: vi.fn(actual.prerenderRoutes) };
});

function captureLogger(messages: string[]) {
  const logger = createLogger("info");
  logger.warn = (m) => void messages.push(m);
  logger.warnOnce = (m) => void messages.push(m);
  logger.info = () => undefined;
  logger.error = () => undefined;
  return logger;
}

const dirs: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "vite-seo-"));
  dirs.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><html><head><title>t</title></head><body></body></html>",
  );
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, "src", name), content);
  }
  return root;
}

async function run(root: string, options?: Parameters<typeof viteSeo>[0]) {
  const result = (await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [viteSeo(options)],
    build: { write: false, outDir: join(root, "dist") },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const out = Array.isArray(result) ? result[0] : result;
  const get = (name: string) => {
    const f = out.output.find((o) => o.fileName === name);
    if (!f) return undefined;
    return f.type === "asset" ? String(f.source) : f.code;
  };
  return { get, names: out.output.map((o) => o.fileName) };
}

const sitemapTs = `export default async () => [{ url: "https://example.com/a" }];`;
const robotsTs = `export default { rules: { userAgent: "*", allow: "/" } };`;
const manifestTs = `export default { name: "App", short_name: "A" };`;

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("viteSeo build", () => {
  it("emits sitemap.xml and robots.txt", async () => {
    const root = fixture({ "sitemap.ts": sitemapTs, "robots.ts": robotsTs });
    const { get } = await run(root);
    expect(get("sitemap.xml")).toContain("<loc>https://example.com/a</loc>");
    expect(get("robots.txt")).toContain("User-Agent: *");
  }, 60000);

  it("emits manifest and injects the link tag", async () => {
    const root = fixture({ "manifest.ts": manifestTs });
    const { get } = await run(root);
    expect(JSON.parse(get("manifest.webmanifest")!).name).toBe("App");
    expect(get("index.html")).toContain(
      '<link rel="manifest" href="/manifest.webmanifest">',
    );
  }, 60000);

  it("appends Sitemap line to robots.txt using siteUrl", async () => {
    const root = fixture({ "sitemap.ts": sitemapTs, "robots.ts": robotsTs });
    const { get } = await run(root, { siteUrl: "https://example.com" });
    expect(get("robots.txt")).toContain("Sitemap: https://example.com/sitemap.xml");
  }, 60000);

  it("ignores missing convention files", async () => {
    const root = fixture({});
    const { get, names } = await run(root);
    expect(get("index.html")).not.toContain('rel="manifest"');
    expect(names).not.toContain("sitemap.xml");
    expect(names).not.toContain("robots.txt");
    expect(names).not.toContain("manifest.webmanifest");
  }, 60000);
});

describe("viteSeo dev", () => {
  it("serves sitemap.xml and robots.txt", async () => {
    const root = fixture({ "sitemap.ts": sitemapTs, "robots.ts": robotsTs });
    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true },
      plugins: [viteSeo()],
    });
    try {
      const call = (url: string) =>
        new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
          const chunks: string[] = [];
          const headers: Record<string, string> = {};
          const res = {
            statusCode: 200,
            setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
            getHeader: (k: string) => headers[k.toLowerCase()],
            write: (c: string) => void chunks.push(String(c)),
            end: (c?: string) => {
              if (c) chunks.push(String(c));
              resolve({
                status: res.statusCode,
                type: headers["content-type"] ?? "",
                body: chunks.join(""),
              });
            },
          };
          server.middlewares(
            { url, method: "GET", headers: {} } as never,
            res as never,
            (err?: unknown) => reject(err ?? new Error("not handled " + url)),
          );
        });
      const s = await call("/sitemap.xml");
      expect(s.status).toBe(200);
      expect(s.type).toContain("application/xml");
      expect(s.body).toContain("https://example.com/a");
      const r = await call("/robots.txt");
      expect(r.status).toBe(200);
      expect(r.type).toContain("text/plain");
    } finally {
      await server.close();
    }
  }, 60000);
});

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures/plugin");

async function runFixture(name: string, options?: Parameters<typeof viteSeo>[0]) {
  return run(join(fixturesDir, name), options);
}

describe("viteSeo seo-routes.json", () => {
  it("emits seo-routes.json from the default src/routeTree.gen.ts", async () => {
    const { get } = await runFixture("default");
    const raw = get("seo-routes.json")!;
    expect(raw.endsWith("}\n")).toBe(true);
    expect(raw).toContain('\n  "version": 1');
    const manifest = JSON.parse(raw);
    expect(manifest.version).toBe(1);
    const paths = manifest.routes.map((r: { path: string }) => r.path).sort();
    expect(paths).toEqual(["/", "/about", "/posts/$postId"]);
    const post = manifest.routes.find((r: { path: string }) => r.path === "/posts/$postId");
    expect(post).toEqual({ path: "/posts/$postId", dynamic: true });
    const about = manifest.routes.find((r: { path: string }) => r.path === "/about");
    expect(about.dynamic).toBe(false);
    expect(about.head.meta.length).toBeGreaterThan(0);
  }, 60000);

  it("honours the routeTree option (relative path)", async () => {
    const { get } = await runFixture("custom", { routeTree: "src/tree.ts" });
    expect(JSON.parse(get("seo-routes.json")!).version).toBe(1);
  }, 60000);

  it("honours the routeTree option (absolute path)", async () => {
    const abs = join(fixturesDir, "custom", "src", "tree.ts");
    const { get } = await runFixture("custom", { routeTree: abs });
    expect(JSON.parse(get("seo-routes.json")!).routes.length).toBe(3);
  }, 60000);

  it("emits nothing without a route tree file or option", async () => {
    const { names } = await runFixture("none");
    expect(names).not.toContain("seo-routes.json");
  }, 60000);

  it("fails naming the file when routeTree is not exported", async () => {
    await expect(runFixture("broken")).rejects.toThrow(/routeTree\.gen\.ts/);
  }, 60000);

  it("fails naming the file when the module cannot be loaded", async () => {
    await expect(runFixture("missing", { routeTree: "src/nope.ts" })).rejects.toThrow(/nope\.ts/);
  }, 60000);
});

// ---------------------------------------------------------------------------
// Feed, llms.txt and markdown
// ---------------------------------------------------------------------------

const contentSite = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures/content-site");

/** Temporary site with arbitrary files (paths relative to the root) and no route tree. */
function site(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "vite-seo-site-"));
  dirs.push(root);
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><html><head><title>t</title></head><body></body></html>",
  );
  for (const [name, text] of Object.entries(files)) {
    const p = join(root, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return root;
}

const feedTs = (extra = "") =>
  `export default (ctx) => ({ title: "Blog & Co", link: ctx.siteUrl ?? "/", ${extra} items: ctx.content.map((e) => ({ title: e.title, url: e.url, date: e.date })) });`;
const post = "---\ntitle: Post\ndate: 2026-01-01\n---\nBody";

describe("viteSeo content-site build", () => {
  const options = { siteUrl: "https://example.com", content: { dir: "content" } };

  it("emits feed, llms, markdown files and the feed link", async () => {
    const { get, names } = await run(contentSite, options);
    const feed = get("feed.xml")!;
    expect(XMLValidator.validate(feed)).toBe(true);
    expect(feed).toContain("https://example.com/blog/ciao");
    expect(feed).toContain("Ciao: mondo &amp; co");
    expect(feed).not.toContain("Bozza");
    expect(get("llms.txt")).toContain("https://example.com/blog/ciao");
    expect(get("sitemap.xml")).toContain("<loc>https://example.com/blog/ciao</loc>");
    expect(names).not.toContain("atom.xml");
    expect(names).not.toContain("bozza.md");
    expect(get("blog/ciao.md")).toContain("Corpo del post con ]]> e & dentro.");
    expect(get("blog/ciao.md")).toMatch(/^---\ntitle: /);
    expect(get("index.md")).toContain("Benvenuti nel sito.");
    expect(get("index.html")).toContain(
      '<link rel="alternate" type="application/rss+xml" title="Il mio sito &amp; blog" href="/feed.xml">',
    );
  }, 60000);

  it("prerenders uncovered static routes: about.md after content in llms-full.txt, content wins on /", async () => {
    const { get, names } = await run(contentSite, options);
    expect(get("about.md")).toContain("ABOUT-ROUTE-TEXT");
    expect(get("about.md")).toContain("title: About us");
    expect(get("index.md")).not.toContain("HOME-ROUTE");
    const full = get("llms-full.txt")!;
    expect(full).not.toContain("HOME-ROUTE");
    expect(full.indexOf("Corpo del post")).toBeGreaterThan(-1);
    expect(full.indexOf("ABOUT-ROUTE-TEXT")).toBeGreaterThan(full.indexOf("Corpo del post"));
    expect(full.indexOf("Benvenuti nel sito.")).toBeLessThan(full.indexOf("ABOUT-ROUTE-TEXT"));
    expect(names).toContain("seo-routes.json");
  }, 60000);

  it("markdown.prerender false disables the pages", async () => {
    const { get, names } = await run(contentSite, { ...options, markdown: { prerender: false } });
    expect(names).not.toContain("about.md");
    expect(get("llms-full.txt")).not.toContain("ABOUT-ROUTE-TEXT");
  }, 60000);

  it("without content the prerendered pages are still emitted, including / and llms-full.txt", async () => {
    const { get } = await run(contentSite, { siteUrl: "https://example.com" });
    expect(get("index.md")).toContain("HOME-ROUTE");
    expect(get("about.md")).toContain("ABOUT-ROUTE-TEXT");
    expect(get("llms-full.txt")).toContain("HOME-ROUTE");
  }, 60000);
});

describe("viteSeo feed formats and links", () => {
  it("formats rss/atom/json emit three files and three links", async () => {
    const root = site({
      "src/feed.js": feedTs('formats: ["rss", "atom", "json"],'),
      "content/a.md": post,
    });
    const { get } = await run(root, { content: { dir: "content" } });
    expect(XMLValidator.validate(get("feed.xml")!)).toBe(true);
    expect(XMLValidator.validate(get("atom.xml")!)).toBe(true);
    expect(JSON.parse(get("feed.json")!).title).toBe("Blog & Co");
    const html = get("index.html")!;
    expect(html).toContain('<link rel="alternate" type="application/rss+xml" title="Blog &amp; Co" href="/feed.xml">');
    expect(html).toContain('<link rel="alternate" type="application/atom+xml" title="Blog &amp; Co" href="/atom.xml">');
    expect(html).toContain('<link rel="alternate" type="application/feed+json" title="Blog &amp; Co" href="/feed.json">');
    expect(html.match(/rel="alternate"/g)).toHaveLength(3);
  }, 60000);

  it("duplicate formats emit once", async () => {
    const root = site({ "src/feed.js": feedTs('formats: ["rss", "rss"],'), "content/a.md": post });
    const { get } = await run(root, { content: { dir: "content" } });
    expect(get("index.html")!.match(/rel="alternate"/g)).toHaveLength(1);
  }, 60000);

  it("no feed file: no feed output and no link", async () => {
    const root = site({ "content/a.md": post });
    const { get, names } = await run(root, { content: { dir: "content" } });
    expect(names.filter((n) => /^(feed|atom)\./.test(n))).toEqual([]);
    expect(names).not.toContain("llms.txt");
    expect(names).not.toContain("llms-full.txt");
    expect(get("a.md")).toContain("Body");
    expect(get("index.html")).not.toContain('rel="alternate"');
  }, 60000);

  it("no content option: no .md and no llms-full.txt", async () => {
    const root = site({
      "src/llms.js": `export default (ctx) => ({ title: "S", sections: [] });`,
    });
    const { get, names } = await run(root);
    expect(get("llms.txt")).toContain("# S");
    expect(names.filter((n) => n.endsWith(".md"))).toEqual([]);
    expect(names).not.toContain("llms-full.txt");
  }, 60000);

  it("a plain exported value still works and ctx reaches robots/manifest functions", async () => {
    const root = site({
      "src/sitemap.js": `export default [{ url: "https://example.com/plain" }];`,
      "src/robots.js": `export default (ctx) => ({ rules: { userAgent: "*", disallow: "/" + ctx.content.length + ctx.pages.length } });`,
      "src/manifest.js": `export default (ctx) => ({ name: "n" + ctx.content.length });`,
      "content/a.md": post,
    });
    const { get } = await run(root, { content: { dir: "content" } });
    expect(get("sitemap.xml")).toContain("/plain");
    expect(get("robots.txt")).toContain("Disallow: /10");
    expect(JSON.parse(get("manifest.webmanifest")!).name).toBe("n1");
  }, 60000);

  it("baseUrl moves URLs and files; a url override moves the file", async () => {
    const root = site({
      "src/feed.js": feedTs(),
      "content/a.md": post,
      "content/b.md": "---\ntitle: B\nurl: /moved/here/\n---\nB",
      "content/sec/index.md": "---\ntitle: Sec\n---\nS",
    });
    const { get, names } = await run(root, { content: { dir: "content", baseUrl: "/docs" } });
    expect(get("docs/a.md")).toContain("Body");
    expect(get("moved/here.md")).toContain("url: /moved/here");
    expect(get("docs/sec/index.md")).toContain("url: /docs/sec");
    expect(names).not.toContain("a.md");
    expect(get("feed.xml")).toContain("/docs/a");
  }, 60000);

  it("an index.md at the root of content produces index.md", async () => {
    const root = site({ "content/index.md": "---\ntitle: Home\n---\nH" });
    const { get } = await run(root, { content: { dir: "content" } });
    expect(get("index.md")).toContain("H");
  }, 60000);
});

describe("viteSeo output collisions", () => {
  it("fails naming both files when two entries produce the same .md", async () => {
    const root = site({
      "content/index.md": "---\ntitle: Home\n---\nH",
      "content/x.md": "---\ntitle: X\nurl: /index\n---\nX",
    });
    await expect(run(root, { content: { dir: "content" } })).rejects.toThrow(/index\.md.*x\.md|x\.md.*index\.md/);
  }, 60000);

  it("fails on duplicate content URLs", async () => {
    const root = site({
      "content/a.md": "# A",
      "content/a/index.md": "# A2",
    });
    await expect(run(root, { content: { dir: "content" } })).rejects.toThrow(/Duplicate content URL/);
  }, 60000);
});

async function dev(options: Parameters<typeof viteSeo>[0], root = contentSite, warns: string[] = []) {
  const server = await createServer({
    root,
    configFile: false,
    customLogger: captureLogger(warns),
    appType: "custom",
    server: { middlewareMode: true, ws: false },
    plugins: [viteSeo(options)],
  });
  const call = (url: string) =>
    new Promise<{ status: number; type: string; body: string } | "next">((resolve, reject) => {
      const headers: Record<string, string> = {};
      const res = {
        statusCode: 200,
        setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
        getHeader: (k: string) => headers[k.toLowerCase()],
        write: () => undefined,
        end: (c?: string) =>
          resolve({ status: res.statusCode, type: headers["content-type"] ?? "", body: String(c ?? "") }),
      };
      server.middlewares(
        { url, method: "GET", headers: {} } as never,
        res as never,
        (err?: unknown) => (err ? reject(err) : resolve("next")),
      );
    });
  return { server, call };
}

describe("viteSeo content dev", () => {
  it("serves feed, llms and markdown with the right MIME types and next() otherwise", async () => {
    const { server, call } = await dev({ siteUrl: "https://example.com", content: { dir: "content" } });
    try {
      const feed = (await call("/feed.xml")) as { status: number; type: string; body: string };
      expect(feed.status).toBe(200);
      expect(feed.type).toBe("application/rss+xml; charset=utf-8");
      expect(XMLValidator.validate(feed.body)).toBe(true);
      const llms = (await call("/llms.txt")) as { type: string; body: string };
      expect(llms.type).toBe("text/plain; charset=utf-8");
      const full = (await call("/llms-full.txt")) as { type: string; body: string };
      expect(full.type).toBe("text/plain; charset=utf-8");
      expect(full.body).toContain("ABOUT-ROUTE-TEXT");
      const md = (await call("/blog/ciao.md")) as { type: string; body: string };
      expect(md.type).toBe("text/markdown; charset=utf-8");
      expect(md.body).toContain("Corpo del post");
      expect(((await call("/index.md")) as { type: string }).type).toBe("text/markdown; charset=utf-8");
      expect(((await call("/about.md")) as { body: string }).body).toContain("ABOUT-ROUTE-TEXT");
      expect(await call("/altro")).toBe("next");
      expect(await call("/missing.md")).toBe("next");
      expect(await call("/atom.xml")).toBe("next");
    } finally {
      await server.close();
    }
  }, 60000);

  it("serves atom and json feeds", async () => {
    const root = site({
      "src/feed.js": feedTs('formats: ["atom", "json"],'),
      "content/a.md": post,
    });
    const { server, call } = await dev({ content: { dir: "content" } }, root);
    try {
      expect(((await call("/atom.xml")) as { type: string }).type).toBe("application/atom+xml; charset=utf-8");
      expect(((await call("/feed.json")) as { type: string }).type).toBe("application/feed+json; charset=utf-8");
      expect(await call("/feed.xml")).toBe("next");
    } finally {
      await server.close();
    }
  }, 60000);
});

describe("viteSeo dev regressions", () => {
  it("regenerates sitemap per request: an edited convention file shows on the next request", async () => {
    const root = site({ "src/sitemap.js": `export default [{ url: "https://example.com/one" }];` });
    const { server, call } = await dev({}, root);
    try {
      expect(((await call("/sitemap.xml")) as { body: string }).body).toContain("/one");
      writeFileSync(join(root, "src/sitemap.js"), `export default [{ url: "https://example.com/two" }];`);
      // Deterministic: invalidate the SSR module graph explicitly instead of waiting for chokidar.
      server.moduleGraph?.invalidateAll();
      (server as unknown as { environments?: { ssr?: { moduleGraph?: { invalidateAll(): void } } } }).environments?.ssr?.moduleGraph?.invalidateAll();
      let body = ((await call("/sitemap.xml")) as { body: string }).body;
      for (let i = 0; i < 10 && !body.includes("/two"); i++) {
        await new Promise((r) => setTimeout(r, 50));
        body = ((await call("/sitemap.xml")) as { body: string }).body;
      }
      expect(body).toContain("/two");
    } finally {
      await server.close();
    }
  }, 60000);

  it("a broken route tree never breaks sitemap/robots/manifest in dev and warns once", async () => {
    const root = site({
      "src/routeTree.gen.ts": "export const nothing = 1;",
      "src/sitemap.js": `export default [{ url: "https://example.com/a" }];`,
      "src/robots.js": `export default { rules: { userAgent: "*", allow: "/" } };`,
    });
    const warns: string[] = [];
    const { server, call } = await dev({}, root, warns);
    try {
      for (const url of ["/sitemap.xml", "/robots.txt", "/sitemap.xml"]) {
        expect(((await call(url)) as { status: number }).status).toBe(200);
      }
      expect(warns.filter((w) => /routeTree/.test(w))).toHaveLength(1);
    } finally {
      await server.close();
    }
  }, 60000);

  it("a healthy pipeline falls through for Vite module requests with a query", async () => {
    const root = site({ "src/notes.md": "# n", "content/a.md": post });
    const { server, call } = await dev({ content: { dir: "content" } }, root);
    try {
      expect(await call("/src/notes.md?raw")).toBe("next");
    } finally {
      await server.close();
    }
  }, 60000);

  it("a broken pipeline neither breaks /src/notes.md?raw nor an unknown /x.md", async () => {
    const root = site({ "src/notes.md": "# n" });
    const warns: string[] = [];
    const { server, call } = await dev({ content: { dir: "nope" } }, root, warns);
    try {
      expect(await call("/src/notes.md?raw")).toBe("next");
      expect(await call("/x.md")).toBe("next");
      expect(await call("/y.md")).toBe("next");
      expect(warns).toHaveLength(1);
    } finally {
      await server.close();
    }
  }, 60000);
});

describe("viteSeo degraded dev context", () => {
  const treeSrc = () => {
    const treePath = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures/prerender/tree")
      .split("\\")
      .join("/");
    return `export { tree as routeTree } from "${treePath}";`;
  };

  it("reuses a degraded context for 10 s, then retries", async () => {
    const root = site({
      "src/routeTree.gen.ts": treeSrc(),
      "src/sitemap.js": `export default [{ url: "https://example.com/a" }];`,
    });
    const { server, call } = await dev({}, root);
    const spy = vi.mocked(prerenderRoutes);
    spy.mockClear();
    spy.mockImplementation(async () => {
      throw new Error("render exploded");
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await call("/sitemap.xml");
      await call("/sitemap.xml");
      expect(spy).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 11_000);
      await call("/sitemap.xml");
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      spy.mockReset();
      await server.close();
    }
  }, 60000);

  it("transformIndexHtml does not build the context when there is no feed file", async () => {
    const root = site({ "src/routeTree.gen.ts": treeSrc() });
    const { server } = await dev({}, root);
    const spy = vi.mocked(prerenderRoutes);
    spy.mockClear();
    spy.mockImplementation(async () => {
      throw new Error("render exploded");
    });
    try {
      await server.transformIndexHtml("/", "<html><head></head><body></body></html>");
      expect(spy).toHaveBeenCalledTimes(0);
    } finally {
      spy.mockReset();
      await server.close();
    }
  }, 60000);

  it("reports react-dom (not react-dom/server) as the missing package", async () => {
    const real = await vi.importActual<typeof import("./prerender")>("./prerender");
    expect(new real.PrerenderDependencyError("react-dom", new Error("x")).pkg).toBe("react-dom");
  });
});

describe("viteSeo prerender dependencies and warnings", () => {
  const missing = () =>
    vi.mocked(prerenderRoutes).mockImplementationOnce(async () => {
      throw new PrerenderDependencyError("react", new Error("not installed"));
    });

  async function runWarn(root: string, options: Parameters<typeof viteSeo>[0]) {
    const warns: string[] = [];
    const result = (await build({
      root,
      configFile: false,
      customLogger: captureLogger(warns),
      plugins: [viteSeo(options)],
      build: { write: false, outDir: join(root, "dist") },
    })) as Rollup.RollupOutput | Rollup.RollupOutput[];
    const out = Array.isArray(result) ? result[0] : result;
    return { warns, names: out.output.map((o) => o.fileName) };
  }

  it("default prerender: a missing react warns once and skips the pages", async () => {
    missing();
    const { warns, names } = await runWarn(contentSite, { content: { dir: "content" } });
    expect(warns.filter((w) => /react/.test(w) && /prerender/i.test(w))).toHaveLength(1);
    expect(names).not.toContain("about.md");
    expect(names).toContain("blog/ciao.md");
  }, 60000);

  it("explicit prerender: true keeps the missing dependency an error", async () => {
    missing();
    await expect(
      runWarn(contentSite, { content: { dir: "content" }, markdown: { prerender: true } }),
    ).rejects.toThrow(/react/);
  }, 60000);

  it("explicit prerender options object keeps it an error", async () => {
    missing();
    await expect(
      runWarn(contentSite, { content: { dir: "content" }, markdown: { prerender: {} } }),
    ).rejects.toThrow(/react/);
  }, 60000);

  it("forwards prerender warnings of a throwing route and still builds", async () => {
    const treePath = join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures/prerender/tree").split("\\").join("/");
    const root = site({ "src/routeTree.gen.ts": `export { tree as routeTree } from "${treePath}";` });
    const { warns, names } = await runWarn(root, {});
    expect(warns.some((w) => w.includes('"/boom"'))).toBe(true);
    expect(names).toContain("docs/guide.md");
    expect(names).not.toContain("boom.md");
  }, 60000);
});
