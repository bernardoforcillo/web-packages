import { createRootRoute, createRoute, Navigate, Outlet } from "@tanstack/react-router";

function build(extra: "all" | "ok") {
  const root = createRootRoute({
    component: () => (
      <>
        <header>
          <h1>SITE</h1>
        </header>
        <Outlet />
      </>
    ),
  });
  const docs = createRoute({
    getParentRoute: () => root,
    path: "/docs",
    component: () => <Outlet />,
  });
  const docsIndex = createRoute({
    getParentRoute: () => docs,
    path: "/",
    component: () => <main>DOCS-INDEX</main>,
  });
  const trail = createRoute({
    getParentRoute: () => root,
    path: "/trail/",
    component: () => <main>TRAIL-PAGE</main>,
  });
  const noH1 = createRoute({
    getParentRoute: () => root,
    path: "/noh1",
    component: () => <main>No heading here</main>,
  });
  const withH1 = createRoute({
    getParentRoute: () => root,
    path: "/withh1",
    component: () => (
      <main>
        <h1>Real Title</h1>
      </main>
    ),
  });
  const go = createRoute({
    getParentRoute: () => root,
    path: "/go",
    component: () => <Navigate to="/noh1" />,
  });
  const empty = createRoute({
    getParentRoute: () => root,
    path: "/empty",
    component: () => <main />,
  });
  const good = [docs.addChildren([docsIndex]), trail, noH1, withH1];
  return root.addChildren(extra === "all" ? [...good, go, empty] : good);
}

export const edgeOk = build("ok");
export const edgeAll = build("all");
