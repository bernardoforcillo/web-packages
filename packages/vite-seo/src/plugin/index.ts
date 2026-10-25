import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { createServer } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import type { ContentEntry, ConventionContext, MetadataRoute } from "../types";
import { loadContent } from "./content";
import type { ContentOptions } from "./content";
import { atomToXml, jsonFeedToJson, rssToXml } from "./feed";
import { llmsFullToTxt, llmsToTxt, markdownForEntry } from "./llms";
import { prerenderRoutes } from "./prerender";
import type { PrerenderOptions } from "./prerender";
import { buildSeoRoutes } from "./routes";
import { manifestToJson, robotsToTxt, sitemapToXml } from "./serialize";

export type { ContentOptions } from "./content";
export type { PrerenderOptions } from "./prerender";

export interface ViteSeoOptions {
  /** Directory (relative to the Vite root) holding sitemap/robots/manifest/feed/llms files. Default `src`. */
  dir?: string;
  /** Absolute site URL, used to auto-link the sitemap from robots.txt and to absolutise feed/llms URLs. */
  siteUrl?: string;
  /**
   * Module (relative to the Vite root, or absolute) exporting `routeTree`.
   * Default `src/routeTree.gen.ts` if it exists, otherwise no `seo-routes.json`.
   */
  routeTree?: string;
  /** Folder of markdown files (frontmatter + body): entries for feed, llms.txt and per-page `.md`. */
  content?: ContentOptions;
  /** Markdown generation from prerendered static routes (on by default when a route tree exists). */
  markdown?: { prerender?: boolean | PrerenderOptions };
}

type Loader = Pick<ViteDevServer, "ssrLoadModule">;
type Kind = "sitemap" | "robots" | "manifest" | "feed" | "llms";
type FeedFormat = "rss" | "atom" | "json";
type Output = { type: string; body: string };
type Generated = {
  files: Map<string, Output>;
  warnings: string[];
  /** Present when a feed was emitted. */
  feed?: { title: string; formats: FeedFormat[] };
  /** Route tree, loaded when a route tree file exists. */
  tree?: unknown;
};

const EXTENSIONS = [".ts", ".js"];
const MANIFEST_PATH = "/manifest.webmanifest";
const MD_TYPE = "text/markdown; charset=utf-8";
const TEXT_TYPE = "text/plain; charset=utf-8";
const FEED_FILES: Record<FeedFormat, { file: string; type: string; mime: string }> = {
  rss: { file: "feed.xml", type: "application/rss+xml; charset=utf-8", mime: "application/rss+xml" },
  atom: { file: "atom.xml", type: "application/atom+xml; charset=utf-8", mime: "application/atom+xml" },
  json: { file: "feed.json", type: "application/feed+json; charset=utf-8", mime: "application/feed+json" },
};
/** Fixed output names a content `.md` may never overwrite. */
const RESERVED = new Set([
  "feed.xml",
  "atom.xml",
  "feed.json",
  "llms.txt",
  "llms-full.txt",
  "sitemap.xml",
  "robots.txt",
  "manifest.webmanifest",
  "seo-routes.json",
]);
const SERVED_AT_ROOT = new Set([
  "sitemap.xml",
  "robots.txt",
  "manifest.webmanifest",
  "feed.xml",
  "atom.xml",
  "feed.json",
  "llms.txt",
  "llms-full.txt",
]);

/** Output file of an entry: `/` -> index.md, `index.md` sources -> `<url>/index.md`, otherwise `<url>.md`. */
function markdownFileName(entry: ContentEntry): string {
  if (entry.url === "/") return "index.md";
  const stem = entry.url.replace(/^\/+/, "");
  const fromIndexFile = !entry.file.startsWith("prerender:") && basename(entry.file) === "index.md";
  return fromIndexFile ? `${stem}/index.md` : `${stem}.md`;
}

async function resolveDefault<T>(loader: Loader, file: string, ctx: ConventionContext): Promise<T> {
  const mod = await loader.ssrLoadModule(file);
  const def = mod.default;
  return (typeof def === "function" ? await def(ctx) : def) as T;
}

