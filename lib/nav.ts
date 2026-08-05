import { cumulativeDistances, distanceAlong, snapToPath } from '@/lib/geometry';
import { RouteManeuver, RouteResponse, UserPosition } from '@/types/map';

export type NavProgress = {
  /** Index into route.maneuvers of the turn being approached. */
  stepIndex: number;
  /** Metres until that maneuver. */
  distanceToManeuverM: number;
  /** Metres left to the final destination. */
  remainingDistanceM: number;
  /** Seconds left, scaled by how the driver is actually doing against plan. */
  remainingSeconds: number;
  /** Perpendicular distance from the route. */
  offRouteM: number;
  isOffRoute: boolean;
  /** Snapped position, for drawing the puck on the road rather than beside it. */
  snapped: { lat: number; lng: number };
  /** Bearing of the road ahead, for the follow camera. */
  courseDeg: number | null;
  /** Portion of the route already driven, 0–1. */
  fraction: number;
  /**
   * Geometry vertex the driver matched to. Feed this back as the next call's
   * hint so the windowed scan stays centred on the driver.
   */
  shapeIndex: number;
};

/**
 * Precomputed per-route tables. Building these on every GPS tick would be
 * wasteful on a long route, so the caller holds one of these per route.
 */
export type NavIndex = {
  cumulative: number[];
  /** Distance from route start to each maneuver. */
  maneuverDistances: number[];
  totalM: number;
  totalSeconds: number;
};

export function buildNavIndex(route: RouteResponse): NavIndex {
  const cumulative = cumulativeDistances(route.coordinates);
  const totalM = cumulative[cumulative.length - 1] ?? 0;

  return {
    cumulative,
    maneuverDistances: route.maneuvers.map((maneuver) => cumulative[maneuver.shapeIndex] ?? 0),
    totalM,
    totalSeconds: route.summary.durationMin * 60
  };
}

/** Treat the driver as off-route beyond this perpendicular distance. */
const OFF_ROUTE_M = 55;

export function computeProgress(
  route: RouteResponse,
  index: NavIndex,
  position: UserPosition,
  hintShapeIndex: number
): NavProgress | null {
  const snap = snapToPath(position.coordinate, route.coordinates, hintShapeIndex);
  if (!snap) return null;

  const travelled = distanceAlong(snap, route.coordinates, index.cumulative);
  const remainingDistanceM = Math.max(0, index.totalM - travelled);

  // The upcoming maneuver is the first one still ahead of us. A small backward
  // tolerance stops the step flapping while sitting in an intersection.
  let stepIndex = route.maneuvers.length - 1;
  for (let i = 0; i < index.maneuverDistances.length; i += 1) {
    if (index.maneuverDistances[i] > travelled + 5) {
      stepIndex = i;
      break;
    }
  }

  const distanceToManeuverM = Math.max(0, index.maneuverDistances[stepIndex] - travelled);

  // Scale the plan's remaining time by progress so a slow driver's ETA drifts
  // out rather than staying pinned to Valhalla's original estimate.
  const fraction = index.totalM > 0 ? travelled / index.totalM : 0;
  const remainingSeconds = index.totalSeconds * (1 - fraction);

  return {
    stepIndex,
    distanceToManeuverM,
    remainingDistanceM,
    remainingSeconds,
    offRouteM: snap.distanceM,
    // GPS accuracy varies wildly; don't call a reroute on a bad fix alone.
    isOffRoute: snap.distanceM > Math.max(OFF_ROUTE_M, (position.accuracyM ?? 0) * 1.5),
    snapped: snap.snapped,
    courseDeg: courseAt(route.coordinates, snap.index),
    fraction: Math.min(1, Math.max(0, fraction)),
    shapeIndex: snap.index
  };
}

/** Bearing of the road a short way ahead, smoothed over a few vertices. */
function courseAt(path: [number, number][], index: number): number | null {
  const ahead = Math.min(path.length - 1, index + 3);
  if (ahead <= index) return null;

  const a = path[index];
  const b = path[ahead];
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function formatEtaClock(remainingSeconds: number): string {
  const arrival = new Date(Date.now() + remainingSeconds * 1000);
  return arrival.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDistanceM(meters: number, imperial = false): string {
  if (imperial) {
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`;
    return `${(feet / 5280).toFixed(feet / 5280 < 10 ? 1 : 0)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters / 1000 < 10 ? 1 : 0)} km`;
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours} h ${totalMinutes % 60} min`;
}

/**
 * Announcement thresholds in ascending order, so `find` picks the *tightest*
 * band the driver is currently inside. Ordering matters: with a descending
 * list every distance under 1600 m matches the 1600 m band first, that band is
 * then marked as announced, and the 800/250/60 m calls never fire — one
 * announcement per turn instead of four.
 */
const ANNOUNCE_BANDS = [60, 250, 800, 1600];

export function announcementFor(
  maneuver: RouteManeuver,
  distanceM: number,
  alreadyAnnounced: Set<string>,
  imperial: boolean
): string | null {
  const band = ANNOUNCE_BANDS.find((threshold) => distanceM <= threshold);
  if (band === undefined) return null;

  const key = `${maneuver.shapeIndex}:${band}`;
  if (alreadyAnnounced.has(key)) return null;
  alreadyAnnounced.add(key);

  const spoken = maneuver.verbalInstruction || maneuver.instruction;
  // Close in, drop the distance preamble — "in 60 metres turn right" is noise.
  if (band <= 60) return spoken;
  return `In ${formatDistanceM(band, imperial)}, ${lowerFirst(spoken)}`;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
