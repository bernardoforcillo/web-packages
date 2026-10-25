use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Method, Request, StatusCode, header};
use http_body_util::BodyExt;
use tower::ServiceExt;
use vite_serve::assets::AssetSource;
use vite_serve::manifest::Manifest;
use vite_serve::negotiate::MarkdownIndex;
use vite_serve::route_match::RouteTable;
use vite_serve::server::{AppState, build_app};

const INDEX: &str = r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Vecchio</title>
    <script type="module" crossorigin src="/assets/app.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>
"#;

// Longer than the compression layer's minimum size so gzip actually applies.
const CIAO_MD: &str = "# Ciao

Questo e il testo markdown della pagina di prova, abbastanza lungo.
";

const SECRET: &str = "TOP-SECRET-CONTENT-12345";

static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct Env {
    root: PathBuf,
}

impl Env {
    fn new() -> Self {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!("vite-serve-t7-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let dist = root.join("dist");
        std::fs::create_dir_all(dist.join("assets")).unwrap();
        std::fs::write(dist.join("index.html"), INDEX).unwrap();
        std::fs::write(dist.join("assets/app.js"), "console.log(1);").unwrap();
        std::fs::write(dist.join("robots.txt"), "User-agent: *").unwrap();
        std::fs::write(root.join("secret.txt"), SECRET).unwrap();
        std::fs::write(root.join("secret.md"), SECRET).unwrap();
        std::fs::create_dir_all(dist.join("blog")).unwrap();
        std::fs::write(dist.join("blog/ciao.md"), CIAO_MD).unwrap();
        std::fs::write(dist.join("index.md"), "# Home\n").unwrap();
        Self { root }
    }

    fn dist(&self) -> PathBuf {
        self.root.join("dist")
    }

    fn app(&self, manifest: &str, cache: Option<&str>) -> Router {
        let m = Manifest::from_slice(manifest.as_bytes()).unwrap();
        let assets = AssetSource::Disk(self.dist());
        let markdown = MarkdownIndex::from_paths(assets.list());
        build_app(AppState {
            assets,
            routes: RouteTable::new(&m),
            markdown,
            html_cache_control: cache.map(str::to_string),
        })
    }
}

impl Drop for Env {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

const MANIFEST: &str = r#"{
  "version": 1,
  "routes": [
    { "path": "/", "dynamic": false, "head": { "meta": [{ "title": "Home | Sito" }] } },
    { "path": "/about", "dynamic": false, "head": { "meta": [{ "title": "About | Sito" }], "cache": { "revalidate": 60 } } },
    { "path": "/off", "dynamic": false, "head": { "meta": [{ "title": "Off | Sito" }], "cache": false } },
    { "path": "/posts/$postId", "dynamic": true }
  ]
}"#;

async fn send(app: &Router, method: Method, uri: &str) -> (StatusCode, HeaderMap, String) {
    send_h(app, method, uri, &[]).await
}

async fn send_h(
    app: &Router,
    method: Method,
    uri: &str,
    hdrs: &[(&str, &str)],
) -> (StatusCode, HeaderMap, String) {
    let mut b = Request::builder().method(method).uri(uri);
    for (k, v) in hdrs {
        b = b.header(*k, *v);
    }
    let req = b.body(Body::empty()).unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        headers,
        String::from_utf8_lossy(&bytes).into_owned(),
    )
}

async fn get(app: &Router, uri: &str) -> (StatusCode, HeaderMap, String) {
    send(app, Method::GET, uri).await
}

fn h<'a>(headers: &'a HeaderMap, name: &str) -> &'a str {
    headers.get(name).map(|v| v.to_str().unwrap()).unwrap_or("")
}

