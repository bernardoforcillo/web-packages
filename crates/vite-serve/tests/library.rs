use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use axum::routing::get;
use http_body_util::BodyExt;
use tower::ServiceExt;
use vite_serve::{BuildError, Manifest, ViteServe, ViteServeBuilder};

const INDEX: &str = "<!doctype html><html><head><title>Vecchio</title></head><body><div id=\"root\"></div></body></html>";
const FIXTURE: &[u8] = include_bytes!("fixtures/seo-routes.json");

static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let p = std::env::temp_dir().join(format!("vite-serve-lib-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        Self(p)
    }
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn dist() -> TempDir {
    let d = TempDir::new();
    std::fs::write(d.path().join("index.html"), INDEX).unwrap();
    d
}

fn fixture_file(d: &TempDir) -> PathBuf {
    let f = d.path().join("custom-routes.json");
    std::fs::write(&f, FIXTURE).unwrap();
    f
}

async fn get_text(app: Router, uri: &str) -> (StatusCode, axum::http::HeaderMap, String) {
    let res = app
        .oneshot(Request::get(uri).body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        headers,
        String::from_utf8_lossy(&bytes).into_owned(),
    )
}

#[tokio::test]
async fn manifest_path_injects_title() {
    let d = dist();
    let f = fixture_file(&d);
    let vs = ViteServe::builder()
        .dist(d.path())
        .manifest_path(&f)
        .build()
        .unwrap();
    let (st, _, body) = get_text(vs.router(), "/about").await;
    assert_eq!(st, StatusCode::OK);
    assert!(body.contains("<title>About | Sito</title>"), "{body}");
}

#[tokio::test]
async fn manifest_value_and_repeated_router_calls() {
    let d = dist();
    let m = Manifest::from_slice(FIXTURE).unwrap();
    let vs = ViteServe::builder()
        .dist(d.path())
        .manifest(m)
        .build()
        .unwrap();
    let vs2 = vs.clone();
    let (_, _, a) = get_text(vs.router(), "/about").await;
    let (_, _, b) = get_text(vs2.router(), "/about").await;
    assert!(a.contains("<title>About | Sito</title>"));
    assert_eq!(a, b);
}

#[tokio::test]
async fn no_manifest_serves_plain_html() {
    let d = dist();
    std::fs::write(d.path().join("seo-routes.json"), FIXTURE).unwrap();
    let vs = ViteServe::builder()
        .dist(d.path())
        .no_manifest()
        .build()
        .unwrap();
    let (st, _, body) = get_text(vs.router(), "/about").await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body, INDEX);
}

#[tokio::test]
async fn default_manifest_in_dist_is_picked_up_and_absent_is_fine() {
    let d = dist();
    let vs = ViteServe::builder().dist(d.path()).build().unwrap();
    let (_, _, body) = get_text(vs.router(), "/about").await;
    assert_eq!(body, INDEX);

    std::fs::write(d.path().join("seo-routes.json"), FIXTURE).unwrap();
    let vs = ViteServe::builder().dist(d.path()).build().unwrap();
    let (_, _, body) = get_text(vs.router(), "/about").await;
    assert!(body.contains("<title>About | Sito</title>"));
}

#[tokio::test]
async fn mounts_inside_another_axum_app() {
    let d = dist();
    let f = fixture_file(&d);
    let vs = ViteServe::builder()
        .dist(d.path())
        .manifest_path(&f)
        .build()
        .unwrap();
    let app = Router::new()
        .route("/api/ping", get(|| async { "pong" }))
        .fallback_service(vs.router());
    let (st, _, body) = get_text(app.clone(), "/api/ping").await;
    assert_eq!((st, body.as_str()), (StatusCode::OK, "pong"));
    let (st, _, body) = get_text(app, "/about").await;
    assert_eq!(st, StatusCode::OK);
    assert!(body.contains("<title>About | Sito</title>"));
}

#[tokio::test]
async fn html_cache_control_overrides() {
    let d = dist();
    let f = fixture_file(&d);
    let vs = ViteServe::builder()
        .dist(d.path())
        .manifest_path(&f)
        .html_cache_control("no-store")
        .build()
        .unwrap();
    let (_, h, _) = get_text(vs.router(), "/about").await;
    assert_eq!(h[header::CACHE_CONTROL], "no-store");
}

fn err_of(b: ViteServeBuilder) -> BuildError {
    match b.build() {
        Ok(_) => panic!("expected BuildError"),
        Err(e) => e,
    }
}

