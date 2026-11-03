# Project Brief for AI Agent: Offline-First LAN App (NestJS + React + Prisma + PostgreSQL) with Auto-Updates and Internet Dashboard

You are building and deploying a small web app. Follow this document top to bottom. Do not skip phases. After each phase, run its **Verify** step and fix problems before moving on.

Legend:
- 🤖 = you (the agent) do this.
- 🧑 = the human must do this (needs their accounts, router, or physical access). Stop and ask the human to do it, then continue.

---

## 0. Ground rules

1. Ask the human for every value in **Section 2 (Placeholders)** before writing any file that uses them.
2. The dev machine is **Windows, using `cmd`** (not PowerShell, unless a file is `.ps1`). cmd has no heredocs, so create files with your file-writing tool, not with `echo`.
3. Package manager is **pnpm** (via corepack). Never use npm or yarn.
4. Never commit secrets. `.env` files are gitignored.
5. Keep all dependencies and assets local. **No CDNs, no Google Fonts, no external requests at runtime**, because the app must work with no internet.
6. If a command fails, read the error, fix the cause, and retry. Do not paper over failures.
7. Do not change the decisions in Section 1 without asking the human.
8. **Pin Prisma to major version 7.** As of late 2026, `prisma@latest` on npm installs **Prisma 8, which is still a release candidate and a different API** (new packages, new schema/contract format). Always install with explicit `@7` ranges as shown below, and never run `pnpm add prisma` or `pnpm dlx prisma` without a version.

---

## 1. Goal and fixed decisions

### Requirements
- App runs on a **single old Windows PC in a LAN** and works fully **offline**.
- It **auto-downloads and installs updates** from the internet when online, with automatic rollback (code **and** database) if the new version fails.
- A **dashboard is reachable from the internet** (HTTPS) through a fixed/public IP with port forwarding.
- **Free only**: GitHub (repo, Actions, Releases), DuckDNS (if IP is not static), Caddy, NSSM, PostgreSQL.
- The target PC is weak (old CPU, little RAM), so no Docker and no building on the target.

### Stack
| Part | Choice |
|---|---|
| Monorepo | pnpm workspace: `apps/api`, `apps/web`, `packages/shared` |
| Backend | NestJS 11 on **Fastify** |
| ORM | **Prisma 7** with the `prisma-client` generator and the `@prisma/adapter-pg` driver adapter |
| Database | **PostgreSQL 17**, installed natively on the target as a Windows service, listening on localhost only |
| Frontend | React + Vite + TypeScript, TanStack Query, React Router |
| Shared | zod schemas and types, built with tsup to CJS and ESM |
| Auth | Cookie session (JWT in httpOnly cookie), scrypt password hashing |
| Runtime on target | Bundled `node.exe` shipped inside each release (target needs no Node installed) |
| Services | NSSM runs the app and Caddy as Windows services; PostgreSQL has its own service |
| HTTPS | Caddy with automatic Let's Encrypt |
| CI/CD | GitHub Actions builds a release zip on every `v*` tag and smoke-tests it against a real PostgreSQL |
| Updater | `ops/update.ps1`, hourly scheduled task: checksum verified, `pg_dump` backup, `prisma migrate deploy`, health check, automatic rollback (restores the dump) |
| Backups | `ops/backup.ps1`, nightly `pg_dump` |
| Node version | **22** everywhere (dev, CI, bundled `node.exe`) |

### Architecture
```
LAN clients ──► http://PC-LAN-IP:8080 ──┐
Internet ──► router 80/443 ──► Caddy ───┴──► NestJS (API + built React) ──► PostgreSQL (localhost:5432)
                                   Scheduled tasks: update.ps1 (hourly, outbound to GitHub), backup.ps1 (nightly)
```

### Resource note (tell the human)
PostgreSQL plus Node plus Caddy need roughly 400 MB to 1 GB of RAM in total on a lightly used app. With 2 GB RAM or less this is tight. Recommend at least 4 GB and an SSD. The tuning in Phase 10 keeps PostgreSQL small.

---

## 2. Placeholders (ask the human, then substitute everywhere)

| Placeholder | Meaning | Example |
|---|---|---|
| `YOUR_GH_USER` | GitHub username | `jdoe` |
| `REPO_NAME` | Repo name (default `lan-app`) | `lan-app` |
| `YOUR_DOMAIN` | Public hostname | `myapp.duckdns.org` |
| `DUCKDNS_SUB` / `DUCKDNS_TOKEN` | Only if the IP is not truly static | `myapp` / token |
| `ACME_EMAIL` | Email for Let's Encrypt | `me@example.com` |
| `TARGET_LAN_IP` | Fixed LAN IP of the old PC | `192.168.1.10` |
| `PG_SUPER_PASS` | Password for the PostgreSQL `postgres` superuser on the target (human chooses, hex/alphanumeric only) | |
| `DB_PASS` | Password for the app's database role on the target. Generate 32 hex chars (see 10.2). **Hex only**, no special characters, because it goes inside a URL | |

Also ask: **Is the repo allowed to be public?** (Default yes. A public repo lets the updater download releases without credentials. If private, see Section 14.)

Also ask: **Does the router's WAN IP match the public IP** (what-is-my-ip site)? If not, the ISP uses CGNAT and port forwarding will not work. In that case replace Caddy and DuckDNS with `cloudflared` running as a Windows service (Cloudflare Tunnel, free) and tell the human.

---

## 3. Repository layout

