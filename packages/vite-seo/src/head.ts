import { toJsonLdScripts } from "./graph";
import { resolveTitle } from "./merge";
import type { Head, Metadata } from "./types";

export function toHead(metadata: Metadata): Head {
  const meta: Head["meta"] = [];
  const links: Head["links"] = [];
  const scripts: Head["scripts"] = [];
  const base = metadata.metadataBase;

  const abs = (value: string): string => {
    if (base === undefined) return value;
    try {
      return new URL(value, base).toString();
    } catch {
      return value;
    }
  };

  const title = resolveTitle(metadata.title);
  const description = metadata.description;

  if (title !== undefined) meta.push({ title });
  if (description !== undefined) meta.push({ name: "description", content: description });

  if (metadata.robots !== undefined) {
    let content: string;
    if (typeof metadata.robots === "string") {
      content = metadata.robots;
    } else {
      const parts: string[] = [];
      if (metadata.robots.index !== undefined) parts.push(metadata.robots.index ? "index" : "noindex");
      if (metadata.robots.follow !== undefined) parts.push(metadata.robots.follow ? "follow" : "nofollow");
      content = parts.join(", ");
    }
    if (content) meta.push({ name: "robots", content });
  }

  if (metadata.verification?.google) {
    meta.push({ name: "google-site-verification", content: metadata.verification.google });
  }

  const og = metadata.openGraph;
  if (og) {
    const ogTitle = og.title ?? title;
    const ogDescription = og.description ?? description;
    if (ogTitle !== undefined) meta.push({ property: "og:title", content: ogTitle });
    if (ogDescription !== undefined) meta.push({ property: "og:description", content: ogDescription });
    if (og.url) meta.push({ property: "og:url", content: abs(og.url) });
    if (og.siteName) meta.push({ property: "og:site_name", content: og.siteName });
    if (og.type) meta.push({ property: "og:type", content: og.type });
    if (og.locale) meta.push({ property: "og:locale", content: og.locale });
    const images = typeof og.images === "string" ? [{ url: og.images }] : (og.images ?? []);
    for (const img of images as { url: string; width?: number; height?: number; alt?: string }[]) {
      meta.push({ property: "og:image", content: abs(img.url) });
      if (img.width !== undefined) meta.push({ property: "og:image:width", content: String(img.width) });
      if (img.height !== undefined) meta.push({ property: "og:image:height", content: String(img.height) });
      if (img.alt) meta.push({ property: "og:image:alt", content: img.alt });
    }
  }

  const tw = metadata.twitter;
  if (tw) {
    if (tw.card) meta.push({ name: "twitter:card", content: tw.card });
    if (tw.site) meta.push({ name: "twitter:site", content: tw.site });
    if (tw.creator) meta.push({ name: "twitter:creator", content: tw.creator });
    const twTitle = tw.title ?? title;
    const twDescription = tw.description ?? description;
    if (twTitle !== undefined) meta.push({ name: "twitter:title", content: twTitle });
    if (twDescription !== undefined) meta.push({ name: "twitter:description", content: twDescription });
    for (const image of tw.images ?? []) meta.push({ name: "twitter:image", content: abs(image) });
  }

  if (metadata.alternates?.canonical) {
    links.push({ rel: "canonical", href: abs(metadata.alternates.canonical) });
  }
  for (const [hreflang, href] of Object.entries(metadata.alternates?.languages ?? {})) {
    links.push({ rel: "alternate", href: abs(href), hrefLang: hreflang });
  }

  if (metadata.icons?.icon) links.push({ rel: "icon", href: abs(metadata.icons.icon) });
  if (metadata.icons?.apple) links.push({ rel: "apple-touch-icon", href: abs(metadata.icons.apple) });

  if (metadata.jsonLd !== undefined) {
    const items = Array.isArray(metadata.jsonLd) ? metadata.jsonLd : [metadata.jsonLd];
    scripts.push(...toJsonLdScripts(items));
  }

  const head: Head = { meta, links, scripts };
  if (metadata.cache !== undefined) head.cache = metadata.cache;
  return head;
}
