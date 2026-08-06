import { getEndpoints } from '@/lib/config';
import { destinationPoint } from '@/lib/geometry';
import { fetchRoute } from '@/lib/services/routing';
import { Coordinate, RouteOptions, RouteResponse, Waypoint } from '@/types/map';

/**
 * Round-trip generation.
 *
 * Valhalla has no round-trip mode, so we approximate one: place waypoints on a
 * ring around the start, snap them onto real roads, and route through them back
 * to where we began. Vary the ring's rotation and you get a different drive
 * from the same start — which is the point for a meet or a Sunday loop.
 */

/** Waypoints on the ring. Six reads as a loop; fewer looks like an out-and-back. */
const RING_POINTS = 6;

/**
 * Roads never follow the straight line between waypoints, so the driven
 * distance overshoots the polygon joining them. Scale the ring down to
 * compensate; refinement below corrects whatever this misses.
 */
const DETOUR_FACTOR = 1.25;

/** Accept a loop within this fraction of the requested distance. */
const TOLERANCE = 0.18;

/**
 * Refinement passes. Each is a routing call (~1s), and three was not enough —
 * a 40 km request could still be 33% out when the loop ran out of attempts
 * mid-correction.
 */
const MAX_ATTEMPTS = 5;

export class LoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoopError';
  }
}

type LocateEdge = { correlated_lat?: number; correlated_lon?: number };
type LocateEntry = { edges?: LocateEdge[] };

/**
 * Pull generated points onto the road network.
 *
 * Without this a ring point can land in a lake or a field, and Valhalla either
 * fails the whole route or detours absurdly to reach it.
 */
async function snapToRoads(points: Coordinate[], signal?: AbortSignal): Promise<Coordinate[]> {
  const { valhallaUrl } = getEndpoints();

  const response = await fetch(`${valhallaUrl.replace(/\/+$/, '')}/locate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: points.map((point) => ({ lat: point.lat, lon: point.lng })),
      costing: 'auto',
      verbose: false
    }),
    signal
  }).catch(() => null);

  if (!response?.ok) return points;

  const payload = (await response.json().catch(() => null)) as LocateEntry[] | null;
  if (!Array.isArray(payload)) return points;

  return points.map((point, index) => {
    const edge = payload[index]?.edges?.[0];
    if (typeof edge?.correlated_lat !== 'number' || typeof edge?.correlated_lon !== 'number') {
      // Unsnappable point (offshore, private land) — keep the original and let
      // routing decide; dropping it would distort the loop's shape.
      return point;
    }
    return { lat: edge.correlated_lat, lng: edge.correlated_lon };
  });
}

/** Ring of waypoints around `start`, rotated by `rotationDeg`. */
function ringWaypoints(start: Coordinate, radiusM: number, rotationDeg: number): Coordinate[] {
  return Array.from({ length: RING_POINTS }, (_, index) => {
    const bearing = (rotationDeg + (360 / RING_POINTS) * index) % 360;
    return destinationPoint(start, bearing, radiusM);
  });
}

/**
 * Radius whose ring polygon, after road detour, is about `targetKm` around.
 * Perimeter of a regular k-gon inscribed in radius r is 2·k·r·sin(π/k).
 */
function radiusForTarget(targetKm: number): number {
  const polygonFactor = 2 * RING_POINTS * Math.sin(Math.PI / RING_POINTS);
  return (targetKm * 1000) / (polygonFactor * DETOUR_FACTOR);
}

export type GeneratedLoop = {
  waypoints: Waypoint[];
  route: RouteResponse;
  /** Actual driven distance, which will differ from the request. */
  distanceKm: number;
};

/**
 * Build a round trip of roughly `targetKm` starting and ending at `start`.
 *
 * `rotationDeg` seeds the ring's orientation — pass a different value to get a
 * different loop of the same length from the same place.
 *
 * The result can miss the target substantially, and the caller should surface
 * the distance actually found. Dense grids are the hard case: from Times Square
 * a 15 km request lands near 10 km however the ring is sized, because the
 * available streets simply don't compose a ring that length. Longer, less
 * constrained loops converge well — 40 km and 80 km both land inside tolerance.
 */
export async function generateLoop(
  start: Coordinate,
  targetKm: number,
  options: RouteOptions,
  rotationDeg = 0,
  signal?: AbortSignal
): Promise<GeneratedLoop> {
  if (targetKm < 2) throw new LoopError('Pick a loop of at least 2 km.');

  let radius = radiusForTarget(targetKm);
  let best: GeneratedLoop | null = null;

  // Bracket the answer rather than scaling by the miss. Driven distance is not
  // linear in ring radius — a small change can flip which roads get used — so
  // proportional correction overshoots badly in dense grids. Bisection only
  // needs "too long or too short", which is always reliable.
  let tooShort = 0;
  let tooLong = Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const ring = await snapToRoads(ringWaypoints(start, radius, rotationDeg), signal);
    const stops = [start, ...ring, start];

    let route: RouteResponse;
    try {
      // Alternates are meaningless for a loop and cost time, so force them off.
      route = await fetchRoute(stops, { ...options, alternatives: false }, signal);
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      // A ring point may be unroutable (island, gated road). Rotate slightly
      // and shrink a little rather than giving up on the whole loop.
      radius *= 0.85;
      rotationDeg = (rotationDeg + 17) % 360;
      continue;
    }

    const candidate: GeneratedLoop = {
      route,
      distanceKm: route.summary.distanceKm,
      waypoints: [
        { id: 'loop-start', name: 'Start', label: 'Round trip', coordinate: start },
        ...ring.map((point, index) => ({
          id: `loop-${index}`,
          name: `Via ${index + 1}`,
          label: `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
          coordinate: point
        })),
        { id: 'loop-end', name: 'Back to start', label: 'Round trip', coordinate: start }
      ]
    };

    // Keep whichever attempt lands closest to what was asked for.
    if (!best || Math.abs(candidate.distanceKm - targetKm) < Math.abs(best.distanceKm - targetKm)) {
      best = candidate;
    }

    const error = (candidate.distanceKm - targetKm) / targetKm;
    if (Math.abs(error) <= TOLERANCE) return candidate;

    if (candidate.distanceKm > targetKm) tooLong = radius;
    else tooShort = radius;

    // Until an upper bound exists there is nothing to bisect against, so grow
    // toward the target instead; afterwards, halve the bracket each pass.
    radius = Number.isFinite(tooLong)
      ? (tooShort + tooLong) / 2
      : radius * Math.min(2, Math.max(1.2, targetKm / Math.max(1, candidate.distanceKm)));
  }

  if (!best) throw new LoopError('Could not find a loop from here. Try a different distance or start point.');
  return best;
}
