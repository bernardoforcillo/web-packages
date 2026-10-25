//! Content negotiation between HTML and Markdown representations of a page.

use std::collections::HashMap;

use crate::route_match::normalize_request_path;

/// One parsed `Accept` item for a media type we care about.
#[derive(Clone, Copy)]
struct Pref {
    q: f32,
    position: usize,
}

/// Whether an `Accept` header prefers `text/markdown` over `text/html`.
///
/// Media types are case-insensitive; only the `q` parameter is considered (default 1,
/// clamped to `0..=1`). `*/*` and `text/*` never count. Items that are malformed
/// (no `type/subtype`, or an unparsable `q`) are ignored. `text/markdown` wins when
/// its `q` is greater than zero and either `text/html` is not listed, or its `q` is
/// greater than that of `text/html`, or the two are equal and markdown comes first.
pub fn prefers_markdown(accept: &str) -> bool {
    let mut markdown: Option<Pref> = None;
    let mut html: Option<Pref> = None;
    for (position, item) in accept.split(',').enumerate() {
        let Some((media, q)) = parse_item(item) else {
            continue;
        };
        let slot = match media.as_str() {
            "text/markdown" => &mut markdown,
            "text/html" => &mut html,
            _ => continue,
        };
        match slot {
            Some(existing) => {
                if q > existing.q {
                    existing.q = q;
                }
            }
            None => *slot = Some(Pref { q, position }),
        }
    }
    let Some(md) = markdown else {
        return false;
    };
    if md.q <= 0.0 {
        return false;
    }
    match html {
        None => true,
        Some(h) => md.q > h.q || (md.q == h.q && md.position < h.position),
    }
}

/// Returns the lowercased media type and its `q`, or `None` for a malformed item.
fn parse_item(item: &str) -> Option<(String, f32)> {
    let mut parts = item.split(';');
    let media = parts.next()?.trim().to_ascii_lowercase();
    let (ty, sub) = media.split_once('/')?;
    if ty.is_empty() || sub.is_empty() || sub.contains('/') || media.contains(char::is_whitespace) {
        return None;
    }
    let mut q = 1.0_f32;
    for param in parts {
        let Some((key, value)) = param.split_once('=') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case("q") {
            let parsed: f32 = value.trim().parse().ok()?;
            if !parsed.is_finite() {
                return None;
            }
            q = parsed.clamp(0.0, 1.0);
        }
    }
    Some((media, q))
}

/// The set of URL paths that have a Markdown twin, built from the dist file listing.
///
/// `x.md` serves `/x`, `x/index.md` serves `/x`, `index.md` serves `/`; when both
/// `x.md` and `x/index.md` exist, `x.md` wins. Matching is case-sensitive.
#[derive(Debug, Default, Clone)]
pub struct MarkdownIndex {
    files: HashMap<String, String>,
}

impl MarkdownIndex {
    /// Builds the index from asset-relative file paths (`/` separated).
    pub fn from_paths(paths: impl IntoIterator<Item = String>) -> Self {
        let mut files: HashMap<String, String> = HashMap::new();
        for file in paths {
            let Some(stem) = file.strip_suffix(".md") else {
                continue;
            };
            if stem.is_empty() || file.split('/').any(str::is_empty) {
                continue;
            }
            if stem == "index" {
                files.insert("/".to_owned(), file);
            } else if let Some(dir) = stem.strip_suffix("/index") {
                files.entry(format!("/{dir}")).or_insert(file);
            } else {
                files.insert(format!("/{stem}"), file);
            }
        }
        Self { files }
    }

    /// The Markdown file (relative to the dist root) serving `url_path`, if any.
    /// `url_path` is normalised like [`RouteTable`](crate::route_match::RouteTable) does.
    pub fn file_for(&self, url_path: &str) -> Option<&str> {
        let path = normalize_request_path(url_path)?;
        self.files.get(&path).map(String::as_str)
    }

    /// Whether `url_path` has a Markdown twin.
    pub fn contains(&self, url_path: &str) -> bool {
        self.file_for(url_path).is_some()
    }
}
