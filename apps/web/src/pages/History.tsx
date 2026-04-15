import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DroneResponse, HistoryPoint } from '../lib/api.js';
import { api } from '../lib/api.js';
import { HistoryMap } from '../components/HistoryMap.js';

// ── Time range ──────────────────────────────────────────────────────────────

type Preset = '5m' | '15m' | '1h' | '24h' | 'custom';

const PRESETS: Record<Exclude<Preset, 'custom'>, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
}

// ── Page component ──────────────────────────────────────────────────────────

export function History() {
  const { id: droneId = '' } = useParams<{ id: string }>();

  const [preset, setPreset] = useState<Preset>('5m');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customRange, setCustomRange] = useState<{ from: number; to: number } | null>(null);

  // Capture timestamp once per preset change — prevents query key drift on re-renders
  const presetRange = useMemo(() => {
    if (preset === 'custom') return null;
    const to = Date.now();
    return { from: to - PRESETS[preset], to };
  }, [preset]);

  const from = preset !== 'custom' ? (presetRange?.from ?? 0) : (customRange?.from ?? 0);
  const to = preset !== 'custom' ? (presetRange?.to ?? 0) : (customRange?.to ?? 0);
  const isValidRange = from > 0 && to > 0 && from < to;

  // Custom range validation (before clicking Load)
  const customFromMs = customFrom ? new Date(customFrom).getTime() : 0;
  const customToMs = customTo ? new Date(customTo).getTime() : 0;
  const isCustomValid = customFromMs > 0 && customToMs > 0 && customFromMs < customToMs;

  // Drone name lookup (cached from Dashboard — staleTime 10 min)
  const { data: droneList = [] } = useQuery<DroneResponse[]>({
    queryKey: ['drones'],
    queryFn: api.drones.list,
    staleTime: 10 * 60 * 1000,
  });
  const droneName = droneList.find((d) => d.id === droneId)?.name ?? droneId;

  // History fetch — only runs when range is valid
  const {
    data: points = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<HistoryPoint[]>({
    queryKey: ['history', droneId, from, to],
    queryFn: () => api.telemetry.history({ drone_id: droneId, from, to }),
    enabled: isValidRange,
  });

  // Derived stats — computed from points, not inside HistoryMap
  const stats = useMemo(() => {
    if (points.length < 1) return null;
    return {
      count: points.length,
      timeSpan:
        points.length >= 2 ? formatDuration(points[points.length - 1]!.ts - points[0]!.ts) : '—',
      batteryDelta:
        points.length >= 2
          ? `-${(points[0]!.battery_pct - points[points.length - 1]!.battery_pct).toFixed(1)}%`
          : '—',
    };
  }, [points]);

  function handleLoadCustom() {
    if (!isCustomValid) return;
    setCustomRange({ from: customFromMs, to: customToMs });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #ccc',
        }}
      >
        <Link to="/">← Back to Dashboard</Link>
        <span style={{ fontWeight: 700 }}>{droneName}</span>
        <span style={{ color: '#888' }}>Flight History</span>
      </header>

      {/* Time range controls */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #eee',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {(['5m', '15m', '1h', '24h'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            style={{ fontWeight: preset === p ? 700 : 400 }}
          >
            Last {p}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          style={{ fontWeight: preset === 'custom' ? 700 : 400 }}
        >
          Custom
        </button>

        {preset === 'custom' && (
          <>
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label="From"
            />
            <input
              type="datetime-local"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label="To"
            />
            <button onClick={handleLoadCustom} disabled={!isCustomValid}>
              Load
            </button>
            {customFrom && customTo && !isCustomValid && (
              <span style={{ color: '#ef4444', fontSize: 12 }}>"From" must be before "To"</span>
            )}
          </>
        )}
      </div>

      {/* Stats bar — only when we have at least 1 point */}
      {stats && (
        <div
          style={{
            display: 'flex',
            gap: '2rem',
            padding: '0.5rem 1rem',
            background: '#f9f9f9',
            borderBottom: '1px solid #eee',
            fontSize: 13,
          }}
        >
          <span>
            <b>{stats.count} points</b>
          </span>
          <span>
            Duration: <b>{stats.timeSpan}</b>
          </span>
          <span>
            Battery used: <b>{stats.batteryDelta}</b>
          </span>
        </div>
      )}

      {/* Map area */}
      <main style={{ flex: 1, position: 'relative' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.8)',
              zIndex: 10,
            }}
          >
            Loading…
          </div>
        )}
        {isError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <p>Failed to load history.</p>
            <button onClick={() => void refetch()}>Retry</button>
          </div>
        )}
        {!isLoading && !isError && points.length === 0 && isValidRange && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            No telemetry found for this time range.
          </div>
        )}
        <HistoryMap points={points} />
      </main>
    </div>
  );
}
