import { createRootRoute, createRoute } from "@tanstack/react-router";
import type { Head } from "../../src/types";

const H = (p: Partial<Head>): Head => ({ meta: [], links: [], scripts: [], ...p });
type Opts = Record<string, unknown>;

/** root (with options) + a layout (with options) + a child `/l/leaf` (with options). */
export function layered(root: Opts, layout: Opts, leaf: Opts, layoutPath = "/l") {
  const r = createRootRoute(root as never);
  const l = createRoute({ getParentRoute: () => r, path: layoutPath, ...layout } as never);
  const c = createRoute({ getParentRoute: () => l, path: "/leaf", ...leaf } as never);
  return r.addChildren([l.addChildren([c])]);
}

export const noHeadTree = (() => {
  const r = createRootRoute();
  const a = createRoute({ getParentRoute: () => r, path: "/a" });
  return r.addChildren([a]);
})();

export const emptyTree = createRootRoute().addChildren([]);

export { H };
