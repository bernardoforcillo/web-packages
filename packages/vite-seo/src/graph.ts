import { serializeJsonLd } from "./jsonld";
import type { JsonLdGraph, JsonLdItem, JsonLdObject } from "./types";

const SCHEMA_CONTEXT = "https://schema.org";

type Node = Record<string, unknown>;

function isDefaultContext(context: unknown): boolean {
  if (context === undefined) return true;
  if (typeof context !== "string") return false;
  const normalized = context.replace(/\/+$/, "");
  return normalized === "https://schema.org" || normalized === "http://schema.org";
}

function isGraph(item: JsonLdItem): item is JsonLdGraph {
  return "@graph" in item && Array.isArray((item as { "@graph": unknown })["@graph"]);
}

/**
 * Turn the merged JSON-LD items into script contents: ONE `@graph` script for
 * every node in the default schema.org context (merged by `@id`), followed by
 * one script per node that declares a different `@context`.
 */
export function toJsonLdScripts(items: readonly JsonLdItem[]): { type: string; children: string }[] {
  const nodes: Node[] = [];
  for (const item of items) {
    if (isGraph(item)) {
      const context = item["@context"];
      for (const child of item["@graph"]) {
        const node = child as Node;
        nodes.push(node["@context"] === undefined && context !== undefined ? { "@context": context, ...node } : node);
      }
    } else {
      nodes.push(item as Node);
    }
  }

  const graph: Node[] = [];
  const byId = new Map<string, number>();
  const foreign: Node[] = [];
  for (const node of nodes) {
    if (!isDefaultContext(node["@context"])) {
      foreign.push(node);
      continue;
    }
    const { "@context": _context, ...rest } = node;
    const id = rest["@id"];
    if (typeof id === "string") {
      const at = byId.get(id);
      if (at !== undefined) {
        graph[at] = { ...graph[at], ...rest };
        continue;
      }
      byId.set(id, graph.length);
    }
    graph.push(rest);
  }

  const scripts: { type: string; children: string }[] = [];
  if (graph.length > 0) {
    scripts.push({
      type: "application/ld+json",
      children: serializeJsonLd({ "@context": SCHEMA_CONTEXT, "@graph": graph } as unknown as JsonLdObject),
    });
  }
  for (const node of foreign) {
    scripts.push({ type: "application/ld+json", children: serializeJsonLd(node as JsonLdObject) });
  }
  return scripts;
}
