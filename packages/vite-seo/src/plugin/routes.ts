/**
 * Enumerazione delle route TanStack Router per il manifest `seo-routes.json`.
 *
 * Verifica empirica dell'API (@tanstack/react-router 1.170.x), con
 * `createRouter({ routeTree, history: createMemoryHistory() })`:
 *  - `router.routesByPath` e' una mappa `fullPath -> route` con tutte le route
 *    che hanno un path (indice incluso come "/", dinamiche come "/posts/$postId");
 *    la root NON compare: sta solo in `router.routesById["__root__"]`.
 *  - Campo scelto per il path: `route.fullPath`.
 *  - `route.options.head`, `route.options.loader`, `route.options.beforeLoad`
 *    sono le funzioni passate a createRoute (undefined se assenti).
 *  - `route.parentRoute` risale la catena fino alla root (inclusa), da cui
 *    si ricava la catena antenato -> foglia.
 */
import type { Head } from "../types";

export type SeoRoute = { path: string; dynamic: boolean; head?: Head };
export type SeoRoutesManifest = { version: 1; routes: SeoRoute[] };

type MetaEntry = Head["meta"][number];

function metaKey(m: MetaEntry): string {
  if ("title" in m) return "title";
  if ("name" in m) return `name:${m.name}`;
  if ("property" in m) return `property:${m.property}`;
  if ("http-equiv" in m) return `http-equiv:${m["http-equiv"]}`;
  return `raw:${JSON.stringify(m)}`;
}

/** Mantiene solo l'ultima occorrenza di ogni chiave, nell'ordine di quelle ultime. */
function keepLast<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const k = key(items[i]!);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(items[i]!);
  }
  return out.reverse();
}

/** Unisce gli head dall'antenato (primo) alla foglia (ultimo). */
export function mergeHeads(heads: Head[]): Head {
  const result: Head = {
    meta: keepLast(heads.flatMap((x) => x.meta), metaKey),
    links: keepLast(heads.flatMap((x) => x.links), (l) => JSON.stringify(l)),
    scripts: keepLast(heads.flatMap((x) => x.scripts), (s) => JSON.stringify(s)),
  };
  for (const x of heads) if (x.cache !== undefined) result.cache = x.cache;
  return result;
}

function hasContent(h: Head): boolean {
  return h.meta.length > 0 || h.links.length > 0 || h.scripts.length > 0 || h.cache !== undefined;
}

type AnyRoute = {
  fullPath: string;
  parentRoute?: AnyRoute;
  options: { head?: (ctx: unknown) => unknown; loader?: unknown; beforeLoad?: unknown };
};

export type EnumeratedRoute = {
  path: string;
  /** Segue le regole di staticita': `$` nel path, loader/beforeLoad nella catena, o head che lancia. */
  dynamic: boolean;
  /** Head unito della catena (solo per route statiche). */
  head?: Head;
};

/** Enumera tutte le route con path e ne decide la staticita' (regola unica per manifest e prerender). */
export async function enumerateRoutes(routeTree: unknown): Promise<EnumeratedRoute[]> {
  const { createRouter, createMemoryHistory } = await import("@tanstack/react-router");
  const router = createRouter({
    routeTree,
    history: createMemoryHistory(),
  } as never) as unknown as { routesByPath: Record<string, AnyRoute> };

  const out: EnumeratedRoute[] = [];
  for (const route of Object.values(router.routesByPath)) {
    const path = route.fullPath;
    const chain: AnyRoute[] = [];
    for (let r: AnyRoute | undefined = route; r; r = r.parentRoute) chain.unshift(r);

    let dynamic =
      path.includes("$") || chain.some((r) => r.options.loader !== undefined || r.options.beforeLoad !== undefined);

    let head: Head | undefined;
    if (!dynamic) {
      try {
        const heads: Head[] = [];
        for (const r of chain) {
          if (!r.options.head) continue;
          const h = (await r.options.head({ params: {}, loaderData: undefined })) as Head | undefined;
          if (h) heads.push(h);
        }
        head = mergeHeads(heads);
      } catch {
        dynamic = true;
      }
    }
    out.push(dynamic ? { path, dynamic: true } : { path, dynamic: false, head });
  }
  return out;
}

export async function buildSeoRoutes(routeTree: unknown): Promise<SeoRoutesManifest> {
  const routes: SeoRoute[] = [];
  for (const r of await enumerateRoutes(routeTree)) {
    if (r.dynamic) routes.push({ path: r.path, dynamic: true });
    else if (r.head && hasContent(r.head)) routes.push({ path: r.path, dynamic: false, head: r.head });
  }
  return { version: 1, routes };
}
