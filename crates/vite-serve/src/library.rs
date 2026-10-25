//! The supported public API: a builder that produces a [`ViteServe`] you can mount in
//! an axum application or serve on its own.

use std::future::Future;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::Router;
use tokio::net::TcpListener;

use crate::assets::AssetSource;
use crate::manifest::{Manifest, ManifestError, SUPPORTED_VERSION};
use crate::route_match::RouteTable;
use crate::server::{AppState, build_app_shared};

const DEFAULT_MANIFEST: &str = "seo-routes.json";

/// Why [`ViteServeBuilder::build`] failed. Every variant names the offending path.
#[derive(Debug)]
#[non_exhaustive]
pub enum BuildError {
    /// Neither `dist(..)` nor `embedded()` was called.
    NoAssetSource,
    /// The `dist` directory does not exist or is not a directory.
    DistNotFound(PathBuf),
    /// The `dist` directory (or embedded bundle) has no `index.html`.
    IndexMissing(PathBuf),
    /// The manifest file could not be read.
    ManifestUnreadable {
        path: PathBuf,
        source: std::io::Error,
    },
    /// The manifest file is invalid JSON/shape or has an unsupported `version`.
    ManifestInvalid {
        path: PathBuf,
        source: ManifestError,
    },
}

impl std::fmt::Display for BuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoAssetSource => {
                f.write_str("no asset source: call `dist(..)` or `embedded()` before `build()`")
            }
            Self::DistNotFound(p) => write!(f, "dist directory not found: {}", p.display()),
            Self::IndexMissing(p) => {
                write!(f, "index.html not found in {}", p.display())
            }
            Self::ManifestUnreadable { path, source } => {
                write!(f, "cannot read manifest {}: {source}", path.display())
            }
            Self::ManifestInvalid { path, source } => {
                write!(f, "invalid manifest {}: {source}", path.display())
            }
        }
    }
}

impl std::error::Error for BuildError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::ManifestUnreadable { source, .. } => Some(source),
            Self::ManifestInvalid { source, .. } => Some(source),
            Self::NoAssetSource | Self::DistNotFound(_) | Self::IndexMissing(_) => None,
        }
    }
}

enum ManifestSource {
    /// Look for `<dist>/seo-routes.json`; fine if absent.
    Default,
    Path(PathBuf),
    Value(Manifest),
    None,
}

/// Builder for [`ViteServe`]. Start with [`ViteServe::builder`].
pub struct ViteServeBuilder {
    assets: Option<AssetSource>,
    manifest: ManifestSource,
    html_cache_control: Option<String>,
}

impl ViteServeBuilder {
    /// Serve the built SPA from this directory (must contain `index.html`).
    pub fn dist(mut self, dir: impl Into<PathBuf>) -> Self {
        self.assets = Some(AssetSource::Disk(dir.into()));
        self
    }

    /// Serve the files embedded at compile time (folder from `VITE_SEO_DIST`).
    #[cfg(feature = "embed")]
    pub fn embedded(mut self) -> Self {
        self.assets = Some(AssetSource::Embedded);
        self
    }

    /// Load the manifest from this file. A missing or invalid file makes `build` fail.
    /// Ignored when [`manifest`](Self::manifest) was also given.
    pub fn manifest_path(mut self, path: impl Into<PathBuf>) -> Self {
        if !matches!(self.manifest, ManifestSource::Value(_)) {
            self.manifest = ManifestSource::Path(path.into());
        }
        self
    }

    /// Use an already parsed manifest (takes precedence over `manifest_path`).
    pub fn manifest(mut self, manifest: Manifest) -> Self {
        self.manifest = ManifestSource::Value(manifest);
        self
    }

    /// Serve `index.html` unchanged: do not load any manifest (lowest precedence).
    pub fn no_manifest(mut self) -> Self {
        if matches!(self.manifest, ManifestSource::Default) {
            self.manifest = ManifestSource::None;
        }
        self
    }

    /// Override the `Cache-Control` header of every served HTML response.
    pub fn html_cache_control(mut self, value: impl Into<String>) -> Self {
        self.html_cache_control = Some(value.into());
        self
    }