#[test]
fn missing_dist_is_error_naming_path() {
    let d = TempDir::new();
    let missing = d.path().join("nope");
    let e = err_of(ViteServe::builder().dist(&missing));
    assert!(e.to_string().contains(missing.to_str().unwrap()), "{e}");
}

#[test]
fn dist_without_index_is_error_naming_path() {
    let d = TempDir::new();
    let e = err_of(ViteServe::builder().dist(d.path()));
    assert!(e.to_string().contains(d.path().to_str().unwrap()), "{e}");
    assert!(e.to_string().contains("index.html"), "{e}");
}

#[test]
fn invalid_manifest_is_error_naming_file() {
    let d = dist();
    let f = d.path().join("bad.json");
    std::fs::write(&f, "{ not json").unwrap();
    let e = err_of(ViteServe::builder().dist(d.path()).manifest_path(&f));
    assert!(e.to_string().contains(f.to_str().unwrap()), "{e}");
    assert!(std::error::Error::source(&e).is_some());
}

#[test]
fn unreadable_manifest_is_error_naming_file() {
    let d = dist();
    let f = d.path().join("absent.json");
    let e = err_of(ViteServe::builder().dist(d.path()).manifest_path(&f));
    assert!(e.to_string().contains(f.to_str().unwrap()), "{e}");
}

#[test]
fn version_two_manifest_is_error_naming_file() {
    let d = dist();
    let f = d.path().join("v2.json");
    std::fs::write(&f, r#"{"version":2,"routes":[]}"#).unwrap();
    let e = err_of(ViteServe::builder().dist(d.path()).manifest_path(&f));
    assert!(e.to_string().contains(f.to_str().unwrap()), "{e}");
    assert!(e.to_string().contains('2'), "{e}");
}

#[tokio::test]
async fn serves_on_a_real_listener_and_shuts_down() {
    let d = dist();
    let vs = ViteServe::builder().dist(d.path()).build().unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    let server = tokio::spawn(vs.serve_listener_with_shutdown(listener, async move {
        let _ = rx.await;
    }));
    let body = tokio::task::spawn_blocking(move || {
        ureq::get(format!("http://{addr}/healthz"))
            .call()
            .unwrap()
            .into_body()
            .read_to_string()
            .unwrap()
    })
    .await
    .unwrap();
    assert_eq!(body, "ok");
    tx.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), server)
        .await
        .expect("server should stop")
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn serve_with_shutdown_binds_address_and_stops() {
    let d = dist();
    let vs = ViteServe::builder().dist(d.path()).build().unwrap();
    let server = tokio::spawn(
        vs.serve_with_shutdown("127.0.0.1:0".parse().unwrap(), std::future::ready(())),
    );
    tokio::time::timeout(std::time::Duration::from_secs(5), server)
        .await
        .expect("server should stop")
        .unwrap()
        .unwrap();
}

#[test]
fn build_without_asset_source_is_error_not_panic() {
    let e = err_of(ViteServe::builder());
    let msg = e.to_string();
    assert!(
        msg.contains("dist(..)") && msg.contains("embedded()"),
        "{msg}"
    );
    // BuildError is non_exhaustive: external code needs a wildcard arm.
    let kind = match &e {
        BuildError::NoAssetSource => "none",
        _ => "other",
    };
    assert_eq!(kind, "none");
}

#[cfg(feature = "embed")]
#[tokio::test]
async fn embedded_bundle_reads_its_own_manifest() {
    // Requires VITE_SEO_DIST (at compile time) to hold index.html and a valid
    // seo-routes.json containing the fixture's /about route.
    let vs = ViteServe::builder().embedded().build().unwrap();
    assert!(vs.has_manifest());
    let (_, _, body) = get_text(vs.router(), "/about").await;
    assert!(body.contains("<title>About | Sito</title>"), "{body}");
    let vs = ViteServe::builder()
        .embedded()
        .no_manifest()
        .build()
        .unwrap();
    assert!(!vs.has_manifest());
}

#[test]
fn has_manifest_reflects_outcome() {
    let d = dist();
    assert!(
        !ViteServe::builder()
            .dist(d.path())
            .build()
            .unwrap()
            .has_manifest()
    );
    std::fs::write(d.path().join("seo-routes.json"), FIXTURE).unwrap();
    assert!(
        ViteServe::builder()
            .dist(d.path())
            .build()
            .unwrap()
            .has_manifest()
    );
}
