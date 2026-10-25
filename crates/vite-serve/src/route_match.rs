//! Lookup table for the static (non-dynamic) routes of a manifest.

use matchit::Router;
use percent_encoding::percent_decode_str;

use crate::manifest::{Manifest, RouteEntry};

/// Matches request paths against the manifest's static routes that carry a `head`.
#[derive(Debug)]
pub struct RouteTable {
    entries: Vec<RouteEntry>,
    router: Router<usize>,
}

impl RouteTable {
    /// Builds a table holding only `dynamic == false` routes that have a `head`.
    ///
    /// Routes whose normalised pattern duplicates an earlier one, or that matchit
    /// rejects, are skipped (the first one wins).
    pub fn new(manifest: &Manifest) -> Self {
        let mut entries = Vec::new();
        let mut router = Router::new();
        for entry in &manifest.routes {
            if entry.dynamic || entry.head.is_none() {
                continue;
            }
            let pattern = to_matchit_pattern(&entry.path);
            let index = entries.len();
            if router.insert(pattern, index).is_ok() {
                entries.push(entry.clone());
            }
        }
        Self { entries, router }
    }

    /// Returns the entry matching `request_path`, if any.
    pub fn lookup(&self, request_path: &str) -> Option<&RouteEntry> {
        let path = normalize_request_path(request_path)?;
        let matched = self.router.at(&path).ok()?;
        self.entries.get(*matched.value)
    }
}

/// Drops query/fragment, percent-decodes, collapses `//` and strips a trailing slash.
/// Returns `None` if the decoded path is not valid UTF-8.
fn normalize_request_path(raw: &str) -> Option<String> {
    let end = raw.find(['?', '#']).unwrap_or(raw.len());
    let decoded = percent_decode_str(&raw[..end]).decode_utf8().ok()?;
    Some(join_segments(&decoded))
}

fn join_segments(path: &str) -> String {
    let mut out = String::with_capacity(path.len() + 1);
    for segment in path.split('/').filter(|s| !s.is_empty()) {
        out.push('/');
        out.push_str(segment);
    }
    if out.is_empty() {
        out.push('/');
    }
    out
}

/// Converts a TanStack route path (`$id`, trailing `$`) into a matchit pattern.
fn to_matchit_pattern(path: &str) -> String {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.is_empty() {
        return "/".to_owned();
    }
    let last = segments.len() - 1;
    let mut out = String::with_capacity(path.len() + 8);
    for (i, segment) in segments.iter().enumerate() {
        out.push('/');
        if *segment == "$" && i == last {
            out.push_str("{*splat}");
        } else if let Some(name) = segment.strip_prefix('$') {
            out.push('{');
            out.push_str(name);
            out.push('}');
        } else {
            out.push_str(&segment.replace('{', "{{").replace('}', "}}"));
        }
    }
    out
}