    /// Validate the configuration and build the server.
    pub fn build(self) -> Result<ViteServe, BuildError> {
        let assets = self.assets.ok_or(BuildError::NoAssetSource)?;
        let dist_dir = match &assets {
            AssetSource::Disk(dir) => {
                if !dir.is_dir() {
                    return Err(BuildError::DistNotFound(dir.clone()));
                }
                if !dir.join("index.html").is_file() {
                    return Err(BuildError::IndexMissing(dir.clone()));
                }
                Some(dir.clone())
            }
            #[cfg(feature = "embed")]
            AssetSource::Embedded => {
                if assets.get("index.html").is_none() {
                    return Err(BuildError::IndexMissing(PathBuf::from("<embedded bundle>")));
                }
                None
            }
        };

        let manifest = match self.manifest {
            ManifestSource::Value(m) => Some(m),
            ManifestSource::Path(p) => Some(load_manifest(&p)?),
            ManifestSource::None => None,
            ManifestSource::Default => match dist_dir {
                Some(dir) => {
                    let p = dir.join(DEFAULT_MANIFEST);
                    if p.is_file() {
                        Some(load_manifest(&p)?)
                    } else {
                        None
                    }
                }
                None => match assets.get(DEFAULT_MANIFEST) {
                    Some(asset) => Some(parse_manifest(&asset.bytes, Path::new(DEFAULT_MANIFEST))?),
                    None => None,
                },
            },
        };
        let has_manifest = manifest.is_some();

        let routes = RouteTable::new(&manifest.unwrap_or(Manifest {
            version: SUPPORTED_VERSION,
            routes: Vec::new(),
        }));
        Ok(ViteServe {
            has_manifest,
            state: Arc::new(AppState {
                assets,
                routes,
                html_cache_control: self.html_cache_control,
            }),
        })
    }
}

fn load_manifest(path: &Path) -> Result<Manifest, BuildError> {
    let bytes = std::fs::read(path).map_err(|source| BuildError::ManifestUnreadable {
        path: path.to_path_buf(),
        source,
    })?;
    parse_manifest(&bytes, path)
}

fn parse_manifest(bytes: &[u8], path: &Path) -> Result<Manifest, BuildError> {
    Manifest::from_slice(bytes).map_err(|source| BuildError::ManifestInvalid {
        path: path.to_path_buf(),
        source,
    })
}

/// A configured SPA server. Cheap to clone; [`router`](Self::router) can be called
/// any number of times.
#[derive(Clone)]
pub struct ViteServe {
    has_manifest: bool,
    state: Arc<AppState>,
}

impl ViteServe {
    /// Start configuring a server.
    pub fn builder() -> ViteServeBuilder {
        ViteServeBuilder {
            assets: None,
            manifest: ManifestSource::Default,
            html_cache_control: None,
        }
    }

    /// Whether a manifest was loaded (explicitly, or found as the default
    /// `seo-routes.json` on disk or in the embedded bundle).
    pub fn has_manifest(&self) -> bool {
        self.has_manifest
    }

    /// An axum [`Router`] serving the site; mount it with `fallback_service` or `merge`.
    pub fn router(&self) -> Router {
        build_app_shared(self.state.clone())
    }

    /// Bind `addr` and serve until the process ends.
    pub async fn serve(self, addr: SocketAddr) -> std::io::Result<()> {
        self.serve_with_shutdown(addr, std::future::pending()).await
    }

    /// Bind `addr` and serve until `shutdown` completes, then drain gracefully.
    pub async fn serve_with_shutdown(
        self,
        addr: SocketAddr,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> std::io::Result<()> {
        let listener = TcpListener::bind(addr).await?;
        self.serve_listener_with_shutdown(listener, shutdown).await
    }

    /// Like [`serve_with_shutdown`](Self::serve_with_shutdown) on an already bound
    /// listener (bind port 0 and read `local_addr()` to learn the port).
    pub async fn serve_listener_with_shutdown(
        self,
        listener: TcpListener,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> std::io::Result<()> {
        axum::serve(listener, self.router())
            .with_graceful_shutdown(shutdown)
            .await
    }
}
