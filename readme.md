# web-packages

Monorepo pnpm per package React e TypeScript. Turborepo esegue build e controlli
coordinando le dipendenze tra package; Changesets gestisce versioni e release.

## Requisiti

- Node.js 20 o successivo
- pnpm 9 o successivo

## Avvio

```sh
pnpm install
pnpm build
pnpm typecheck
```

## Package

- `@bernardoforcillo/vite-seo`: API Metadata in stile Next.js per TanStack Router e Vite; vedi [packages/vite-seo/README.md](packages/vite-seo/README.md).
- `vite-serve` (crate Rust in `crates/vite-serve`): server e libreria che iniettano i tag SEO nell'`index.html` di una SPA Vite; vedi [crates/vite-serve/README.md](crates/vite-serve/README.md).

## Aggiungere un package

Per aggiungere un package, crea una nuova cartella in `packages/` con il suo
`package.json`; pnpm lo includerà automaticamente. Aggiungi gli script `build`
e `typecheck` per integrarlo nei task di Turborepo.

## Versioni e pubblicazione

1. Esegui `pnpm changeset` e descrivi i package modificati e il tipo di release.
2. Esegui `pnpm version-packages` per aggiornare versioni e changelog.
3. Pubblica con `pnpm release` dopo aver configurato l'accesso a npm.

Pubblica i package con lo scope `@bernardoforcillo` e verifica che l'account npm
abbia i permessi per usarlo.

## Contribuire

Vedi [contributing.md](contributing.md).

## Sicurezza

Per segnalare una vulnerabilità vedi [security.md](security.md).

## Licenza

[MIT](license.md)
