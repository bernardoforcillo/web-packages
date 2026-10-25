import { createRootRoute, createRoute } from "@tanstack/react-router";
import { defineSeo } from "./seo";

const { rootHead, seo } = defineSeo({ title: { default: "S", template: "%s | S" } });

const root = createRootRoute({ head: rootHead });

export const page = createRoute({
  getParentRoute: () => root,
  path: "/p",
  loader: () => ({ name: "X" }),
  head: seo(({ loaderData }) => ({ title: (loaderData as { name: string } | undefined)?.name })),
});

export const staticPage = createRoute({
  getParentRoute: () => root,
  path: "/q",
  head: seo({ title: "Q" }),
});

createRootRoute({
  // @ts-expect-error wrong Head shape must fail
  head: () => ({ meta: "nope" }),
});
