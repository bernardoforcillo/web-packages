import type { Thing } from "./schema";

/** A schema.org node. The plain-record branch keeps hand-written literals compiling. */
export type JsonLdObject = Thing | (Record<string, unknown> & { "@type": string });

/** A container holding several nodes: `{ "@context"?, "@graph": [...] }`. */
export type JsonLdGraph = { "@context"?: unknown; "@graph": JsonLdObject[] };

export type JsonLdItem = JsonLdObject | JsonLdGraph;

export type OpenGraph = {
  title?: string;
  description?: string;
  url?: string;
  siteName?: string;
  images?: string | { url: string; width?: number; height?: number; alt?: string }[];
  type?: string;
  locale?: string;
};

export type Twitter = {
  card?: "summary" | "summary_large_image";
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  images?: string[];
};

export type Metadata = {
  metadataBase?: URL | string;
  title?: string | { default?: string; template?: string; absolute?: string };
  description?: string;
  openGraph?: OpenGraph;
  twitter?: Twitter;
  alternates?: { canonical?: string; languages?: Record<string, string> };
  robots?: string | { index?: boolean; follow?: boolean };
  icons?: { icon?: string; apple?: string };
  verification?: { google?: string };
  jsonLd?: JsonLdItem | JsonLdItem[];
  cache?: { revalidate: number } | false;
};

export type Head = {
  meta: Record<string, string>[];
  links: { rel: string; href: string; hrefLang?: string }[];
  scripts: { type: string; children: string }[];
  cache?: Metadata["cache"];
};

export namespace MetadataRoute {
  export type Sitemap = {
    url: string;
    lastModified?: string | Date;
    changeFrequency?: string;
    priority?: number;
    alternates?: { languages?: Record<string, string> };
  }[];

  export type Rule = {
    userAgent?: string | string[];
    allow?: string | string[];
    disallow?: string | string[];
    crawlDelay?: number;
  };

  export type Robots = {
    rules: Rule | Rule[];
    sitemap?: string | string[];
    host?: string;
  };

  export type Manifest = {
    name?: string;
    short_name?: string;
    description?: string;
    start_url?: string;
    display?: string;
    background_color?: string;
    theme_color?: string;
    icons?: { src: string; sizes?: string; type?: string; purpose?: string }[];
  };

  export type FeedItem = {
    title: string;
    url: string;
    id?: string;
    summary?: string;
    content?: string;
    contentText?: string;
    date?: string | Date;
    updated?: string | Date;
    authors?: { name: string; email?: string; url?: string }[];
    tags?: string[];
  };

  export type Feed = {
    title: string;
    link: string;
    description?: string;
    language?: string;
    updated?: string | Date;
    formats?: ("rss" | "atom" | "json")[];
    items: FeedItem[];
  };

  export type Llms = {
    title: string;
    summary?: string;
    details?: string;
    sections: {
      title: string;
      optional?: boolean;
      links: { title: string; url: string; notes?: string }[];
    }[];
  };
}

export type ContentEntry = {
  slug: string;
  url: string;
  title: string;
  description?: string;
  date?: string;
  updated?: string;
  tags: string[];
  body: string;
  file: string;
};

export type ConventionContext = {
  content: ContentEntry[];
  pages: ContentEntry[];
  siteUrl?: string;
};
