export default (ctx: { content: { title: string; url: string; description?: string; date?: string; tags: string[] }[]; siteUrl?: string }) => ({
  title: "Il mio sito & blog",
  link: ctx.siteUrl ?? "/",
  description: "Feed di prova",
  items: ctx.content.map((e) => ({
    title: e.title,
    url: e.url,
    summary: e.description,
    date: e.date,
    tags: e.tags,
  })),
});
