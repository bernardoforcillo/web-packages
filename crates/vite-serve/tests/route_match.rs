use vite_serve::manifest::{Manifest, RouteEntry};
use vite_serve::route_match::RouteTable;

fn entry(path: &str, dynamic: bool, with_head: bool) -> String {
    let head = if with_head {
        r#","head":{"meta":[{"title":"t"}]}"#
    } else {
        ""
    };
    format!(r#"{{"path":"{path}","dynamic":{dynamic}{head}}}"#)
}

fn manifest(entries: &[String]) -> Manifest {
    let json = format!(r#"{{"version":1,"routes":[{}]}}"#, entries.join(","));
    Manifest::from_slice(json.as_bytes()).expect("valid manifest")
}

fn table(entries: &[(&str, bool, bool)]) -> RouteTable {
    let es: Vec<String> = entries.iter().map(|(p, d, h)| entry(p, *d, *h)).collect();
    RouteTable::new(&manifest(&es))
}

fn path_of(e: Option<&RouteEntry>) -> Option<&str> {
    e.map(|e| e.path.as_str())
}

#[test]
fn about_variants_match_same_entry() {
    let t = table(&[("/", false, true), ("/about", false, true)]);
    for p in [
        "/about",
        "/about/",
        "/about?x=1",
        "/about#h",
        "//about//",
        "/about/?a=b#c",
    ] {
        assert_eq!(path_of(t.lookup(p)), Some("/about"), "path {p}");
    }
}

#[test]
fn root_matches_home() {
    let t = table(&[("/", false, true), ("/about", false, true)]);
    for p in ["/", "", "/?x=1", "//", "/#top"] {
        assert_eq!(path_of(t.lookup(p)), Some("/"), "path {p:?}");
    }
}

#[test]
fn percent_encoded_path_matches_unicode_route() {
    let t = table(&[("/caffè", false, true)]);
    assert_eq!(path_of(t.lookup("/caff%C3%A8")), Some("/caffè"));
    assert_eq!(path_of(t.lookup("/caffè")), Some("/caffè"));
}

#[test]
fn unknown_path_is_none() {
    let t = table(&[("/about", false, true)]);
    assert!(t.lookup("/nope").is_none());
}

#[test]
fn dynamic_routes_are_never_returned() {
    let t = table(&[("/live", true, true), ("/posts/$postId", true, true)]);
    assert!(t.lookup("/live").is_none());
    assert!(t.lookup("/posts/42").is_none());
}

#[test]
fn routes_without_head_are_excluded() {
    let t = table(&[("/nohead", false, false)]);
    assert!(t.lookup("/nohead").is_none());
}

#[test]
fn static_wins_over_dynamic_sibling() {
    let t = table(&[("/posts/new", false, true), ("/posts/$postId", true, true)]);
    assert_eq!(path_of(t.lookup("/posts/new")), Some("/posts/new"));
    assert!(t.lookup("/posts/42").is_none());
}

#[test]
fn malformed_escapes_return_none() {
    let t = table(&[("/about", false, true)]);
    assert!(t.lookup("/%zz").is_none());
    assert!(t.lookup("/%ff").is_none());
    assert!(t.lookup("/%").is_none());
    assert!(t.lookup("/about%").is_none());
}

#[test]
fn odd_manifests_do_not_panic() {
    let t = table(&[
        ("/a/$id", false, true),
        ("/a/$other", false, true),
        ("/files/$", false, true),
        ("/b/{x}", false, true),
        ("", false, true),
        ("/dup", false, true),
        ("/dup/", false, true),
    ]);
    assert!(t.lookup("/dup").is_some());
    let _ = t.lookup("/a/1");
    let _ = t.lookup("/files/x/y");
}
