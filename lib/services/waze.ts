import { getLocalDataKey } from '@/lib/config';
import { Coordinate, RoadAlert, RoadAlertKind, TrafficJam } from '@/types/map';

/**
 * Live Waze alerts and jams, via OpenWeb Ninja's licensed feed.
 *
 * This is the legitimate route to Waze data — the reports are proprietary and
 * their own endpoint is private, so the only honest way to show them is a
 * licensed API with the user's own key. Everything here no-ops without one.
 */

const BASE = 'https://api.openwebninja.com/waze/alerts-and-jams';

/** Waze's alert vocabulary mapped onto the kinds we already render. */
const TYPE_MAP: Record<string, RoadAlertKind> = {
  POLICE: 'police',
  ACCIDENT: 'crash',
  ROAD_CLOSED: 'closure',
  JAM: 'traffic',
  HAZARD: 'hazard',
  CONSTRUCTION: 'hazard',
  WEATHERHAZARD: 'hazard'
};

type WazeAlert = {
  alert_id?: string;
  type?: string;
  subtype?: string | null;
  description?: string | null;
  street?: string | null;
  city?: string | null;
  latitude?: number;
  longitude?: number;
  alert_reliability?: number;
  num_thumbs_up?: number;
  publish_datetime_utc?: string;
};

type WazeJam = {
  jam_id?: string;
  level?: number;
  speed_kmh?: number;
  length_meters?: number;
  end_location?: string | null;
  line_coordinates?: Array<{ lat: number; lon: number }>;
};

type WazeEnvelope = {
  status?: string;
  data?: { alerts?: WazeAlert[]; jams?: WazeJam[] };
  error?: { message?: string; code?: number };
};

export type WazeTraffic = {
  alerts: RoadAlert[];
  jams: TrafficJam[];
};

const EMPTY: WazeTraffic = { alerts: [], jams: [] };

/**
 * Drop the least trustworthy reports.
 *
 * Waze scores reliability 0–10 from confirmations. Anything very low is often a
 * stale or mistaken report, and a false "police ahead" callout is worse than
 * silence when the driver is relying on it.
 */
const MIN_RELIABILITY = 3;

export async function fetchWazeTraffic(
  bounds: { southWest: Coordinate; northEast: Coordinate },
  signal?: AbortSignal
): Promise<WazeTraffic> {
  const key = getLocalDataKey();
  if (!key) return EMPTY;

  const url = new URL(BASE);
  url.searchParams.set('bottom_left', `${bounds.southWest.lat.toFixed(6)},${bounds.southWest.lng.toFixed(6)}`);
  url.searchParams.set('top_right', `${bounds.northEast.lat.toFixed(6)},${bounds.northEast.lng.toFixed(6)}`);

  if (Date.now() < throttledUntil) return EMPTY;

  // Observed 503s and 20s+ responses on this endpoint, so allow one retry and
  // keep a hard ceiling — traffic is an enhancement and must never stall nav.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeout = AbortSignal.timeout(25_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      const response = await fetch(url, { headers: { 'x-api-key': key }, signal: combined });
      if (response.status === 401 || response.status === 403) return EMPTY;

      // This endpoint is metered per call. Retrying a 429 just spends more of
      // the user's quota, so back off for a while instead.
      if (response.status === 429) {
        throttledUntil = Date.now() + THROTTLE_BACKOFF_MS;
        throw new WazeThrottled();
      }

      if (!response.ok) continue;

      const payload = (await response.json().catch(() => null)) as WazeEnvelope | null;
      if (!payload?.data) continue;

      return { alerts: parseAlerts(payload.data.alerts ?? []), jams: parseJams(payload.data.jams ?? []) };
    } catch (error) {
      if (error instanceof WazeThrottled) throw error;
      if (signal?.aborted) throw error;
    }
  }

  return EMPTY;
}

/** Raised when the account's quota is exhausted, so callers can say so. */
export class WazeThrottled extends Error {
  constructor() {
    super('Live traffic quota reached.');
    this.name = 'WazeThrottled';
  }
}

const THROTTLE_BACKOFF_MS = 10 * 60 * 1000;

/** Module-level so every caller shares one backoff window. */
let throttledUntil = 0;

function parseAlerts(raw: WazeAlert[]): RoadAlert[] {
  return raw
    .map((alert, index): RoadAlert | null => {
      const { latitude, longitude } = alert;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
      if ((alert.alert_reliability ?? 0) < MIN_RELIABILITY) return null;

      const kind = TYPE_MAP[(alert.type ?? '').toUpperCase()] ?? 'hazard';
      // subtype is the specific flavour (e.g. HAZARD_ON_ROAD_POT_HOLE); fall
      // back through description and street so the card always says something.
      const note = alert.description || prettifySubtype(alert.subtype) || alert.street || undefined;

      return {
        id: `waze-${alert.alert_id ?? index}`,
        kind,
        coordinate: { lat: latitude, lng: longitude },
        note,
        source: 'waze'
      };
    })
    .filter((value): value is RoadAlert => value !== null);
}

function parseJams(raw: WazeJam[]): TrafficJam[] {
  return raw
    .map((jam, index): TrafficJam | null => {
      const line = (jam.line_coordinates ?? [])
        .filter((point) => typeof point.lat === 'number' && typeof point.lon === 'number')
        .map((point): [number, number] => [point.lon, point.lat]);
      // A jam needs at least a segment to draw.
      if (line.length < 2) return null;

      return {
        id: `jam-${jam.jam_id ?? index}`,
        level: Math.min(5, Math.max(1, jam.level ?? 1)),
        speedKmh: typeof jam.speed_kmh === 'number' ? jam.speed_kmh : null,
        lengthM: typeof jam.length_meters === 'number' ? jam.length_meters : null,
        towards: jam.end_location ?? undefined,
        coordinates: line
      };
    })
    .filter((value): value is TrafficJam => value !== null);
}

/** "HAZARD_ON_ROAD_POT_HOLE" -> "Pot hole on road". */
function prettifySubtype(subtype: string | null | undefined): string | undefined {
  if (!subtype) return undefined;
  const words = subtype.replace(/^(HAZARD|JAM|ACCIDENT|ROAD_CLOSED)_?/, '').replace(/_/g, ' ').trim().toLowerCase();
  if (!words) return undefined;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
