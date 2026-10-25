import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { H, emptyTree, layered, noHeadTree } from "../../test-fixtures/routes/cases";
import { routeTree, sharedTree, throwingTree } from "../../test-fixtures/routes/tree";
import { buildSeoRoutes, mergeHeads } from "./routes";

const h = H;

describe("mergeHeads", () => {
  it("last title wins", () => {
    const r = mergeHeads([h({ meta: [{ title: "a" }] }), h({ meta: [{ title: "b" }] })]);
    expect(r.meta).toEqual([{ title: "b" }]);
  });
  it("dedupes meta by name, last wins", () => {
    const r = mergeHeads([
      h({ meta: [{ name: "description", content: "1" }, { property: "og:title", content: "x" }] }),
      h({ meta: [{ name: "description", content: "2" }] }),
    ]);
    expect(r.meta).toEqual([{ property: "og:title", content: "x" }, { name: "description", content: "2" }]);
  });
  it("dedupes identical links", () => {
    const l = { rel: "canonical", href: "https://x.it/" };
    expect(mergeHeads([h({ links: [l] }), h({ links: [{ ...l }] })]).links).toEqual([l]);
  });
  it("appends scripts, dropping identical ones", () => {
    const a = { type: "application/ld+json", children: "1" };
    const b = { type: "application/ld+json", children: "2" };
    expect(mergeHeads([h({ scripts: [a] }), h({ scripts: [a, b] })]).scripts).toEqual([a, b]);
  });
  it("cache comes from the last head defining it", () => {
    const r = mergeHeads([h({ cache: { revalidate: 5 } }), h({ cache: false }), h({})]);
    expect(r.cache).toBe(false);
    expect(mergeHeads([h({})]).cache).toBeUndefined();
  });
});

describe("buildSeoRoutes", () => {
  it("matches the shared JSON fixture", async () => {
    const expected = JSON.parse(
      readFileSync(new URL("../../../../crates/vite-serve/tests/fixtures/seo-routes.json", import.meta.url), "utf8"),
    );
    const manifest = await buildSeoRoutes(sharedTree);
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(expected);
  });
  it("marks loader/beforeLoad/param routes dynamic without head", async () => {
    const { routes } = await buildSeoRoutes(routeTree);
    for (const p of ["/posts/$postId", "/stats"]) {
      const r = routes.find((x) => x.path === p)!;
      expect(r.dynamic).toBe(true);
      expect(r.head).toBeUndefined();
    }
  });
  it("a throwing head makes the route dynamic", async () => {
    const { routes } = await buildSeoRoutes(throwingTree);
    expect(routes).toEqual([{ path: "/boom", dynamic: true }]);
  });
});

const only = async (tree: unknown) => (await buildSeoRoutes(tree)).routes;

describe("buildSeoRoutes: chain semantics", () => {
  it("emits a head-less static route with the root head when the root has one", async () => {
    const routes = await only(routeTree);
    const plain = routes.find((x) => x.path === "/plain")!;
    expect(plain.dynamic).toBe(false);
    expect(plain.head?.meta).toEqual([{ title: "Sito" }]);
  });
  it("omits static routes when no head exists anywhere in the chain", async () => {
    expect(await only(noHeadTree)).toEqual([]);
  });
  it("ancestor loader makes descendants dynamic", async () => {
    const routes = await only(layered({}, { loader: () => 1 }, { head: () => H({ meta: [{ title: "x" }] }) }));
    expect(routes).toContainEqual({ path: "/l/leaf", dynamic: true });
  });
  it("ancestor beforeLoad makes descendants dynamic", async () => {
    const routes = await only(layered({}, { beforeLoad: () => ({}) }, { head: () => H({ meta: [{ title: "x" }] }) }));
    expect(routes).toContainEqual({ path: "/l/leaf", dynamic: true });
  });
  it("$ in an ancestor path makes descendants dynamic", async () => {
    const routes = await only(layered({}, {}, { head: () => H({ meta: [{ title: "x" }] }) }, "/u/$id"));
    expect(routes).toContainEqual({ path: "/u/$id/leaf", dynamic: true });
  });
  it("throwing ancestor head makes descendants dynamic", async () => {
    const routes = await only(
      layered({}, { head: () => { throw new Error("x"); } }, { head: () => H({ meta: [{ title: "x" }] }) }),
    );
    expect(routes).toContainEqual({ path: "/l/leaf", dynamic: true });
  });
  it("merges root + leaf heads", async () => {
    const rootScript = { type: "application/ld+json", children: "{\"r\":1}" };
    const leafScript = { type: "application/ld+json", children: "{\"l\":1}" };
    const icon = { rel: "icon", href: "/favicon.ico" };
    const routes = await only(
      layered(
        {
          head: () =>
            H({
              meta: [{ title: "root" }, { name: "description", content: "r" }, { name: "robots", content: "index" }],
              links: [icon],
              scripts: [rootScript],
            }),
        },
        {},
        { head: () => H({ meta: [{ title: "leaf" }, { name: "description", content: "l" }], scripts: [leafScript] }) },
      ),
    );
    const head = routes.find((x) => x.path === "/l/leaf")!.head!;
    expect(head.meta).toHaveLength(3);
    expect(head.meta).toEqual(
      expect.arrayContaining([{ title: "leaf" }, { name: "description", content: "l" }, { name: "robots", content: "index" }]),
    );
    expect(head.links).toEqual([icon]);
    expect(head.scripts).toEqual([rootScript, leafScript]);
  });
  it("supports async head functions", async () => {
    const routes = await only(layered({}, {}, { head: async () => H({ meta: [{ title: "async" }] }) }));
    expect(routes.find((x) => x.path === "/l/leaf")!.head?.meta).toEqual([{ title: "async" }]);
  });
  it("a head returning undefined contributes nothing", async () => {
    expect(await only(layered({}, {}, { head: () => undefined }))).toEqual([]);
    const routes = await only(
      layered({ head: () => H({ meta: [{ title: "r" }] }) }, {}, { head: () => undefined }),
    );
    expect(routes.find((x) => x.path === "/l/leaf")!.head?.meta).toEqual([{ title: "r" }]);
  });
  it("empty route tree gives no routes", async () => {
    expect(await buildSeoRoutes(emptyTree)).toEqual({ version: 1, routes: [] });
  });
});
