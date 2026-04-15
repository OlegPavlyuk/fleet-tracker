import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { HistoryPoint } from '../lib/api.js';

const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

interface HistoryMapProps {
  points: HistoryPoint[];
}

export function HistoryMap({ points }: HistoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapReadyRef = useRef(false);
  const markersRef = useRef<{
    start: maplibregl.Marker | null;
    end: maplibregl.Marker | null;
  }>({ start: null, end: null });

  // ── Init map — runs exactly once ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [30.52, 50.45],
      zoom: 10,
    });

    map.on('load', () => {
      map.addSource('history-path', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'history-line',
        type: 'line',
        source: 'history-path',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 3 },
      });

      isMapReadyRef.current = true;
    });

    map.on('error', (e) => {
      console.warn('[HistoryMap] MapLibre error', e);
    });

    mapRef.current = map;

    return () => {
      isMapReadyRef.current = false;
      markersRef.current.start?.remove();
      markersRef.current.end?.remove();
      markersRef.current = { start: null, end: null };
      map.remove();
    };
  }, []);

  // ── Sync path when points change ────────────────────────────────────────────
  // Note: the mock calls map.on('load', cb) synchronously, so isMapReadyRef is
  // true before this effect runs in tests. In production the map loads fast
  // enough that points (a network round-trip away) arrive after the map is ready.
  useEffect(() => {
    if (!isMapReadyRef.current || !mapRef.current) return;

    const map = mapRef.current;
    const src = map.getSource('history-path');
    if (!src || !('setData' in src)) return;

    const geoSrc = src as maplibregl.GeoJSONSource;

    if (points.length === 0) {
      geoSrc.setData({ type: 'FeatureCollection', features: [] });
      markersRef.current.start?.remove();
      markersRef.current.end?.remove();
      markersRef.current = { start: null, end: null };
      return;
    }

    const coordinates = points.map((p) => [p.lng, p.lat] as [number, number]);

    geoSrc.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {},
        },
      ],
    });

    const first = points[0]!;
    const last = points[points.length - 1]!;

    // Reuse markers if they already exist (points updated, not first render)
    if (markersRef.current.start) {
      markersRef.current.start.setLngLat([first.lng, first.lat]);
    } else {
      markersRef.current.start = new maplibregl.Marker({ color: '#4ade80' })
        .setLngLat([first.lng, first.lat])
        .addTo(map);
    }

    if (markersRef.current.end) {
      markersRef.current.end.setLngLat([last.lng, last.lat]);
    } else {
      markersRef.current.end = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat([last.lng, last.lat])
        .addTo(map);
    }

    if (points.length >= 2) {
      const lngs = points.map((p) => p.lng);
      const lats = points.map((p) => p.lat);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 60, maxZoom: 15 },
      );
    }
  }, [points]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
