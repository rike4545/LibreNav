'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { GeoJSONSource, LngLatLike, Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { appEnv } from '@/lib/env';
import { ChargerSite, Coordinate, HazardReport, Incident, RouteResponse } from '@/types/map';

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
};

const ROUTE_SOURCE = 'route-source';
const ALTERNATIVE_SOURCE = 'alternative-source';
const REPORTS_SOURCE = 'reports-source';
const CHARGERS_SOURCE = 'chargers-source';
const INCIDENTS_SOURCE = 'incidents-source';

export function TeslaMap({ center, origin, destination, route, reports, chargers, incidents, activeAlternativeId, onCenterChange }: Props) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: appEnv.mapStyleUrl,
      center: [center.lng, center.lat] as LngLatLike,
      zoom: appEnv.defaultZoom,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('moveend', () => {
      const nextCenter = map.getCenter();
      onCenterChange({ lat: nextCenter.lat, lng: nextCenter.lng });
    });

    map.on('load', () => {
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data: emptyLine() });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: ROUTE_SOURCE,
        paint: { 'line-color': '#38bdf8', 'line-width': 7, 'line-opacity': 0.94 }
      });

      map.addSource(ALTERNATIVE_SOURCE, { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'alternative-lines',
        type: 'line',
        source: ALTERNATIVE_SOURCE,
        paint: { 'line-color': '#94a3b8', 'line-width': 4, 'line-opacity': 0.75 }
      });

      map.addSource(REPORTS_SOURCE, { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'reports-layer',
        type: 'circle',
        source: REPORTS_SOURCE,
        paint: {
          'circle-radius': 7,
          'circle-color': '#f97316',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5
        }
      });

      map.addSource(CHARGERS_SOURCE, { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'chargers-layer',
        type: 'circle',
        source: CHARGERS_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': '#22c55e',
          'circle-stroke-color': '#052e16',
          'circle-stroke-width': 1.5
        }
      });

      map.addSource(INCIDENTS_SOURCE, { type: 'geojson', data: emptyCollection() });
      map.addLayer({
        id: 'incidents-layer',
        type: 'circle',
        source: INCIDENTS_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': '#f43f5e',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5
        }
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lng, onCenterChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 700 });
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(route?.geometry ?? emptyLine());

    const altSource = map.getSource(ALTERNATIVE_SOURCE) as GeoJSONSource | undefined;
    altSource?.setData({
      type: 'FeatureCollection',
      features: (route?.alternatives ?? [])
        .filter((item) => item.id !== activeAlternativeId)
        .map((item) => ({ ...item.geometry, properties: { id: item.id } }))
    });

    if (route?.geometry.geometry.coordinates.length) {
      const bounds = new maplibregl.LngLatBounds();
      route.geometry.geometry.coordinates.forEach((point) => bounds.extend([point[0], point[1]]));
      map.fitBounds(bounds, { padding: 90, duration: 700, maxZoom: 15 });
    }
  }, [route, activeAlternativeId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(REPORTS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(reports.map((report) => ({ point: report.coordinate, properties: { kind: report.kind } }))));
  }, [reports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(CHARGERS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(chargers.map((charger) => ({ point: charger.coordinate, properties: { name: charger.name, network: charger.network } }))));
  }, [chargers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(INCIDENTS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(incidents.map((incident) => ({ point: incident.coordinate, properties: { title: incident.title, kind: incident.kind } }))));
  }, [incidents]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    removeMarker(map, 'origin-marker');
    removeMarker(map, 'destination-marker');

    if (origin) addMarker(map, 'origin-marker', origin, '#10b981');
    if (destination) addMarker(map, 'destination-marker', destination, '#f43f5e');
  }, [origin, destination]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function emptyLine(): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [] }
  };
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

function addMarker(map: Map, className: string, coordinate: Coordinate, color: string) {
  const element = document.createElement('div');
  element.className = className;
  element.style.width = '18px';
  element.style.height = '18px';
  element.style.borderRadius = '9999px';
  element.style.background = color;
  element.style.border = '2px solid white';
  new maplibregl.Marker({ element }).setLngLat([coordinate.lng, coordinate.lat]).addTo(map);
}

function removeMarker(map: Map, className: string) {
  const markers = document.getElementsByClassName(className);
  while (markers.length > 0) {
    markers[0].remove();
  }
}
