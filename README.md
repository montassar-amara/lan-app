# LAN/APP

Offline-first readings dashboard for a local network. NestJS + Fastify + Prisma/PostgreSQL on the
back end, React/Vite on the front end, shipped as a self-contained Windows release zip with a
PowerShell updater.

## Layout

```
apps/api            NestJS API (port 8080), serves the built web app in production
apps/web            React dashboard (Vite dev server proxies /api to :8080)
packages/shared     zod DTOs shared by both apps
ops/update.ps1      updater: checksum, backup, migrate, health check, rollback
ops/backup.ps1      nightly pg_dump, 14-day retention
scripts/package.mjs builds release/app.zip + SHA256
```

## Development

Requires Node 22 and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm --filter @app/shared build
pnpm dev
```

The API reads `apps/api/.env`:

```
DATABASE_URL=postgresql://dev:dev@localhost:5432/myapp_dev
JWT_SECRET=<at least 32 characters>
ADMIN_USER=admin
ADMIN_PASS=<first-run admin password>
```

The first start seeds the admin account when the `User` table is empty. Remove `ADMIN_PASS` from the
environment after that.

Apply migrations with `pnpm --filter api exec prisma migrate deploy`.

## Release

```sh
pnpm package v1.0.0
```

Pushing a `v*` tag makes GitHub Actions run type checks and unit tests, build the zip, smoke-test it
against a fresh PostgreSQL instance, and attach `app.zip` + `app.zip.sha256` to the release.

Target PC setup (PostgreSQL, NSSM service, Caddy, firewall, scheduled tasks) is described in
`RUNBOOK.md`.