export function viteSeo(options: ViteSeoOptions = {}): Plugin {
  const dirOption = options.dir ?? "src";
  let root = process.cwd();
  let seoDir = resolve(root, dirOption);

  const find = (kind: Kind): string | undefined =>
    EXTENSIONS.map((ext) => resolve(seoDir, kind + ext)).find((f) => existsSync(f));

  const routeTreeFile = (): string | undefined => {
    if (options.routeTree) {
      return isAbsolute(options.routeTree) ? options.routeTree : resolve(root, options.routeTree);
    }
    const def = resolve(root, "src/routeTree.gen.ts");
    return existsSync(def) ? def : undefined;
  };

  const prerenderOptions = (): PrerenderOptions | undefined => {
    const value = options.markdown?.prerender;
    if (value === false) return undefined;
    return typeof value === "object" ? value : {};
  };

  async function loadTree(loader: Loader, file: string): Promise<unknown> {
    let tree: unknown;
    try {
      const mod = await loader.ssrLoadModule(file);
      tree = mod.routeTree;
    } catch (err) {
      throw new Error(
        `vite-seo: cannot load route tree ${file}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    if (!tree) throw new Error(`vite-seo: ${file} has no "routeTree" export`);
    return tree;
  }

  async function generate(loader: Loader): Promise<Generated> {
    const out = new Map<string, Output>();
    const origins = new Map<string, string>();
    const warnings: string[] = [];
    const add = (name: string, output: Output, origin: string) => {
      const prior = origins.get(name);
      if (prior !== undefined || (RESERVED.has(name) && origin.startsWith("entry:"))) {
        throw new Error(
          `vite-seo: "${name}" from ${origin.replace(/^entry:/, "")} collides with ${prior?.replace(/^entry:/, "") ?? "a generated output"}`,
        );
      }
      origins.set(name, origin);
      out.set(name, output);
    };

    // Content is read once, before the convention files, and only when the option is set.
    const content = options.content ? await loadContent(options.content, root) : [];

    const treeFile = routeTreeFile();
    const tree = treeFile ? await loadTree(loader, treeFile) : undefined;
    const prerender = prerenderOptions();
    let pages: ContentEntry[] = [];
    if (tree && prerender) {
      const load = (id: string) =>
        loader.ssrLoadModule(id.startsWith(".") || id.startsWith("/") ? resolve(root, id) : id);
      const result = await prerenderRoutes(tree, { ...prerender, root, siteUrl: options.siteUrl, load });
      warnings.push(...result.warnings);
      const covered = new Set(content.map((e) => e.url));
      pages = result.pages.filter((p) => !covered.has(p.url));
    }

    const ctx: ConventionContext = { content, pages };
    if (options.siteUrl !== undefined) ctx.siteUrl = options.siteUrl;

    const sitemapFile = find("sitemap");
    const robotsFile = find("robots");
    const manifestFile = find("manifest");
    const feedFile = find("feed");
    const llmsFile = find("llms");

    if (sitemapFile) {
      const sitemap = await resolveDefault<MetadataRoute.Sitemap>(loader, sitemapFile, ctx);
      add("sitemap.xml", { type: "application/xml", body: sitemapToXml(sitemap) }, "sitemap");
    }
    if (robotsFile) {
      const robots = await resolveDefault<MetadataRoute.Robots>(loader, robotsFile, ctx);
      let body = robotsToTxt(robots);
      if (sitemapFile && !robots.sitemap && options.siteUrl) {
        body = `${body.replace(/\n+$/, "")}\nSitemap: ${options.siteUrl.replace(/\/+$/, "")}/sitemap.xml\n`;
      }
      add("robots.txt", { type: "text/plain", body }, "robots");
    }
    if (manifestFile) {
      const manifest = await resolveDefault<MetadataRoute.Manifest>(loader, manifestFile, ctx);
      add(
        "manifest.webmanifest",
        { type: "application/manifest+json", body: manifestToJson(manifest) },
        "manifest",
      );
    }

    let feedInfo: Generated["feed"];
    if (feedFile) {
      const feed = await resolveDefault<MetadataRoute.Feed>(loader, feedFile, ctx);
      const formats = [...new Set<FeedFormat>(feed.formats ?? ["rss"])];
      for (const format of formats) {
        const body =
          format === "rss"
            ? rssToXml(feed, options.siteUrl)
            : format === "atom"
              ? atomToXml(feed, options.siteUrl)
              : jsonFeedToJson(feed, options.siteUrl);
        add(FEED_FILES[format].file, { type: FEED_FILES[format].type, body }, "feed");
      }
      feedInfo = { title: feed.title, formats };
    }

    const all = [...content, ...pages];
    if (llmsFile) {
      const llms = await resolveDefault<MetadataRoute.Llms>(loader, llmsFile, ctx);
      add("llms.txt", { type: TEXT_TYPE, body: llmsToTxt(llms, options.siteUrl) }, "llms");
      if (all.length > 0) {
        add("llms-full.txt", { type: TEXT_TYPE, body: llmsFullToTxt(all, options.siteUrl) }, "llms");
      }
    }

    for (const entry of all) {
      add(markdownFileName(entry), { type: MD_TYPE, body: markdownForEntry(entry) }, `entry:${entry.file}`);
    }

    return { files: out, warnings, feed: feedInfo, tree };
  }

  let devServer: ViteDevServer | undefined;
  let devCache: Promise<Generated> | undefined;
  /** Result of the build run, read by transformIndexHtml (our generateBundle runs before Vite's HTML one). */
  let built: Generated | undefined;

  const devGenerated = (): Promise<Generated> => {
    if (!devCache) {
      const pending = generate(devServer!);
      devCache = pending;
      pending.catch(() => {
        if (devCache === pending) devCache = undefined;
      });
    }
    return devCache;
  };

  return {
    name: "vite-seo",
    configResolved(config) {
      root = config.root;
      seoDir = resolve(root, dirOption);
    },
    configureServer(server) {
      devServer = server;
      devCache = undefined;
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        const name = path.replace(/^\//, "");
        if (!SERVED_AT_ROOT.has(name) && !name.endsWith(".md")) return next();
        try {
          const { files } = await devGenerated();
          const file = files.get(name);
          if (!file) return next();
          res.statusCode = 200;
          res.setHeader("Content-Type", file.type);
          res.end(file.body);
        } catch (err) {
          next(err);
        }
      });
    },
    async transformIndexHtml() {
      const tags: { tag: string; attrs: Record<string, string>; injectTo: "head" }[] = [];
      if (find("manifest")) {
        tags.push({ tag: "link", attrs: { rel: "manifest", href: MANIFEST_PATH }, injectTo: "head" });
      }
      let feed = built?.feed;
      if (!built && devServer) {
        try {
          feed = (await devGenerated()).feed;
        } catch {
          feed = undefined;
        }
      }
      if (feed) {
        for (const format of feed.formats) {
          const { mime, file } = FEED_FILES[format];
          tags.push({
            tag: "link",
            attrs: { rel: "alternate", type: mime, title: feed.title, href: `/${file}` },
            injectTo: "head",
          });
        }
      }
      return tags.length > 0 ? tags : undefined;
    },
    async generateBundle() {
      built = undefined;
      const treeFile = routeTreeFile();
      if (
        !find("sitemap") &&
        !find("robots") &&
        !find("manifest") &&
        !find("feed") &&
        !find("llms") &&
        !options.content &&
        !treeFile
      ) {
        return;
      }
      const loader = await createServer({
        root,
        configFile: false,
        logLevel: "silent",
        appType: "custom",
        server: { middlewareMode: true, ws: false },
        optimizeDeps: { noDiscovery: true },
      });
      try {
        const generated = await generate(loader);
        for (const warning of generated.warnings) this.warn(warning);
        for (const [fileName, { body }] of generated.files) {
          this.emitFile({ type: "asset", fileName, source: body });
        }
        if (treeFile && generated.tree) {
          this.emitFile({
            type: "asset",
            fileName: "seo-routes.json",
            source: `${JSON.stringify(await buildSeoRoutes(generated.tree), null, 2)}\n`,
          });
        }
        built = generated;
      } finally {
        await loader.close();
      }
    },
  };
}
