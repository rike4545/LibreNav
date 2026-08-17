'use client';

import { useCallback, useEffect, useRef } from 'react';
import maplibregl, { GeoJSONSource, LngLatBoundsLike, Map, MapMouseEvent, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TERRAIN_DEM_URL, appEnv, resolveMapStyleUrl } from '@/lib/config';
import { boundsOf } from '@/lib/geometry';
import { ChargerSite, Coordinate, HazardReport, Place, RoadAlert, RouteResponse, TrafficJam, UserPosition, Waypoint } from '@/types/map';

type Props = {
  center: Coordinate;
  styleId: string;
  waypoints: Waypoint[];
  route: RouteResponse | null;
  activeAlternativeId: string | null;
  chargers: ChargerSite[];
  places: Place[];
  reports: HazardReport[];
  alerts: RoadAlert[];
  jams: TrafficJam[];
  terrain3d: boolean;
  userPosition: UserPosition | null;
  /** Snapped position during navigation; keeps the puck on the road. */
  snappedPosition: Coordinate | null;
  navActive: boolean;
  courseDeg: number | null;
  /** Bumping this recenters the camera on the full route. */
  fitRouteToken: number;
  /** Bumping this recenters the camera on the driver. */
  recenterToken: number;
  onCenterChange: (center: Coordinate) => void;
  onChargerSelect: (charger: ChargerSite) => void;
  onPlaceSelect: (place: Place) => void;
  onAlternativeSelect: (id: string) => void;
  onMapLongPress: (point: Coordinate) => void;
};

const SOURCES = {
  route: 'route-src',
  routeDriven: 'route-driven-src',
  alternatives: 'alternatives-src',
  chargers: 'chargers-src',
  places: 'places-src',
  reports: 'reports-src',
  alerts: 'alerts-src',
  jams: 'jams-src'
} as const;

const TERRAIN_SOURCE = 'terrain-dem';

const emptyCollection = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

const lineFeature = (coordinates: [number, number][], properties: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'LineString', coordinates }
});

/** Our layers, bottom to top. Order matters: the casing sits under the route. */
const OVERLAY_LAYERS = [
  'alternatives-line',
  'alternatives-hit',
  'route-casing',
  'route-line',
  'route-driven',
  'jams-line',
  'chargers-cluster',
  'chargers-cluster-count',
  'chargers-point',
  'places-point',
  'reports-point',
  'alerts-point'
];

/**
 * Push our layers above the basemap's.
 *
 * A basemap style keeps loading layers after it first reports itself ready, so
 * layers added at that moment end up *below* the opaque land fills that arrive
 * afterwards — the route line silently vanishes under the map. Re-stacking is
 * cheap and idempotent, so just do it whenever the style changes.
 */
