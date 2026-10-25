use vite_serve::head_html::render_head;
use vite_serve::manifest::Head;

fn head(json: &str) -> Head {
    serde_json::from_str(json).unwrap()
}

#[test]
fn title_is_text_escaped() {
    let h = head(r#"{"meta":[{"title":"A & B <i>"}],"links":[],"scripts":[]}"#);
    assert_eq!(render_head(&h), "<title>A &amp; B &lt;i&gt;</title>\n");
}

#[test]
fn meta_attribute_values_are_escaped() {
    let h = head(
        r#"{"meta":[{"name":"description","content":"say \"hi\" <script>&"}],"links":[],"scripts":[]}"#,
    );
    assert_eq!(
        render_head(&h),
        "<meta content=\"say &quot;hi&quot; &lt;script&gt;&amp;\" name=\"description\"/>\n"
    );
}

#[test]
fn link_canonical_with_hreflang() {
    let h = head(
        r#"{"meta":[],"links":[{"rel":"alternate","href":"https://x.test/it","hrefLang":"it"}],"scripts":[]}"#,
    );
    assert_eq!(
        render_head(&h),
        "<link href=\"https://x.test/it\" hrefLang=\"it\" rel=\"alternate\"/>\n"
    );
}

#[test]
fn script_cannot_close_early() {
    let h = head(
        r#"{"meta":[],"links":[],"scripts":[{"type":"application/ld+json","children":"{\"a\":\"</script><b>\",\"c\":\"<!--\"}"}]}"#,
    );
    let out = render_head(&h);
    assert_eq!(out.matches("</script>").count(), 1);
    assert!(out.ends_with("</script>\n"));
    assert!(out.contains(r"<\/script>"));
    assert!(out.contains(r"<\!--"));
    assert!(!out.contains("<!--"));
}

#[test]
fn invalid_attribute_key_is_skipped() {
    let h = head(
        r#"{"meta":[{"x onload=alert(1) y":"v","name":"a"},{"name":"ok","content":"1"}],"links":[{"rel":"x\"","href":"/"},{"a b":"c"}],"scripts":[]}"#,
    );
    let out = render_head(&h);
    assert!(!out.contains("onload"));
    assert!(!out.contains("a b"));
    assert!(out.contains("<meta content=\"1\" name=\"ok\"/>\n"));
    assert!(out.contains("<link href=\"/\" rel=\"x&quot;\"/>\n"));
}

#[test]
fn order_is_meta_then_links_then_scripts() {
    let h = head(
        r#"{"meta":[{"title":"T"},{"name":"n","content":"c"}],"links":[{"rel":"canonical","href":"/"}],"scripts":[{"type":"application/ld+json","children":"{}"}]}"#,
    );
    assert_eq!(
        render_head(&h),
        "<title>T</title>\n<meta content=\"c\" name=\"n\"/>\n<link href=\"/\" rel=\"canonical\"/>\n<script type=\"application/ld+json\">{}</script>\n"
    );
}

#[test]
fn deterministic() {
    let h = head(
        r#"{"meta":[{"name":"n","content":"c","property":"p"}],"links":[{"rel":"r","href":"/","hrefLang":"it"}],"scripts":[]}"#,
    );
    assert_eq!(render_head(&h), render_head(&h));
}

#[test]
fn empty_head_is_empty_string() {
    let h = head(r#"{"meta":[],"links":[],"scripts":[]}"#);
    assert_eq!(render_head(&h), "");
}
