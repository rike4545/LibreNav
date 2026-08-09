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

  const positioned = alerts
    .map((alert) => {
      const match = nearestOnPath(alert.coordinate, path);
      if (!match || match.offsetM > maxOffsetM) return null;
      return { ...alert, distanceAlongM: cumulative[match.index] ?? 0 };
    })
    .filter((value): value is RoadAlert & { distanceAlongM: number } => value !== null)
    .sort((a, b) => a.distanceAlongM - b.distanceAlongM);

  return dedupeAlerts(positioned);
}

/**
 * Which source to believe when two reports describe the same thing.
 *
 * OSM cameras are surveyed and carry the posted limit, so they beat a live
 * report of the same camera. A crowd-confirmed Waze report beats one person's
 * own tap on this device.
 */
const SOURCE_RANK: Record<RoadAlert['source'], number> = { osm: 3, waze: 2, local: 1 };

/** Two same-kind alerts within this far along the route are one thing. */
const DUPLICATE_WINDOW_M = 80;

/**
 * Collapse duplicate reports of a single hazard.
 *
 * The alert list is three sources concatenated, so a fixed camera in OSM, the
 * live report of it, and the driver's own pin all describe one thing and would
 * otherwise warn three times on one approach. Expects the list already
 * positioned and sorted by distance along the route.
 */
export function dedupeAlerts(alerts: Array<RoadAlert & { distanceAlongM: number }>): RoadAlert[] {
  const kept: Array<RoadAlert & { distanceAlongM: number }> = [];

  for (const alert of alerts) {
    // Sorted input means any duplicate is among the trailing entries.
    //
    // Matching against the kept representative rather than chaining is
    // deliberate: a string of reports each 70 m from the last would otherwise
    // collapse kilometres of separate incidents into a single warning.
    let duplicateAt = -1;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (alert.distanceAlongM - kept[i].distanceAlongM > DUPLICATE_WINDOW_M) break;
      if (kept[i].kind === alert.kind) {
        duplicateAt = i;
        break;
      }
    }

    if (duplicateAt < 0) {
      kept.push(alert);
      continue;
    }

    // Keep whichever source is more trustworthy; on a tie keep the first,
    // which is the earlier one on the road.
    if (SOURCE_RANK[alert.source] > SOURCE_RANK[kept[duplicateAt].source]) {
      // Hold the cluster's original position. The better source can sit
      // further along than the entry it replaces, and writing its distance
      // into an earlier slot would leave the list unsorted for the caller —
      // which picks the next alert by walking it in order. Warning at the
      // first report of a cluster is also the safer end to err on.
      kept[duplicateAt] = { ...alert, distanceAlongM: kept[duplicateAt].distanceAlongM };
    }
  }

  return kept;
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
