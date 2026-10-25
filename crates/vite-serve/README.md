# vite-serve

Server HTTP per una SPA costruita con Vite: serve i file statici e, per ogni route
statica descritta in `seo-routes.json`, inietta nell'`<head>` di `index.html` titolo,
meta, link e JSON-LD prima di inviare la risposta. Le altre route ricevono il fallback
SPA (`index.html` invariato).

Si usa in due modi: come **libreria Rust** (API supportata) o come **binario** da riga
di comando (un sottile wrapper della libreria).

## Uso come libreria

```toml
[dependencies]
vite-serve = { version = "0.1", default-features = false }
```

Con `default-features = false` non vengono compilati `clap` e `tracing-subscriber`
(servono solo al binario, feature `cli`).

```rust
use axum::{Router, routing::get};
use vite_serve::ViteServe;

let site = ViteServe::builder()
    .dist("./dist")                 // deve contenere index.html
    // .manifest_path("./dist/seo-routes.json")
    // .no_manifest()
    // .html_cache_control("no-store")
    .build()?;

// Montato in un'app axum esistente:
let app = Router::new()
    .route("/api/ping", get(|| async { "pong" }))
    .fallback_service(site.router());

// Oppure da solo:
// site.serve("0.0.0.0:3000".parse()?).await?;
```

Metodi del builder: `dist`, `embedded` (solo con feature `embed`), `manifest_path`,
`manifest` (un `Manifest` già letto), `no_manifest`, `html_cache_control`, `build`.
Precedenza della sorgente del manifest: `manifest` > `manifest_path` > `no_manifest`.
Se non ne chiami nessuno, `build` cerca `<dist>/seo-routes.json` e, se manca, serve
senza iniezione. Un `manifest_path` esplicito mancante, illeggibile, invalido o con
`version` diversa da 1 è un `BuildError` che nomina il file; `dist` inesistente o senza
`index.html` è un `BuildError` che nomina la cartella.

`ViteServe` è economico da clonare e `router()` si può chiamare più volte. Per avviare il
server: `serve(addr)`, `serve_with_shutdown(addr, future)` e
`serve_listener_with_shutdown(listener, future)` (utile con la porta 0).

Esempio completo: `cargo run --example embed_in_axum -- ./dist`.

## Uso da riga di comando

```sh
cargo run --release -- --dist ./dist --port 3000
```

| Flag | Default | Significato |
| --- | --- | --- |
| `--dist <dir>` | obbligatorio (senza feature `embed`) | cartella della SPA costruita |
| `--manifest <file>` | `<dist>/seo-routes.json` | manifest delle route |
| `--host <host>` | `0.0.0.0` | indirizzo di ascolto |
| `--port <porta>` | `3000` | porta (0 = libera) |
| `--html-cache-control <valore>` | nessuno | sovrascrive `Cache-Control` dell'HTML |

All'avvio stampa su stdout `listening on http://HOST:PORT`. Se il manifest di default
manca, scrive un avviso nel log e serve senza iniezione; un manifest invalido o con
`version` ignota termina con exit code 1 e un messaggio che nomina il file. Il livello
di log si imposta con `RUST_LOG` (default `info`). Ctrl-C (e SIGTERM su unix) avvia lo
shutdown ordinato.

## Il contratto `seo-routes.json`

Il file è generato dal plugin Vite `@bernardoforcillo/vite-seo`: formato, campi e
schema JSON sono descritti in [packages/vite-seo/README.md](../../packages/vite-seo/README.md).
Questo crate accetta solo `version: 1`.

## Build con i file incorporati (`embed`)

```sh
VITE_SEO_DIST=/percorso/assoluto/dist cargo build --release --features embed
./target/release/vite-serve --port 3000
```

La cartella `VITE_SEO_DIST` viene incorporata nel binario: va impostata **prima** della
build e deve contenere `index.html`. Cargo non ricompila quando cambia il contenuto della
cartella o la variabile: dopo ogni modifica esegui `cargo clean -p vite-serve` (oppure
tocca un sorgente) prima di ricostruire. Da libreria usa `.embedded()`. In modalità
`embed` il manifest di default (`seo-routes.json`) viene letto dal bundle incorporato; se
non c'è, si serve senza iniezione (con un avviso nel log del CLI), mentre uno invalido è un
errore di avvio. Anche `--manifest` / `.manifest_path(..)` restano disponibili.

## Limiti

- Le route dinamiche (es. `/posts/$postId`) non ricevono tag finché non c'è la parte 3
  del progetto: ottengono `index.html` invariato.
- Nessun proxy `/api`: per le API monta `vite-serve` in un'app axum tua (`fallback_service`).
- `dist` è pubblica: tutti i file al suo interno, **compresi quelli nascosti**, vengono
  serviti. Non metterci nulla di riservato.
- L'API pubblica espone tipi di axum 0.8 (`Router`): la versione di axum della tua app
  deve coincidere.