```
REPO_NAME/
├─ apps/api/
│  ├─ prisma/schema.prisma        schema
│  ├─ prisma/migrations/          committed SQL migrations (ship in releases)
│  ├─ prisma.config.ts            Prisma 7 CLI config (ships in releases)
│  └─ src/                        NestJS (src/generated/prisma is generated, gitignored)
├─ apps/web/                      React + Vite
├─ packages/shared/               zod schemas and types
├─ ops/update.ps1                 updater (shipped inside every release)
├─ ops/backup.ps1                 nightly pg_dump (shipped inside every release)
├─ scripts/package.mjs            builds release/app.zip (used locally and by CI)
├─ .github/workflows/release.yml
├─ release.cmd
├─ pnpm-workspace.yaml
├─ package.json
├─ .node-version                  contains: 22
└─ .gitignore
```

---

## Phase 1: Dev machine prerequisites 🧑/🤖

🤖 Check what is already installed (`node -v`, `pnpm -v`, `git --version`, `gh --version`, `psql --version`). Install only what is missing:

```bat
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install GitHub.cli
winget search postgresql
winget install PostgreSQL.PostgreSQL.17
corepack enable
```

- 🧑 If `corepack enable` needs admin rights, ask the human to run it in an elevated cmd.
- 🧑 Run `gh auth login` and `git config --global user.name/user.email` if not set.
- 🧑 The PostgreSQL installer asks for a superuser (`postgres`) password. Ask the human to choose one and tell you. Default port 5432. (Alternative if the human prefers Docker on the dev machine: `docker run -d --name pg-dev -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:17`.)

🤖 Create the dev role and database (adjust the psql path to the installed version, and use the superuser password):
```bat
set PGPASSWORD=<superuser password>
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE dev LOGIN PASSWORD 'dev' CREATEDB;"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE myapp_dev OWNER dev;"
```
(`CREATEDB` is required because `prisma migrate dev` creates a shadow database.)

**Verify:** `node -v` prints `v22.x`, `pnpm -v` prints a version, and `psql -U dev -h localhost -d myapp_dev -c "select 1"` works (password `dev`).

---

## Phase 2: Scaffold the monorepo 🤖

```bat
mkdir REPO_NAME && cd REPO_NAME
git init -b main
echo 22> .node-version
mkdir apps packages ops scripts .github\workflows
pnpm init
corepack use pnpm@10

cd apps
pnpm dlx @nestjs/cli new api --package-manager pnpm --skip-git --skip-install
pnpm create vite web --template react-ts
cd ..
mkdir packages\shared\src
```

Delete any `pnpm-lock.yaml`, `node_modules`, or `.git` folders the generators created inside `apps\*`.

