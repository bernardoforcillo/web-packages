use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

const BIN: &str = env!("CARGO_BIN_EXE_vite-serve");
const FIXTURE: &[u8] = include_bytes!("fixtures/seo-routes.json");
const INDEX: &str = "<!doctype html><html><head><title>Vecchio</title></head><body></body></html>";

static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let p = std::env::temp_dir().join(format!("vite-serve-cli-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("index.html"), INDEX).unwrap();
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

struct Server {
    child: Child,
    base: String,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn start(args: &[&str]) -> Server {
    let mut child = Command::new(BIN)
        .args(args)
        .args(["--host", "127.0.0.1", "--port", "0"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
    let line = lines.next().expect("no output").unwrap();
    let base = line
        .strip_prefix("listening on ")
        .unwrap_or_else(|| panic!("unexpected line: {line}"))
        .trim()
        .to_string();
    // Keep draining stdout so the child never blocks on a full pipe.
    std::thread::spawn(move || for _ in lines {});
    Server { child, base }
}

fn get(url: &str) -> String {
    ureq::get(url)
        .call()
        .unwrap()
        .into_body()
        .read_to_string()
        .unwrap()
}

#[test]
fn invalid_manifest_exits_nonzero_naming_file() {
    let d = TempDir::new();
    let bad = d.path().join("bad.json");
    std::fs::write(&bad, "{ nope").unwrap();
    let out = Command::new(BIN)
        .args(["--dist", d.path().to_str().unwrap(), "--manifest"])
        .arg(&bad)
        .args(["--port", "0"])
        .output()
        .unwrap();
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains(bad.to_str().unwrap()), "{stderr}");
}

#[test]
fn missing_default_manifest_still_starts() {
    let d = TempDir::new();
    let s = start(&["--dist", d.path().to_str().unwrap()]);
    assert_eq!(get(&format!("{}/healthz", s.base)), "ok");
}

#[test]
fn end_to_end_injects_title() {
    let d = TempDir::new();
    std::fs::write(d.path().join("seo-routes.json"), FIXTURE).unwrap();
    let s = start(&["--dist", d.path().to_str().unwrap()]);
    let body = get(&format!("{}/about", s.base));
    assert!(body.contains("<title>About | Sito</title>"), "{body}");
}
