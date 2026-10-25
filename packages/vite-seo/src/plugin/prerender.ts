/**
 * Prerender delle route statiche TanStack Router e conversione HTML -> markdown.
 *
 * Questo modulo importa `turndown`, `linkedom` e (dinamicamente) `react` /
 * `react-dom/server`: e' raggiunto SOLO dall'entry `./vite`, mai da `src/index.ts`.
 */
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import type { ContentEntry } from "../types";
import { enumerateRoutes } from "./routes";

/**
 * Opzioni del prerender delle route statiche.
 */
export type PrerenderOptions = {
  /**
   * Modulo (risolto da `load`) che esporta `createRouter()` e restituisce il router dell'app,
   * per avere contesto/provider reali. DEVE usare la memory history (il router viene spostato
   * con `router.history.replace(path)` in Node: una browser history non funziona).
   */
  createRouter?: string;
  /** Se true, la prima route che fallisce fa rigettare la promise invece di produrre un avviso. */
  strict?: boolean;
};

const DROPPED = "nav, header, footer, aside, script, style, noscript, svg, template";
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function resolveUrl(href: string, base: { url: string; siteUrl?: string }): string {
  const value = href.trim();
  if (value === "" || value.startsWith("#") || value.startsWith("//") || SCHEME.test(value)) return href;
  if (value.startsWith("/")) {
    if (!base.siteUrl) return href;
    try {
      return new URL(value, base.siteUrl).href;
    } catch {
      return href;
    }
  }
  const baseIsAbsolute = SCHEME.test(base.url);
  try {
    const routeUrl = new URL(base.url, base.siteUrl ?? "http://prerender.invalid");
    const resolved = new URL(value, routeUrl);
    if (baseIsAbsolute || base.siteUrl) return resolved.href;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return href;
  }
}

function tableRows(table: Element): Element[] {
  const rows: Element[] = [];
  for (const child of Array.from(table.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "tr") rows.push(child);
    else if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
      for (const tr of Array.from(child.children)) if (tr.tagName.toLowerCase() === "tr") rows.push(tr);
    }
  }
  return rows;
}

