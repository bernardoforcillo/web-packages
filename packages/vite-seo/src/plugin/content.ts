import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import type { ContentEntry } from "../types";

export type ContentOptions = { dir: string; baseUrl?: string };

async function walk(dir: string, out: string[]): Promise<void> {
  const items = await readdir(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith(".") || item.name === "node_modules") continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) await walk(full, out);
    else if (item.isFile() && item.name.endsWith(".md")) out.push(full);
  }
}

function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = src.split("\n");
  if (lines[0].replace(/\r$/, "") !== "---") return { yaml: null, body: src };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].replace(/\r$/, "") === "---") {
      return { yaml: lines.slice(1, i).join("\n").replace(/\r/g, ""), body: lines.slice(i + 1).join("\n") };
    }
  }
  return { yaml: null, body: src };
}

function toIso(value: unknown, field: string, file: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid "${field}" date in ${file}`);
  return d.toISOString();
}

function toTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function str(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

/** Leading `/`, no trailing `/` (except for the root itself). */
function normalizeUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed === "") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export async function loadContent(options: ContentOptions, root: string): Promise<ContentEntry[]> {
  const base = resolve(root, options.dir);
  const files: string[] = [];
  try {
    await walk(base, files);
  } catch (err) {
    throw new Error(`Cannot read content directory "${base}": ${(err as Error).message}`);
  }
  files.sort();

  const prefix = normalizeUrl(options.baseUrl ?? "") === "/" ? "" : normalizeUrl(options.baseUrl ?? "");
  const entries: ContentEntry[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const { yaml, body } = splitFrontmatter(text);
    let data: Record<string, unknown> = {};
    if (yaml !== null) {
      try {
        const parsed = parse(yaml);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
      } catch (err) {
        throw new Error(`Invalid frontmatter in ${file}: ${(err as Error).message}`);
      }
    }
    if (data.draft === true) continue;

    const rel = relative(base, file).split(sep).join("/").replace(/\.md$/, "");
    const slug = rel === "index" ? "index" : rel.replace(/\/index$/, "");
    const path = rel === "index" ? "" : `/${slug}`;
    const override = str(data.url);
    const url = override !== undefined ? normalizeUrl(override) : `${prefix}${path}` || "/";
    const h1 = /^# +(.+?)\s*$/m.exec(body)?.[1];
    const title = str(data.title) ?? h1 ?? slug.split("/").pop()!;

    const prior = seen.get(url);
    if (prior) throw new Error(`Duplicate content URL "${url}" in ${prior} and ${file}`);
    seen.set(url, file);

    const entry: ContentEntry = { slug, url, title, tags: toTags(data.tags), body, file };
    const description = str(data.description);
    if (description !== undefined) entry.description = description;
    const date = toIso(data.date, "date", file);
    if (date) entry.date = date;
    const updated = toIso(data.updated, "updated", file);
    if (updated) entry.updated = updated;
    entries.push(entry);
  }

  return entries.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.title.localeCompare(b.title);
  });
}
