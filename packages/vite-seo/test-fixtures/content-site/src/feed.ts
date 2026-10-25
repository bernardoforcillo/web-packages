export default (ctx: { content: { title: string; url: string; description?: string; date?: string; tags: string[] }[]; siteUrl?: string }) => ({
  title: "My site & blog",
  link: ctx.siteUrl ?? "/",
  description: "Test feed",
  items: ctx.content.map((e) => ({
    title: e.title,
    url: e.url,
    summary: e.description,
    date: e.date,
    tags: e.tags,
  })),
});
