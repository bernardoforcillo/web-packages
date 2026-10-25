import type { Thing } from "./generated/types";

export type SchemaData = Thing | readonly Thing[];

const CONTEXT = "https://schema.org";

const normalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, normalize(v)]),
    );
  }
  return value;
};

/** Adds `@context`; several nodes become a single `@graph`. */
export function toJsonLd(data: SchemaData): Record<string, unknown> {
  const nodes = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  const strip = ({ "@context": _, ...rest }: Record<string, unknown>) => normalize(rest);
  if (nodes.length === 1) {
    return { "@context": nodes[0]["@context"] ?? CONTEXT, ...(strip(nodes[0]) as object) };
  }
  return { "@context": CONTEXT, "@graph": nodes.map(strip) };
}

/** JSON safe to inline in a `<script>` element (`<` and line separators escaped). */
export function jsonLdString(data: SchemaData): string {
  const BACKSLASH = String.fromCharCode(92);
  const unicode = (code: number) => `${BACKSLASH}u${code.toString(16).padStart(4, "0")}`;
  const unsafe = new RegExp(`[<${String.fromCharCode(0x2028, 0x2029)}]`, "g");
  return JSON.stringify(toJsonLd(data)).replace(unsafe, (c) => unicode(c.charCodeAt(0)));
}
