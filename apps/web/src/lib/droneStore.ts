import { create } from 'zustand';
import type { StateSnapshot } from '@fleet-tracker/shared';

interface DroneState {
  drones: Map<string, StateSnapshot>;
  selectedId: string | null;
  setSnapshot: (arr: StateSnapshot[]) => void;
  updateDrone: (snap: StateSnapshot) => void;
  selectDrone: (id: string | null) => void;
}

export const useDroneStore = create<DroneState>()((set) => ({
  drones: new Map(),
  selectedId: null,

  setSnapshot: (arr) => set({ drones: new Map(arr.map((s) => [s.droneId, s])) }),

  updateDrone: (snap) =>
    set((state) => {
      const drones = new Map(state.drones);
      drones.set(snap.droneId, snap);
      return { drones };
    }),

  selectDrone: (id) => set({ selectedId: id }),
}));

// Expose store for e2e tests in dev mode only
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)['__droneStore'] = useDroneStore;
}
