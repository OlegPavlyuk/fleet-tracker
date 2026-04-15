# Step 14 — Dashboard Map Design

**Date**: 2026-04-15  
**Scope**: v1 Step 14 — MapLibre GL JS integration, WebSocket subscription, drone markers, popup

---

## Decisions

| Topic            | Decision                                          | Rationale                                                                            |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tile provider    | OpenFreeMap via `VITE_MAP_STYLE_URL` env var      | Zero signup, no API key; env var allows provider swap without code change            |
| Marker rendering | GeoJSON source + `circle` layer                   | Single GPU draw call; scales to 50+ drones at 1 Hz; production-like pattern          |
| Drone state      | Zustand `useDroneStore`                           | Consistent with existing `useAuthStore`; no prop drilling; shared by Map + DroneList |
| WS architecture  | `FleetWSClient` class + `useFleetWS` hook adapter | Class is pure TS — testable without React; hook is thin adapter (~20 lines)          |
| Popup style      | Floating MapLibre popup near marker               | Spatial context preserved; doesn't cover map; standard map UX pattern                |

---

## Files

### New

- `apps/web/src/lib/ws.ts` — `FleetWSClient` class (replaces empty stub)
- `apps/web/src/lib/useFleetWS.ts` — React hook adapter
- `apps/web/src/lib/droneStore.ts` — Zustand drone store

### Modified

- `apps/web/src/components/Map.tsx` — full MapLibre implementation (replaces stub)
- `apps/web/src/components/DroneList.tsx` — full sidebar implementation (replaces stub)
- `apps/web/src/pages/Dashboard.tsx` — mounts `useFleetWS`
- `apps/web/.env.example` — adds `VITE_MAP_STYLE_URL`
- `apps/web/package.json` — adds `maplibre-gl`

### Deleted

- `apps/web/src/components/DroneMarker.tsx` — dead code; GeoJSON layer replaces HTML markers

---

## Architecture

```
WS server (/ws/stream)
  │
  │  snapshot { type:'snapshot', payload: StateSnapshot[] }
  │  update   { type:'update',   payload: StateSnapshot   }
  ▼
FleetWSClient (apps/web/src/lib/ws.ts)
  • plain TS class — no React dependency
  • constructor(url, { onSnapshot, onUpdate, onError? })
  • parses JSON → validates shape → dispatches callbacks
  • close(): shuts socket, prevents further callbacks
  │
  ▼
useFleetWS (apps/web/src/lib/useFleetWS.ts)
  • useEffect: creates FleetWSClient on mount, closes on unmount
  • dep: [token] — token change triggers reconnect with clean client
  • wires onSnapshot → store.setSnapshot
  •       onUpdate   → store.updateDrone
  │
  ▼
useDroneStore (apps/web/src/lib/droneStore.ts)
  • drones:     Map<droneId, StateSnapshot>
  • selectedId: string | null
  • setSnapshot(arr)   — full replace (new Map from scratch)
  • updateDrone(snap)  — copy Map + set one key
  • selectDrone(id)    — set selectedId
  │
  ├──▶ Map.tsx
  │      • mapRef: useRef<maplibregl.Map> — created once, never recreated
  │      • init effect (deps: []): addSource('drones') + addLayer + click handler
  │      • data effect (deps: [drones]): source.setData(toFeatureCollection(drones))
  │      • popup effect (deps: [selectedId]): show/remove maplibregl.Popup
  │      • circle-color MapLibre expression: active=#4ade80, idle=#facc15, else=#94a3b8
  │
  └──▶ DroneList.tsx
         • renders sorted list of drones from store
         • row click → selectDrone(id)
         • highlights selected row
         • shows: drone name (from TanStack Query cache) or droneId fallback, status dot, battery %
```

---

## Invariants (must hold)

1. **`setSnapshot` = full replace** — creates new `Map` from array; never merges with prior state
2. **`updateDrone` = single merge** — copies existing Map, sets one key by `droneId`; never touches other entries
3. **One MapLibre instance** — map created in a single `useEffect(fn, [])`, held in `useRef`; never recreated on re-renders
4. **One WS connection** — `useEffect` cleanup calls `client.close()` before any new client is created; `[token]` dep ensures reconnect is always clean
5. **`droneId` is the stable key** — all updates match snapshot entries by `droneId`; popup checks `drones.has(selectedId)` before rendering

---

## Popup content

Triggered by: clicking a drone marker on the map OR clicking a row in DroneList.  
Dismissed by: clicking the map outside a drone marker.

Fields shown:

- Drone name (from `GET /drones` list, joined by id)
- Status badge (active / idle / offline)
- Battery %
- Speed (m/s)
- Altitude (m)
- Heading (°)
- "View history →" link → `/drones/:id/history`

**Note on drone names**: `StateSnapshot` contains only `droneId` — no name. Drone names come from `GET /drones` (already in `api.ts`). Dashboard loads this list once via `useQuery(['drones'], api.drones.list)`. Both `DroneList` and the popup call the same `useQuery` hook — they hit the TanStack Query cache, not the network. No prop drilling needed. Fallback to `droneId` if the list hasn't loaded yet. Telemetry state lives in `useDroneStore`; static metadata (name, model) lives in the TanStack Query cache.

---

## Error handling

| Scenario                         | Handling                                                                   |
| -------------------------------- | -------------------------------------------------------------------------- |
| WS connect fails                 | `onError` callback → `console.warn` (v1; no UI toast)                      |
| WS closes unexpectedly           | `FleetWSClient` logs, calls `close()` cleanly; no auto-reconnect in v1     |
| Message fails JSON parse         | catch + `console.warn`, skip message — do not crash                        |
| Map style load error             | MapLibre `error` event → `console.warn`                                    |
| `selectedId` drone left snapshot | popup effect detects `!drones.has(selectedId)` → calls `selectDrone(null)` |

---

## Testing plan

| Unit            | Approach                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `FleetWSClient` | `vi.fn()` callbacks + mock WebSocket class; test snapshot dispatch, update dispatch, JSON parse error resilience, `close()` stops callbacks |
| `useDroneStore` | call actions directly; assert Map state after `setSnapshot` (full replace) and `updateDrone` (single key)                                   |
| `useFleetWS`    | `renderHook`; assert client created on mount, `close()` called on unmount, reconnects on token change                                       |
| `DroneList`     | render with populated store; assert row count, selected highlight, click → `selectDrone`                                                    |
| `Map.tsx`       | mock `maplibregl.Map`; assert `addSource`, `addLayer`, `setData` called in correct order                                                    |

---

## Out of scope for Step 14

- Auto-reconnect with backoff (add in a later step)
- History path replay on map (Step 15)
- Playwright E2E (Step 16)
- Drone name in popup via REST is a nice-to-have; fallback to droneId if list not loaded
