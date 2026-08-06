import { haversineMeters } from '@/lib/geometry';
import { TrafficJam } from '@/types/map';

export type TrafficDelay = {
  /** Extra seconds the jams add over free-flow. */
  seconds: number;
  /** How many jams actually sit on this route. */
  jamCount: number;
  /** Metres of route covered by jams. */
  affectedMetres: number;
};

/** Jam geometry must sit this close to the route to count as on it. */
const ON_ROUTE_M = 45;

/**
 * Assumed free-flow speed when computing what a jam costs.
 *
 * Valhalla gives a duration for the whole route, not per segment, so we can't
 * read the uncongested speed for exactly these metres. 50 km/h is a reasonable
 * urban stand-in — the figure this produces is a rough delay, and it's labelled
 * as such rather than folded silently into the arrival time.
 */
const ASSUMED_FREE_FLOW_KMH = 50;

/**
 * Delay contributed by jams that lie on the route.
 *
 * Jams arrive for a bounding box, so most of them are on other roads. Each is
 * tested against the route geometry and skipped unless it genuinely overlaps —
 * otherwise a jam on a parallel street would inflate the ETA.
 */
export function estimateTrafficDelay(jams: TrafficJam[], routeCoordinates: [number, number][]): TrafficDelay {
  if (!jams.length || routeCoordinates.length < 2) {
    return { seconds: 0, jamCount: 0, affectedMetres: 0 };
  }

  let seconds = 0;
  let jamCount = 0;
  let affectedMetres = 0;

  for (const jam of jams) {
    if (!isOnRoute(jam, routeCoordinates)) continue;

    const metres = jam.lengthM ?? jamLengthMetres(jam);
    if (metres <= 0) continue;

    // A jam with no reported speed still means congestion; assume crawling
    // rather than discarding it.
    const jamSpeed = jam.speedKmh && jam.speedKmh > 0 ? jam.speedKmh : 8;
    if (jamSpeed >= ASSUMED_FREE_FLOW_KMH) continue;

    const jammedSeconds = metres / ((jamSpeed * 1000) / 3600);
    const freeSeconds = metres / ((ASSUMED_FREE_FLOW_KMH * 1000) / 3600);

    seconds += Math.max(0, jammedSeconds - freeSeconds);
    affectedMetres += metres;
    jamCount += 1;
  }

  return { seconds, jamCount, affectedMetres };
}

/** True when any sampled point of the jam falls within the route corridor. */
function isOnRoute(jam: TrafficJam, route: [number, number][]): boolean {
  // Sampling a few points is enough and keeps this cheap; jams are short.
  const step = Math.max(1, Math.floor(jam.coordinates.length / 4));

  for (let i = 0; i < jam.coordinates.length; i += step) {
    const point = { lng: jam.coordinates[i][0], lat: jam.coordinates[i][1] };
    for (const vertex of route) {
      if (haversineMeters(point, { lng: vertex[0], lat: vertex[1] }) <= ON_ROUTE_M) return true;
    }
  }

  return false;
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
