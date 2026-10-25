import type { JsonLdItem, Metadata, OpenGraph, Twitter } from "./types";

type Title = NonNullable<Metadata["title"]>;
type TitleObject = Exclude<Title, string>;

export function resolveTitle(title: Metadata["title"]): string | undefined {
  if (title === undefined) return undefined;
  if (typeof title === "string") return title || undefined;
  return title.absolute || title.default || undefined;
}

function assignDefined<T extends object>(target: T, source: object | undefined): T {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
  return target;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function mergeTitle(base: Metadata["title"], page: Metadata["title"]): Metadata["title"] {
  if (page === undefined) return base;
  const baseObj: TitleObject = typeof base === "string" ? { default: base } : (base ?? {});
  const pageObj: TitleObject = typeof page === "string" ? { default: page } : page;
  const template = pageObj.template ?? baseObj.template;

  let resolved: string | undefined;
  if (pageObj.absolute) {
    resolved = pageObj.absolute;
  } else if (pageObj.default) {
    resolved =
      baseObj.template && !pageObj.template
        ? baseObj.template.replace("%s", () => pageObj.default as string)
        : pageObj.default;
  } else {
    resolved = baseObj.absolute || baseObj.default;
  }

  const result: TitleObject = {};
  if (resolved !== undefined) result.default = resolved;
  if (template !== undefined) result.template = template;
  return result;
}

export function mergeMetadata(base: Metadata, page: Metadata): Metadata {
  const merged: Metadata = { ...base };
  for (const [key, value] of Object.entries(page)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }

  merged.title = mergeTitle(base.title, page.title);
  if (merged.title === undefined) delete merged.title;

  const pageTitleSet = resolveTitle(page.title) !== undefined;
  const pageDescSet = page.description !== undefined;

  if (base.openGraph || page.openGraph) {
    const inherited: OpenGraph = { ...base.openGraph };
    delete inherited.url;
    if (pageTitleSet) delete inherited.title;
    if (pageDescSet) delete inherited.description;
    merged.openGraph = assignDefined(inherited, page.openGraph);
  }
  if (base.twitter || page.twitter) {
    const inherited: Twitter = { ...base.twitter };
    if (pageTitleSet) delete inherited.title;
    if (pageDescSet) delete inherited.description;
    merged.twitter = assignDefined(inherited, page.twitter);
  }
  if (base.alternates || page.alternates) {
    const languages = {
      ...base.alternates?.languages,
      ...assignDefined({}, page.alternates?.languages),
    };
    merged.alternates = {
      ...assignDefined({ ...base.alternates }, page.alternates),
      ...(Object.keys(languages).length ? { languages } : {}),
    };
  }
  if (base.jsonLd !== undefined || page.jsonLd !== undefined) {
    const ld: JsonLdItem[] = [...toArray(base.jsonLd), ...toArray(page.jsonLd)];
    merged.jsonLd = ld;
  }
  return merged;
}