function createService(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  // Tabelle GFM scritte a mano (turndown-plugin-gfm e' ferma dal 2019 e aggiunge
  // anche strikethrough/task list che qui non servono): la prima riga fa da intestazione.
  service.addRule("gfmTable", {
    filter: "table",
    replacement: (_content, node) => {
      const rows = tableRows(node as unknown as Element).map((tr) =>
        Array.from(tr.children)
          .filter((c) => /^(td|th)$/i.test(c.tagName))
          .map((c) => service.turndown(c.innerHTML).replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|").trim()),
      );
      const width = Math.max(0, ...rows.map((r) => r.length));
      if (rows.length === 0 || width === 0) return "";
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
      const [head, ...body] = rows;
      return `\n\n${[line(head!), line(Array.from({ length: width }, () => "---")), ...body.map(line)].join("\n")}\n\n`;
    },
  });
  // Le celle sono gia' gestite dalla regola della tabella.
  service.addRule("tableParts", {
    filter: ["thead", "tbody", "tfoot", "tr", "th", "td", "caption"],
    replacement: (content) => content,
  });
  return service;
}

export function htmlToMarkdown(
  html: string,
  base: { url: string; siteUrl?: string },
): { title?: string; markdown: string } {
  if (html.trim() === "") return { markdown: "" };
  const source = /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html>${/<body[\s>]/i.test(html) ? html : `<body>${html}</body>`}</html>`;
  const { document } = parseHTML(source);
  const container =
    document.querySelector("main") ??
    document.querySelector("article") ??
    document.body ??
    document.documentElement;
  if (!container) return { markdown: "" };

  // Il container stesso non deve sparire (es. un <main> dentro <header>): si scartano solo i discendenti.
  for (const el of Array.from(container.querySelectorAll(DROPPED))) el.remove();

  let title: string | undefined;
  const h1 = container.querySelector("h1");
  if (h1) title = collapse(h1.textContent ?? "") || undefined;

  for (const a of Array.from(container.querySelectorAll("a[href]"))) {
    a.setAttribute("href", resolveUrl(a.getAttribute("href") ?? "", base));
  }
  for (const img of Array.from(container.querySelectorAll("img[src]"))) {
    img.setAttribute("src", resolveUrl(img.getAttribute("src") ?? "", base));
  }

  const markdown = createService().turndown(container.innerHTML).trim();
  return title === undefined ? { markdown } : { title, markdown };
}

type RouterLike = {
  load(): Promise<unknown>;
  history: { replace(path: string): void };
  state?: {
    statusCode?: number;
    location?: { pathname?: string };
    matches?: { status?: string; error?: unknown; routeId?: string }[];
  };
};

export async function prerenderRoutes(
  routeTree: unknown,
  options: PrerenderOptions & {
    root: string;
    siteUrl?: string;
    load: (id: string) => Promise<Record<string, unknown>>;
  },
): Promise<{ pages: ContentEntry[]; warnings: string[] }> {
  let createElement: (type: unknown, props: unknown) => unknown;
  let renderToString: (element: unknown) => string;
  let RouterProvider: unknown;
  let createMemoryHistory: (opts: { initialEntries: string[] }) => unknown;
  let createRouter: (opts: unknown) => RouterLike;
  try {
    const react = await import("react");
    createElement = react.createElement as never;
  } catch (err) {
    throw new Error(`vite-seo: prerender requires "react" but it cannot be imported: ${msg(err)}`);
  }
  try {
    renderToString = (await import("react-dom/server")).renderToString as never;
  } catch (err) {
    throw new Error(`vite-seo: prerender requires "react-dom/server" but it cannot be imported: ${msg(err)}`);
  }
  {
    const tsr = await import("@tanstack/react-router");
    RouterProvider = tsr.RouterProvider;
    createMemoryHistory = tsr.createMemoryHistory as never;
    createRouter = tsr.createRouter as never;
  }

  let customFactory: (() => RouterLike | Promise<RouterLike>) | undefined;
  if (options.createRouter) {
    const mod = await options.load(options.createRouter);
    if (typeof mod.createRouter !== "function") {
      throw new Error(`vite-seo: "${options.createRouter}" must export a function named "createRouter"`);
    }
    customFactory = mod.createRouter as () => RouterLike;
  }

  const pages: ContentEntry[] = [];
  const warnings: string[] = [];

  const seen = new Set<string>();
  for (const route of await enumerateRoutes(routeTree)) {
    if (route.dynamic) continue;
    // fullPath di una index annidata o di un path esplicito e' "/docs/": si apre "/docs".
    const path = normalizePath(route.path);
    if (seen.has(path)) continue; // layout "/docs" + index "/docs/" rendono la stessa pagina
    seen.add(path);
    try {
      let router: RouterLike;
      if (customFactory) {
        router = await customFactory();
        // Il router non e' montato: si sposta la history e `load()` rilegge la location.
        router.history.replace(path);
      } else {
        router = createRouter({
          routeTree,
          history: createMemoryHistory({ initialEntries: [path] }),
        } as never);
      }
      await router.load();
      const matches = router.state?.matches ?? [];
      const failed = matches.find((m) => m.status === "error");
      if (failed) throw failed.error instanceof Error ? failed.error : new Error(String(failed.error ?? "route error"));
      if (router.state?.statusCode === 404) throw new Error("route not found");
      if (matches.length === 0) throw new Error("no route matched");
      const deepest = matches[matches.length - 1]!;
      if (deepest.routeId !== undefined && normalizePath(deepest.routeId) !== path) {
        throw new Error(`matched route "${deepest.routeId}" instead`);
      }
      const finalPath = router.state?.location?.pathname;
      if (finalPath !== undefined && normalizePath(finalPath) !== path) {
        throw new Error(`redirected to "${finalPath}"`);
      }

      const html = renderToString(createElement(RouterProvider, { router }));
      // React non lancia: su errore di render emette un marcatore `<!--$!-->` + <template data-msg>
      // e lascia il resto del documento. Una pagina cosi' sarebbe incompleta: va trattata come errore.
      if (html.includes("<!--$!-->")) {
        const detail = /data-msg="([^"]*)"/.exec(html)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
        throw new Error(detail ? `render error (${detail.split(/\r?\n/).pop()})` : "render error");
      }
      const routeUrl = options.siteUrl ? new URL(path, options.siteUrl).href : path;
      const { title: h1Title, markdown } = htmlToMarkdown(html, { url: routeUrl, siteUrl: options.siteUrl });
      if (markdown.trim() === "") throw new Error("empty output (client-only content?)");
      const headTitle = route.head?.meta.find((m): m is { title: string } => "title" in m)?.title;
      pages.push({
        slug: path.replace(/^\/+|\/+$/g, ""),
        url: path,
        title: headTitle || h1Title || routeUrl,
        tags: [],
        body: markdown,
        file: `prerender:${path}`,
      });
    } catch (err) {
      const message = `vite-seo: prerender of "${path}" failed: ${msg(err)}`;
      if (options.strict) throw new Error(message, { cause: err });
      warnings.push(message);
    }
  }
  return { pages, warnings };
}

function normalizePath(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
