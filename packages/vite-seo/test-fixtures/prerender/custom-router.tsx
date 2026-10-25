import { createMemoryHistory, createRouter as make } from "@tanstack/react-router";
import { okTree } from "./tree";

export function createRouter() {
  return make({ routeTree: okTree, history: createMemoryHistory(), context: { env: "custom" } } as never);
}
