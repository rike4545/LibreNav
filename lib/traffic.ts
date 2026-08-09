import { haversineMeters } from '@/lib/geometry';
import { limitAtIndex } from '@/lib/services/roadinfo';
import { SpeedLimitSpan, TrafficJam } from '@/types/map';

export type TrafficDelay = {
  /** Extra seconds the jams add over free-flow. */
  seconds: number;
  /** How many jams actually sit on this route. */
  jamCount: number;
  /** Metres of route covered by jams. */
  affectedMetres: number;
  /** The jams that genuinely sit on this route, worst delay first. */
  onRoute: JamOnRoute[];
};

export type JamOnRoute = {
  jam: TrafficJam;
  /** Index into the route geometry where the jam was matched. */
  shapeIndex: number;
  /** Seconds this one jam costs. */
  delaySeconds: number;
  /** Free-flow speed used, from the posted limit where one is known. */
  freeFlowKmh: number;
};

/** Jam geometry must sit this close to the route to count as on it. */
const ON_ROUTE_M = 45;

/**
 * Fallback free-flow speed, used only where OSM carries no maxspeed tag.
 *
 * The posted limit is far better and is used whenever it is known — a jam
 * crawling at 8 km/h costs much more against a motorway's 110 than against an
 * urban 50, and assuming 50 everywhere understated exactly the delays drivers
 * most want warning about.
 */
const ASSUMED_FREE_FLOW_KMH = 50;

/**
 * Delay contributed by jams that lie on the route.
 *
 * Jams arrive for a bounding box, so most of them are on other roads. Each is
 * tested against the route geometry and skipped unless it genuinely overlaps —
 * otherwise a jam on a parallel street would inflate the ETA.
 */
export function estimateTrafficDelay(
  jams: TrafficJam[],
  routeCoordinates: [number, number][],
  speedLimits: SpeedLimitSpan[] = []
): TrafficDelay {
  const empty: TrafficDelay = { seconds: 0, jamCount: 0, affectedMetres: 0, onRoute: [] };
  if (!jams.length || routeCoordinates.length < 2) return empty;

  const onRoute: JamOnRoute[] = [];
  let seconds = 0;
  let affectedMetres = 0;

  for (const jam of jams) {
    const shapeIndex = matchToRoute(jam, routeCoordinates);
    if (shapeIndex < 0) continue;

    const metres = jam.lengthM ?? jamLengthMetres(jam);
    if (metres <= 0) continue;

    // Use the posted limit where the jam actually is; fall back only when OSM
    // has no tag for that stretch.
    const freeFlowKmh = limitAtIndex(speedLimits, shapeIndex)?.limitKmh ?? ASSUMED_FREE_FLOW_KMH;

    // A jam with no reported speed still means congestion; assume crawling
    // rather than discarding it.
    const jamSpeed = jam.speedKmh && jam.speedKmh > 0 ? jam.speedKmh : 8;
    if (jamSpeed >= freeFlowKmh) continue;

    const jammedSeconds = metres / ((jamSpeed * 1000) / 3600);
    const freeSeconds = metres / ((freeFlowKmh * 1000) / 3600);
    const delaySeconds = Math.max(0, jammedSeconds - freeSeconds);

    seconds += delaySeconds;
    affectedMetres += metres;
    onRoute.push({ jam, shapeIndex, delaySeconds, freeFlowKmh });
  }

  onRoute.sort((a, b) => b.delaySeconds - a.delaySeconds);

  return { seconds, jamCount: onRoute.length, affectedMetres, onRoute };
}

/**
 * Index of the route vertex the jam sits on, or -1 when it is on another road.
 *
 * Returns the position as well as the yes/no so callers can look up the posted
 * limit there and tell whether the jam is still ahead of the driver.
 */
function matchToRoute(jam: TrafficJam, route: [number, number][]): number {
  // Sampling a few points is enough and keeps this cheap; jams are short.
  const step = Math.max(1, Math.floor(jam.coordinates.length / 4));

  for (let i = 0; i < jam.coordinates.length; i += step) {
    const point = { lng: jam.coordinates[i][0], lat: jam.coordinates[i][1] };
    for (let v = 0; v < route.length; v += 1) {
      if (haversineMeters(point, { lng: route[v][0], lat: route[v][1] }) <= ON_ROUTE_M) return v;
    }
  }

  return -1;
}

function jamLengthMetres(jam: TrafficJam): number {
  let total = 0;
  for (let i = 1; i < jam.coordinates.length; i += 1) {
    total += haversineMeters(
      { lng: jam.coordinates[i - 1][0], lat: jam.coordinates[i - 1][1] },
      { lng: jam.coordinates[i][0], lat: jam.coordinates[i][1] }
    );
  }
  return total;
}
