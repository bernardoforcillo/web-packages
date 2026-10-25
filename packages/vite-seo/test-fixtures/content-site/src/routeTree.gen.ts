import { createElement } from "react";
import { createRootRoute, createRoute, Outlet } from "@tanstack/react-router";

const root = createRootRoute({ component: () => createElement(Outlet) });

const index = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: () => createElement("main", null, createElement("h1", null, "Home page"), createElement("p", null, "HOME-ROUTE")),
});

const about = createRoute({
  getParentRoute: () => root,
  path: "/about",
  head: () => ({ meta: [{ title: "About us" }], links: [], scripts: [] }),
  component: () => createElement("main", null, createElement("h1", null, "About"), createElement("p", null, "ABOUT-ROUTE-TEXT")),
});

export const routeTree = root.addChildren([index, about]);
