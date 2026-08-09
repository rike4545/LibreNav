import { fetchRoute } from '@/lib/services/routing';
import { JamOnRoute, estimateTrafficDelay } from '@/lib/traffic';
import { Coordinate, RouteOptions, RouteResponse, SpeedLimitSpan, TrafficJam } from '@/types/map';

/**
 * Routing around live jams.
 *
 * Showing "+18 min traffic" tells a driver they are stuck; the useful thing is
 * offering the way round. Valhalla takes exclude_polygons, so a bad jam can be
 * fenced off and the route recomputed without it.
 */

export type RerouteSuggestion = {
  route: RouteResponse;
  /** Seconds saved against staying put, with both sides judged on live traffic. */
  savedSeconds: number;
  /** The jams the detour gets around. */
  avoided: JamOnRoute[];
};

/** Waze jam levels run 1–5; 4 and up is stationary-to-crawling. */
const SEVERE_LEVEL = 4;

/** Or any jam costing this long, however it is graded. */
const SEVERE_DELAY_SECONDS = 180;

/**
 * Don't interrupt for a trivial gain. A detour means unfamiliar roads, so it
 * has to be clearly better — not better within the noise of our own estimate.
 */
const MIN_SAVING_SECONDS = 120;

/**
 * Half-width of the fence drawn around a jam, in metres.
 *
 * Wide enough to catch the carriageway reliably, narrow enough not to swallow a
 * service road running alongside it. In a dense grid this can still exclude a
 * neighbouring street, which costs a slightly worse detour rather than a wrong
 * one.
 */
const FENCE_HALF_WIDTH_M = 20;

/**
 * The jams bad enough to be worth driving around. Exported so the caller can
 * decide whether to look for a detour at all without duplicating the rule.
 */
export function severeJams(onRouteJams: JamOnRoute[]): JamOnRoute[] {
  return onRouteJams.filter(
    (entry) => entry.jam.level >= SEVERE_LEVEL || entry.delaySeconds >= SEVERE_DELAY_SECONDS
  );
}

/**
 * Look for a way around the jams currently on the route.
 *
 * Returns null when nothing is bad enough to be worth avoiding, when no detour
 * exists, or when the detour is not meaningfully faster. The candidate is
 * scored against the same live jam list as the current route, so a detour that
 * merely swaps one queue for another is correctly rejected.
 */
export async function findJamDetour(
  stops: Coordinate[],
  options: RouteOptions,
  current: { durationMin: number; delaySeconds: number },
  onRouteJams: JamOnRoute[],
  allJams: TrafficJam[],
  speedLimits: SpeedLimitSpan[] = [],
  signal?: AbortSignal
): Promise<RerouteSuggestion | null> {
  const severe = severeJams(onRouteJams);
  if (!severe.length) return null;

  const polygons = severe.map((entry) => fenceAround(entry.jam));
  if (!polygons.length) return null;

  const candidate = await fetchRoute(stops, options, signal, polygons).catch(() => null);
  if (!candidate) return null;

  // Judge both sides on live traffic — a detour into a different jam is no gain.
  const candidateDelay = estimateTrafficDelay(allJams, candidate.coordinates, speedLimits);
  const candidateSeconds = candidate.summary.durationMin * 60 + candidateDelay.seconds;
  const currentSeconds = current.durationMin * 60 + current.delaySeconds;

  const savedSeconds = Math.round(currentSeconds - candidateSeconds);
  if (savedSeconds < MIN_SAVING_SECONDS) return null;

  return { route: candidate, savedSeconds, avoided: severe };
}

/**
 * A thin closed ribbon around the jam's polyline.
 *
 * A bounding box would be simpler but on a diagonal road it covers a large
 * square and blocks every parallel street inside it. Offsetting perpendicular
 * to each segment keeps the excluded area to roughly the road itself.
 */
export function fenceAround(jam: TrafficJam): number[][] {
  const line = jam.coordinates;
  if (line.length < 2) return [];

  const left: number[][] = [];
  const right: number[][] = [];

  for (let i = 0; i < line.length; i += 1) {
    // Direction from the neighbouring vertices, so corners get a sane normal.
    const previous = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];

    const latitude = line[i][1];
    const metresPerDegreeLng = 111_320 * Math.cos((latitude * Math.PI) / 180);
    const metresPerDegreeLat = 110_540;

    // Work in metres so the perpendicular is a real right angle, not one
    // skewed by longitude degrees shrinking toward the poles.
    const dx = (next[0] - previous[0]) * metresPerDegreeLng;
    const dy = (next[1] - previous[1]) * metresPerDegreeLat;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;

    const offsetLng = ((-dy / length) * FENCE_HALF_WIDTH_M) / metresPerDegreeLng;
    const offsetLat = ((dx / length) * FENCE_HALF_WIDTH_M) / metresPerDegreeLat;

    left.push([line[i][0] + offsetLng, line[i][1] + offsetLat]);
    right.push([line[i][0] - offsetLng, line[i][1] - offsetLat]);
  }

  if (left.length < 2) return [];

  // Up one side, back down the other, then close the ring.
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]);
  return ring;
}