**pnpm-workspace.yaml**
```yaml
packages:
  - apps/*
  - packages/*
onlyBuiltDependencies:
  - prisma
  - '@prisma/engines'
  - '@prisma/client'
  - esbuild
```
(pnpm 10 skips dependency build/postinstall scripts unless allowed. Prisma's engine download happens in a postinstall. If pnpm prints "Ignored build scripts" for anything else that is needed, run `pnpm approve-builds` or add it here.)

**Root package.json** (merge into the generated file, keep `"private": true`)
```json
{
  "private": true,
  "engines": { "node": ">=22 <23" },
  "scripts": {
    "dev": "pnpm --filter @app/shared build && pnpm -r --parallel --stream run dev",
    "build": "pnpm -r run build",
    "typecheck": "pnpm -r --if-present run typecheck",
    "test": "pnpm -r --if-present run test",
    "package": "node scripts/package.mjs"
  }
}
```

**.gitignore**
```
node_modules
dist
public
release
.env
apps/api/src/generated
```

**.gitattributes**
```
* text=auto
```

**packages/shared/package.json**
```json
{
  "name": "@app/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --clean",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "typecheck": "tsc --noEmit"
  }
}
```
Add a `tsconfig.json` to `packages/shared` (strict, `module: ESNext`, `moduleResolution: Bundler`, `noEmit: true`, `include: ["src"]`).

Install dependencies:
```bat
cd packages\shared
pnpm add zod
pnpm add -D tsup typescript
cd ..\..

pnpm --filter api add @nestjs/platform-fastify @fastify/cookie @fastify/helmet @fastify/static @nestjs/serve-static @nestjs/jwt @nestjs/throttler zod @app/shared@workspace:* @prisma/client@7 @prisma/adapter-pg@7 prisma@7
pnpm --filter api remove @nestjs/platform-express @types/express
pnpm --filter web add react-router @tanstack/react-query @app/shared@workspace:*
pnpm install
```
Notes:
- `prisma@7` is deliberately a **runtime dependency** (not `-D`) of `api`, because the target PC runs `prisma migrate deploy` from the release folder.
- Check that `prisma`, `@prisma/client` and `@prisma/adapter-pg` resolve to the **same 7.x version** (`pnpm --filter api list prisma @prisma/client @prisma/adapter-pg`). Align them if not.

In `apps/api/package.json`:
```json
"files": ["dist", "prisma", "prisma.config.ts"],
"scripts": {
  "dev": "prisma generate && nest start --watch",
  "build": "prisma generate && nest build",
  "typecheck": "prisma generate && tsc --noEmit",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:studio": "prisma studio"
}
```
(Keep other generated scripts such as `test`.) `files` matters: `pnpm deploy` ships only these.

In `apps/api/nest-cli.json` set `"deleteOutDir": true` under `compilerOptions`.

**Verify:** `pnpm install` succeeds, `pnpm --filter @app/shared build` produces `packages/shared/dist`, and `pnpm --filter api exec prisma --version` prints `prisma : 7.x`.

---

## Phase 3: Shared package 🤖

`packages/shared/src/index.ts` exports zod schemas and inferred types used by both API and web:

```ts
import { z } from 'zod';

export const LoginDto = z.object({ username: z.string().min(1), password: z.string().min(1) });
export type LoginDto = z.infer<typeof LoginDto>;

export const ReadingDto = z.object({
  id: z.number().int(),
  value: z.number(),
  createdAt: z.string(),
});
export type ReadingDto = z.infer<typeof ReadingDto>;

export const CreateReadingDto = z.object({ value: z.number().finite() });
export type CreateReadingDto = z.infer<typeof CreateReadingDto>;

export const HealthDto = z.object({ ok: z.boolean(), version: z.string() });
export type HealthDto = z.infer<typeof HealthDto>;
```

The `Reading` model is a placeholder domain. The human will replace it with their real data model later. Keep the structure (schema, migration, controller, web page) so it is easy to replace.

---

## Phase 4: API (NestJS + Fastify + Prisma 7) 🤖

All paths are under `apps/api/`.

### 4.1 Environment

**src/load-env.ts** (must be the first import in `main.ts`). Dev reads `.env`. In production the Windows service passes `--env-file`, so no `.env` exists and the `try` is a no-op.
```ts
try { process.loadEnvFile(); } catch {}
```

**src/env.ts**
```ts
import { z } from 'zod';
export const env = z.object({
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ADMIN_USER: z.string().default('admin'),
  ADMIN_PASS: z.string().min(12).optional(), // only used to seed the first admin
}).parse(process.env);
```

**.env** (gitignored, dev only)
```
DATABASE_URL=postgresql://dev:dev@localhost:5432/myapp_dev
JWT_SECRET=dev-secret-dev-secret-dev-secret-dev-secret
ADMIN_PASS=dev-password-123
```

### 4.2 Prisma schema and config

**prisma/schema.prisma**
```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

model User {
  id           Int      @id @default(autoincrement())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

model Reading {
  id        Int      @id @default(autoincrement())
  value     Float
  createdAt DateTime @default(now())
}
```
In Prisma 7 the connection URL is **not** in the schema. If the installed version rejects `moduleFormat`, consult the current NestJS + Prisma 7 recipe (https://docs.nestjs.com/recipes/prisma) and the Prisma generator docs. The requirement is that the generated client is **CommonJS** so NestJS can import it.

**prisma.config.ts**
```ts
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env by itself. Dev: load it here. Production: the caller passes --env-file.
try { process.loadEnvFile(); } catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // The fallback lets `prisma generate` run in CI without a database. Real commands (migrate) always get the real URL.
    url: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@localhost:5432/invalid',
  },
});
```

Create the first migration against the dev database and commit it:
```bat
pnpm --filter api exec prisma migrate dev --name init
```
Commit `apps/api/prisma/migrations/`. It ships in releases.

### 4.3 Prisma service

**src/prisma/prisma.service.ts**
```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from '../env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // small pool: the target PC is weak
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 5 }) });
  }
  async onModuleInit() { await this.$connect(); }   // fails fast if the DB is down
  async onModuleDestroy() { await this.$disconnect(); }
}
```
Provide it in a global `PrismaModule` and inject it wherever needed. The application never runs migrations itself. Migrations are applied by the updater (Phase 8) with `prisma migrate deploy` before the app starts.

### 4.4 Bootstrap

**src/main.ts**
```ts
import './load-env';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { env } from './env';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule, new FastifyAdapter({ trustProxy: '127.0.0.1' }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();             // closes the Prisma pool when the service stops
  await app.register(cookie);
  await app.register(helmet, {
    hsts: false,                          // Caddy sets it; meaningless on LAN http
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
  });
  await app.listen(env.PORT, '0.0.0.0');
}
bootstrap();
```

Critical gotchas (do not "fix" these):
- Helmet's default CSP includes `upgrade-insecure-requests`, which breaks LAN `http://` access. It is nulled out on purpose.
- Set the auth cookie's `secure` flag **per request**: `secure: req.protocol === 'https'`. `trustProxy` makes this reflect Caddy's `X-Forwarded-Proto`. A hard-coded `Secure` cookie would break login over LAN http.

### 4.5 Static serving (production only)

In `app.module.ts`:
```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const pub = join(__dirname, '..', 'public');
// imports:
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
...(existsSync(pub) ? [ServeStaticModule.forRoot({ rootPath: pub, exclude: ['/api/{*path}'] })] : []),
```
`public/` only exists in packaged releases, so dev does not complain. SPA fallback to `index.html` must work for React Router routes.

### 4.6 Auth

- `POST /api/auth/login` body `LoginDto`: validate with zod, check password, set httpOnly, `sameSite: 'lax'` cookie `session` containing a JWT (expiry 7 days). Decorate with `@Throttle({ default: { limit: 5, ttl: 60_000 } })`.
- `POST /api/auth/logout`: clear cookie.
- `GET /api/auth/me`: returns current user.
- A **global guard** requires a valid session on all routes except those marked with a `@Public()` decorator (`/api/health` and `/api/auth/login`).
- On module init, if `prisma.user.count() === 0` and `ADMIN_PASS` is set, create the admin from `ADMIN_USER`/`ADMIN_PASS`.

Password hashing uses `node:crypto` scrypt (no native dependency):
```ts
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const sc = promisify(scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
export async function hashPw(pw: string) {
  const s = randomBytes(16);
  return `${s.toString('hex')}:${(await sc(pw, s, 64)).toString('hex')}`;
}
export async function checkPw(pw: string, stored: string) {
  const [s, h] = stored.split(':');
  return timingSafeEqual(await sc(pw, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex'));
}
```

### 4.7 Health endpoint (the updater and CI depend on it)

`GET /api/health` is `@Public()` and must return `{ ok: true, version }` where `version` comes from the `VERSION` file in the release root (`dev` if absent), and it must touch the database:
```ts
const version = (() => {
  try { return readFileSync(join(__dirname, '..', 'VERSION'), 'utf8').trim(); }
  catch { return 'dev'; }
})();
@Public() @Get('health')
async health() { await this.prisma.$queryRaw`SELECT 1`; return { ok: true, version }; }
```
Do not change this response shape or path. If the database is unreachable the endpoint must fail (non-200), which makes the updater roll back.

### 4.8 Example domain endpoints (replaceable)

- `GET /api/readings` returns the latest 100 readings ordered by id desc (shape `ReadingDto[]`, `createdAt` as ISO string).
- `POST /api/readings` body `CreateReadingDto`, returns the created reading.

### 4.9 Build output check

After `pnpm --filter api build`, compare `src/generated/prisma` with `dist/generated/prisma`. **Every runtime file the generated client needs (including any non-`.ts` files such as `.wasm` or `.js` assets) must exist under `dist/generated/prisma`.** If non-TypeScript assets are missing, add them to `nest-cli.json` `compilerOptions.assets` (with `outDir` pointing into `dist`) so Nest copies them. The CI smoke test (Phase 7) will catch this if it is missed.

**Verify (Phase 4):**
1. `pnpm --filter api build` succeeds.
2. Start the API with the dev env: `curl http://localhost:8080/api/health` returns `{"ok":true,"version":"dev"}`.
3. Login with the seeded admin returns a `Set-Cookie`; `GET /api/readings` without a cookie returns 401.
4. Stop PostgreSQL briefly (or use a wrong `DATABASE_URL`): the app must fail to start or `/api/health` must fail.

---

## Phase 5: Web app (React) 🤖

**apps/web/vite.config.ts**
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
```

Implement:
- Login page (posts to `/api/auth/login`), redirects to the dashboard on success.
- A protected dashboard page listing readings with TanStack Query using `refetchInterval: 5000`, plus a button to add a reading.
- A router guard that redirects to login on 401.
- Validate API responses with the shared zod schemas.
- Keep everything same-origin and offline-safe: no CDN links, no remote fonts, no analytics. Use `fetch` with relative URLs and `credentials: 'same-origin'`.
- Add a `typecheck` script (`tsc -b --noEmit` or equivalent) in `apps/web/package.json`.

**Verify:** `pnpm dev` starts shared watch, API on 8080, and web on 5173. Login works at `http://localhost:5173`. `pnpm typecheck` and `pnpm build` pass.

---

## Phase 6: Packaging script 🤖

**scripts/package.mjs** (the same code runs locally and in CI)
```js
import { cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const version = process.argv[2] ?? 'dev';
const TAR = `${process.env.SystemRoot}\\System32\\tar.exe`; // bsdtar; Git's GNU tar can't make zips
const run = (cmd, env = {}) =>
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

rmSync('release', { recursive: true, force: true });
run('pnpm -r run build');
// hoisted linker: no symlinks/junctions in node_modules, so the zip is portable
run('pnpm --filter api deploy --legacy --prod release/app', { npm_config_node_linker: 'hoisted' });
cpSync('apps/web/dist', 'release/app/public', { recursive: true });
cpSync('ops', 'release/app/ops', { recursive: true });
cpSync(process.execPath, 'release/app/node.exe');
writeFileSync('release/app/VERSION', version);
run(`"${TAR}" -a -c -f release/app.zip -C release/app .`);
writeFileSync('release/app.zip.sha256',
  createHash('sha256').update(readFileSync('release/app.zip')).digest('hex'));
```

The resulting `release/app` folder must contain: `node.exe`, `dist/` (including `dist/generated/prisma`), `prisma/` (schema and migrations), `prisma.config.ts`, `public/`, `ops/`, `node_modules/` (production, hoisted, **including `prisma` CLI and its schema engine binary**), `package.json`, `VERSION`.

**Verify:** `pnpm package v0.0.0-local`, then check these paths exist inside `release/app`: `node_modules\prisma\build\index.js`, `prisma\migrations`, `prisma.config.ts`. Then run the smoke test manually against the dev database (extract the zip to a temp folder first):
```bat
cd <extracted folder>
set DATABASE_URL=postgresql://dev:dev@localhost:5432/myapp_dev
set PORT=18080
set JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
set ADMIN_PASS=smoke-test-password
node.exe node_modules\prisma\build\index.js migrate deploy
node.exe dist\main.js
```
`curl http://127.0.0.1:18080/api/health` must return `version: "v0.0.0-local"`. If `pnpm deploy --legacy` fails, adjust flags to the installed pnpm version (`pnpm deploy --help`) while keeping the result: a self-contained, link-free `release/app` folder. If the Prisma schema engine binary is missing from the output, make sure `@prisma/engines` postinstall ran in CI (see `onlyBuiltDependencies`) and that the deploy step did not strip it.

---

## Phase 7: CI release workflow 🤖

The smoke test installs a real PostgreSQL on the Windows runner (same engine and OS as production), applies the migrations from inside the zip using the **bundled `node.exe`**, boots the app, and checks `/api/health`.

**.github/workflows/release.yml**
```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: node scripts/package.mjs ${{ github.ref_name }}
      - name: Install PostgreSQL for the smoke test
        shell: pwsh
        run: choco install postgresql17 --params '/Password:smoke' -y --no-progress
      - name: Smoke test the zip
        shell: pwsh
        run: |
          $pg = (Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]$_.Name } -Descending | Select-Object -First 1).FullName + '\bin'
          $env:PGPASSWORD = 'smoke'
          & "$pg\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE DATABASE smoke"
          if ($LASTEXITCODE) { throw 'cannot create database' }
          New-Item -ItemType Directory smoke | Out-Null
          tar -xf release/app.zip -C smoke
          $env:DATABASE_URL = 'postgresql://postgres:smoke@127.0.0.1:5432/smoke'
          $env:PORT = '18080'
          $env:JWT_SECRET = 'x' * 40
          $env:ADMIN_PASS = 'smoke-test-password'
          Push-Location smoke
          .\node.exe node_modules\prisma\build\index.js migrate deploy
          if ($LASTEXITCODE) { throw 'migrate deploy failed' }
          $p = Start-Process .\node.exe -ArgumentList 'dist/main.js' -WorkingDirectory $PWD -PassThru
          Start-Sleep 10
          $h = Invoke-RestMethod http://127.0.0.1:18080/api/health
          Stop-Process $p
          Pop-Location
          if ($h.version -ne '${{ github.ref_name }}') { throw "bad health: $h" }
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            release/app.zip
            release/app.zip.sha256
```
If the Chocolatey package name or parameters differ, or the runner image already ships PostgreSQL that can be started instead, adapt the two PostgreSQL steps. The requirement is unchanged: a real PostgreSQL, migrations applied via the zip's own `node.exe`, health check with the correct version.

**release.cmd** (repo root)
```bat
@echo off
if "%1"=="" (echo usage: release 1.0.1 & exit /b 1)
git diff --quiet && git diff --cached --quiet || (echo Commit first & exit /b 1)
git push || exit /b 1
git tag v%1 || exit /b 1
git push origin v%1
```

---

## Phase 8: Updater and backup scripts 🤖

Replace `YOUR_GH_USER/REPO_NAME` with the real values.

### ops/update.ps1

Behavior contract (do not weaken):
1. Verify the SHA256 before extracting.
2. Stop the service, take a `pg_dump` backup **before** switching code or migrating. If the dump fails, restart the service and abort.
3. Switch the `current` junction to the new release, run `prisma migrate deploy` with the new release's own `node.exe` while the app is stopped.
4. Start the service and wait for `/api/health` to report the new version.
5. If migration or health check fails: stop the service, restore the dump, repoint `current` to the previous release, start the service, record the tag in `bad.txt` so it is never retried.
6. Keep the last 3 releases. The script updates its own copy (and `backup.ps1`) from the new release.

```powershell
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # progress bars make downloads crawl on old PCs
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'YOUR_GH_USER/REPO_NAME'; $root = 'C:\myapp'; $svc = 'myapp'
Start-Transcript "$root\logs\update.log" -Append | Out-Null

function Point($t) {
  if (Test-Path "$root\current") { cmd /c rmdir "$root\current" | Out-Null }  # removes the link only
  cmd /c mklink /J "$root\current" "$root\releases\$t" | Out-Null
}
function Healthy($t) {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep 2
    try { if ((Invoke-RestMethod http://127.0.0.1:8080/api/health -TimeoutSec 3).version -eq $t) { return $true } } catch {}
  }
  return $false
}
function PgBin {
  $d = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]$_.Name } -Descending | Select-Object -First 1
  "$($d.FullName)\bin"
}
function DbUrl {
  $l = Get-Content "$root\config\app.env" | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
  $l.Substring('DATABASE_URL='.Length)
}

try {
  $cur = if (Test-Path "$root\current\VERSION") { (Get-Content "$root\current\VERSION").Trim() } else { '' }
  $bad = if (Test-Path "$root\bad.txt") { Get-Content "$root\bad.txt" } else { @() }
  $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'myapp-updater' }
  $tag = $rel.tag_name
  if ($tag -eq $cur -or $bad -contains $tag) { return }

  $dir = "$root\releases\$tag"
  if (-not (Test-Path $dir)) {
    $a = $rel.assets | Where-Object name -eq 'app.zip'
    $s = $rel.assets | Where-Object name -eq 'app.zip.sha256'
    Invoke-WebRequest $a.browser_download_url -OutFile "$root\dl.zip"
    Invoke-WebRequest $s.browser_download_url -OutFile "$root\dl.sha256"
    $want = (Get-Content "$root\dl.sha256" -Raw).Trim().Split(' ')[0]
    if ((Get-FileHash "$root\dl.zip" -Algorithm SHA256).Hash -ne $want) { throw 'checksum mismatch' }
    New-Item -ItemType Directory "$dir.tmp" | Out-Null
    tar -xf "$root\dl.zip" -C "$dir.tmp"          # far faster than Expand-Archive on old PCs
    if ($LASTEXITCODE) { throw 'extract failed' }
    Rename-Item "$dir.tmp" $tag
    Remove-Item "$root\dl.zip", "$root\dl.sha256"
  }

  $prev = $cur
  $hasSvc = [bool](Get-Service $svc -ErrorAction SilentlyContinue)
  if ($hasSvc) {
    $pg = PgBin; $url = DbUrl
    Stop-Service $svc -Force
    $dump = "$root\backups\pre-$tag.dump"
    & "$pg\pg_dump.exe" --dbname=$url -Fc -f $dump
    if ($LASTEXITCODE) { Start-Service $svc; throw 'pre-update pg_dump failed; update aborted' }

    Point $tag
    Push-Location "$root\current"
    & .\node.exe "--env-file=$root\config\app.env" node_modules\prisma\build\index.js migrate deploy
    $migrated = ($LASTEXITCODE -eq 0)
    Pop-Location

    $ok = $false
    if ($migrated) { Start-Service $svc; $ok = Healthy $tag }
    if (-not $ok) {
      Stop-Service $svc -Force
      & "$pg\pg_restore.exe" --dbname=$url --clean --if-exists --no-owner $dump
      if ($prev) { Point $prev }
      Start-Service $svc
      Add-Content "$root\bad.txt" $tag
      throw "release $tag failed (migrated=$migrated); restored database and rolled back to $prev"
    }
  } else {
    Point $tag    # first install: service and database do not exist yet (see Phase 10)
  }

  Get-ChildItem "$root\releases" -Directory | Sort-Object CreationTime -Descending |
    Select-Object -Skip 3 | Remove-Item -Recurse -Force
  Get-ChildItem "$root\backups" -Filter 'pre-*.dump' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) |
    Remove-Item -Force
  Copy-Item "$root\current\ops\update.ps1" "$root\update.ps1" -Force   # updater updates itself
  Copy-Item "$root\current\ops\backup.ps1" "$root\backup.ps1" -Force
}
finally { Stop-Transcript | Out-Null }
```

### ops/backup.ps1 (nightly)

```powershell
$ErrorActionPreference = 'Stop'
$root = 'C:\myapp'
$d = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]$_.Name } -Descending | Select-Object -First 1
$pg = "$($d.FullName)\bin"
$l = Get-Content "$root\config\app.env" | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
$url = $l.Substring('DATABASE_URL='.Length)
$f = "$root\backups\daily-$(Get-Date -Format yyyy-MM-dd).dump"
& "$pg\pg_dump.exe" --dbname=$url -Fc -f $f
if ($LASTEXITCODE) { throw 'pg_dump failed' }
Get-ChildItem "$root\backups" -Filter 'daily-*.dump' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-14) |
  Remove-Item -Force
```

---

## Phase 9: First release 🧑/🤖

1. 🧑 Create an empty **public** GitHub repo `REPO_NAME` (or let the agent do it with `gh repo create YOUR_GH_USER/REPO_NAME --public --source . --remote origin` if `gh` is authenticated).
2. 🤖
   ```bat
   git add .
   git commit -m "initial version"
   git push -u origin main
   git tag v1.0.0
   git push origin v1.0.0
   gh run watch
   ```
3. **Verify:** the Action succeeds and the release `v1.0.0` contains `app.zip` and `app.zip.sha256`. If CI fails, read the logs (`gh run view --log-failed`), fix, delete the tag (`git tag -d v1.0.0 && git push origin :refs/tags/v1.0.0`), and retag.

---

## Phase 10: Target PC setup 🧑

The agent cannot reach the old PC. Give the human the exact steps below, with placeholders filled in. They run them in an **elevated cmd** on the old PC (Windows 10/11, 64-bit). Order matters.

### 10.1 Folders and first install
```bat
winget install NSSM.NSSM
winget install CaddyServer.Caddy
```
Close and reopen the elevated cmd, then:
```bat
mkdir C:\myapp\backups C:\myapp\logs C:\myapp\config C:\myapp\releases C:\myapp\caddy
curl -L -o C:\myapp\update.ps1 https://raw.githubusercontent.com/YOUR_GH_USER/REPO_NAME/main/ops/update.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\update.ps1
dir C:\myapp\current
copy C:\myapp\current\ops\backup.ps1 C:\myapp\backup.ps1
```
`C:\myapp\current` should contain `node.exe`, `dist`, `public`, `node_modules`, `prisma`, `prisma.config.ts`, `VERSION`. (At this point there is no service or database yet, so the updater only unpacks and points `current`.)

### 10.2 Generate secrets
```bat
C:\myapp\current\node.exe -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run it twice: one value is `JWT_SECRET`, the other is `DB_PASS` (hex only, URL-safe).

### 10.3 Install and configure PostgreSQL
```bat
winget search postgresql
winget install PostgreSQL.PostgreSQL.17 --override "--mode unattended --unattendedmodeui none --superpassword PG_SUPER_PASS --serverport 5432"
```
If the unattended flags are rejected by the installer, run `winget install PostgreSQL.PostgreSQL.17` normally and use the GUI: choose a superuser password (`PG_SUPER_PASS`), port 5432, skip Stack Builder. Then:
```bat
sc query state= all | findstr /i "postgresql"
```
Note the exact service name (for example `postgresql-x64-17`) and use it below as `PG_SERVICE`.

Create the app role and database (non-superuser, owns only its database):
```bat
set PGPASSWORD=PG_SUPER_PASS
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE ROLE myapp LOGIN PASSWORD 'DB_PASS';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE DATABASE myapp OWNER myapp;"
```

Tune for a weak PC and make sure it listens on localhost only:
```bat
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET shared_buffers='128MB';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET max_connections=20;"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET work_mem='4MB';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET maintenance_work_mem='32MB';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET effective_cache_size='512MB';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET listen_addresses='localhost';"
net stop PG_SERVICE
net start PG_SERVICE
```
(If the PC has 2 GB RAM or less, use `shared_buffers='64MB'`. Leave `fsync` and `synchronous_commit` at their defaults (on): the PC will suffer power cuts.) Do **not** open port 5432 in the firewall and do **not** forward it on the router.

### 10.4 App config and first migration
**C:\myapp\config\app.env** (use forward slashes if paths appear; no quotes):
```
PORT=8080
DATABASE_URL=postgresql://myapp:DB_PASS@127.0.0.1:5432/myapp
JWT_SECRET=<64 hex chars from 10.2>
ADMIN_USER=admin
ADMIN_PASS=<long first-admin password>
```
After the first successful start (admin created), remove the `ADMIN_PASS` line.

Apply the migrations once:
```bat
cd /d C:\myapp\current
node.exe --env-file=C:\myapp\config\app.env node_modules\prisma\build\index.js migrate deploy
```
Expected: it lists the applied migrations without errors.

### 10.5 Permissions and app service (runs as LocalService)
```bat
icacls C:\myapp\config /inheritance:r /grant "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" "NT AUTHORITY\LocalService:(OI)(CI)R"
icacls C:\myapp\logs   /grant "NT AUTHORITY\LocalService:(OI)(CI)M"

nssm install myapp C:\myapp\current\node.exe
nssm set myapp AppParameters "--max-old-space-size=256 --env-file=C:\myapp\config\app.env dist\main.js"
nssm set myapp AppDirectory C:\myapp\current
nssm set myapp ObjectName "NT AUTHORITY\LocalService"
nssm set myapp DependOnService PG_SERVICE
nssm set myapp Start SERVICE_AUTO_START
nssm set myapp AppStdout C:\myapp\logs\out.log
nssm set myapp AppStderr C:\myapp\logs\err.log
nssm set myapp AppRotateFiles 1
nssm set myapp AppRotateBytes 5000000
nssm set myapp AppRestartDelay 5000
nssm set myapp AppStopMethodConsole 15000
nssm start myapp
curl http://localhost:8080/api/health
```
Notes: `DependOnService` makes Windows start PostgreSQL before the app after every reboot. `C:\myapp\current` is a junction that the updater repoints, so no service changes are needed per release. `NSSM` with `LocalService` must be able to read `C:\myapp\current` (inherited permissions normally allow this; if the service fails with access denied, grant read: `icacls C:\myapp\releases /grant "NT AUTHORITY\LocalService:(OI)(CI)RX"`).

### 10.6 Caddy (HTTPS)
**C:\myapp\Caddyfile**
```
{
	email ACME_EMAIL
}
YOUR_DOMAIN {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy no-referrer
		-Server
	}
	@lanonly path /api/admin/* /api/ingest/*
	respond @lanonly 404
	reverse_proxy 127.0.0.1:8080
}
```
(The `@lanonly` paths are a convention: any future write/admin/ingestion routes under these prefixes are blocked from the internet and only reachable on the LAN at `:8080`.)

```bat
where caddy
nssm install caddy "C:\Program Files\caddy\caddy.exe"
nssm set caddy AppParameters "run --config C:\myapp\Caddyfile"
nssm set caddy AppEnvironmentExtra XDG_DATA_HOME=C:\myapp\caddy
nssm set caddy Start SERVICE_AUTO_START
nssm start caddy
```
Use the path printed by `where caddy` if it differs.

### 10.7 Firewall, schedules, power
```bat
netsh advfirewall firewall add rule name="myapp web" dir=in action=allow protocol=TCP localport=80,443
netsh advfirewall firewall add rule name="myapp lan" dir=in action=allow protocol=TCP localport=8080 remoteip=localsubnet

schtasks /create /f /tn myapp-update /sc hourly /ru SYSTEM /rl HIGHEST /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\update.ps1"
schtasks /create /f /tn myapp-backup /sc daily /st 02:00 /ru SYSTEM /rl HIGHEST /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\backup.ps1"

powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /h off
sc config w32time start= auto
```

Only if the public IP is **not** static (DuckDNS):
```bat
echo curl -s "https://www.duckdns.org/update?domains=DUCKDNS_SUB&token=DUCKDNS_TOKEN&ip=" > C:\myapp\duck.cmd
schtasks /create /f /tn duckdns /sc minute /mo 5 /ru SYSTEM /tr C:\myapp\duck.cmd
```

Run one backup immediately to prove it works:
```bat
powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\backup.ps1
dir C:\myapp\backups
```

### 10.8 Router and BIOS
- Give the PC a fixed LAN IP (DHCP reservation) = `TARGET_LAN_IP`.
- Forward **TCP 80 and 443** to `TARGET_LAN_IP`. Do **not** forward 8080, 5432 or any other port.
- BIOS: set "Restore on AC power loss" to **Power On**.

### 10.9 Optional
- Defender exclusion to speed up the weak CPU (security trade-off, human decides): `powershell Add-MpPreference -ExclusionPath C:\myapp`

### 10.10 Manual restore (disaster recovery, keep for the human)
```bat
net stop myapp
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --dbname=postgresql://myapp:DB_PASS@127.0.0.1:5432/myapp --clean --if-exists --no-owner C:\myapp\backups\daily-YYYY-MM-DD.dump
net start myapp
```

---

## Phase 11: Final verification 🧑 (agent guides)

| Check | How | Expected |
|---|---|---|
| LAN works | Open `http://TARGET_LAN_IP:8080` from another LAN device | Login page, can log in |
| Internet works | Phone on **mobile data**, open `https://YOUR_DOMAIN` | Valid HTTPS cert, login works |
| Offline works | Unplug the router's internet cable, open the LAN URL | Still works, data still saves |
| Database not exposed | From another LAN device: `Test-NetConnection TARGET_LAN_IP -Port 5432` | Fails (PostgreSQL is localhost only) |
| Auto-update | Release `v1.0.1` (Section 12), then run `powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\update.ps1` on the PC (or wait 1 hour) | `current\VERSION` becomes `v1.0.1`, `/api/health` shows the new version, `C:\myapp\backups\pre-v1.0.1.dump` exists |
| Migration applied | Ship a release with a new additive migration | New table/column exists, app works |
| Rollback | (On a staging box only) release a build with a failing migration or a startup crash | Update log shows rollback, database restored, old version running, tag in `bad.txt` |
| Reboot | Restart the PC | PostgreSQL, app and Caddy all start automatically, health is OK |
| Backup | Look in `C:\myapp\backups` the next morning | A fresh `daily-*.dump` |

---

## 12. Day-to-day workflow

```bat
git checkout -b feature-x
pnpm dev                              :: develop (web 5173, api 8080)
pnpm --filter api db:migrate          :: after editing schema.prisma: creates a migration (commit it!)
pnpm typecheck && pnpm test
pnpm package v0.0.0-local             :: optional: test the exact release zip locally
git add . && git commit -m "feature x"
git checkout main && git merge feature-x
release 1.0.1                         :: tags and pushes; CI builds and smoke-tests; the PC updates itself within an hour
gh run watch
```

Useful commands on the target PC:
```bat
nssm restart myapp
nssm restart caddy
type C:\myapp\logs\err.log
type C:\myapp\logs\update.log
sc query myapp
```

---

## 13. Invariants (never violate)

1. **Migrations are additive only**: add tables/columns, never drop or rename in the same release. Never edit a migration that has already been released. Always commit the generated `prisma/migrations` folder.
2. **Never run** `prisma migrate dev`, `migrate reset` or `db push` against the production database. Production only ever gets `prisma migrate deploy`, run by the updater.
3. A rollback restores the database from the pre-update dump, so **any data written between the update and the rollback is lost**. Keep the health-check window short (it is about 60 seconds).
4. **Do not change** the `/api/health` path or response shape, the `VERSION` file convention, or the fact that health touches the database.
5. **Never expose** ports other than 80 and 443 to the internet. Never forward 8080, 22 or 5432. PostgreSQL listens on localhost only.
6. **No runtime internet dependency** in the app (no CDNs, remote fonts, external APIs required to function).
7. **All releases come from tags** `v*` built by CI. Never copy files by hand onto the target.
8. Always keep `ADMIN_PASS`, `DB_PASS`, `PG_SUPER_PASS` and `JWT_SECRET` out of git. Remove `ADMIN_PASS` from `app.env` after the first start.
9. Node major version must be identical in `.node-version`, CI, and the bundled `node.exe`. Prisma packages must stay on the same 7.x version.
10. The PostgreSQL **major version** on the target must stay the same (dumps restore into the same or a newer major version, not an older one). Upgrading PostgreSQL is a manual, planned task.

## 14. Known risks and notes (tell the human)

- **Weak points of an old PC are disk, power and RAM, not CPU.** Recommend an SSD, a small UPS, and at least 4 GB RAM. Copy `C:\myapp\backups` to a USB drive periodically. A backup on the same disk does not survive a disk failure.
- **Clock drift** when offline can break cookies and certificates. Replace the CMOS battery if the clock resets after power loss.
- **Staging:** test the first updates on a second machine or VM set up the same way before trusting production. Test a deliberately failing release there to see the rollback work.
- **Disk usage:** each release includes `node.exe` and `node_modules` including the Prisma CLI, and the updater keeps the last 3. Check `C:\myapp\releases` size on the first update, and reduce the number kept (`-Skip 3` in `update.ps1`) if disk space is tight.
- **Private repo:** the updater would need a fine-grained, read-only GitHub token and the asset API URL with `Accept: application/octet-stream`. Ask the human before switching. A public repo means source code is public.
- **CGNAT:** if port forwarding is impossible, use Cloudflare Tunnel (`cloudflared` as a Windows service) instead of Caddy and DuckDNS. Everything else stays the same.
- **Transport security:** on the LAN, traffic is plain `http://`. This is acceptable on a trusted LAN. Internet access is always HTTPS via Caddy.
- **Prisma 8:** do not upgrade to Prisma 8 until it is generally available and the human asks for it. It is a rewrite (different packages, schema file and query API), so treat it as a separate migration project.
- **Verify on first run rather than trusting blindly:** (a) the `pnpm deploy --legacy` output contains the Prisma CLI and its schema engine binary, (b) all generated-client files are present in `dist/generated`, (c) the winget PostgreSQL unattended flags and service name, (d) the Chocolatey PostgreSQL package in CI, (e) the Caddy install path used in the NSSM command.

## 15. Definition of done

- [ ] Repo on GitHub with CI green (including the PostgreSQL smoke test) and release `v1.0.0` published (zip plus checksum).
- [ ] Target PC runs PostgreSQL, `myapp` and `caddy` as auto-start services, in the right order.
- [ ] PostgreSQL listens on localhost only and port 5432 is not reachable from the LAN.
- [ ] LAN access works with the internet unplugged.
- [ ] HTTPS dashboard works from outside the network.
- [ ] A second release (with a migration) was installed automatically by the updater and a `pre-*.dump` was created.
- [ ] Nightly backup produced a `daily-*.dump`, and a test restore into a scratch database succeeded.
- [ ] Rollback was tested (on staging) or the human acknowledged it is untested.
- [ ] Human knows how to release (`release 1.0.x`), how to create migrations, and where logs and backups are.