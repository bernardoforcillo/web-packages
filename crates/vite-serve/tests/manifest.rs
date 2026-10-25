use vite_serve::manifest::{CacheDirective, Manifest};

const FIXTURE: &[u8] = include_bytes!("fixtures/seo-routes.json");

#[test]
fn parses_shared_fixture() {
    let m = Manifest::from_slice(FIXTURE).unwrap();
    assert_eq!(m.version, 1);
    assert_eq!(m.routes.len(), 3);
    let head = m.routes[0].head.as_ref().unwrap();
    assert_eq!(head.meta[0]["title"], "Home | Site");
    assert_eq!(head.cache, None);
    let about = m.routes[1].head.as_ref().unwrap();
    assert_eq!(about.cache, Some(CacheDirective::Revalidate(60)));
    assert_eq!(about.scripts[0].type_, "application/ld+json");
    assert_eq!(about.links[0]["rel"], "canonical");
}

#[test]
fn routes_cache_is_revalidate_60_on_about() {
    let m = Manifest::from_slice(FIXTURE).unwrap();
    assert_eq!(
        m.routes[1].head.as_ref().unwrap().cache,
        Some(CacheDirective::Revalidate(60))
    );
}

#[test]
fn cache_false_is_disabled() {
    let json = br#"{"version":1,"routes":[{"path":"/","dynamic":false,"head":{"meta":[],"links":[],"scripts":[],"cache":false}}]}"#;
    let m = Manifest::from_slice(json).unwrap();
    assert_eq!(
        m.routes[0].head.as_ref().unwrap().cache,
        Some(CacheDirective::Disabled)
    );
}

#[test]
fn rejects_invalid_cache_shapes() {
    for bad in ["true", "-1", "{\"revalidate\":-5}", "\"x\"", "{}", "60"] {
        let json = format!(
            r#"{{"version":1,"routes":[{{"path":"/","dynamic":false,"head":{{"meta":[],"links":[],"scripts":[],"cache":{bad}}}}}]}}"#
        );
        assert!(Manifest::from_slice(json.as_bytes()).is_err(), "{bad}");
    }
}

#[test]
fn wrong_version_errors_mentioning_version() {
    let err = Manifest::from_slice(br#"{"version":2,"routes":[]}"#).unwrap_err();
    assert!(err.to_string().contains("version"), "{err}");
}

#[test]
fn truncated_json_errors() {
    let err = Manifest::from_slice(&FIXTURE[..FIXTURE.len() / 2]).unwrap_err();
    assert!(!err.to_string().is_empty());
}

#[test]
fn dynamic_route_without_head_is_valid() {
    let m = Manifest::from_slice(FIXTURE).unwrap();
    assert!(m.routes[2].dynamic);
    assert!(m.routes[2].head.is_none());
}
