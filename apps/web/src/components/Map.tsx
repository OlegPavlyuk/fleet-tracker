import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StateSnapshot } from '@fleet-tracker/shared';
import type { DroneResponse } from '../lib/api.js';
import { api } from '../lib/api.js';
import { useDroneStore } from '../lib/droneStore.js';

const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

function toFeatureCollection(drones: Map<string, StateSnapshot>) {
  return {
    type: 'FeatureCollection' as const,
    features: [...drones.values()].map((d) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [d.lng, d.lat] },
      properties: {
        droneId: d.droneId,
        status: d.status,
        battery_pct: d.battery_pct,
        speed_mps: d.speed_mps,
        altitude_m: d.altitude_m,
        heading_deg: d.heading_deg,
      },
    })),
  };
}

function buildPopupHtml(drone: StateSnapshot, name: string): string {
  const statusColor =
    drone.status === 'active' ? '#4ade80' : drone.status === 'idle' ? '#facc15' : '#94a3b8';
  return `
    <div style="font-family:sans-serif;font-size:13px;min-width:160px">
      <div style="font-weight:700;margin-bottom:4px">${name}</div>
      <div style="color:${statusColor};margin-bottom:8px">● ${drone.status}</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#888;padding-right:8px">battery</td><td>${drone.battery_pct.toFixed(0)}%</td></tr>
        <tr><td style="color:#888;padding-right:8px">speed</td><td>${drone.speed_mps.toFixed(1)} m/s</td></tr>
        <tr><td style="color:#888;padding-right:8px">altitude</td><td>${drone.altitude_m.toFixed(0)} m</td></tr>
        <tr><td style="color:#888;padding-right:8px">heading</td><td>${drone.heading_deg.toFixed(0)}°</td></tr>
      </table>
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid #eee">
        <a href="/drones/${drone.droneId}/history"
           style="color:#3b82f6;text-decoration:none;font-size:12px">
          View history →
        </a>
      </div>
    </div>
  `;
}

// Named DroneMap internally so the component function doesn't shadow the
// built-in Map constructor (which we use in useMemo via the droneStore Map).
function DroneMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const isMapReadyRef = useRef(false);

  const drones = useDroneStore((s) => s.drones);
  const selectedId = useDroneStore((s) => s.selectedId);
  const selectDrone = useDroneStore((s) => s.selectDrone);

  const { data: droneList = [] } = useQuery<DroneResponse[]>({
    queryKey: ['drones'],
    queryFn: api.drones.list,
    staleTime: 10 * 60 * 1000,
  });

  const nameMap = useMemo(
    () => new Map<string, string>(droneList.map((d) => [d.id, d.name])),
    [droneList],
  );

  // ── Init map — runs exactly once ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [30.52, 50.45], // Kyiv default
      zoom: 10,
    });

    map.on('load', () => {
      map.addSource('drones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'drones',
        type: 'circle',
        source: 'drones',
        paint: {
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-color': [
            'match',
            ['get', 'status'],
            'active',
            '#4ade80',
            'idle',
            '#facc15',
            /* else */ '#94a3b8',
          ],
        },
      });

      // Click on a drone marker
      map.on('click', 'drones', (e) => {
        const feature = e.features?.[0];
        const droneId = feature?.properties?.droneId as string | undefined;
        if (droneId) selectDrone(droneId);
      });

      // Click on empty map area deselects
      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['drones'] });
        if (hits.length === 0) selectDrone(null);
      });

      map.on('mouseenter', 'drones', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'drones', () => {
        map.getCanvas().style.cursor = '';
      });

      isMapReadyRef.current = true;
    });

    map.on('error', (e) => {
      console.warn('[Map] MapLibre error', e);
    });

    mapRef.current = map;
    return () => {
      isMapReadyRef.current = false;
      map.remove();
    };
  }, []); // intentional empty deps: map init runs once on mount

  // ── Sync GeoJSON when drone state changes ───────────────────────────────────
  useEffect(() => {
    if (!isMapReadyRef.current || !mapRef.current) return;
    const src = mapRef.current.getSource('drones');
    if (src && 'setData' in src) {
      (src as maplibregl.GeoJSONSource).setData(toFeatureCollection(drones));
    }
  }, [drones]);

  // ── Create popup when a drone is selected ──────────────────────────────────
  useEffect(() => {
    popupRef.current?.remove();
    popupRef.current = null;

    if (!selectedId || !mapRef.current || !isMapReadyRef.current) return;

    const drone = drones.get(selectedId);
    if (!drone) {
      selectDrone(null);
      return;
    }

    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
      .setLngLat([drone.lng, drone.lat])
      .setHTML(buildPopupHtml(drone, nameMap.get(selectedId) ?? selectedId))
      .addTo(mapRef.current);

    popup.on('close', () => selectDrone(null));
    popupRef.current = popup;
  }, [selectedId, drones, nameMap, selectDrone]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

export { DroneMap as Map };
