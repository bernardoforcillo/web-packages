//! Serve a built Vite single-page app and inject per-route SEO tags into `index.html`.
//!
//! `vite-serve` reads the `seo-routes.json` manifest emitted by the Vite plugin and, for
//! every static route listed there, rewrites the `<head>` of `index.html` (title, meta,
//! links, JSON-LD) before sending it. Everything else is served as plain static files,
//! with an SPA fallback to `index.html`.
//!
//! The [`ViteServe`] builder is the supported API. This example mounts the site next to
//! an `/api` route of your own axum application:
//!
//! ```no_run
//! use axum::{Router, routing::get};
//! use vite_serve::ViteServe;
//!
//! # async fn run() -> Result<(), Box<dyn std::error::Error>> {
//! let site = ViteServe::builder()
//!     .dist("./dist") // must contain index.html (and optionally seo-routes.json)
//!     .build()?;
//!
//! let app = Router::new()
//!     .route("/api/ping", get(|| async { "pong" }))
//!     .fallback_service(site.router());
//!
//! let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
//! axum::serve(listener, app).await?;
//! # Ok(())
//! # }
//! ```
//!
//! The public API exposes axum 0.8 types, so your axum version must match.

#[doc(hidden)]
pub mod assets;
#[doc(hidden)]
pub mod head_html;
#[doc(hidden)]
pub mod inject;
mod library;
pub mod manifest;
#[doc(hidden)]
pub mod route_match;
#[doc(hidden)]
pub mod server;

pub use library::{BuildError, ViteServe, ViteServeBuilder};
pub use manifest::{CacheDirective, Head, Manifest, RouteEntry};
