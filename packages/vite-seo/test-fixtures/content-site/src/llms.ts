export default (ctx: { content: { title: string; url: string; description?: string }[]; siteUrl?: string }) => ({
  title: "Il mio sito",
  summary: "Sito di prova",
  sections: [
    {
      title: "Contenuti",
      links: ctx.content.map((e) => ({ title: e.title, url: e.url, notes: e.description })),
    },
  ],
});
