# Fleet Tracker — Project Memory

> **Read this file at the start of every session.** It defines the project, conventions, and workflow.

## What this is

Pet-проєкт: real-time платформа для трекінгу парку дронів. Backend на Node.js приймає телеметрію через WebSocket від емулятора, тримає актуальний стан в пам'яті, розсилає підписникам через WS, зберігає історію в PostGIS. Web dashboard на React показує живу мапу + history view.

Мета — прокачка скілів під вакансію real-time geospatial backend. Інкрементально нарощуємо складність по итераціях (v1 → v7).

**Активна итерація**: див. `docs/PROGRESS.md`
**Повний план**: `~/.claude/plans/valiant-greeting-rabbit.md`

## Tech stack

- **Runtime**: Node.js 20+, TypeScript 5+
- **Backend**: Express, `ws`, Drizzle ORM, PostgreSQL 16 + PostGIS 3.4, pino, zod, jose (JWT), argon2
- **Frontend**: Vite, React 18, TanStack Query, Zustand, MapLibre GL JS, react-router
- **Tests**: vitest, supertest, testcontainers, Playwright
- **Tooling**: pnpm workspaces, ESLint, Prettier, Husky, lint-staged, commitlint

## Repo layout

```
apps/api          # Express + ws backend (single process v1)
apps/web          # React dashboard
apps/emulator     # Drone simulator CLI
packages/shared   # zod schemas + TS types + constants
docs/             # PROGRESS.md, DECISIONS.md, specs/
```

## Commands

```bash
pnpm install              # install all workspaces
pnpm dev                  # start all dev servers
pnpm --filter api dev     # dev a specific app
pnpm test                 # run all tests
pnpm typecheck            # tsc --noEmit across workspaces
pnpm lint                 # eslint
pnpm format               # prettier --write
pnpm build                # build all apps

docker-compose up -d                   # start postgres+postgis
pnpm --filter api db:generate          # drizzle-kit generate
pnpm --filter api db:migrate           # apply migrations
```

## Code conventions

- **TypeScript strict mode** everywhere (`strict: true`, `noUncheckedIndexedAccess: true`)
- **No `any`** unless commented why. Prefer `unknown` + narrowing
- **Imports**: external → internal absolute → internal relative. Type-only imports use `import type`
- **File naming**: `kebab-case.ts` for files, `PascalCase.tsx` for React components
- **Module structure**: each backend module has `index.ts` exporting public API; internals stay private
- **Tests**: colocated `*.test.ts` next to source, integration tests in `__tests__/` subfolders
- **Errors**: typed domain error classes, never throw plain `Error` from business logic
- **Logging**: `pino` only, never `console.log` in src (only in CLI tools)
- **Config**: load + validate via zod schema in `config.ts`, fail-fast on bad env

## Workflow rules

### Per-session

1. **Start of session**: read `docs/PROGRESS.md`, run `git status` and `git log -5`, then ask user what to do
2. **End of session**: update `docs/PROGRESS.md`, commit work, summarize what was done

### Implementation

1. **TDD by default**: write failing test → make it pass → refactor. Skip only when user explicitly says
2. **Plan before coding** if change is non-trivial (>100 lines or multiple files): show short plan via TodoWrite, get nod, then code
3. **Stay in scope**: if you find a bug or improvement opportunity outside current task, note it in `docs/PROGRESS.md` open questions, **do not fix silently**
4. **No premature abstraction**: three similar lines is not a pattern; wait for the third real use case
5. **Use `superpowers:*` skills proactively** when applicable (TDD, debugging, plan execution, code review)

### Before commit

1. `pnpm typecheck` — must pass
2. `pnpm test` — must pass (or document why a test is intentionally skipped in `docs/DECISIONS.md`)
3. `pnpm lint` — must pass (warnings OK, errors not)
4. Show diff to user, propose commit message, ask for go-ahead

### Commits

- **Conventional Commits** — enforced by commitlint
- Format: `type(scope): subject` (lowercase subject, no period, ≤72 chars)
- Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `style`, `perf`, `ci`, `build`
- Scope examples: `api`, `web`, `emulator`, `shared`, `db`, `auth`, `ingest`, `realtime`, `state`, `persist`, `deps`
- Body: explain _why_, not _what_. Reference iteration step where useful
- One commit = one logical change. No "WIP", no dump commits
- Never `--amend` published commits. Never `--no-verify`. Never `git push --force` without explicit approval

### Branches

- `main` — always green
- `feat/<iter>-<short>` for features (e.g. `feat/v1-ingest`)
- `fix/<short>` for fixes
- One branch per logical chunk; merge via PR (squash or rebase, depending on history quality)

### Git safety

- Never run destructive ops (`reset --hard`, `branch -D`, `clean -f`) without explicit user OK
- Always `git status` before stage operations
- Stage explicit files, avoid blanket `git add -A`

## When stuck

- If unclear what to do — ask, don't guess
- If you find conflicting info — flag it, propose options
- If a tool is missing or external action needed — say so explicitly, list what user must do

## Model strategy

- **Sonnet 4.6** — default for implementation, refactoring, tests
- **Opus 4.6** — design decisions, complex debugging, code review at iteration boundaries
- **Haiku 4.5** — trivial edits, formatting, repetitive renames
- User switches via `/model`. Suggest a switch when the task type changes

## References

- `docs/PROGRESS.md` — current state, what's done, what's next
- `docs/DECISIONS.md` — non-obvious decisions with rationale
- `~/.claude/plans/valiant-greeting-rabbit.md` — full v1 implementation plan
- `docs/superpowers/specs/` — design specs for future iterations
