import { stringify } from "yaml";
import type { ContentEntry, MetadataRoute } from "../types";

function absolutize(url: string, siteUrl?: string): string {
  if (!siteUrl || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  try {
    return new URL(url, siteUrl).href;
  } catch {
    return url;
  }
}

const escapeTitle = (t: string) => t.replace(/[[\]]/g, (m) => `\\${m}`);

export function llmsToTxt(llms: MetadataRoute.Llms, siteUrl?: string): string {
  const blocks: string[] = [`# ${llms.title}`];
  if (llms.summary) blocks.push(`> ${llms.summary}`);
  if (llms.details) blocks.push(llms.details);

  const render = (
    heading: string,
    links: MetadataRoute.Llms["sections"][number]["links"],
  ) => {
    const lines = links.map((l) => {
      const base = `- [${escapeTitle(l.title)}](${absolutize(l.url, siteUrl)})`;
      return l.notes ? `${base}: ${l.notes}` : base;
    });
    return `## ${heading}\n\n${lines.join("\n")}`;
  };

  for (const s of llms.sections) {
    if (!s.optional) blocks.push(render(s.title, s.links));
  }
  const optional = llms.sections.filter((s) => s.optional).flatMap((s) => s.links);
  if (optional.length > 0) blocks.push(render("Optional", optional));

  return `${blocks.join("\n\n")}\n`;
}

export function llmsFullToTxt(entries: ContentEntry[], siteUrl?: string): string {
  const chunks = entries.map((e) => {
    const text = `# ${e.title}\n${absolutize(e.url, siteUrl)}\n\n${e.body}`;
    return text.endsWith("\n") ? text : `${text}\n`;
  });
  return chunks.join("\n---\n\n");
}

export function markdownForEntry(entry: ContentEntry): string {
  const fm: Record<string, string> = { title: entry.title, url: entry.url };
  if (entry.description) fm.description = entry.description;
  if (entry.date) fm.date = entry.date;
  return `---\n${stringify(fm, { lineWidth: 0 })}---\n\n${entry.body}`;
}
