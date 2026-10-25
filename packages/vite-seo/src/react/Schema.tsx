import { createElement, type ElementType, type ReactNode } from "react";
import { URL_PROPS } from "../schema/generated/vocab";
import { jsonLdString, type SchemaData } from "../schema/jsonld";

export type SchemaFormat = "json-ld" | "microdata" | "rdfa";

export type SchemaProps = {
  data: SchemaData;
  /** Serialization. JSON-LD is what Google recommends; Microdata/RDFa render inline markup. */
  format?: SchemaFormat;
  /** Wrapper element for Microdata/RDFa. */
  as?: ElementType;
  /** Microdata/RDFa only: visible markup rendered inside the root entity. */
  children?: ReactNode;
};

type Node = Record<string, unknown>;

const SCHEMA = "https://schema.org/";
const typeIri = (t: string) => (/^https?:/.test(t) ? t : SCHEMA + t);
const asArray = <T,>(v: T | readonly T[]): T[] => (Array.isArray(v) ? [...v] : [v as T]);
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !(v instanceof Date);

function entityAttrs(node: Node, format: "microdata" | "rdfa", prop?: string, root = false) {
  const types = asArray(node["@type"] as string | string[]);
  const id = node["@id"] as string | undefined;
  if (format === "microdata") {
    return {
      itemScope: true,
      itemType: types.map(typeIri).join(" "),
      itemID: id,
      itemProp: prop,
    };
  }
  return {
    vocab: root ? SCHEMA : undefined,
    typeof: types.join(" "),
    resource: id,
    property: prop,
  };
}

function leafAttrs(format: "microdata" | "rdfa", prop: string) {
  return format === "microdata" ? { itemProp: prop } : { property: prop };
}

function renderValue(format: "microdata" | "rdfa", prop: string, value: unknown, key: string): ReactNode {
  if (value === null || value === undefined) return null;
  if (isNode(value)) {
    if ("@type" in value) return <Entity key={key} node={value} format={format} prop={prop} />;
    const id = value["@id"];
    return typeof id === "string" ? createElement("link", { key, ...leafAttrs(format, prop), href: id }) : null;
  }
  const str = value instanceof Date ? value.toISOString() : String(value);
  if ((URL_PROPS.has(prop) && /^(https?:\/\/|\/)/.test(str)) || str.startsWith(SCHEMA)) {
    return createElement("link", { key, ...leafAttrs(format, prop), href: str });
  }
  return createElement("meta", { key, ...leafAttrs(format, prop), content: str });
}

function Entity({
  node,
  format,
  prop,
  root,
  as = "div",
  children,
}: {
  node: Node;
  format: "microdata" | "rdfa";
  prop?: string;
  root?: boolean;
  as?: ElementType;
  children?: ReactNode;
}) {
  const body = Object.entries(node)
    .filter(([k]) => !k.startsWith("@"))
    .flatMap(([k, v]) => asArray(v).map((item, i) => renderValue(format, k, item, `${k}-${i}`)));
  return createElement(as, entityAttrs(node, format, prop, root), body, children);
}

/**
 * Renders schema.org structured data as JSON-LD (`<script>`), Microdata or RDFa.
 *
 * Microdata/RDFa emit `<meta>`/`<link>` children inside an annotated element, so
 * the data is machine-readable without duplicating visible content; pass
 * `children` to keep your own markup inside the root entity.
 */
export function Schema({ data, format = "json-ld", as, children }: SchemaProps) {
  if (format === "json-ld") {
    return (
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- output is JSON with "<" escaped
        dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
      />
    );
  }
  const nodes = asArray(data) as unknown as Node[];
  return (
    <>
      {nodes.map((node, i) => (
        <Entity key={i} node={node} format={format} root as={as}>
          {i === 0 ? children : null}
        </Entity>
      ))}
    </>
  );
}