function raiseOverlays(map: Map) {
  for (const id of OVERLAY_LAYERS) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

export function NavMap({
  center,
  styleId,
  waypoints,
  route,
  activeAlternativeId,
  chargers,
  places,
  reports,
  alerts,
  jams,
  terrain3d,
  userPosition,
  snappedPosition,
  navActive,
  courseDeg,
  fitRouteToken,
  recenterToken,
  onCenterChange,
  onChargerSelect,
  onPlaceSelect,
  onAlternativeSelect,
  onMapLongPress
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const waypointMarkersRef = useRef<Marker[]>([]);
  const styleReadyRef = useRef(false);
  /** Style the map is actually on, so a swap can't be requested twice or lost. */
  const appliedStyleRef = useRef<string | null>(null);
  /** Latest requested style, readable from the mount effect's closure. */
  const styleIdRef = useRef(styleId);

  // Handlers land in map event callbacks that are registered once; refs keep
  // those callbacks pointing at the current props without re-binding listeners.
  const handlersRef = useRef({ onChargerSelect, onPlaceSelect, onAlternativeSelect, onMapLongPress, onCenterChange });
  const dataRef = useRef({ route, activeAlternativeId, chargers, places, reports, alerts, jams });

  // Both were assigned during render, which React does not allow — a render
  // that gets thrown away (StrictMode, a concurrent retry) would still have
  // moved the ref. Refreshing them here keeps the same "latest props without
  // re-binding listeners" behaviour, and this effect is declared above every
  // effect that reads them so it commits first.
  useEffect(() => {
    handlersRef.current = { onChargerSelect, onPlaceSelect, onAlternativeSelect, onMapLongPress, onCenterChange };
    dataRef.current = { route, activeAlternativeId, chargers, places, reports, alerts, jams };
  });

  /**
   * Push the current data into every source.
   *
   * Deliberately not gated on `isStyleLoaded`/`idle`: a map that is still
   * streaming tiles never goes idle, which on a slow connection meant the route
   * line never got drawn. `setData` is valid the moment a source exists, so the
   * only precondition is that layers are installed.
   */
  const syncOverlayData = useCallback((map: Map) => {
    const set = (id: string, data: GeoJSON.FeatureCollection) => {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      source?.setData(data);
    };

    const { route: current, activeAlternativeId: activeId, chargers: pins, places: pois, reports: hazards, alerts: warnings, jams: congestion } = dataRef.current;

    if (!current) {
      set(SOURCES.route, emptyCollection());
      set(SOURCES.alternatives, emptyCollection());
    } else {
      const active = current.alternatives.find((alternative) => alternative.id === activeId);
      set(SOURCES.route, {
        type: 'FeatureCollection',
        features: [lineFeature(active ? active.coordinates : current.coordinates)]
      });

      // Whichever line isn't selected renders as an alternate.
      const others: GeoJSON.Feature[] = current.alternatives
        .filter((alternative) => alternative.id !== activeId)
        .map((alternative) => lineFeature(alternative.coordinates, { id: alternative.id }));
      if (active) others.push(lineFeature(current.coordinates, { id: 'main' }));

      set(SOURCES.alternatives, { type: 'FeatureCollection', features: others });
    }

    set(SOURCES.chargers, {
      type: 'FeatureCollection',
      features: pins.map((charger) => ({
        type: 'Feature',
        properties: { id: charger.id, powerKw: charger.powerKw ?? 0 },
        geometry: { type: 'Point', coordinates: [charger.coordinate.lng, charger.coordinate.lat] }
      }))
    });

    set(SOURCES.places, {
      type: 'FeatureCollection',
      features: pois.map((place) => ({
        type: 'Feature',
        properties: { id: place.id },
        geometry: { type: 'Point', coordinates: [place.coordinate.lng, place.coordinate.lat] }
      }))
    });

    set(SOURCES.reports, {
      type: 'FeatureCollection',
      features: hazards.map((report) => ({
        type: 'Feature',
        properties: { id: report.id, kind: report.kind },
        geometry: { type: 'Point', coordinates: [report.coordinate.lng, report.coordinate.lat] }
      }))
    });

    set(SOURCES.jams, {
      type: 'FeatureCollection',
      features: congestion.map((jam) => ({
        type: 'Feature',
        properties: { id: jam.id, level: jam.level },
        geometry: { type: 'LineString', coordinates: jam.coordinates }
      }))
    });

    set(SOURCES.alerts, {
      type: 'FeatureCollection',
      features: warnings.map((alert) => ({
        type: 'Feature',
        properties: { id: alert.id, kind: alert.kind },
        geometry: { type: 'Point', coordinates: [alert.coordinate.lng, alert.coordinate.lat] }
      }))
    });
  }, []);

  const installLayers = useCallback((map: Map) => {
    if (map.getSource(SOURCES.route)) return;

    /* ------------------------------------------------------------- route */
    map.addSource(SOURCES.alternatives, { type: 'geojson', data: emptyCollection() });
    map.addLayer({
      id: 'alternatives-line',
      type: 'line',
      source: SOURCES.alternatives,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#64748b', 'line-width': 6, 'line-opacity': 0.65 }
    });
    // Invisible fat line so alternates are tappable on a touch screen.
    map.addLayer({
      id: 'alternatives-hit',
      type: 'line',
      source: SOURCES.alternatives,
      paint: { 'line-color': '#000', 'line-width': 26, 'line-opacity': 0 }
    });

    map.addSource(SOURCES.route, { type: 'geojson', data: emptyCollection() });
    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: SOURCES.route,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#0c4a6e', 'line-width': 12, 'line-opacity': 0.9 }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: SOURCES.route,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#38bdf8', 'line-width': 7 }
    });

    // The already-driven portion, drawn over the live route and dimmed.
    map.addSource(SOURCES.routeDriven, { type: 'geojson', data: emptyCollection() });
    map.addLayer({
      id: 'route-driven',
      type: 'line',
      source: SOURCES.routeDriven,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#475569', 'line-width': 7, 'line-opacity': 0.85 }
    });

    /* ---------------------------------------------------------- chargers */
    map.addSource(SOURCES.chargers, {
      type: 'geojson',
      data: emptyCollection(),
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 48
    });
    map.addLayer({
      id: 'chargers-cluster',
      type: 'circle',
      source: SOURCES.chargers,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#10b981',
        'circle-opacity': 0.85,
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 40, 28],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.75)'
      }
    });
    map.addLayer({
      id: 'chargers-cluster-count',
      type: 'symbol',
      source: SOURCES.chargers,
      filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
      paint: { 'text-color': '#022c22' }
    });
    map.addLayer({
      id: 'chargers-point',
      type: 'circle',
      source: SOURCES.chargers,
      filter: ['!', ['has', 'point_count']],
      paint: {
        // Colour by peak power so fast chargers stand out at a glance.
        'circle-color': ['case', ['>=', ['get', 'powerKw'], 150], '#22d3ee', ['>=', ['get', 'powerKw'], 50], '#34d399', '#a3e635'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 8, 18, 11],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.85)'
      }
    });

    /* ------------------------------------------------------------ places */
    map.addSource(SOURCES.places, { type: 'geojson', data: emptyCollection() });
    map.addLayer({
      id: 'places-point',
      type: 'circle',
      source: SOURCES.places,
      paint: {
        'circle-color': '#a855f7',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 9],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.9)'
      }
    });

    /* ----------------------------------------------- local hazard reports */
    map.addSource(SOURCES.reports, { type: 'geojson', data: emptyCollection() });
    map.addLayer({
      id: 'reports-point',
      type: 'circle',
      source: SOURCES.reports,
      paint: {
        'circle-color': [
          'match',
          ['get', 'kind'],
          'police', '#38bdf8',
          'crash', '#f43f5e',
          'closure', '#f43f5e',
          'traffic', '#fb923c',
          'camera', '#a855f7',
          '#f59e0b'
        ],
        'circle-radius': 7,
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.85)'
      }
    });

    /* --------------------------------------------------- live traffic jams */
    map.addSource(SOURCES.jams, { type: 'geojson', data: emptyCollection() });
    map.addLayer({
      id: 'jams-line',
      type: 'line',
      source: SOURCES.jams,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        // Waze levels run 1 (light) to 5 (standstill) — amber through to red.
        'line-color': ['step', ['get', 'level'], '#facc15', 3, '#f97316', 4, '#ef4444', 5, '#b91c1c'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 7],
        'line-opacity': 0.9
      }
    });

    /* ------------------------------------------- speed cameras and alerts */
    map.addSource(SOURCES.alerts, { type: 'geojson', data: emptyCollection() });
    map.addLayer({
      id: 'alerts-point',
      type: 'circle',
      source: SOURCES.alerts,
      paint: {
        'circle-color': ['match', ['get', 'kind'], 'speed-camera', '#f59e0b', 'police', '#38bdf8', 'crash', '#f43f5e', '#fb923c'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 15, 8],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.9)'
      }
    });

    /* ---------------------------------------------------------- handlers */
    map.on('click', 'chargers-cluster', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const source = map.getSource(SOURCES.chargers) as GeoJSONSource;
      void source
        .getClusterExpansionZoom(feature.properties?.cluster_id as number)
        .then((zoom) => {
          if (feature.geometry.type === 'Point') {
            map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
          }
        })
        .catch(() => {});
    });

    map.on('click', 'chargers-point', (event) => {
      const id = event.features?.[0]?.properties?.id;
      const charger = dataRef.current.chargers.find((item) => item.id === id);
      if (charger) handlersRef.current.onChargerSelect(charger);
    });

    map.on('click', 'places-point', (event) => {
      const id = event.features?.[0]?.properties?.id;
      const place = dataRef.current.places.find((item) => item.id === id);
      if (place) handlersRef.current.onPlaceSelect(place);
    });

    map.on('click', 'alternatives-hit', (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string') handlersRef.current.onAlternativeSelect(id);
    });

    for (const layer of ['chargers-cluster', 'chargers-point', 'places-point', 'alternatives-hit']) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    if (!map.getSource(TERRAIN_SOURCE)) {
      map.addSource(TERRAIN_SOURCE, {
        type: 'raster-dem',
        tiles: [TERRAIN_DEM_URL],
        tileSize: 256,
        // Terrarium packs elevation into RGB differently from Mapbox's scheme.
        encoding: 'terrarium',
        maxzoom: 13,
        attribution: 'Elevation: AWS Terrain Tiles'
      });
    }

    raiseOverlays(map);
    syncOverlayData(map);
  }, [syncOverlayData]);

  /* ------------------------------------------------------ map lifecycle */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveMapStyleUrl(styleId),
      center: [center.lng, center.lat],
      zoom: appEnv.defaultZoom,
      attributionControl: false,
      maxPitch: 70
    });
    mapRef.current = map;
    appliedStyleRef.current = styleId;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');

    /**
     * Not `isStyleLoaded()`: that stays false while tiles are still pending,
     * even though the style spec is fully parsed and addSource/addLayer are
     * already valid. Gating on it meant a map whose tiles were slow never got
     * its overlays at all — no route line, no chargers. A parsed layer list is
     * the accurate signal for "safe to add layers".
     */
    const styleParsed = () => {
      try {
        return (map.getStyle()?.layers?.length ?? 0) > 0;
      } catch {
        return false;
      }
    };

    const applyOverlays = () => {
      if (!styleParsed()) return false;
      styleReadyRef.current = true;

      // A style change asked for before this point was refused below. Honour it
      // now rather than dropping it — that is how a theme flip during the first
      // load used to strand a dark basemap under a light UI. Recording it as
      // applied first is what stops the resulting styledata re-entering here.
      if (appliedStyleRef.current !== styleIdRef.current) {
        appliedStyleRef.current = styleIdRef.current;
        map.setStyle(resolveMapStyleUrl(styleIdRef.current), { diff: false });
        return true;
      }

      installLayers(map);
      raiseOverlays(map);
      syncOverlayData(map);
      return true;
    };

    // 'load' waits for the first full render, which never arrives if tiles
    // stall, so back the events with a poll that stops once we're installed.
    map.on('load', applyOverlays);
    map.on('styledata', applyOverlays);
    map.on('idle', () => raiseOverlays(map));

    let installPoll: ReturnType<typeof setInterval> | undefined;
    if (!applyOverlays()) {
      installPoll = setInterval(() => {
        if (applyOverlays()) {
          clearInterval(installPoll);
          installPoll = undefined;
        }
      }, 200);
    }

    map.on('moveend', () => {
      const next = map.getCenter();
      handlersRef.current.onCenterChange({ lat: next.lat, lng: next.lng });
    });

    // Long-press to drop a destination, matching the phone-maps gesture.
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    const clearPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
    };
    const startPress = (event: MapMouseEvent) => {
      clearPress();
      pressTimer = setTimeout(() => {
        handlersRef.current.onMapLongPress({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      }, 550);
    };

    map.on('mousedown', startPress);
    map.on('mouseup', clearPress);
    map.on('dragstart', clearPress);
    map.on('touchstart', (event) => startPress(event as unknown as MapMouseEvent));
    map.on('touchend', clearPress);
    map.on('touchmove', clearPress);
    map.on('contextmenu', (event) => {
      handlersRef.current.onMapLongPress({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });

    // MapLibre only measures its container on construction. Watch for size
    // changes so rotation, panel reflow, and window resizes stay in sync.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      clearPress();
      if (installPoll) clearInterval(installPoll);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
    // Mount once — later prop changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------- style swap */
  useEffect(() => {
    styleIdRef.current = styleId;
    const map = mapRef.current;
    // Before the first style parses, setStyle would be discarded; applyOverlays
    // picks the change back up off styleIdRef once it is safe.
    if (!map || !styleReadyRef.current) return;
    if (appliedStyleRef.current === styleId) return;
    appliedStyleRef.current = styleId;
    map.setStyle(resolveMapStyleUrl(styleId), { diff: false });
  }, [styleId]);

  /* --------------------------------------------- overlay data -> sources */
  useEffect(() => {
    const map = mapRef.current;
    if (map) syncOverlayData(map);
  }, [route, activeAlternativeId, chargers, places, reports, syncOverlayData]);

  /* --------------------------------------------------- driven-so-far dim */
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCES.routeDriven) as GeoJSONSource | undefined;
    if (!map || !source) return;

    if (!navActive || !route || !snappedPosition) {
      source.setData(emptyCollection());
      return;
    }

    // Find where the driver is, then dim everything behind them.
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < route.coordinates.length; i += 1) {
      const dx = route.coordinates[i][0] - snappedPosition.lng;
      const dy = route.coordinates[i][1] - snappedPosition.lat;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        nearest = i;
      }
    }

    const driven = route.coordinates.slice(0, nearest + 1);
    driven.push([snappedPosition.lng, snappedPosition.lat]);
    source.setData({ type: 'FeatureCollection', features: driven.length > 1 ? [lineFeature(driven)] : [] });
  }, [navActive, route, snappedPosition]);





  /* -------------------------------------------------- waypoint markers */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of waypointMarkersRef.current) marker.remove();

    waypointMarkersRef.current = waypoints.map((waypoint, index) => {
      const isFirst = index === 0;
      const isLast = index === waypoints.length - 1;
      const element = document.createElement('div');
      element.className = 'nav-waypoint-marker';
      element.style.background = isLast ? '#38bdf8' : isFirst ? '#22c55e' : '#f59e0b';
      element.textContent = isLast && waypoints.length > 1 ? '■' : isFirst ? '●' : String(index);
      element.title = waypoint.name;

      return new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([waypoint.coordinate.lng, waypoint.coordinate.lat])
        .addTo(map);
    });

    return () => {
      for (const marker of waypointMarkersRef.current) marker.remove();
      waypointMarkersRef.current = [];
    };
  }, [waypoints]);

  /* ------------------------------------------------------- user position */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const point = snappedPosition ?? userPosition?.coordinate;
    if (!point) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    if (!userMarkerRef.current) {
      const element = document.createElement('div');
      element.className = 'nav-user-puck';
      element.innerHTML = '<span class="nav-user-ring"></span><span class="nav-user-dot"></span><span class="nav-user-cone"></span>';
      userMarkerRef.current = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([point.lng, point.lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([point.lng, point.lat]);
    }

    // Point the heading cone along GPS heading, falling back to road course.
    const heading = userPosition?.heading ?? courseDeg;
    const cone = userMarkerRef.current.getElement().querySelector<HTMLElement>('.nav-user-cone');
    if (cone) {
      cone.style.opacity = heading === null || heading === undefined ? '0' : '1';
      if (heading !== null && heading !== undefined) {
        cone.style.transform = `translate(-50%, -100%) rotate(${heading}deg)`;
      }
    }
  }, [userPosition, snappedPosition, courseDeg]);

  /* --------------------------------------------------------- nav camera */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navActive) return;
    const point = snappedPosition ?? userPosition?.coordinate;
    if (!point) return;

    map.easeTo({
      center: [point.lng, point.lat],
      zoom: 16.5,
      pitch: 55,
      bearing: userPosition?.heading ?? courseDeg ?? map.getBearing(),
      duration: 900,
      // Push the driver low in the frame so the road ahead gets the space.
      padding: { top: 260, bottom: 40, left: 0, right: 0 }
    });
  }, [navActive, snappedPosition, userPosition, courseDeg]);

  // Flatten the camera when navigation stops.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || navActive) return;
    map.easeTo({ pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
  }, [navActive]);

  /* -------------------------------------------------- camera fit tokens */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || fitRouteToken === 0) return;
    const bounds = boundsOf(route.coordinates);
    if (bounds) {
      map.fitBounds(bounds as LngLatBoundsLike, { padding: { top: 120, bottom: 320, left: 80, right: 80 }, duration: 900 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRouteToken]);

  useEffect(() => {
    const map = mapRef.current;
    const point = userPosition?.coordinate;
    if (!map || !point || recenterToken === 0) return;
    map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 15), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  /* --------------------------------------- follow external center changes */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || navActive) return;
    const current = map.getCenter();
    // Only move for meaningful jumps; otherwise moveend feedback loops.
    if (Math.abs(current.lat - center.lat) > 0.02 || Math.abs(current.lng - center.lng) > 0.02) {
      map.easeTo({ center: [center.lng, center.lat], duration: 600 });
    }
  }, [center, navActive]);

  // Inline styles rather than utility classes: maplibre-gl.css sets
  // `.maplibregl-map { position: relative }` and loads after Tailwind, which
  // would otherwise win and collapse the container to zero height.
  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
