import { OVERPASS_MIRRORS, getEndpoints } from '@/lib/config';
import { samplePath } from '@/lib/geometry';
import { Coordinate, RoadAlert } from '@/types/map';

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
};

/** Parse "30 mph", "50", "30 km/h" into km/h. */
function parseMaxspeed(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return /mph/i.test(match[2] ?? '') ? Math.round(amount * 1.60934) : Math.round(amount);
}

/**
 * Speed cameras along the route corridor.
 *
 * OSM tags these as highway=speed_camera, with enforcement relations used for
 * average-speed zones. We take the point form, which is what a driver needs to
 * be warned about, and sample the path so the query stays one request.
 */
export async function fetchSpeedCameras(
  path: [number, number][],
  corridorKm = 0.4,
  signal?: AbortSignal
): Promise<RoadAlert[]> {
  if (path.length < 2) return [];

  // Cameras sit on the road itself, so a tight corridor avoids picking up
  // cameras on parallel streets the driver isn't on.
  const radius = Math.round(Math.min(Math.max(corridorKm, 0.1), 2) * 1000);
  const samples = samplePath(path, 1500).slice(0, 60);
  const anchors = samples.map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`).join(',');

  const query = `[out:json][timeout:30];
(
  node["highway"="speed_camera"](around:${radius},${anchors});
  node["enforcement"="maxspeed"](around:${radius},${anchors});
);
out tags 300;`;

  const configured = getEndpoints().overpassUrl;
  const endpoints = [configured, ...OVERPASS_MIRRORS.filter((mirror) => mirror !== configured)];

  for (const endpoint of endpoints) {
    const timeout = AbortSignal.timeout(12_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: combined
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as { elements?: OverpassElement[] };
      return (payload.elements ?? [])
        .map((element): RoadAlert | null => {
          if (typeof element.lat !== 'number' || typeof element.lon !== 'number') return null;
          const tags = element.tags ?? {};
          return {
            id: `cam-${element.id}`,
            kind: 'speed-camera',
            coordinate: { lat: element.lat, lng: element.lon },
            limitKmh: parseMaxspeed(tags.maxspeed),
            source: 'osm'
          };
        })
        .filter((value): value is RoadAlert => value !== null);
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  return [];
}

/**
 * Place alerts on the route and drop anything that isn't really on it.
 *
 * Without the corridor test an alert on a parallel street would still project
 * onto some point of the route and get announced.
 */
export function positionAlertsOnRoute(
  alerts: RoadAlert[],
  path: [number, number][],
  cumulative: number[],
  maxOffsetM = 60
): RoadAlert[] {
  if (path.length < 2) return [];

  return alerts
    .map((alert) => {
      const match = nearestOnPath(alert.coordinate, path);
      if (!match || match.offsetM > maxOffsetM) return null;
      return { ...alert, distanceAlongM: cumulative[match.index] ?? 0 };
    })
    .filter((value): value is RoadAlert & { distanceAlongM: number } => value !== null)
    .sort((a, b) => a.distanceAlongM - b.distanceAlongM);
}

/** Closest vertex on the path, with its perpendicular-ish offset in metres. */
function nearestOnPath(point: Coordinate, path: [number, number][]): { index: number; offsetM: number } | null {
  let bestIndex = -1;
  let bestSq = Infinity;
  const cosLat = Math.cos((point.lat * Math.PI) / 180);

  for (let i = 0; i < path.length; i += 1) {
    // Squared degrees, longitude scaled by latitude — enough to rank candidates
    // without a haversine call per vertex.
    const dx = (path[i][0] - point.lng) * cosLat;
    const dy = path[i][1] - point.lat;
    const sq = dx * dx + dy * dy;
    if (sq < bestSq) {
      bestSq = sq;
      bestIndex = i;
    }
  }

  if (bestIndex < 0) return null;
  // 1 degree of latitude ≈ 111.32 km.
  return { index: bestIndex, offsetM: Math.sqrt(bestSq) * 111_320 };
}
