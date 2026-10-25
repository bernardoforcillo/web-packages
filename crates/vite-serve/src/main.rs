//! Thin command-line wrapper around [`vite_serve::ViteServe`].

use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;
use vite_serve::ViteServe;

#[derive(Parser)]
#[command(version, about)]
struct Args {
    /// Directory with the built SPA (required unless built with the `embed` feature).
    #[arg(long, value_name = "DIR")]
    dist: Option<PathBuf>,

    /// Path of seo-routes.json (default: <dist>/seo-routes.json).
    #[arg(long, value_name = "FILE")]
    manifest: Option<PathBuf>,

    /// Address to listen on.
    #[arg(long, default_value = "0.0.0.0")]
    host: String,

    /// Port to listen on (0 picks a free port).
    #[arg(long, default_value_t = 3000)]
    port: u16,

    /// Override the Cache-Control header of served HTML.
    #[arg(long, value_name = "VALUE")]
    html_cache_control: Option<String>,
}

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    match run(Args::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(msg) => {
            eprintln!("error: {msg}");
            ExitCode::FAILURE
        }
    }
}

async fn run(args: Args) -> Result<(), String> {
    let mut builder = ViteServe::builder();
    match &args.dist {
        Some(dir) => builder = builder.dist(dir),
        None => {
            #[cfg(feature = "embed")]
            {
                builder = builder.embedded();
            }
            #[cfg(not(feature = "embed"))]
            return Err("--dist <DIR> is required".to_string());
        }
    }
    // Without --manifest the library looks for seo-routes.json in dist (or the bundle).
    if let Some(file) = &args.manifest {
        builder = builder.manifest_path(file);
    }
    if let Some(value) = &args.html_cache_control {
        builder = builder.html_cache_control(value.clone());
    }
    let server = builder.build().map_err(|e| e.to_string())?;
    if !server.has_manifest() {
        tracing::warn!("seo-routes.json not found, serving index.html without SEO injection");
    }

    let addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .parse()
        .map_err(|e| format!("invalid --host/--port: {e}"))?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("cannot bind {addr}: {e}"))?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?;
    tracing::info!("listening on http://{bound}");
    {
        use std::io::Write;
        println!("listening on http://{bound}");
        let _ = std::io::stdout().flush();
    }

    server
        .serve_listener_with_shutdown(listener, shutdown_signal())
        .await
        .map_err(|e| e.to_string())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
    tracing::info!("shutting down");
}
