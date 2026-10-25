# Contributing

Thanks for your interest. This repository is a pnpm monorepo managed with
Turborepo; versions and changelogs are managed with Changesets.

## Setup

Requirements: Node.js 20 or later, pnpm 9 or later and, for `crates/vite-serve`,
the stable Rust toolchain.

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Workflow

1. Create a branch from `main`.
2. Make your change, with tests covering the new behavior.
3. Make sure `pnpm build`, `pnpm typecheck` and `pnpm test` pass.
4. If the change touches a published package, add a changeset:

   ```sh
   pnpm changeset
   ```

   Select the affected packages and the release type (patch, minor or major),
   describing the change from the point of view of the package's users.
5. Open a pull request explaining what changes and why.

## Changelog

Each package has its own `changelog.md`. Do not edit it by hand for new
releases: `pnpm version-packages` updates it from the changesets.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
`fix:`, `docs:`, `chore:`, ...).

## License

By contributing you agree that your contribution is released under the
[MIT license](license.md).

## Security

For vulnerabilities, follow [security.md](security.md) instead of opening an issue.
