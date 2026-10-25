use std::collections::HashSet;
use std::fmt;

use lol_html::html_content::ContentType;
use lol_html::{Settings, element, rewrite_str};

use crate::head_html::render_head;
use crate::manifest::Head;

#[derive(Debug)]
pub struct InjectError(String);

impl fmt::Display for InjectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "head injection failed: {}", self.0)
    }
}

impl std::error::Error for InjectError {}

/// Keys of the `<meta>` attributes that identify a meta tag.
const META_KEYS: [&str; 3] = ["name", "property", "http-equiv"];

/// Inject `head` at the end of the document's `<head>`, first removing the
/// existing head elements that the injected ones replace.
pub fn inject_head(html: &str, head: &Head) -> Result<String, InjectError> {
    let rendered = render_head(head);
    if rendered.is_empty() {
        return Ok(html.to_string());
    }

    let has_title = head
        .meta
        .iter()
        .any(|m| m.len() == 1 && m.contains_key("title"));
    let mut meta_keys: HashSet<(&'static str, String)> = HashSet::new();
    for entry in &head.meta {
        for key in META_KEYS {
            if let Some(v) = entry.get(key) {
                meta_keys.insert((key, v.to_ascii_lowercase()));
            }
        }
    }
    let has_canonical = head.links.iter().any(|l| {
        l.get("rel")
            .is_some_and(|r| r.eq_ignore_ascii_case("canonical"))
    });

    let mut settings = Settings::new();
    if has_title {
        settings = settings.append_element_content_handler(element!("head > title", |el| {
            el.remove();
            Ok(())
        }));
    }
    if !meta_keys.is_empty() {
        settings = settings.append_element_content_handler(element!("head > meta", move |el| {
            let dup = META_KEYS.iter().any(|key| {
                el.get_attribute(key)
                    .is_some_and(|v| meta_keys.contains(&(*key, v.to_ascii_lowercase())))
            });
            if dup {
                el.remove();
            }
            Ok(())
        }));
    }
    if has_canonical {
        settings = settings.append_element_content_handler(element!("head > link", |el| {
            if el
                .get_attribute("rel")
                .is_some_and(|r| r.trim().eq_ignore_ascii_case("canonical"))
            {
                el.remove();
            }
            Ok(())
        }));
    }
    settings = settings.append_element_content_handler(element!("head", move |el| {
        el.append(&rendered, ContentType::Html);
        Ok(())
    }));

    rewrite_str(html, settings).map_err(|e| InjectError(e.to_string()))
}