#[tokio::test]
async fn injects_head_for_static_routes() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (s, hd, body) = get(&app, "/about").await;
    assert_eq!(s, StatusCode::OK);
    assert!(body.contains("<title>About | Sito</title>"), "{body}");
    assert!(!body.contains("Vecchio"));
    assert!(body.contains(r#"src="/assets/app.js""#));
    assert_eq!(h(&hd, "content-type"), "text/html; charset=utf-8");
    let (s, _, body) = get(&app, "/").await;
    assert_eq!(s, StatusCode::OK);
    assert!(body.contains("<title>Home | Sito</title>"));
    assert!(body.contains(r#"src="/assets/app.js""#));
}

#[tokio::test]
async fn dynamic_and_unknown_paths_serve_plain_index() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    for uri in ["/posts/42", "/nope/whatever"] {
        let (s, hd, body) = get(&app, uri).await;
        assert_eq!(s, StatusCode::OK, "{uri}");
        assert_eq!(body, INDEX, "{uri}");
        assert_eq!(h(&hd, "cache-control"), "no-cache", "{uri}");
    }
}

#[tokio::test]
async fn serves_assets_with_mime_and_immutable_cache() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (s, hd, body) = get(&app, "/assets/app.js").await;
    assert_eq!(s, StatusCode::OK);
    let ct = h(&hd, "content-type");
    assert!(ct.contains("javascript"), "{ct}");
    assert_eq!(
        h(&hd, "cache-control"),
        "public, max-age=31536000, immutable"
    );
    assert_eq!(body, "console.log(1);");
    let (s, hd, _) = get(&app, "/robots.txt").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(h(&hd, "cache-control"), "no-cache");
}

#[tokio::test]
async fn missing_file_with_extension_is_404() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    for uri in ["/missing.js", "/assets/nope.css"] {
        let (s, _, body) = get(&app, uri).await;
        assert_eq!(s, StatusCode::NOT_FOUND, "{uri}");
        assert!(!body.contains("<html"), "{uri}");
    }
}

#[tokio::test]
async fn traversal_never_leaks_files_outside_dist() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    for uri in [
        "/../Cargo.toml",
        "/%2e%2e/secret.txt",
        "//etc/passwd",
        "/..%2f..%2fsecret.txt",
        "/assets/../../secret.txt",
        "/%5c..%5csecret.txt",
        "/..%5csecret.txt",
        "/%2e%2e%2fsecret.txt",
        "/assets/%00.js",
    ] {
        let Ok(parsed) = uri.parse::<axum::http::Uri>() else {
            continue;
        };
        let req = Request::builder().uri(parsed).body(Body::empty()).unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        let body = String::from_utf8_lossy(&bytes);
        assert!(!body.contains(SECRET), "{uri} leaked");
        assert!(!body.contains("[package]"), "{uri} leaked Cargo.toml");
    }
}

#[test]
fn asset_source_rejects_escapes() {
    let env = Env::new();
    let src = AssetSource::Disk(env.dist());
    assert!(src.get("secret.txt").is_none());
    assert!(src.get("../secret.txt").is_none());
    assert!(src.get("%2e%2e/secret.txt").is_none());
    assert!(src.get("assets/../../secret.txt").is_none());
    assert!(src.get("..\\secret.txt").is_none());
    assert!(src.get("C:/Windows/win.ini").is_none());
    assert!(src.get("/etc/passwd").is_none());
    assert!(src.get("//etc/passwd").is_none());
    assert!(
        src.get("assets").is_none(),
        "directories are never returned"
    );
    let a = src.get("assets/app.js").unwrap();
    assert_eq!(a.bytes, b"console.log(1);");
    assert!(a.mime.contains("javascript"));
    assert_eq!(
        src.get("index.html").unwrap().mime,
        "text/html; charset=utf-8"
    );
}

#[tokio::test]
async fn head_matches_get_headers_with_empty_body() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (gs, gh, gb) = get(&app, "/about").await;
    let (hs, hh, hb) = send(&app, Method::HEAD, "/about").await;
    assert_eq!(gs, hs);
    assert!(hb.is_empty());
    assert!(!gb.is_empty());
    for name in ["content-type", "cache-control"] {
        assert_eq!(h(&gh, name), h(&hh, name), "{name}");
    }
}

