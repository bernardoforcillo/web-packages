//! HTTP layer: static files, SPA fallback with per-route head injection.

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderValue, Method, Request, StatusCode, header};
use axum::response::Response;
use axum::routing::get;
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, percent_decode_str, utf8_percent_encode};
use tower_http::compression::CompressionLayer;

use crate::assets::AssetSource;
use crate::inject::inject_head;
use crate::manifest::CacheDirective;
use crate::negotiate::{MarkdownIndex, prefers_markdown};
use crate::route_match::{RouteTable, normalize_request_path};

pub struct AppState {
    pub assets: AssetSource,
    pub routes: RouteTable,
    /// Pages that have a Markdown twin (built once, from the files present at startup).
    pub markdown: MarkdownIndex,
    /// When set, overrides the `Cache-Control` of served HTML.
    pub html_cache_control: Option<String>,
}

/// Everything but unreserved characters and `/` is escaped in the `Link` target.
const LINK_PATH: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'/')
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

const IMMUTABLE: &str = "public, max-age=31536000, immutable";

pub fn build_app(state: AppState) -> Router {
    build_app_shared(Arc::new(state))
}

/// Like [`build_app`] but shares an existing state, so several routers can be built
/// from one configuration.
pub fn build_app_shared(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .fallback(handle)
        .with_state(state)
        .layer(CompressionLayer::new())
}

async fn handle(State(state): State<Arc<AppState>>, req: Request<Body>) -> Response {
    let is_head = match *req.method() {
        Method::GET => false,
        Method::HEAD => true,
        _ => return text(StatusCode::METHOD_NOT_ALLOWED, "method not allowed", false),
    };
    let path = req.uri().path().to_string();
    let rel = path.strip_prefix('/').unwrap_or(&path).to_string();

    if rel != "index.html" && !rel.is_empty() {
        let st = state.clone();
        let rel2 = rel.clone();
        let asset = tokio::task::spawn_blocking(move || st.assets.get(&rel2))
            .await
            .ok()
            .flatten();
        if let Some(asset) = asset {
            let decoded = percent_decode_str(&rel).decode_utf8_lossy();
            let cache = if decoded.starts_with("assets/") {
                IMMUTABLE
            } else {
                "no-cache"
            };
            return respond(StatusCode::OK, &asset.mime, cache, asset.bytes, is_head);
        }
        if has_extension(&rel) {
            return text(StatusCode::NOT_FOUND, "not found", is_head);
        }
    }

    let accept = req
        .headers()
        .get_all(header::ACCEPT)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .collect::<Vec<_>>()
        .join(",");
    let markdown_file = state.markdown.file_for(&path).map(str::to_owned);
    if let Some(file) = &markdown_file
        && prefers_markdown(&accept)
    {
        let st = state.clone();
        let file = file.clone();
        let asset = tokio::task::spawn_blocking(move || st.assets.get(&file))
            .await
            .ok()
            .flatten();
        if let Some(asset) = asset {
            let mut res = respond(
                StatusCode::OK,
                "text/markdown; charset=utf-8",
                "no-cache",
                asset.bytes,
                is_head,
            );
            res.headers_mut()
                .append(header::VARY, HeaderValue::from_static("Accept"));
            return res;
        }
    }

    let st = state.clone();
    let index = tokio::task::spawn_blocking(move || st.assets.get("index.html"))
        .await
        .ok()
        .flatten();
    let Some(index) = index else {
        return text(
            StatusCode::INTERNAL_SERVER_ERROR,
            "index.html missing",
            is_head,
        );
    };
    let mut html = String::from_utf8_lossy(&index.bytes).into_owned();
    let mut cache = "no-cache".to_string();
    if let Some(entry) = state.routes.lookup(&path)
        && let Some(head) = &entry.head
    {
        match inject_head(&html, head) {
            Ok(injected) => html = injected,
            Err(e) => {
                tracing::warn!(path = %path, error = %e, "head injection failed, serving plain index.html")
            }
        }
        match head.cache {
            Some(CacheDirective::Revalidate(n)) => cache = format!("public, s-maxage={n}"),
            Some(CacheDirective::Disabled) => cache = "no-store".to_string(),
            None => {}
        }
    }
    if let Some(over) = &state.html_cache_control {
        cache = over.clone();
    }
    let mut res = respond(
        StatusCode::OK,
        "text/html; charset=utf-8",
        &cache,
        html.into_bytes(),
        is_head,
    );
    res.headers_mut()
        .append(header::VARY, HeaderValue::from_static("Accept"));
    if markdown_file.is_some()
        && let Some(link) = alternate_link(&path)
    {
        res.headers_mut().append(header::LINK, link);
    }
    res
}

/// `Link: <{path}.md>; rel="alternate"; type="text/markdown"` for a normalised path.
fn alternate_link(path: &str) -> Option<HeaderValue> {
    let normalized = normalize_request_path(path)?;
    let target = if normalized == "/" {
        "/index".to_string()
    } else {
        normalized
    };
    let encoded = utf8_percent_encode(&target, LINK_PATH);
    HeaderValue::from_str(&format!(
        "<{encoded}.md>; rel=\"alternate\"; type=\"text/markdown\""
    ))
    .ok()
}

fn has_extension(rel: &str) -> bool {
    let decoded = percent_decode_str(rel).decode_utf8_lossy();
    decoded.rsplit('/').next().is_some_and(|s| s.contains('.'))
}

fn text(status: StatusCode, msg: &'static str, is_head: bool) -> Response {
    respond(
        status,
        "text/plain; charset=utf-8",
        "no-store",
        msg.as_bytes().to_vec(),
        is_head,
    )
}

fn respond(
    status: StatusCode,
    content_type: &str,
    cache: &str,
    bytes: Vec<u8>,
    is_head: bool,
) -> Response {
    let len = bytes.len();
    let body = if is_head {
        Body::empty()
    } else {
        Body::from(bytes)
    };
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, cache)
        .header(header::CONTENT_LENGTH, len)
        .body(body)
        .unwrap_or_else(|_| Response::new(Body::empty()))
}
