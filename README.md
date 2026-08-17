# ERP Platform

A modular-monolith ERP platform. Export Order Management is the first business module (not yet implemented — this repository currently contains only the platform foundation). See [`CLAUDE.md`](CLAUDE.md) for engineering principles and [`docs/`](docs/) for architecture and module design docs.

**Stack:** React + TypeScript + Ant Design · Django + Django REST Framework · PostgreSQL · Docker Compose.

## Prerequisites

- Docker and Docker Compose (this is the only supported way to run the stack locally — no local Node/Python install required).

## Quick start

```bash
cd docker
docker compose up --build
```

This starts three services:

| Service | URL | Notes |
|---|---|---|
| Frontend | http://localhost:5173 | Vite dev server, hot reload |
| Backend | http://localhost:8000/api/v1/health/ | Django dev server, auto-migrates on start |
| Backend admin | http://localhost:8000/admin/ | Django admin (create a superuser first, see below) |
| Postgres | localhost:5432 | For local `psql`/GUI client access |

Everything works with zero configuration — every environment variable has a sensible dev default baked into `docker/docker-compose.yml`.

The frontend requires a login (session-based). Create an admin user (once the stack is up), then sign in at http://localhost:5173:

```bash
docker compose -f docker/docker-compose.yml exec backend python manage.py createsuperuser
```

A freshly created superuser has no role or employee profile yet — the app will show them as signed in with no role badge. Assign them to the `Manager/Admin` group and (optionally) link an `Employee` record via http://localhost:8000/admin/.

Stop the stack with `Ctrl+C`, or `docker compose down` (add `-v` to also drop the Postgres volume).

## Environment configuration

All configurable variables are documented in [`.env.example`](.env.example) at the repo root. The stack runs correctly with none of them set. To override a value, copy it to `docker/.env` (Compose auto-loads a `.env` file next to the compose file) — for example, to set a real `DJANGO_SECRET_KEY` or point the frontend at a different API URL.

## Running tests

```bash
# Backend (pytest)
docker compose -f docker/docker-compose.yml run --rm backend pytest

# Frontend (vitest)
docker compose -f docker/docker-compose.yml run --rm frontend npm test
```

## Linting & type checking

```bash
# Backend — ruff (lint) and mypy (types)
docker compose -f docker/docker-compose.yml run --rm backend ruff check .
docker compose -f docker/docker-compose.yml run --rm backend mypy .

# Frontend — oxlint (lint) and tsc (types)
docker compose -f docker/docker-compose.yml run --rm frontend npm run lint
docker compose -f docker/docker-compose.yml run --rm frontend npm run type-check
```

## Repository structure

```
backend/            Django project (config/ settings, apps/core, apps/accounts)
frontend/            React + TypeScript + Ant Design app (src/app, src/shared)
docker/               docker-compose.yml + Dockerfiles for local dev
docs/                  architecture decisions and module specs
CLAUDE.md              engineering & product principles for this repo
.env.example           reference list of configurable environment variables
```

Two backend apps exist today, both reusable platform apps, not business modules:

- `core` — health check, `BaseModel` (audit fields every model gets), `Organization` (single row, org-awareness without multi-tenancy).
- `accounts` — custom `User` (`AUTH_USER_MODEL` from the first migration so it never needs to change later), `Team`, `Employee`, session-based auth (`/api/v1/auth/{csrf,login,logout,me}/`), and the 7 seeded roles (Django Groups: Export/Production/Procurement/Packing/Logistics Coordinator, Manager/Admin, Customer). Role checks anywhere in the API reuse `apps.accounts.permissions.HasAnyRole(...)` — see `docs/modules/export-orders/business-rules.md` for how this is meant to be used.

No React screens exist for managing Organizations/Teams/Employees/Roles — that's Django admin's job in V1, deliberately, to keep the UI simple.

Business modules, and the rest of the reusable platform apps described in `docs/architecture/` (customers, products, vendors, attachments, comments, audit, notifications), are added as the work that needs them starts — not ahead of time, per `CLAUDE.md`.

## What's deliberately not here yet

No Redis, Celery, Kubernetes, microservices, message queues, or cloud-specific infrastructure — none of it is needed to run this foundation, and `CLAUDE.md` asks that infrastructure not be added ahead of a demonstrated requirement. No business modules yet, and no `CustomerContact`/customer-portal login (that needs the Customer master, a separate future app) — see `docs/modules/export-orders/` for that design work, not yet implemented.
