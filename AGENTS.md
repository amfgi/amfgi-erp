## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python -m graphify update .` to keep the graph current (AST-only, no API cost). Use this form if the `graphify` CLI is not on PATH.

## Cursor Cloud specific instructions

Single Next.js 16 (App Router, Turbopack) ERP app. Backend = Next.js API routes, DB = PostgreSQL via Prisma 7 with the `pg` driver adapter (`@prisma/adapter-pg`), auth via NextAuth 5. Note: `README.md` says MySQL/Next 14 but the code is PostgreSQL/Next 16 — trust the code.

### Node
- Use Node 24 (`.nvmrc`). The exec-daemon prepends its own Node 22 to `PATH`; a line in `~/.bashrc` re-prepends the nvm Node 24 bin so fresh shells get v24. If a shell shows v22, run `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`.

### Local database (not started automatically)
- Start PostgreSQL each session: `sudo service postgresql start` (it does not auto-start).
- Local dev role/db: role `amfgi` / password `amfgi` (superuser), server `127.0.0.1:5432`. The app reads `DATABASE_URL`/`DIRECT_DATABASE_URL` from `/workspace/.env` (gitignored; recreate if missing — also needs `AUTH_SECRET`, `AUTH_URL=http://localhost:3000`, `AUTH_COOKIE_SECURE=false`).
- Fresh DB from scratch: `createdb -h 127.0.0.1 -U amfgi amfgi` then `npm run migrate:deploy` then `npm run seed`. Seed prints demo logins (e.g. `admin@almuraqib.com` / `Admin@1234`).

### Run / verify (all need `.env` + running Postgres)
- Dev server: `npm run dev` (http://localhost:3000; runs `prisma generate` first). Changing `.env` requires a dev-server restart. Never run two `next dev` instances at once — they bind different ports and cause confusing "wrong DB" behavior.
- `npm run lint`, `npm run typecheck` (typecheck is clean; lint has many pre-existing errors), `npm test` (jest integration tests hit the local DB).
- Known pre-existing test failures: several integration suites fail in `teardownTestContext` on `warehouse.deleteMany()` with a null-constraint error. Root cause is `schema.prisma` `Company.stockFallbackWarehouse` relation using `fields: [id, stockFallbackWarehouseId]` with `onDelete: SetNull` (Prisma 7 tries to null the Company PK). This is a schema/Prisma-version issue, not an environment problem.

### Restoring a Postgres backup as the dev DB
- Backups are `pg_dump` from PostgreSQL 18, so `pg_restore` v18 is required (Ubuntu ships v16). Install once via the PGDG apt repo: `postgresql-client-18` (binaries in `/usr/lib/postgresql/18/bin/`).
- Restore into a separate db and repoint `.env` to it: `createdb -h 127.0.0.1 -U amfgi <db>` then `/usr/lib/postgresql/18/bin/pg_restore -h 127.0.0.1 -U amfgi -d <db> --no-owner --no-privileges <dump>`. The only expected error (`SET transaction_timeout` unrecognized) is harmless on a v16 server.
- Restored users authenticate with their real (unknown) password hashes; for local login set a known password directly, e.g. `UPDATE "User" SET password='<bcryptjs hash>' WHERE email='...'` (cost 12, use the app's `bcryptjs`).
