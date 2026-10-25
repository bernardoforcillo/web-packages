# web-packages

pnpm monorepo for React and TypeScript packages, plus a Rust crate. Turborepo
runs builds and checks across packages in dependency order; Changesets manages
versions and releases.

## Requirements

- pnpm 9 or later
- A stable Rust toolchain (only for `crates/vite-serve`)

## Getting started

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Packages

| Package | Path | Description |
| --- | --- | --- |
| `@bernardoforcillo/vite-seo` | [packages/vite-seo](packages/vite-seo/readme.md) | Next.js-style Metadata API for TanStack Router and Vite: JSON-LD graph, sitemap, robots, manifest, RSS/Atom/JSON feeds, `llms.txt` and per-page markdown. |
| `vite-serve` (Rust crate, npm name `@bernardoforcillo/vite-serve`) | [crates/vite-serve](crates/vite-serve/readme.md) | Server and library that inject per-route SEO tags into the `index.html` of a Vite SPA and answer `Accept: text/markdown`. |

## Commands

| Command | Description |
| --- | --- |
| `pnpm build` | Build every package (`cargo build --release` for the crate). |
| `pnpm typecheck` | Type-check every package (`cargo check` for the crate). |
| `pnpm test` | Run every test suite (`vitest`, `cargo test`). |
| `pnpm changeset` | Describe a change and its release type. |
| `pnpm version-packages` | Apply changesets, then sync the crate version into `Cargo.toml` and `Cargo.lock`. |
| `pnpm release` | Build and publish with Changesets. |

## Adding a package

To add a package, create a new folder in `packages/` with its own
`package.json`; pnpm includes it automatically. Add `build` and `typecheck`
scripts to plug it into the Turborepo tasks.

## Versions and publishing

1. Run `pnpm changeset` and describe the changed packages and the release type.
2. Run `pnpm version-packages` to update versions and changelogs. This also keeps
   the version of the `vite-serve` crate (`Cargo.toml`, `Cargo.lock`) in step
   with its `package.json`.
3. Publish with `pnpm release` once npm access is configured.

Publish packages under the `@bernardoforcillo` scope and make sure the npm
account has permission to use it.

## Contributing

See [contributing.md](contributing.md).

## Security

To report a vulnerability see [security.md](security.md).

## License

[MIT](license.md)
