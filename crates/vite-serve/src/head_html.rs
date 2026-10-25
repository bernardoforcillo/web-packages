use std::collections::BTreeMap;
use std::fmt::Write;

use crate::manifest::Head;

fn escape_text(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// `[A-Za-z_:][A-Za-z0-9_:.-]*`
fn valid_attr_key(k: &str) -> bool {
    let mut chars = k.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == ':' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | ':' | '.' | '-'))
}

fn render_void(out: &mut String, tag: &str, attrs: &BTreeMap<String, String>) {
    if !attrs.keys().all(|k| valid_attr_key(k)) {
        return;
    }
    out.push('<');
    out.push_str(tag);
    for (k, v) in attrs {
        let _ = write!(out, " {k}=\"{}\"", escape_attr(v));
    }
    out.push_str("/>\n");
}

pub fn render_head(head: &Head) -> String {
    let mut out = String::new();
    for entry in &head.meta {
        if entry.len() == 1
            && let Some(title) = entry.get("title")
        {
            let _ = writeln!(out, "<title>{}</title>", escape_text(title));
        } else {
            render_void(&mut out, "meta", entry);
        }
    }
    for entry in &head.links {
        render_void(&mut out, "link", entry);
    }
    for script in &head.scripts {
        let children = script
            .children
            .replace("</", "<\\/")
            .replace("<!--", "<\\!--");
        let _ = writeln!(
            out,
            "<script type=\"{}\">{}</script>",
            escape_attr(&script.type_),
            children
        );
    }
    out
}
