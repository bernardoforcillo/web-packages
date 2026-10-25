//! Mount a built Vite app next to your own axum routes.
//!
//! Run with: `cargo run --example embed_in_axum -- ./dist`

use axum::{Router, routing::get};
use vite_serve::ViteServe;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dist = std::env::args()
        .nth(1)
        .ok_or("usage: embed_in_axum <dist-dir>")?;
    let site = ViteServe::builder().dist(dist).build()?;

    let app = Router::new()
        .route("/api/ping", get(|| async { "pong" }))
        .fallback_service(site.router());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await?;
    println!("listening on http://{}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}
