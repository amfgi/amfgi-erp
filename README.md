# AMFGI ERP System

A multi-company ERP for fiberglass and steel workshop operations — inventory/stock control, jobs & job costing, HR & payroll, scheduling, dispatch and delivery notes. Built with **Next.js 16 (App Router, Turbopack)**, **React 19**, **PostgreSQL via Prisma 7**, **NextAuth 5**, and **TypeScript**.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Seeding Test Data](#seeding-test-data)
- [NPM Scripts](#npm-scripts)
- [Running Tests](#running-tests)
- [Deployment (Dokploy + Docker)](#deployment-dokploy--docker)

---

## Features

### Core modules

- **Stock & Inventory**: Materials, categories, units, warehouses, FIFO stock batches, goods receipt, dispatch, manual adjustments, inter-company & warehouse transfers, issue/non-stock reconciliation, stock count sessions, integrity reports, inventory-by-warehouse.
- **Jobs & Job Costing**: Parent contracts + variations, budget job items, formulas, job-wise cost analysis, external/hybrid job sources (Project Management API integration).
- **Customers & Suppliers**: Directory management with contacts, linked jobs and transactions, configurable local/external source modes.
- **HR & Payroll**: Employees (driver/office/hybrid/worker types), visa periods, documents & document types, attendance, company holidays, salary components, pay types, allowance types, pay runs, and tiered leave.
- **Leave Management**: Configurable leave types (entitlement, pay tiers, rollover, portal visibility), accrual by hire/visa anchor, annual + per-type balances, approvals synced to schedule absences, overlap prevention.
- **Scheduling & Dispatch**: Daily work schedules with drag helpers, presence/editor sync, driver trip plans, multi-assign print layouts.
- **Delivery Notes**: Structured delivery notes with company letterhead + print template builder, signed copies.
- **Reports**: Stock valuation, consumption, job profitability, monthly job summary, stock adjustments/exceptions, supplier traceability.
- **Employee Self-Service portal** (`/me`): Profile, documents, attendance, and leave requests for linked employees.
- **Admin**: Users, roles (permission presets), companies, media/storage/email/API/print settings.

### Platform features

- **Multi-tenancy**: Shared database with per-company data isolation via `companyId`; company switching and role-based access control.
- **Authentication**: Credentials (bcrypt) + Google OAuth via NextAuth 5, JWT sessions, per-company permission resolution.
- **FIFO stock consumption**, atomic Prisma transactions, soft deletes, and audit logging (material & price logs).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Next.js 16 (App Router, Turbopack), Redux Toolkit, Tailwind CSS 4, shadcn/ui, lucide-react |
| **Backend** | Next.js API Routes (Node runtime), TypeScript |
| **Database** | PostgreSQL via Prisma 7 ORM using the `pg` driver adapter (`@prisma/adapter-pg`); optional Prisma Accelerate for app queries |
| **Auth** | NextAuth 5, bcryptjs, Google OAuth |
| **Validation** | Zod |
| **Testing** | Jest + ts-jest |
| **Runtime** | Node.js 24 (see `.nvmrc`) |
| **Package Manager** | npm |

---

## Project Structure

```
app/
├── (app)/                 # App Router pages
│   ├── dashboard/  stock/  jobs/  customers/  suppliers/
│   ├── hr/                # employees, attendance, schedule, payroll, leave, reports, settings
│   ├── me/                # employee self-service portal
│   ├── reports/  admin/  settings/  media/  profile/
│   └── layout.tsx
└── api/                   # API routes (materials, transactions, jobs, hr, stock, reports, me, …)
lib/
├── db/                    # prisma.ts (singleton + pg adapter), postgresAdapter.ts, resolveDatabaseUrl.ts
├── hr/                    # leave, payroll, scheduling, attendance business logic
├── permissions.ts         # permission definitions & role presets
└── utils/
prisma/
├── schema.prisma          # Prisma schema (Postgres)
└── migrations-postgres/   # SQL migrations
scripts/                   # seed.ts, seed-production.ts, docker-publish.sh, docker-entrypoint.sh, …
__tests__/                 # unit (lib) + integration tests
auth.ts                    # NextAuth configuration
next.config.ts             # standalone output, Turbopack, image domains
Dockerfile                 # production standalone image
```

---

## Getting Started

### Prerequisites

- **Node.js 24** (`nvm install 24 && nvm use`)
- **npm**
- **PostgreSQL 16+** (local or hosted)

### 1. Install

```bash
npm install   # runs `prisma generate` via postinstall
```

### 2. Configure environment

Create a `.env` file in the project root (see [Environment Variables](#environment-variables)):

```env
DATABASE_URL="postgresql://amfgi:amfgi@127.0.0.1:5432/amfgi"
DIRECT_DATABASE_URL="postgresql://amfgi:amfgi@127.0.0.1:5432/amfgi"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"
AUTH_COOKIE_SECURE="false"
```

### 3. Set up the database

```bash
createdb amfgi                 # or CREATE DATABASE amfgi;
npm run migrate:deploy         # apply Prisma migrations
npm run seed                   # seed demo data
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string used by the app. May be a direct `postgresql://…` URL or a Prisma Accelerate URL. |
| `DIRECT_DATABASE_URL` | ⚠️ | Direct TCP `postgresql://…` URL for migrations and seed scripts. Required when `DATABASE_URL` is a Prisma Accelerate/proxy URL; otherwise optional (falls back to `DATABASE_URL`). `DIRECT_URL` is also accepted. |
| `AUTH_SECRET` | ✅ (prod) | Secret for JWT/session cookies (`openssl rand -base64 32`). A dev fallback is used if unset in development. `NEXTAUTH_SECRET` also accepted. |
| `AUTH_URL` | ✅ (prod) | Public site URL for Auth.js callbacks, e.g. `https://erp.example.com`. `NEXTAUTH_URL` also accepted. |
| `AUTH_COOKIE_SECURE` | optional | `true`/`false` to force secure cookies. Defaults to secure in production / when `AUTH_URL` is https. Set `false` for plain-HTTP local dev. |
| `AUTH_COOKIE_DOMAIN` | optional | Cookie domain for multi-subdomain deployments. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Enable Google OAuth sign-in. |

---

## Database Setup

The schema is PostgreSQL (`datasource db { provider = "postgresql" }`) and the app connects through the `pg` driver adapter. Multi-tenancy is enforced with a `companyId` on company-scoped tables and composite unique/foreign keys.

```bash
npm run prisma:generate     # regenerate the Prisma client
npm run migrate:deploy      # apply migrations (uses DIRECT_DATABASE_URL if set)
npm run pri                 # open Prisma Studio (GUI)
```

Migrations live in `prisma/migrations-postgres/` (configured in `prisma.config.ts`).

---

## Seeding Test Data

```bash
npm run seed
```

Seeds two companies (AMFGI, K&M), roles, users, units/categories/warehouses, materials with FIFO stock batches, customers/suppliers, jobs (contracts + variations), delivery notes, and a full HR dataset (employees, attendance, leave types/requests, print templates).

Demo logins printed by the seed:

```
Super Admin:   admin@almuraqib.com     / Admin@1234
AMFGI Manager: manager@amfgi.com       / Manager@1234
K&M Manager:   manager@kandm.com       / Manager@1234
Store Keeper:  storekeeper@amfgi.com   / Store@1234
Employee Demo: me.emp001@amfgi.com     / Employee@1234
```

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Generate Prisma client + start the dev server (Turbopack). |
| `npm run build` | Production build (`next build`). |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Type-check with `tsc --noEmit`. |
| `npm test` / `test:watch` / `test:coverage` | Run Jest tests. |
| `npm run seed` / `seed:production` | Seed demo / production data. |
| `npm run migrate:deploy` | Apply Prisma migrations. |
| `npm run prisma:generate` | Regenerate the Prisma client. |
| `npm run pri` | Open Prisma Studio. |
| `npm run docker:build` / `docker:publish` | Build / build-and-push the Docker image. |

---

## Running Tests

```bash
npm test                         # all tests
npm test -- __tests__/lib        # unit tests only (no DB needed)
npm test -- fifo-batch.test.ts   # a specific suite
```

- **Unit tests** (`__tests__/lib/**`) are pure and need no database.
- **Integration tests** (`__tests__/integration/**`) require a reachable PostgreSQL via `DATABASE_URL`; they create and tear down their own prefixed test data.

---

## Deployment (Dokploy + Docker)

Production runs as a standalone Docker image (`output: 'standalone'`). The recommended flow is to **build the image on your machine and let Dokploy pull it** (avoids compiling on a small VPS):

```bash
# 1. Build & push the image to a registry (e.g. Docker Hub)
export DOCKER_USER=your-registry-username
npm run docker:publish            # runs typecheck, builds, and pushes <user>/amfgi-erp:latest

# 2. In Dokploy, create an application from that image and set the runtime env:
#    DATABASE_URL, DIRECT_DATABASE_URL, AUTH_SECRET, AUTH_URL,
#    (optional) GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
#    Expose container port 3000.

# 3. Apply database migrations against the production DB (once per release):
DIRECT_DATABASE_URL="postgresql://…prod…" npm run migrate:deploy
```

The container entrypoint (`scripts/docker-entrypoint.sh`) simply runs the Next.js standalone server (`node server.js`) on port `3000`. Migrations are **not** run automatically on boot — run `migrate:deploy` as a release step.

> Build-time `DATABASE_URL`/`AUTH_*` values in the `Dockerfile` are placeholders for `next build` only; Dokploy's runtime environment variables override them.

---

## License

(Add your license here)
