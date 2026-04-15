import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '@fleet-tracker/shared';
import { useDroneStore } from '../lib/droneStore';

// Stub TanStack Query — always returns empty drone list (no REST needed)
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
}));

import { DroneList } from '../components/DroneList';

const s1: StateSnapshot = {
  droneId: 'd1',
  ts: 1,
  lat: 0,
  lng: 0,
  altitude_m: 0,
  heading_deg: 0,
  speed_mps: 0,
  battery_pct: 87,
  status: 'active',
};
const s2: StateSnapshot = {
  droneId: 'd2',
  ts: 2,
  lat: 0,
  lng: 0,
  altitude_m: 0,
  heading_deg: 0,
  speed_mps: 0,
  battery_pct: 18,
  status: 'idle',
};

describe('DroneList', () => {
  beforeEach(() => {
    useDroneStore.setState({ drones: new Map(), selectedId: null });
  });
  afterEach(() => {
    cleanup();
  });

  it('shows placeholder when no drones', () => {
    render(<DroneList />);
    expect(screen.getByText(/no drones online/i)).toBeTruthy();
  });

  it('renders a row for each drone', () => {
    useDroneStore.setState({
      drones: new Map([
        ['d1', s1],
        ['d2', s2],
      ]),
    });
    render(<DroneList />);
    // With no name map, falls back to droneId
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('d2')).toBeTruthy();
  });

  it('shows battery percentage', () => {
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    render(<DroneList />);
    expect(screen.getByText(/87%/)).toBeTruthy();
  });

  it('clicking a row calls selectDrone with that droneId', async () => {
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    render(<DroneList />);
    await userEvent.click(screen.getByText('d1'));
    expect(useDroneStore.getState().selectedId).toBe('d1');
  });
});
