export default (ctx: { content: { url: string }[]; siteUrl?: string }) =>
  ctx.content.map((e) => ({ url: `${ctx.siteUrl ?? "https://example.com"}${e.url === "/" ? "" : e.url}` }));
