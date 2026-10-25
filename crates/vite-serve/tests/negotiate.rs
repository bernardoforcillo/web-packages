use vite_serve::negotiate::{MarkdownIndex, prefers_markdown};

#[test]
fn accept_variants() {
    let cases: &[(&str, bool)] = &[
        ("text/markdown", true),
        ("Text/Markdown", true),
        ("TEXT/MARKDOWN; Charset=utf-8", true),
        ("text/html", false),
        ("", false),
        ("   ", false),
        ("*/*", false),
        ("text/*", false),
        ("garbage", false),
        (",,;;q=", false),
        ("text/markdown;q=0", false),
        ("text/markdown;q=0.0, text/html", false),
        ("text/markdown, text/html;q=0.9", true),
        ("text/markdown;q=0.9, text/html", false),
        ("text/html, text/markdown", false),
        ("text/markdown, text/html", true),
        ("text/markdown;q=1, text/html;q=1", true),
        ("text/html;q=1, text/markdown;q=1", false),
        ("text/html;q=0.5, text/markdown;q=0.8", true),
        ("text/html;q=0, text/markdown;q=0.1", true),
        ("text/html;q=0, text/markdown", true),
        ("text/markdown, */*", true),
        ("*/*, text/markdown", true),
        ("text/*, text/markdown", true),
        ("text/html, */*;q=0.1", false),
        ("text/markdown;q=abc", false),
        ("text/markdown;q=abc, text/html;q=0.1", false),
        ("text/markdown;q=2, text/html;q=1", true),
        ("text/markdown;q=-1, text/html", false),
        ("text/markdown;q=0.5;level=1, text/html;q=0.4", true),
        ("text/html;q=bad, text/markdown;q=0.1", true),
        ("text/markdown;Q=1, text/html;q=0.5", true),
    ];
    for (accept, expected) in cases {
        assert_eq!(prefers_markdown(accept), *expected, "Accept: {accept:?}");
    }
}

fn idx(paths: &[&str]) -> MarkdownIndex {
    MarkdownIndex::from_paths(paths.iter().map(|s| s.to_string()))
}

#[test]
fn index_maps_files_to_urls() {
    let i = idx(&[
        "a.md",
        "b/index.md",
        "index.md",
        "c/d.md",
        "x.txt",
        "assets/app.js",
    ]);
    for p in ["/", "/a", "/b", "/c/d"] {
        assert!(i.contains(p), "{p}");
    }
    for p in ["/x", "/x.txt", "/assets/app.js", "/c", "/a.md"] {
        assert!(!i.contains(p), "{p}");
    }
    assert_eq!(i.file_for("/"), Some("index.md"));
    assert_eq!(i.file_for("/a"), Some("a.md"));
    assert_eq!(i.file_for("/b"), Some("b/index.md"));
    assert_eq!(i.file_for("/c/d"), Some("c/d.md"));
    assert_eq!(i.file_for("/zzz"), None);
}

#[test]
fn x_md_wins_over_x_index_md() {
    for order in [["x.md", "x/index.md"], ["x/index.md", "x.md"]] {
        let i = idx(&order);
        assert_eq!(i.file_for("/x"), Some("x.md"));
    }
}

#[test]
fn lookup_normalises_like_route_table() {
    let i = idx(&["blog/ciao.md", "index.md", "Docs/Intro.md"]);
    assert!(i.contains("/blog/ciao/"));
    assert!(i.contains("//blog//ciao"));
    assert!(i.contains("/blog/ciao?x=1#frag"));
    assert!(i.contains("/blog/cia%6f"));
    assert!(i.contains("/?q=1"));
    assert!(i.contains(""));
    assert!(i.contains("/Docs/Intro"));
    assert!(!i.contains("/docs/intro"), "case-sensitive");
    assert!(!i.contains("/blog/%ff"));
}

#[test]
fn empty_index_contains_nothing() {
    let i = idx(&[]);
    assert!(!i.contains("/"));
    assert!(i.file_for("/a").is_none());
}