#[tokio::test]
async fn cache_control_rules() {
    let env = Env::new();
    let (_, hd, _) = get(&env.app(MANIFEST, Some("no-store")), "/about").await;
    assert_eq!(h(&hd, "cache-control"), "no-store");
    let app = env.app(MANIFEST, None);
    let (_, hd, _) = get(&app, "/about").await;
    assert_eq!(h(&hd, "cache-control"), "public, s-maxage=60");
    let (_, hd, _) = get(&app, "/off").await;
    assert_eq!(h(&hd, "cache-control"), "no-store");
    let (_, hd, _) = get(&app, "/").await;
    assert_eq!(h(&hd, "cache-control"), "no-cache");
}

#[tokio::test]
async fn method_health_and_index_html() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (s, _, _) = send(&app, Method::POST, "/").await;
    assert_eq!(s, StatusCode::METHOD_NOT_ALLOWED);
    let (s, _, body) = get(&app, "/healthz").await;
    assert_eq!((s, body.as_str()), (StatusCode::OK, "ok"));
    let (s, hd, body) = get(&app, "/index.html").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(body, INDEX);
    assert_eq!(h(&hd, "content-type"), "text/html; charset=utf-8");
    assert!(hd.get(header::CACHE_CONTROL).is_some());
}

#[tokio::test]
async fn missing_index_is_500() {
    let env = Env::new();
    std::fs::remove_file(env.dist().join("index.html")).unwrap();
    let app = env.app(MANIFEST, None);
    let (s, _, _) = get(&app, "/about").await;
    assert_eq!(s, StatusCode::INTERNAL_SERVER_ERROR);
}

#[cfg(feature = "embed")]
#[test]
fn embedded_source_serves_dist_and_rejects_escapes() {
    let dist = PathBuf::from(env!("VITE_SEO_DIST"));
    let src = AssetSource::Embedded;
    let expected = std::fs::read(dist.join("index.html")).unwrap();
    assert_eq!(src.get("index.html").unwrap().bytes, expected);
    assert!(src.get("../x").is_none());
    assert!(src.get("assets/../../x").is_none());
}

fn vary_values(headers: &HeaderMap) -> Vec<String> {
    headers
        .get_all(header::VARY)
        .iter()
        .flat_map(|v| v.to_str().unwrap().split(','))
        .map(|s| s.trim().to_ascii_lowercase())
        .collect()
}

const MD: &[(&str, &str)] = &[("accept", "text/markdown")];

#[tokio::test]
async fn negotiated_markdown_has_vary_accept_and_accept_encoding() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (s, hd, _) = send_h(
        &app,
        Method::GET,
        "/blog/ciao",
        &[("accept", "text/markdown"), ("accept-encoding", "gzip")],
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(h(&hd, "content-type"), "text/markdown; charset=utf-8");
    assert_eq!(h(&hd, "cache-control"), "no-cache");
    let v = vary_values(&hd);
    assert!(v.contains(&"accept".to_string()), "{v:?}");
    assert!(v.contains(&"accept-encoding".to_string()), "{v:?}");
    assert!(hd.get("link").is_none());
    let (_, _, body) = send_h(&app, Method::GET, "/blog/ciao", MD).await;
    assert_eq!(body, CIAO_MD);
}

#[tokio::test]
async fn root_negotiates_index_md_and_trailing_slash_works() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (s, hd, body) = send_h(&app, Method::GET, "/", MD).await;
    assert_eq!((s, body.as_str()), (StatusCode::OK, "# Home\n"));
    assert_eq!(h(&hd, "content-type"), "text/markdown; charset=utf-8");
    let (_, _, body) = send_h(&app, Method::GET, "/blog/ciao/", MD).await;
    assert_eq!(body, CIAO_MD);
}

#[tokio::test]
async fn html_fallback_has_vary_accept_and_link_when_markdown_exists() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (s, hd, body) = get(&app, "/blog/ciao").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(body, INDEX);
    assert_eq!(h(&hd, "content-type"), "text/html; charset=utf-8");
    assert!(vary_values(&hd).contains(&"accept".to_string()));
    assert_eq!(
        h(&hd, "link"),
        r#"</blog/ciao.md>; rel="alternate"; type="text/markdown""#
    );
    let (_, hd, _) = get(&app, "/").await;
    assert_eq!(
        h(&hd, "link"),
        r#"</index.md>; rel="alternate"; type="text/markdown""#
    );
    let (_, hd, body) = send_h(
        &app,
        Method::GET,
        "/blog/ciao",
        &[("accept", "text/html, text/markdown;q=0.5")],
    )
    .await;
    assert_eq!(body, INDEX);
    assert!(hd.get("link").is_some());
}

