# History View — Design Spec

**Date**: 2026-04-15
**Step**: v1 Step 15
**Status**: Approved

---

## Overview

Replace the `History.tsx` stub with a fully functional drone flight-path history page. The page lets the user pick a time range, fetches telemetry from the existing `/telemetry/history` API endpoint, and renders the path as a static GeoJSON line on a MapLibre map alongside a summary stats panel.

Animated replay (playback controls, marker moving along path) is explicitly out of scope for v1 — deferred to v6. See `docs/DECISIONS.md` for the ADR.

---

## Files Changed

```
apps/web/src/
  components/
    HistoryMap.tsx        # NEW — MapLibre map: LineString path + start/end markers
  pages/
    History.tsx           # REPLACE stub — page logic: time range state + useQuery + layout
```

No changes to existing files (`Map.tsx`, `DroneList.tsx`, `Dashboard.tsx`, `api.ts`, etc.).

---

## Architecture

### `History.tsx` — page component

Responsibilities:

- Read `droneId` from `useParams`
- Fetch drone name via `useQuery(['drones'])` (cached from Dashboard, staleTime 10 min) — falls back to drone ID in header if unavailable
- Own time range state
- Fetch history via `useQuery(['history', droneId, from, to])`
- Compute derived stats from points
- Render layout: header, time range controls, stats bar, `<HistoryMap>`

### `HistoryMap.tsx` — pure display component

Responsibilities:

- Accept `points: HistoryPoint[]` as props
- Own MapLibre map lifecycle (init, cleanup)
- Render flight path as a LineString + start/end circle markers
- Fit map bounds to path when points change
- No store, no WS, no queries

---

## Time Range Controls

### State shape

```ts
type Preset = '5m' | '15m' | '1h' | '24h' | 'custom';

const PRESETS: Record<Exclude<Preset, 'custom'>, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};
```

- Default preset: `'5m'`
- `from` / `to` for preset modes: computed via `useMemo([preset])` — captures timestamp once per preset change, not on every render (prevents query key drift)
- `from` / `to` for custom mode: set from `<input type="datetime-local">` values via `new Date(value).getTime()` (browsers parse as local time, result is UTC ms)
- Preset buttons: query re-runs immediately on selection
- Custom mode: shows two datetime-local inputs + a "Load" button; Load button is disabled when `from >= to`; inline validation message shown in that case

---

## `HistoryMap` Component

### MapLibre sources and layers (stable IDs)

| ID              | Type           | Purpose                            |
| --------------- | -------------- | ---------------------------------- |
| `history-path`  | GeoJSON source | LineString of all telemetry points |
| `history-line`  | line layer     | Blue path line                     |
| `history-start` | circle layer   | Green marker — first point         |
| `history-end`   | circle layer   | Red marker — last point            |

### Layer styles

- `history-line`: color `#3b82f6`, width 3px, `line-join: round`, `line-cap: round`
- `history-start`: color `#4ade80`, radius 7, white stroke 2px
- `history-end`: color `#ef4444`, radius 7, white stroke 2px

### `points` change effect (separate `useEffect` with `[points]` dep)

1. Guard: `const src = map.getSource('history-path'); if (!src || !('setData' in src)) return;`
2. If `points.length === 0`: call `setData` with empty FeatureCollection, hide/remove markers → return (no `fitBounds`)
3. If `points.length >= 1`: build LineString GeoJSON, call `setData`, update marker positions via `setLngLat()` (reuse existing marker refs, create on first non-empty render)
4. If `points.length >= 2`: `map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 15 })`

### Markers

Stored in `useRef<{ start: maplibregl.Marker | null; end: maplibregl.Marker | null }>`. On empty points or unmount: `marker.remove()`, set ref to `null`.

### Cleanup

`useEffect` cleanup calls `map.remove()` and removes both markers.

### Map default view

Center: `[30.52, 50.45]` (Kyiv), zoom 10 — overridden by `fitBounds` when points load.

---

## Derived Stats (computed in `History.tsx`)

All stats computed from `points: HistoryPoint[]` — never inside `HistoryMap`:

| Stat          | Formula                                                                 | Edge case                   |
| ------------- | ----------------------------------------------------------------------- | --------------------------- |
| Point count   | `points.length`                                                         | —                           |
| Time span     | `points[last].ts - points[0].ts` formatted as `Xm Ys`                   | `points.length < 2` → `'—'` |
| Battery delta | `points[0].battery_pct - points[last].battery_pct` formatted as `−X.X%` | `points.length < 2` → `'—'` |

---

## Loading & Error States

| State                           | UI                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| Drone name loading              | Show drone ID as fallback in header                                                   |
| History query loading           | Spinner + "Loading…" in map area; stats bar hidden                                    |
| History query error             | Error message + Retry button (`refetch`)                                              |
| Empty result (200 but 0 points) | "No telemetry found for this time range"; `HistoryMap` receives `[]`, shows blank map |
| `from >= to` (custom mode)      | Load button disabled; inline validation message                                       |
| Drone list error                | Non-blocking; falls back to drone ID in header                                        |

---

## Navigation

- Header: `← Back to Dashboard` using `<Link to="/">` from react-router-dom
- Entry point: "View history →" link in Dashboard popup already navigates to `/drones/:id/history`

---

## Testing

### `HistoryMap.test.tsx`

Mock `maplibre-gl` (same pattern as `Map.test.tsx`). Assert:

- Source `setData` called with empty FeatureCollection when `points=[]`
- `fitBounds` NOT called when `points=[]`
- `fitBounds` called with correct bounds when `points` has ≥2 entries
- `map.remove()` called on unmount

### `History.test.tsx`

Mock `api.telemetry.history`. Assert:

- Preset buttons render and update query params
- Custom range Load button is disabled when `from >= to`
- Stats show `'—'` for empty result
- Stats show correct values for a 2-point result
- Error state renders retry button
- "Back to Dashboard" link is present
