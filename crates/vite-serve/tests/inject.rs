use vite_serve::inject::inject_head;
use vite_serve::manifest::Head;

fn head(json: &str) -> Head {
    serde_json::from_str(json).unwrap()
}

const VITE: &str = r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- keep me -->
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <title>Old</title>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <svg><title>icon</title></svg>
    <script>window.x = "</div>";</script>
  </body>
</html>
"#;

fn count(hay: &str, needle: &str) -> usize {
    hay.matches(needle).count()
}

#[test]
fn replaces_title() {
    let h = head(r#"{"meta":[{"title":"New"}]}"#);
    let out = inject_head(VITE, &h).unwrap();
    assert!(!out.contains("Old"));
    assert!(out.contains("<title>New</title>"));
    // head-level title replaced; svg title untouched
    assert_eq!(count(&out, "<title>"), 2);
    assert!(out.contains("<svg><title>icon</title></svg>"));
}

#[test]
fn svg_title_is_kept_when_head_has_no_title_in_doc() {
    let html = "<html><head></head><body><svg><title>icon</title></svg></body></html>";
    let h = head(r#"{"meta":[{"title":"New"}]}"#);
    let out = inject_head(html, &h).unwrap();
    assert!(out.contains("<svg><title>icon</title></svg>"));
    assert!(out.contains("<title>New</title>"));
}

#[test]
fn dedupes_meta_description() {
    let html = r#"<html><head><meta name="description" content="old"></head><body></body></html>"#;
    let h = head(r#"{"meta":[{"name":"description","content":"new"}]}"#);
    let out = inject_head(html, &h).unwrap();
    assert_eq!(count(&out.to_lowercase(), "name=\"description\""), 1);
    assert!(!out.contains("old"));
    assert!(out.contains("new"));
}

#[test]
fn dedupe_is_case_insensitive() {
    let html = r#"<html><head><META NAME="Description" content="old"></head><body></body></html>"#;
    let h = head(r#"{"meta":[{"name":"description","content":"new"}]}"#);
    let out = inject_head(html, &h).unwrap();
    assert!(!out.contains("old"));
    assert_eq!(count(&out.to_lowercase(), "description"), 1);
}

#[test]
fn dedupes_property_and_http_equiv() {
    let html = r#"<html><head><meta property="og:title" content="old1"><meta http-equiv="refresh" content="old2"><meta property="og:image" content="keep"></head><body></body></html>"#;
    let h = head(
        r#"{"meta":[{"property":"og:title","content":"n1"},{"http-equiv":"refresh","content":"n2"}]}"#,
    );
    let out = inject_head(html, &h).unwrap();
    assert!(!out.contains("old1") && !out.contains("old2"));
    assert!(out.contains("n1") && out.contains("n2"));
    assert!(out.contains(r#"<meta property="og:image" content="keep">"#));
}

#[test]
fn dedupes_canonical() {
    let html = r#"<html><head><link rel="canonical" href="https://old.test/"><link rel="icon" href="/f.ico"></head><body></body></html>"#;
    let h = head(r#"{"links":[{"rel":"canonical","href":"https://new.test/"}]}"#);
    let out = inject_head(html, &h).unwrap();
    assert_eq!(count(&out, "canonical"), 1);
    assert!(out.contains("https://new.test/"));
    assert!(!out.contains("old.test"));
    assert!(out.contains(r#"<link rel="icon" href="/f.ico">"#));
}

#[test]
fn canonical_kept_if_head_does_not_inject_one() {
    let html =
        r#"<html><head><link rel="canonical" href="https://old.test/"></head><body></body></html>"#;
    let h = head(r#"{"meta":[{"name":"robots","content":"noindex"}]}"#);
    let out = inject_head(html, &h).unwrap();
    assert!(out.contains("https://old.test/"));
}

#[test]
fn untouched_content_is_byte_identical() {
    let h = head(
        r#"{"meta":[{"title":"New"},{"name":"description","content":"d"}],"links":[{"rel":"canonical","href":"https://x.test/"}]}"#,
    );
    let out = inject_head(VITE, &h).unwrap();
    for keep in [
        "<!doctype html>\n<html lang=\"en\">",
        "<meta charset=\"UTF-8\" />",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
        "<!-- keep me -->",
        "<link rel=\"icon\" type=\"image/svg+xml\" href=\"/vite.svg\" />",
        "<script type=\"module\" crossorigin src=\"/assets/index-abc123.js\"></script>",
    ] {
        assert!(out.contains(keep), "missing: {keep}\n{out}");
    }
    let tail = |s: &str| s[s.find("</head>").unwrap()..].to_string();
    assert_eq!(tail(&out), tail(VITE));
}

#[test]
fn injected_content_goes_at_end_of_head() {
    let h = head(r#"{"meta":[{"name":"description","content":"d"}]}"#);
    let out = inject_head(VITE, &h).unwrap();
    let pos = out.find("name=\"description\"").unwrap();
    assert!(pos > out.find("index-abc123.js").unwrap());
    assert!(pos < out.find("</head>").unwrap());
}

#[test]
fn no_head_is_unchanged() {
    let html = "<div>hello</div>";
    let h = head(r#"{"meta":[{"title":"New"}]}"#);
    assert_eq!(inject_head(html, &h).unwrap(), html);
}

#[test]
fn empty_head_is_unchanged() {
    let h = head(r#"{}"#);
    assert_eq!(inject_head(VITE, &h).unwrap(), VITE);
}

#[test]
fn hostile_values_do_not_break_structure() {
    let h = head(
        r#"{"meta":[{"name":"description","content":"</head><script>alert(1)</script>\"x"}]}"#,
    );
    let out = inject_head(VITE, &h).unwrap();
    assert_eq!(count(&out, "</head>"), 1);
    assert!(!out.contains("<script>alert"));
}
