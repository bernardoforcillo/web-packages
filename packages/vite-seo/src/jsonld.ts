import type { JsonLdItem } from "./types";

/** Serialize JSON-LD safely for embedding inside a script element. */
export function serializeJsonLd(data: JsonLdItem | JsonLdItem[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const CONTEXT = "https://schema.org";

/** What the helpers return: assignable to JsonLdObject, but with open properties. */
type Node = Record<string, unknown> & { "@type": string };

type Person = { name: string; url?: string };

/** Copy only the defined entries (absent optionals must not appear as keys). */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/** `@id` goes right after `@type`, and only when provided. */
function withId<T extends Record<string, unknown>>(type: string, id: string | undefined, rest: T): Node {
  return compact({ "@context": CONTEXT, "@type": type, "@id": id, ...rest }) as Node;
}

function person(p: Person): Node {
  return compact({ "@type": "Person", name: p.name, url: p.url });
}

export function article(input: {
  id?: string;
  headline: string;
  datePublished?: string;
  dateModified?: string;
  author?: Person | Person[];
  image?: string | string[];
  description?: string;
}): Node {
  const { author, id, ...rest } = input;
  return withId("Article", id, {
    ...rest,
    author: Array.isArray(author)
      ? author.map(person)
      : author
        ? person(author)
        : undefined,
  });
}

export function product(input: {
  id?: string;
  name: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  brand?: string;
  offers?: {
    price: number | string;
    priceCurrency: string;
    availability?: string;
    url?: string;
  };
}): Node {
  const { brand, offers, id, ...rest } = input;
  return withId("Product", id, {
    ...rest,
    brand: brand === undefined ? undefined : { "@type": "Brand", name: brand },
    offers: offers ? compact({ "@type": "Offer", ...offers }) : undefined,
  });
}

export function faqPage(
  items: { question: string; answer: string }[],
  id?: string,
): Node {
  return withId("FAQPage", id, {
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  }) as Node;
}

export function breadcrumbList(
  items: { name: string; url: string }[],
  id?: string,
): Node {
  return withId("BreadcrumbList", id, {
    itemListElement: items.map((i, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: i.name,
      item: i.url,
    })),
  }) as Node;
}

export function organization(input: {
  id?: string;
  name: string;
  url: string;
  logo?: string;
  sameAs?: string[];
}): Node {
  const { id, ...rest } = input;
  return withId("Organization", id, rest) as Node;
}

export function webSite(input: { id?: string; name: string; url: string }): Node {
  return withId("WebSite", input.id, { name: input.name, url: input.url }) as Node;
}
