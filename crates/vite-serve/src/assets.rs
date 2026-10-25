//! Where the built SPA files come from: a directory on disk, or (feature `embed`)
//! files compiled into the binary.

use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;

/// A file read from the dist folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asset {
    pub bytes: Vec<u8>,
    pub mime: String,
}

#[cfg(feature = "embed")]
#[derive(rust_embed::RustEmbed)]
#[folder = "$VITE_SEO_DIST"]
struct Dist;

#[derive(Debug, Clone)]
pub enum AssetSource {
    /// Serve from a directory on disk.
    Disk(PathBuf),
    /// Serve files embedded at compile time (folder from `VITE_SEO_DIST`).
    #[cfg(feature = "embed")]
    Embedded,
}

impl AssetSource {
    /// Returns the file at `rel` (relative to the dist root), or `None` when it does not
    /// exist, is a directory, or the path tries to escape the dist root.
    pub fn get(&self, rel: &str) -> Option<Asset> {
        let rel = sanitize(rel)?;
        match self {
            AssetSource::Disk(root) => read_disk(root, &rel),
            #[cfg(feature = "embed")]
            AssetSource::Embedded => {
                let file = Dist::get(&rel)?;
                Some(Asset {
                    bytes: file.data.into_owned(),
                    mime: mime_for(&rel),
                })
            }
        }
    }
}

/// Percent-decodes and validates a relative path, returning it `/`-joined.
fn sanitize(rel: &str) -> Option<String> {
    if rel.starts_with('/') {
        // Absolute paths and `//host/...` forms.
        return None;
    }
    let decoded = percent_decode_str(rel).decode_utf8().ok()?;
    if decoded.starts_with('/') || decoded.contains(['\\', '\0', ':']) {
        return None;
    }
    let mut parts = Vec::new();
    for segment in decoded.split('/') {
        match segment {
            ".." => return None,
            "" | "." => {}
            s => parts.push(s),
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

fn read_disk(root: &Path, rel: &str) -> Option<Asset> {
    let root = root.canonicalize().ok()?;
    let full = root.join(rel).canonicalize().ok()?;
    if !full.starts_with(&root) || !full.is_file() {
        return None;
    }
    let bytes = std::fs::read(&full).ok()?;
    Some(Asset {
        bytes,
        mime: mime_for(rel),
    })
}

fn mime_for(rel: &str) -> String {
    let mime = mime_guess::from_path(rel).first_or_octet_stream();
    if mime.essence_str() == "text/html" {
        "text/html; charset=utf-8".to_string()
    } else {
        mime.to_string()
    }
}