#[tokio::test]
async fn path_without_markdown_gets_html_with_vary_and_no_link() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    for uri in ["/about", "/nope/whatever"] {
        let (s, hd, body) = send_h(&app, Method::GET, uri, MD).await;
        assert_eq!(s, StatusCode::OK, "{uri}");
        assert!(body.contains("<html"), "{uri}");
        assert_eq!(h(&hd, "content-type"), "text/html; charset=utf-8");
        assert!(vary_values(&hd).contains(&"accept".to_string()), "{uri}");
        assert!(hd.get("link").is_none(), "{uri}");
    }
}

#[tokio::test]
async fn head_negotiated_matches_get_without_body() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (gs, gh, gb) = send_h(&app, Method::GET, "/blog/ciao", MD).await;
    let (hs, hh, hb) = send_h(&app, Method::HEAD, "/blog/ciao", MD).await;
    assert_eq!(gs, hs);
    assert!(hb.is_empty());
    assert!(!gb.is_empty());
    for name in ["content-type", "cache-control", "content-length"] {
        assert_eq!(h(&gh, name), h(&hh, name), "{name}");
    }
    assert!(vary_values(&hh).contains(&"accept".to_string()));
}

#[tokio::test]
async fn direct_md_request_uses_markdown_mime() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    let (s, hd, body) = get(&app, "/blog/ciao.md").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(h(&hd, "content-type"), "text/markdown; charset=utf-8");
    assert_eq!(h(&hd, "cache-control"), "no-cache");
    assert_eq!(body, CIAO_MD);
}

#[tokio::test]
async fn traversal_with_markdown_accept_never_leaks() {
    let env = Env::new();
    let app = env.app(MANIFEST, None);
    for uri in [
        "/..%2fsecret",
        "/%2e%2e/secret",
        "/blog/%2e%2e/%2e%2e/secret",
        "/../secret",
        "/blog/..%2f..%2fsecret",
    ] {
        let Ok(parsed) = uri.parse::<axum::http::Uri>() else {
            continue;
        };
        let req = Request::builder()
            .uri(parsed)
            .header("accept", "text/markdown")
            .body(Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        assert!(
            !String::from_utf8_lossy(&bytes).contains(SECRET),
            "{uri} leaked"
        );
    }
}

#[test]
fn list_returns_relative_files() {
    let env = Env::new();
    let l = AssetSource::Disk(env.dist()).list();
    for f in [
        "index.html",
        "index.md",
        "assets/app.js",
        "blog/ciao.md",
        "robots.txt",
    ] {
        assert!(l.contains(&f.to_string()), "{f} in {l:?}");
    }
    assert!(!l.iter().any(|f| f.contains("secret")));
    assert!(!l.contains(&"assets".to_string()), "no directories");
}

#[test]
fn list_does_not_follow_symlinks_outside_root() {
    let env = Env::new();
    let outside = env.root.join("outside");
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::write(outside.join("leak.md"), SECRET).unwrap();
    let dir_link = env.dist().join("linkdir");
    let file_link = env.dist().join("linkfile.md");
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&outside, &dir_link).unwrap();
        std::os::unix::fs::symlink(env.root.join("secret.md"), &file_link).unwrap();
    }
    #[cfg(windows)]
    {
        if std::os::windows::fs::symlink_dir(&outside, &dir_link).is_err()
            || std::os::windows::fs::symlink_file(env.root.join("secret.md"), &file_link).is_err()
        {
            eprintln!("skipping: symlinks not permitted on this system");
            return;
        }
    }
    let l = AssetSource::Disk(env.dist()).list();
    assert!(
        !l.iter().any(|f| f.contains("leak") || f.contains("link")),
        "{l:?}"
    );
}
