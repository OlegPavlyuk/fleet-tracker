import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { HistoryPoint } from '../lib/api';
import type { DroneResponse } from '../lib/api';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'drone-abc' }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

// Mock HistoryMap to avoid maplibre-gl dependency in History tests
vi.mock('../components/HistoryMap', () => ({
  HistoryMap: ({ points }: { points: HistoryPoint[] }) => (
    <div data-testid="history-map" data-point-count={points.length} />
  ),
}));

const { mockRefetch, mockUseQuery } = vi.hoisted(() => ({
  mockRefetch: vi.fn(),
  mockUseQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mockUseQuery,
}));

import { History } from '../pages/History';

// Default: empty history, empty drone list — no loading, no error
function defaultQuery({ queryKey }: { queryKey: unknown[] }) {
  if (Array.isArray(queryKey) && queryKey[0] === 'history') {
    return {
      data: [] as HistoryPoint[],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
  }
  return { data: [] as DroneResponse[] };
}

// ── Time range controls ─────────────────────────────────────────────────────

describe('History — navigation and preset controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockImplementation(defaultQuery);
  });
  afterEach(() => {
    cleanup();
  });

  it('renders a Back to Dashboard link pointing to /', () => {
    render(<History />);
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('renders all preset buttons', () => {
    render(<History />);
    expect(screen.getByRole('button', { name: /last 5m/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /last 15m/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /last 1h/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /last 24h/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /custom/i })).toBeTruthy();
  });

  it('does not show datetime inputs in default (preset) mode', () => {
    render(<History />);
    expect(screen.queryByLabelText('From')).toBeNull();
    expect(screen.queryByLabelText('To')).toBeNull();
  });

  it('shows datetime inputs and Load button when Custom is selected', async () => {
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /custom/i }));
    expect(screen.getByLabelText('From')).toBeTruthy();
    expect(screen.getByLabelText('To')).toBeTruthy();
    expect(screen.getByRole('button', { name: /load/i })).toBeTruthy();
  });

  it('Load button is disabled when custom inputs are empty', async () => {
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /custom/i }));
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /load/i });
    expect(btn.disabled).toBe(true);
  });

  it('Load button is disabled when from >= to', async () => {
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /custom/i }));
    // from is later than to → invalid
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-04-15T12:00' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-04-15T10:00' },
    });
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /load/i });
    expect(btn.disabled).toBe(true);
  });

  it('Load button is enabled when from < to', async () => {
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /custom/i }));
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-04-15T10:00' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-04-15T12:00' },
    });
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /load/i });
    expect(btn.disabled).toBe(false);
  });
});

// ── Loading / error / empty states ──────────────────────────────────────────

describe('History — loading, error, empty, and stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('shows loading indicator when history query is in flight', () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: [], isLoading: true, isError: false, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('shows error message and Retry button when history query fails', () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: [], isLoading: false, isError: true, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    expect(screen.getByText(/failed to load history/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('calls refetch when Retry is clicked', async () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: [], isLoading: false, isError: true, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it('shows "no telemetry found" message when 0 points returned with a valid range', () => {
    mockUseQuery.mockImplementation(defaultQuery);
    render(<History />);
    // Default preset '5m' is a valid range, and query returns []
    expect(screen.getByText(/no telemetry found/i)).toBeTruthy();
  });

  it('does not render stats bar when 0 points', () => {
    mockUseQuery.mockImplementation(defaultQuery);
    render(<History />);
    expect(screen.queryByText(/points/)).toBeNull();
  });

  it('shows point count with — for duration and battery when only 1 point', () => {
    const onePoint: HistoryPoint[] = [
      {
        ts: 1000,
        lat: 50.4,
        lng: 30.5,
        altitude_m: 100,
        heading_deg: 45,
        speed_mps: 10,
        battery_pct: 80,
      },
    ];
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: onePoint, isLoading: false, isError: false, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    expect(screen.getByText(/1.*points/i)).toBeTruthy();
    // Both duration and battery delta should show — for single-point dataset
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows correct stats for a 2-point result', () => {
    // 65 000 ms apart = 1m 5s; battery drop 80 → 78 = -2.0%
    const twoPoints: HistoryPoint[] = [
      {
        ts: 0,
        lat: 50.4,
        lng: 30.5,
        altitude_m: 100,
        heading_deg: 45,
        speed_mps: 10,
        battery_pct: 80,
      },
      {
        ts: 65000,
        lat: 50.5,
        lng: 30.6,
        altitude_m: 110,
        heading_deg: 90,
        speed_mps: 12,
        battery_pct: 78,
      },
    ];
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: twoPoints, isLoading: false, isError: false, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    expect(screen.getByText(/2.*points/i)).toBeTruthy();
    expect(screen.getByText('1m 5s')).toBeTruthy();
    expect(screen.getByText('-2.0%')).toBeTruthy();
  });

  it('shows drone name from the drone list when available', () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: [], isLoading: false, isError: false, refetch: mockRefetch };
      }
      return {
        data: [
          {
            id: 'drone-abc',
            name: 'Alpha',
            ownerId: 'u1',
            model: 'X1',
            status: 'active',
            createdAt: '',
          } satisfies DroneResponse,
        ],
      };
    });
    render(<History />);
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('falls back to drone ID when drone list is empty', () => {
    mockUseQuery.mockImplementation(defaultQuery);
    render(<History />);
    expect(screen.getByText('drone-abc')).toBeTruthy();
  });

  it('renders HistoryMap with the correct point count', () => {
    const twoPoints: HistoryPoint[] = [
      {
        ts: 0,
        lat: 50.4,
        lng: 30.5,
        altitude_m: 100,
        heading_deg: 45,
        speed_mps: 10,
        battery_pct: 80,
      },
      {
        ts: 1000,
        lat: 50.5,
        lng: 30.6,
        altitude_m: 110,
        heading_deg: 90,
        speed_mps: 12,
        battery_pct: 79,
      },
    ];
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: twoPoints, isLoading: false, isError: false, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    const map = screen.getByTestId('history-map');
    expect(map.getAttribute('data-point-count')).toBe('2');
  });
});
