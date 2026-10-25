//! Types for the `seo-routes.json` (v1) manifest produced by the Vite plugin.

use std::collections::BTreeMap;
use std::fmt;

use serde::Deserialize;
use serde::de::{self, Deserializer, MapAccess, Visitor};

/// Supported manifest version.
pub const SUPPORTED_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub routes: Vec<RouteEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct RouteEntry {
    pub path: String,
    pub dynamic: bool,
    #[serde(default)]
    pub head: Option<Head>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Head {
    #[serde(default)]
    pub meta: Vec<BTreeMap<String, String>>,
    #[serde(default)]
    pub links: Vec<BTreeMap<String, String>>,
    #[serde(default)]
    pub scripts: Vec<Script>,
    #[serde(default)]
    pub cache: Option<CacheDirective>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Script {
    #[serde(rename = "type")]
    pub type_: String,
    pub children: String,
}

/// Per-route cache directive: `false` or `{ "revalidate": <seconds> }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheDirective {
    Disabled,
    Revalidate(u64),
}

impl<'de> Deserialize<'de> for CacheDirective {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct CacheVisitor;

        impl<'de> Visitor<'de> for CacheVisitor {
            type Value = CacheDirective;

            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("`false` or an object like { \"revalidate\": <non-negative integer> }")
            }

            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Self::Value, E> {
                if v {
                    Err(E::custom(
                        "cache: `true` is not allowed, use `false` or { revalidate }",
                    ))
                } else {
                    Ok(CacheDirective::Disabled)
                }
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut revalidate: Option<u64> = None;
                while let Some(key) = map.next_key::<String>()? {
                    if key == "revalidate" {
                        if revalidate.is_some() {
                            return Err(de::Error::duplicate_field("revalidate"));
                        }
                        revalidate = Some(map.next_value()?);
                    } else {
                        return Err(de::Error::unknown_field(&key, &["revalidate"]));
                    }
                }
                revalidate
                    .map(CacheDirective::Revalidate)
                    .ok_or_else(|| de::Error::missing_field("revalidate"))
            }
        }

        deserializer.deserialize_any(CacheVisitor)
    }
}

#[derive(Debug)]
pub enum ManifestError {
    Parse(serde_json::Error),
    UnsupportedVersion(u32),
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parse(e) => write!(f, "invalid seo-routes.json: {e}"),
            Self::UnsupportedVersion(v) => write!(
                f,
                "unsupported seo-routes.json version {v} (expected {SUPPORTED_VERSION})"
            ),
        }
    }
}

impl std::error::Error for ManifestError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Parse(e) => Some(e),
            Self::UnsupportedVersion(_) => None,
        }
    }
}

impl Manifest {
    pub fn from_slice(bytes: &[u8]) -> Result<Self, ManifestError> {
        let manifest: Manifest = serde_json::from_slice(bytes).map_err(ManifestError::Parse)?;
        if manifest.version != SUPPORTED_VERSION {
            return Err(ManifestError::UnsupportedVersion(manifest.version));
        }
        Ok(manifest)
    }
}
