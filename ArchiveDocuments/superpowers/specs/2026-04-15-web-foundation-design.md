# apps/web Foundation — Design Spec (v1 Step 13)

**Date**: 2026-04-15
**Scope**: Vite + React scaffold, router, TanStack Query, Zustand auth store, full API client, Login/Register pages, Dashboard layout shell, History shell, unit tests.

---

## File Structure

```
apps/web/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx                  # mount, QueryClient, RouterProvider
│   ├── router.tsx                # createBrowserRouter — all routes
│   ├── lib/
│   │   ├── http.ts               # base fetch wrapper (Authorization header, ApiError)
│   │   ├── api.ts                # all endpoint functions (auth + drones + telemetry)
│   │   ├── auth.ts               # Zustand auth store (token + user, persisted)
│   │   └── ws.ts                 # empty shell (Step 14)
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── Dashboard.tsx         # layout shell: header + side panel + map placeholder
│   │   └── History.tsx           # stub placeholder (Step 15)
│   ├── components/
│   │   ├── AppLayout.tsx         # protected layout — checks auth, renders <Outlet />
│   │   ├── Map.tsx               # empty shell (Step 14)
│   │   ├── DroneList.tsx         # empty shell (Step 14)
│   │   └── DroneMarker.tsx       # empty shell (Step 14)
│   └── __tests__/
│       ├── api.test.ts
│       └── auth.test.ts
```

---

## Auth Store

`lib/auth.ts` — Zustand store with `persist` middleware (localStorage key: `fleet-auth`).

```ts
interface AuthState {
  token: string | null;
  user: { id: string; email: string } | null;
  login(token: string, user: { id: string; email: string }): void;
  logout(): void;
}
```

- Rehydrates automatically on app load — no manual `localStorage.getItem` anywhere.
- `AppLayout` reads `token` synchronously; if `null` → `<Navigate to="/login" replace />`.

---

## API Client

### `lib/http.ts`

Thin fetch wrapper:

- Reads `token` from Zustand store (outside React tree — safe to call anywhere).
- Sets `Authorization: Bearer <token>` when token is present.
- Throws `ApiError` (with `status: number` and `message: string`) on non-2xx responses.

### `lib/api.ts`

Plain async functions, typed against `@fleet-tracker/shared`:

```ts
// Auth
auth.register(email, password) → { id, email }
auth.login(email, password)    → { token, user: { id, email } }
auth.me()                      → { id, email }

// Drones
drones.list()                  → Drone[]
drones.get(id)                 → Drone
drones.create(name, model)     → { drone: Drone, deviceToken: string }
drones.update(id, patch)       → Drone
drones.delete(id)              → void

// Telemetry
telemetry.history(params)      → StateSnapshot[]
// params: { drone_id: string, from: number, to: number, bbox?: string }
```

No TanStack Query hooks in `api.ts` — hooks live in pages/components (Steps 14–15).

---

## Router

`router.tsx` using `createBrowserRouter`:

| Path                  | Component                 | Auth      |
| --------------------- | ------------------------- | --------- |
| `/login`              | `Login`                   | public    |
| `/register`           | `Register`                | public    |
| `/`                   | `AppLayout` → `Dashboard` | protected |
| `/drones/:id/history` | `AppLayout` → `History`   | protected |

`main.tsx` tree:

```tsx
<QueryClientProvider client={queryClient}>
  <RouterProvider router={router} />
</QueryClientProvider>
```

---

## Pages

### Login + Register

- Controlled inputs: email, password.
- On submit: call `api.auth.login` / `api.auth.register` → `useAuthStore().login(token, user)` → `navigate('/')`.
- Inline error message on `ApiError`.
- Cross-link: Login page links to `/register`, Register page links to `/login`.

### Dashboard (shell)

Layout structure (real content added in Step 14):

```
┌─────────────────────────────────┐
│ Header: "Fleet Tracker"  Logout │
├──────────┬──────────────────────┤
│ DroneList│                      │
│ (empty   │   <div id="map" />   │
│  shell)  │   (placeholder)      │
└──────────┴──────────────────────┘
```

Logout: `useAuthStore().logout()` + `navigate('/login')`.

### History (shell)

Single stub:

```tsx
<p>History — coming in Step 15</p>
```

Renders drone ID from `useParams().id`.

---

## Tests

### `api.test.ts`

- Uses `vi.stubGlobal('fetch', ...)` to mock fetch.
- Per endpoint: happy path (correct URL, method, headers, parsed response) + error path (`ApiError` thrown on 401/4xx).

### `auth.test.ts`

- Pure Zustand store tests, no DOM.
- `login()` sets token + user, persists to localStorage.
- `logout()` clears token + user, removes from localStorage.
- Store rehydrates from pre-seeded localStorage.

---

## Out of Scope for Step 13

- TanStack Query hooks (Step 14)
- MapLibre map rendering (Step 14)
- WS client implementation (Step 14)
- History replay UI (Step 15)
- Component/E2E tests (Step 16)
