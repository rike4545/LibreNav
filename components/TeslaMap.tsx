'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, LngLatLike, Map, Marker, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers } from 'lucide-react';
import { appEnv } from '@/lib/env';
import { ChargerSite, Coordinate, HazardReport, Incident, RouteManeuver, RouteResponse, UserPosition } from '@/types/map';

type Props = {
  center: Coordinate;
  origin: Coordinate | null;
  destination: Coordinate | null;
  route: RouteResponse | null;
  reports: HazardReport[];
  chargers: ChargerSite[];
  incidents: Incident[];
  activeAlternativeId: string | null;
  onCenterChange: (center: Coordinate) => void;
  userPosition: UserPosition | null;
  activeManeuver: RouteManeuver | null;
  navigationMode: boolean;
};

const ROUTE_SOURCE = 'route-source';
const ALTERNATIVE_SOURCE = 'alternative-source';
const REPORTS_SOURCE = 'reports-source';
const CHARGERS_SOURCE = 'chargers-source';
const INCIDENTS_SOURCE = 'incidents-source';

const SEVERITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#facc15'
};

const MAP_STYLES = [
  { label: 'Default', url: appEnv.mapStyleUrl },
  { label: 'Light', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
  { label: 'Dark', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' }
];

export function TeslaMap({
  center,
  origin,
  destination,
  route,
  reports,
  chargers,
  incidents,
  activeAlternativeId,
  onCenterChange,
  userPosition,
  activeManeuver,
  navigationMode
}: Props) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const originMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const dataRef = useRef({ route, reports, chargers, incidents, activeAlternativeId });
  const [styleIdx, setStyleIdx] = useState(0);

  dataRef.current = { route, reports, chargers, incidents, activeAlternativeId };

  function setupLayers(map: Map) {
    if (!map.getSource(ROUTE_SOURCE)) {
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data: emptyLine() });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: ROUTE_SOURCE,
        paint: { 'line-color': '#38bdf8', 'line-width': 7, 'line-opacity': 0.94 }
      });
    }

    if (!map.getSource(ALTERNATIVE_SOURCE)) {
      map.addSource(ALTERNATIVE_SOURCE, { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'alternative-lines',
        type: 'line',
        source: ALTERNATIVE_SOURCE,
        paint: { 'line-color': '#94a3b8', 'line-width': 4, 'line-opacity': 0.75 }
      });
    }

    if (!map.getSource(REPORTS_SOURCE)) {
      map.addSource(REPORTS_SOURCE, { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'reports-layer',
        type: 'circle',
        source: REPORTS_SOURCE,
        paint: {
          'circle-radius': 8,
          'circle-color': '#f97316',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });
      map.on('click', 'reports-layer', (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const props = feature.properties as { kind: string };
        new Popup({ closeButton: true, maxWidth: '220px' })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setHTML(`<div style="font-family:sans-serif;padding:2px"><strong>User report</strong><div style="color:#888;font-size:12px;margin-top:4px;text-transform:capitalize">${props.kind}</div></div>`)
          .addTo(map);
      });
      map.on('mouseenter', 'reports-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'reports-layer', () => { map.getCanvas().style.cursor = ''; });
    }

    if (!map.getSource(CHARGERS_SOURCE)) {
      map.addSource(CHARGERS_SOURCE, {
        type: 'geojson',
        data: emptyCollection(),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 45
      });

      map.addLayer({
        id: 'chargers-clusters',
        type: 'circle',
        source: CHARGERS_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#22c55e',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
          'circle-stroke-color': '#052e16',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9
        }
      });

      map.addLayer({
        id: 'chargers-cluster-count',
        type: 'symbol',
        source: CHARGERS_SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12
        },
        paint: { 'text-color': '#fff' }
      });

      map.on('click', 'chargers-clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['chargers-clusters'] });
        if (!features.length || features[0].geometry.type !== 'Point') return;
        const clusterId = features[0].properties?.cluster_id as number;
        const source = map.getSource(CHARGERS_SOURCE) as GeoJSONSource;
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          if (!zoom) return;
          const coords = features[0].geometry.type === 'Point' ? (features[0].geometry.coordinates as [number, number]) : undefined;
          map.easeTo({ center: coords, zoom });
        });
      });
      map.on('mouseenter', 'chargers-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'chargers-clusters', () => { map.getCanvas().style.cursor = ''; });

      map.addLayer({
        id: 'chargers-layer',
        type: 'circle',
        source: CHARGERS_SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 7,
          'circle-color': '#22c55e',
          'circle-stroke-color': '#052e16',
          'circle-stroke-width': 1.5
        }
      });

      map.on('click', 'chargers-layer', (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const props = feature.properties as { name: string; network: string; powerKw?: number; plugs?: string };
        new Popup({ closeButton: true, maxWidth: '260px' })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setHTML(`
            <div style="font-family:sans-serif;padding:2px">
              <strong style="font-size:14px">${props.name}</strong>
              <div style="color:#555;font-size:12px;margin-top:3px">${props.network}</div>
              ${props.powerKw ? `<div style="margin-top:5px;font-size:12px;font-weight:600;color:#16a34a">${props.powerKw} kW</div>` : ''}
              ${props.plugs ? `<div style="margin-top:4px;font-size:11px;color:#666">${props.plugs}</div>` : ''}
            </div>
          `)
          .addTo(map);
      });
      map.on('mouseenter', 'chargers-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'chargers-layer', () => { map.getCanvas().style.cursor = ''; });
    }

    if (!map.getSource(INCIDENTS_SOURCE)) {
      map.addSource(INCIDENTS_SOURCE, { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'incidents-layer',
        type: 'circle',
        source: INCIDENTS_SOURCE,
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'severity'], 'high', '#ef4444', 'medium', '#f97316', '#facc15'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5
        }
      });

      map.on('click', 'incidents-layer', (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const props = feature.properties as { title: string; kind: string; severity: string; source: string; description?: string };
        const col = SEVERITY_COLOR[props.severity] ?? '#facc15';
        new Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setHTML(`
            <div style="font-family:sans-serif;padding:2px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:${col};display:inline-block;flex-shrink:0"></span>
                <strong style="font-size:14px">${props.title}</strong>
              </div>
              <div style="color:#555;font-size:12px;margin-top:3px;text-transform:capitalize">${props.kind} · ${props.severity}</div>
              ${props.description ? `<div style="margin-top:5px;font-size:12px;color:#333">${props.description}</div>` : ''}
              <div style="margin-top:4px;font-size:11px;color:#888">${props.source}</div>
            </div>
          `)
          .addTo(map);
      });
      map.on('mouseenter', 'incidents-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'incidents-layer', () => { map.getCanvas().style.cursor = ''; });
    }
  }

  function applyCurrentData(map: Map) {
    if (!map.isStyleLoaded()) return;
    const { route, reports, chargers, incidents, activeAlternativeId } = dataRef.current;

    (map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined)?.setData(route?.geometry ?? emptyLine());
    (map.getSource(ALTERNATIVE_SOURCE) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: (route?.alternatives ?? [])
        .filter((a) => a.id !== activeAlternativeId)
        .map((a) => ({ ...a.geometry, properties: { id: a.id } }))
    });
    (map.getSource(REPORTS_SOURCE) as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(reports.map((r) => ({ point: r.coordinate, properties: { kind: r.kind } })))
    );
    (map.getSource(CHARGERS_SOURCE) as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(chargers.map((c) => ({
        point: c.coordinate,
        properties: { name: c.name, network: c.network, powerKw: c.powerKw ?? null, plugs: c.plugs.join(' · ') }
      })))
    );
    (map.getSource(INCIDENTS_SOURCE) as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(incidents.map((i) => ({
        point: i.coordinate,
        properties: { title: i.title, kind: i.kind, severity: i.severity, source: i.source, description: i.description ?? '' }
      })))
    );
  }

  // Initial map mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[0].url,
      center: [center.lng, center.lat] as LngLatLike,
      zoom: appEnv.defaultZoom,
      attributionControl: false
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.on('moveend', () => {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    });
    map.on('load', () => {
      setupLayers(map);
      applyCurrentData(map);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map style switching
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[styleIdx].url);
    map.once('styledata', () => {
      if (map.isStyleLoaded()) {
        setupLayers(map);
        applyCurrentData(map);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleIdx]);

  // Pan to center
  useEffect(() => {
    mapRef.current?.easeTo({ center: [center.lng, center.lat], duration: 700 });
  }, [center]);

  // Route + alternatives
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined)?.setData(route?.geometry ?? emptyLine());
    (map.getSource(ALTERNATIVE_SOURCE) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: (route?.alternatives ?? [])
        .filter((a) => a.id !== activeAlternativeId)
        .map((a) => ({ ...a.geometry, properties: { id: a.id } }))
    });
    if (route?.geometry.geometry.coordinates.length) {
      const bounds = new maplibregl.LngLatBounds();
      route.geometry.geometry.coordinates.forEach((p) => bounds.extend([p[0], p[1]]));
      map.fitBounds(bounds, { padding: 90, duration: 700, maxZoom: 15 });
    }
  }, [route, activeAlternativeId]);

  // Reports
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource(REPORTS_SOURCE) as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(reports.map((r) => ({ point: r.coordinate, properties: { kind: r.kind } })))
    );
  }, [reports]);

  // Chargers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource(CHARGERS_SOURCE) as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(chargers.map((c) => ({
        point: c.coordinate,
        properties: { name: c.name, network: c.network, powerKw: c.powerKw ?? null, plugs: c.plugs.join(' · ') }
      })))
    );
  }, [chargers]);

  // Incidents
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource(INCIDENTS_SOURCE) as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(incidents.map((i) => ({
        point: i.coordinate,
        properties: { title: i.title, kind: i.kind, severity: i.severity, source: i.source, description: i.description ?? '' }
      })))
    );
  }, [incidents]);

  // Origin / destination pin markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    originMarkerRef.current?.remove();
    destMarkerRef.current?.remove();
    if (origin) {
      originMarkerRef.current = new maplibregl.Marker({ element: pinEl('#10b981'), anchor: 'bottom' })
        .setLngLat([origin.lng, origin.lat]).addTo(map);
    }
    if (destination) {
      destMarkerRef.current = new maplibregl.Marker({ element: pinEl('#f43f5e'), anchor: 'bottom' })
        .setLngLat([destination.lng, destination.lat]).addTo(map);
    }
  }, [origin, destination]);

  // User position dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (!userPosition) return;
    userMarkerRef.current = new maplibregl.Marker({ element: userDotEl(userPosition.heading), anchor: 'center' })
      .setLngLat([userPosition.coordinate.lng, userPosition.coordinate.lat])
      .addTo(map);
  }, [userPosition]);

  // Navigation mode: follow user position with heading
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigationMode || !userPosition) return;
    map.easeTo({
      center: [userPosition.coordinate.lng, userPosition.coordinate.lat],
      bearing: userPosition.heading ?? 0,
      duration: 500
    });
  }, [navigationMode, userPosition]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Map style switcher */}
      <button
        type="button"
        onClick={() => setStyleIdx((i) => (i + 1) % MAP_STYLES.length)}
        title="Cycle map style"
        className="absolute bottom-28 right-3 z-10 flex items-center gap-1.5 rounded-full border border-white/20 bg-slate-900/80 px-3 py-2 text-xs font-medium text-white shadow backdrop-blur transition hover:bg-slate-800"
      >
        <Layers className="h-3.5 w-3.5" />
        {MAP_STYLES[styleIdx].label}
      </button>

      {/* Navigation HUD */}
      {navigationMode && activeManeuver && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
          <div className="rounded-2xl border border-sky-500/40 bg-slate-900/95 px-6 py-4 shadow-xl backdrop-blur">
            <div className="text-center text-xs uppercase tracking-widest text-sky-400">Next maneuver</div>
            <div className="mt-1 text-center text-xl font-semibold text-white">{activeManeuver.instruction}</div>
            <div className="mt-1 text-center text-sm text-slate-400">
              {activeManeuver.distanceKm.toFixed(1)} km
              {activeManeuver.timeMin ? ` · ${Math.round(activeManeuver.timeMin)} min` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function emptyLine(): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function toFeatureCollection(items: Array<{ point: Coordinate; properties: Record<string, unknown> }>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map((item) => ({
      type: 'Feature',
      properties: item.properties,
      geometry: { type: 'Point', coordinates: [item.point.lng, item.point.lat] }
    }))
  };
}

function pinEl(color: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = `<svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`;
  return el;
}

function userDotEl(heading: number | null): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:22px;height:22px';

  if (heading !== null) {
    const arrowWrap = document.createElement('div');
    arrowWrap.style.cssText = `position:absolute;inset:-14px;display:flex;align-items:flex-start;justify-content:center;transform:rotate(${heading}deg);pointer-events:none`;
    const arrow = document.createElement('div');
    arrow.style.cssText = 'width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid #3b82f6';
    arrowWrap.appendChild(arrow);
    wrap.appendChild(arrowWrap);
  }

  const ring = document.createElement('div');
  ring.className = 'user-pos-ring';
  ring.style.cssText = 'position:absolute;top:50%;left:50%;width:38px;height:38px;border-radius:9999px;background:rgba(59,130,246,0.22);transform:translate(-50%,-50%)';
  wrap.appendChild(ring);

  const dot = document.createElement('div');
  dot.style.cssText = 'position:absolute;inset:0;border-radius:9999px;background:#3b82f6;border:3px solid white;box-shadow:0 2px 10px rgba(59,130,246,0.7)';
  wrap.appendChild(dot);

  return wrap;
}
