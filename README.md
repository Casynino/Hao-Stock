# Hao Stock — Wholesale Distribution ERP

A production-ready ERP for a wholesale distribution business (rolling papers, poochi and
more) operating from a warehouse and selling through field sales representatives across
Tanzania.

The defining architectural decision is that **inventory is ledger-based**. Stock is never
stored as a mutable `quantity` that gets decremented. Every physical movement writes an
immutable row to `InventoryTransaction`, and the on-hand balance for any
`(product, location)` pair is the **sum of its ledger entries**. This gives a complete,
tamper-evident audit trail, accurate valuation, and the ability to pinpoint missing stock
and hold people accountable.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [Deploying with Neon Postgres](#deploying-with-neon-postgres)
- [Seed accounts](#seed-accounts)
- [Environment variables](#environment-variables)
- [API](#api)
- [Scripts](#scripts)

---

## Features

- **Ledger inventory** — `STOCK_IN`, `PURCHASE_RECEIPT`, `TRANSFER_IN/OUT`, `CASH_SALE`,
  `CREDIT_SALE`, `CUSTOMER_RETURN`, `SALES_RETURN`, `DAMAGE`, `ADJUSTMENT`, `CORRECTION`,
  `STOCK_COUNT`. Balances are always derived from history.
- **Multi-level packaging** — sell/track by Pack, Box or Carton with per-product
  conversion factors (e.g. Box = 50 packs for one product, 24 for another). No hardcoding.
- **Warehouses & sales reps as stock locations** — always know what stock each rep holds.
- **Cash & credit sales** with discounts, partial payments and a full debt dashboard
  (outstanding, overdue, days overdue, collections, per-rep performance).
- **Stock transfers** (warehouse↔rep, warehouse↔warehouse) and **returns** (customer & rep).
- **Stock counts** that reconcile physical vs. ledger and surface **missing stock**.
- **Intelligent reorder engine** — average daily sales, days of cover remaining, and
  recommended reorder quantities with urgency ranking.
- **Reports** — sales (daily/weekly/monthly/annual), product performance, regional,
  sales-rep, profit & loss, inventory valuation, movements, debts — exportable to **PDF & Excel**.
- **Dashboards** — a management dashboard and a personal sales-rep dashboard, with charts.
- **RBAC** — Admin, Warehouse Staff, Sales Representative — with JWT auth and refresh tokens.
- **Audit logs & notifications** for every important action and alert.

## Tech stack

**Frontend:** React + JavaScript, Vite, React Router, Tailwind CSS, Context API,
TanStack Query, Axios, React Hook Form + Zod, Recharts, React Hot Toast — fully responsive.

**Backend:** Node.js, Express, REST, Prisma ORM, JWT, bcrypt, Helmet, CORS, Morgan,
rate limiting, compression, centralized error handling, Zod request validation.

**Database:** PostgreSQL (Neon-ready) via Prisma (migrate + seed), with indexes,
constraints, foreign keys and cascading rules.

## Architecture

```
                 ┌────────────────────┐         ┌──────────────────────────┐
   Browser  ───► │  client (Vite/React)│  /api  ►│  server (Express + Prisma)│
                 └────────────────────┘         └────────────┬─────────────┘
                                                              │ Prisma
                                                     ┌────────▼─────────┐
                                                     │  PostgreSQL/Neon │
                                                     └──────────────────┘
```

**Why ledger-based?** A single `product.quantity -= n` loses history and invites theft and
errors. Here, `inventory.service.js` appends signed `InventoryTransaction` rows inside a DB
transaction and keeps `WarehouseStock` / `RepStock` as a *materialized cache* (rebuildable
from the ledger at any time via `POST /api/inventory/recompute-caches`). Reads derive the
truth from the ledger.

## Project structure

```
.
├─ docker-compose.yml        # Postgres + API + web
├─ server/                   # Express + Prisma API
│  ├─ prisma/
│  │  ├─ schema.prisma       # 25+ models, ledger-centric
│  │  └─ seed.js             # roles, CIVILLY/OHIS catalog, demo data
│  └─ src/
│     ├─ config/             # env, prisma client
│     ├─ middleware/         # auth, authorize, validate, errors
│     ├─ services/           # inventory ledger + all domain logic
│     ├─ controllers/        # thin HTTP handlers
│     ├─ routes/             # one router per module
│     ├─ validators/         # Zod schemas
│     ├─ utils/              # money, dates, numbering, tokens…
│     ├─ app.js / server.js
│     └─ Dockerfile
└─ client/                   # Vite + React SPA
   └─ src/
      ├─ components/         # ui primitives, layout, charts, item editor
      ├─ context/            # AuthContext
      ├─ lib/                # api client, hooks, formatting, constants
      ├─ pages/              # dashboard + every ERP module
      └─ Dockerfile + nginx.conf
```

## Quick start (Docker)

The fastest way to see the whole system running with a local Postgres:

```bash
docker compose up --build
```

- Web app: **http://localhost:8080**
- API: **http://localhost:4000/api** (health: `/api/health`)
- The API container applies the schema (`prisma db push`) and seeds reference + demo data
  on first boot (`SEED_ON_START=true`).

Log in with the [seed accounts](#seed-accounts).

## Local development

Prerequisites: Node 18.18+ and a PostgreSQL database (local or a Neon connection string).

**1) Backend**

```bash
cd server
cp .env.example .env            # set DATABASE_URL / DIRECT_URL (Neon or local)
npm install
npx prisma migrate dev --name init   # creates tables + the initial migration
npm run db:seed                 # roles, catalog, demo data
npm run dev                     # http://localhost:4000
```

> No local Postgres? Use Neon (free) — see below — and paste its connection strings into
> `server/.env`. Or run just the DB with `docker compose up db`.

**2) Frontend**

```bash
cd client
cp .env.example .env            # VITE_API_URL defaults to /api (proxied to :4000)
npm install
npm run dev                     # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:4000`, so no CORS setup is needed
in development.

## Deploying with Neon Postgres

1. Create a project at **https://console.neon.tech** and copy two connection strings:
   - **Pooled** connection → `DATABASE_URL` (used at runtime).
   - **Direct** connection → `DIRECT_URL` (used by Prisma Migrate).
2. Put them in `server/.env` (or your host's env vars), then:
   ```bash
   cd server
   npx prisma migrate deploy   # or: npx prisma migrate dev --name init  (first time)
   npm run db:seed
   ```
3. Deploy the API (Render/Railway/Fly/any Node host) with the same env vars and start
   command `npm start` (or use `server/Dockerfile`).
4. Build the frontend (`npm run build` in `client/`) and serve `client/dist` from any static
   host/CDN, with `VITE_API_URL` pointing at your API origin (e.g. `https://api.example.com/api`).
   Set `CLIENT_ORIGIN` on the API to the web origin for CORS.

## Seed accounts

| Role            | Email                         | Password       |
| --------------- | ----------------------------- | -------------- |
| Administrator   | `admin@haostock.co.tz`        | `Admin@12345`  |
| Warehouse Staff | `warehouse@haostock.co.tz`    | `Warehouse@123`|
| Sales Rep       | `juma@haostock.co.tz`         | `SalesRep@123` |
| Sales Rep       | `asha@haostock.co.tz`         | `SalesRep@123` |

The seed also creates the CIVILLY and OHIS rolling-paper catalog (with Pack/Box/Carton
packaging), opening warehouse stock, a van load for a rep, and sample cash & credit sales.

## Environment variables

See `server/.env.example` and `client/.env.example`. Key ones:

| Variable        | Where  | Purpose                                   |
| --------------- | ------ | ----------------------------------------- |
| `DATABASE_URL`  | server | Pooled Postgres/Neon connection (runtime) |
| `DIRECT_URL`    | server | Direct connection (Prisma Migrate)        |
| `JWT_SECRET`    | server | Access-token signing secret               |
| `CLIENT_ORIGIN` | server | Allowed CORS origin(s), comma-separated   |
| `VITE_API_URL`  | client | API base URL (default `/api`)             |

## API

Base URL: `/api`. Auth via `Authorization: Bearer <accessToken>`. Responses use a
`{ success, data, meta? }` envelope. Full reference in [`docs/API.md`](docs/API.md).

## Scripts

**server/**
- `npm run dev` — start with nodemon
- `npm start` — production start
- `npm run prisma:migrate` / `prisma:deploy` — migrations
- `npm run db:seed` — seed
- `npm run db:reset` — reset + migrate + seed

**client/**
- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — preview the build

---

© Hao Stock. Built for real-world wholesale distribution in Tanzania.
