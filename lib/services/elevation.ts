import { getEndpoints } from '@/lib/config';
import { samplePath } from '@/lib/geometry';

/**
 * Elevation along a route, from Valhalla's /height endpoint.
 *
 * With `range: true` it returns [distanceFromStart, height] pairs, so one call
 * gives both the profile to draw and the climb totals the energy model needs.
 */

export type ElevationProfile = {
  /** [metres along route, metres above sea level]. */
  points: Array<[number, number]>;
  /** Total metres climbed, ignoring descents. */
  ascentM: number;
  /** Total metres descended. */
  descentM: number;
  minM: number;
  maxM: number;
};

/** Ignore wobbles smaller than this; DEM noise would otherwise inflate ascent. */
const NOISE_FLOOR_M = 3;

export async function fetchElevationProfile(
  path: [number, number][],
  signal?: AbortSignal
): Promise<ElevationProfile | null> {
  if (path.length < 2) return null;

  // The endpoint caps how many points it will take, and a dense route would
  // blow past it, so sample proportionally to length.
  const sampled = samplePath(path, Math.max(100, Math.round(path.length / 120) * 100)).slice(0, 500);
  if (sampled.length < 2) return null;

  const { valhallaUrl } = getEndpoints();

  const response = await fetch(`${valhallaUrl.replace(/\/+$/, '')}/height`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      range: true,
      shape: sampled.map((point) => ({ lat: point.lat, lon: point.lng }))
    }),
    signal
  }).catch(() => null);

  if (!response?.ok) return null;

  const payload = (await response.json().catch(() => null)) as { range_height?: Array<[number, number]> } | null;
  const raw = payload?.range_height;
  if (!Array.isArray(raw) || raw.length < 2) return null;

  const points = raw.filter(
    (pair): pair is [number, number] =>
      Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'number'
  );
  if (points.length < 2) return null;

  let ascentM = 0;
  let descentM = 0;
  let minM = points[0][1];
  let maxM = points[0][1];
  let reference = points[0][1];

  for (const [, height] of points) {
    if (height < minM) minM = height;
    if (height > maxM) maxM = height;

    // Only bank a change once it exceeds the noise floor, then move the
    // reference — otherwise every sample's jitter counts as a climb.
    const delta = height - reference;
    if (Math.abs(delta) >= NOISE_FLOOR_M) {
      if (delta > 0) ascentM += delta;
      else descentM += -delta;
      reference = height;
    }
  }

  return { points, ascentM, descentM, minM, maxM };
}

/**
 * Extra energy for the net climb, in kWh.
 *
 * Potential energy is m·g·h; dividing by drivetrain efficiency accounts for
 * losses on the way up. Descent returns some of it through regeneration, but
 * far less than it took, so the two are weighted differently.
 */
export function climbEnergyKwh(
  ascentM: number,
  descentM: number,
  vehicleMassKg = 2000,
  drivetrainEfficiency = 0.85,
  regenEfficiency = 0.6
): number {
  const joulesPerMetre = vehicleMassKg * 9.81;
  const climbKwh = (ascentM * joulesPerMetre) / drivetrainEfficiency / 3_600_000;
  const regainedKwh = (descentM * joulesPerMetre * regenEfficiency) / 3_600_000;
  return climbKwh - regainedKwh;
}
