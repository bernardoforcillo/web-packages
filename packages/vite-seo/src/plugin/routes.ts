/**
 * Enumeration of TanStack Router routes for the `seo-routes.json` manifest.
 *
 * Empirical check of the API (@tanstack/react-router 1.170.x), with
 * `createRouter({ routeTree, history: createMemoryHistory() })`:
 *  - `router.routesByPath` is a `fullPath -> route` map with all the routes
 *    that have a path (index included as "/", dynamic ones like "/posts/$postId");
 *    the root does NOT appear: it is only in `router.routesById["__root__"]`.
 *  - Field chosen for the path: `route.fullPath`.
 *  - `route.options.head`, `route.options.loader`, `route.options.beforeLoad`
 *    are the functions passed to createRoute (undefined if absent).
 *  - `route.parentRoute` walks up the chain to the root (included), from which
 *    the ancestor -> leaf chain is derived.
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

/** Keeps only the last occurrence of each key, in the order of those last occurrences. */
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

/** Merges the heads from the ancestor (first) to the leaf (last). */
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
  /** Follows the staticity rules: `$` in the path, loader/beforeLoad in the chain, or a head that throws. */
  dynamic: boolean;
  /** Merged head of the chain (static routes only). */
  head?: Head;
};

/** Enumerates all routes with a path and decides whether each is static (a single rule for manifest and prerender). */
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
