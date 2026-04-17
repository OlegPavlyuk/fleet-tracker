# CI/CD Design — Fleet Tracker

**Date:** 2026-04-17  
**Status:** approved  
**Scope:** GitHub repository setup + GitHub Actions CI pipeline

---

## Context

The project is a pnpm monorepo (`apps/api`, `apps/web`, `apps/emulator`, `packages/shared`) with three test tiers:

- **Unit tests** — vitest, no external dependencies, env vars injected via `test-setup.ts`
- **Integration tests** — vitest + testcontainers (spins up real PostGIS), no browser
- **E2E tests** — Playwright smoke suite against the full running stack (PostGIS + API + web + Chromium)

These tiers must not overlap in responsibility. Unit tests never touch a real DB. Integration tests never touch a browser. E2E tests never unit-test individual functions.

---

## GitHub Repository

- **Visibility:** public (unlimited GitHub Actions minutes)
- **Default branch:** `main`
- **Branch protection on `main`:** require CI to pass before merge (configured after first push)
- **README badge:** added after first green run:
  ```markdown
  ![CI](https://github.com/<user>/fleet-tracker/actions/workflows/ci.yml/badge.svg)
  ```

---

## Pipeline Overview

Single workflow file: `.github/workflows/ci.yml`

| Job           | Trigger                              | Depends on                     |
| ------------- | ------------------------------------ | ------------------------------ |
| `check`       | every push                           | —                              |
| `unit`        | every push                           | —                              |
| `integration` | every push                           | —                              |
| `e2e`         | push to `main`, PR to `main`, manual | `check`, `unit`, `integration` |

No CD stage. Deployment is out of scope for this iteration.

---

## Triggers

```yaml
on:
  push:
  pull_request:
    branches: [main]
  workflow_dispatch:
```

`workflow_dispatch` enables manual E2E runs without a PR (useful for pipeline debugging).

---

## Shared Setup (all jobs)

Every job runs on `ubuntu-latest` and starts with:

```yaml
- uses: actions/checkout@v4
- uses: pnpm/action-setup@v4 # reads packageManager from root package.json
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: pnpm # hashes pnpm-lock.yaml automatically
- run: pnpm install --frozen-lockfile # deterministic; never auto-updates lockfile in CI
```

---

## Job: `check`

**Purpose:** static analysis — no runtime, no DB, no browser.

```yaml
steps:
  - <shared setup>
  - run: pnpm format:check
  - run: pnpm lint
  - run: pnpm typecheck
```

---

## Job: `unit`

**Purpose:** fast in-process logic tests. No external services.

```yaml
steps:
  - <shared setup>
  - run: pnpm test
```

`test-setup.ts` injects minimum env vars (e.g. `JWT_SECRET`) at the vitest level — no GitHub secrets required for this job.

---

## Job: `integration`

**Purpose:** test DB interactions against a real PostGIS instance managed by testcontainers.

```yaml
env:
  JWT_SECRET: ${{ secrets.CI_JWT_SECRET }}

steps:
  - <shared setup>
  - run: pnpm test:integration
```

Docker is pre-installed on `ubuntu-latest`. Testcontainers pulls the PostGIS image, manages the container lifecycle, and tears it down after tests. No `docker-compose` step needed.

**Secret:** `CI_JWT_SECRET` — a CI-only random string, stored as a GitHub Actions repository secret. It has no relation to any production value.

---

## Job: `e2e`

**Purpose:** smoke-test 2–4 critical user flows against the full running stack.

### Condition

```yaml
if: |
  github.ref == 'refs/heads/main' ||
  (github.event_name == 'pull_request' && github.event.pull_request.base.ref == 'main') ||
  github.event_name == 'workflow_dispatch'
needs: [check, unit, integration]
```

The `event_name == 'pull_request'` guard prevents a null access on `pull_request.base.ref` for non-PR events.

### Environment

```yaml
env:
  JWT_SECRET: ${{ secrets.CI_JWT_SECRET }}
  DATABASE_URL: postgres://postgres:postgres@localhost:5432/fleet
  VITE_API_URL: http://localhost:3000
```

### Steps

```yaml
steps:
  - <shared setup>

  # 1. Start PostGIS
  - run: docker-compose up -d
  - run: pnpm --filter api db:migrate

  # 2. Build and start API (background)
  - run: pnpm --filter api build
  - run: node apps/api/dist/index.js &
    env:
      PORT: 3000

  # 3. Build and serve web (background)
  - run: pnpm --filter web build
  - run: npx vite preview --port 5173 &
    working-directory: apps/web

  # 4. Wait for services to be healthy
  - run: npx wait-on http://localhost:3000/health http://localhost:5173 --timeout 30000

  # 5. Install Playwright (Chromium only — fast, sufficient for smoke)
  - run: npx playwright install --with-deps chromium

  # 6. Run E2E suite
  - run: pnpm test:e2e

  # 7. Upload report (best-effort — may not exist if failure occurs before Playwright starts)
  - uses: actions/upload-artifact@v4
    if: failure()
    with:
      name: playwright-report
      path: apps/web/playwright-report/ # Playwright default; matches playwright.config.ts location
      retention-days: 7

  # 8. Cleanup (always runs, including on failure)
  - name: Teardown
    if: always()
    run: docker-compose down -v # -v removes volumes; safe because CI is stateless
```

### Background process notes

API and web servers are started with `&` (shell background). This is a simple, zero-dependency approach suitable for CI. If process management becomes unreliable (port conflicts, zombie processes), it can be replaced with a dedicated tool such as `concurrently` or `npx serve`. The `if: always()` teardown and `docker-compose down -v` handle cleanup regardless of exit code.

---

## Secrets

| Secret          | Used by              | Purpose                                    |
| --------------- | -------------------- | ------------------------------------------ |
| `CI_JWT_SECRET` | `integration`, `e2e` | Satisfies `config.ts` fail-fast validation |

No production secrets are required. `DATABASE_URL` for E2E points to the ephemeral docker-compose PostGIS instance.

---

## E2E Smoke Flows (to be implemented)

Intentionally minimal. Target 2–4 critical paths:

1. Register → login → land on dashboard (auth flow)
2. Dashboard loads map and drone list (WebSocket connects)
3. Navigate to history view, select a drone, load a time range
4. (Optional) Logout and verify redirect to login

Playwright config already sets `baseURL` from `WEB_BASE_URL` env var (defaults to `http://localhost:5173`) and uses a 30s test timeout. Chromium only.

---

## Out of Scope

- CD / deployment
- Coverage reporting
- Multi-browser Playwright matrix
- Dependabot / Renovate
- Release workflow

These can be added in later iterations.
