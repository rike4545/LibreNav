import { cumulativeDistances, haversineMeters } from '@/lib/geometry';
import { fetchChargers } from '@/lib/services/overpass';
import { ChargerSite, Coordinate, RouteResponse, VehicleProfile, Waypoint } from '@/types/map';

/**
 * Working out where to charge on a trip the battery cannot finish.
 *
 * Deliberately planned against the *existing* route geometry rather than
 * re-routing per candidate: a detour to a charger a few km off the line barely
 * changes the trip, and re-routing for every candidate would mean dozens of
 * routing calls for one suggestion.
 */

/** Charge to this fraction — the last 20% is slow enough to rarely be worth it. */
const CHARGE_TO = 0.8;

/** Plan to arrive at each charger with this much headroom, not on empty. */
const ARRIVAL_BUFFER = 0.15;

/** How far off-route a charger may sit to still be considered. */
const SEARCH_RADIUS_KM = 8;

/** Give up rather than suggest an unusable chain of stops. */
const MAX_STOPS = 4;

export type ChargePlan = {
  /** Chargers to insert, in route order. */
  stops: ChargerSite[];
  /** True when the trip still cannot be completed with these stops. */
  incomplete: boolean;
  /** Set when we ran out of chargers before the trip was viable. */
  note?: string;
};

export class ChargePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChargePlanError';
  }
}

/** Point on the route at a given distance from the start. */
function pointAtDistance(
  coordinates: [number, number][],
  cumulative: number[],
  targetM: number
): { point: Coordinate; index: number } {
  if (targetM <= 0) return { point: { lng: coordinates[0][0], lat: coordinates[0][1] }, index: 0 };

  for (let i = 1; i < cumulative.length; i += 1) {
    if (cumulative[i] >= targetM) {
      return { point: { lng: coordinates[i][0], lat: coordinates[i][1] }, index: i };
    }
  }

  const last = coordinates.length - 1;
  return { point: { lng: coordinates[last][0], lat: coordinates[last][1] }, index: last };
}

/**
 * Score a charger for this leg.
 *
 * Power dominates: a 150 kW stop a little further along beats a 7 kW one right
 * on the ideal point, because the time saved charging outweighs the detour.
 * Reaching *past* the ideal point is disqualifying — that means arriving below
 * the buffer.
 */
function scoreCharger(charger: ChargerSite, ideal: Coordinate): number {
  const detourKm = haversineMeters(ideal, charger.coordinate) / 1000;
  const power = charger.powerKw ?? 7;
  return power - detourKm * 6;
}

/**
 * Chargers needed to complete `route` on the given charge.
 *
 * Assumes each stop charges to 80%. Returns an empty plan when the trip is
 * already reachable.
 */
export async function planChargingStops(
  route: RouteResponse,
  vehicle: VehicleProfile,
  climbKwh: number,
  signal?: AbortSignal
): Promise<ChargePlan> {
  if (vehicle.batteryKwh <= 0 || vehicle.consumptionKwh100km <= 0) {
    throw new ChargePlanError('Set a battery size and consumption first.');
  }

  const cumulative = cumulativeDistances(route.coordinates);
  const totalM = cumulative[cumulative.length - 1] ?? 0;
  if (totalM <= 0) return { stops: [], incomplete: false };

  // Spread the climb cost evenly rather than pretending it lands at one point;
  // per-segment elevation would be better but this keeps it to one pass.
  const kwhPerMetre = vehicle.consumptionKwh100km / 100 / 1000 + Math.max(0, climbKwh) / totalM;

  const reserveKwh = vehicle.batteryKwh * (vehicle.reservePercent / 100);
  let availableKwh = vehicle.batteryKwh * (vehicle.socPercent / 100) - reserveKwh;
  let coveredM = 0;

  const stops: ChargerSite[] = [];
  const used = new Set<string>();

  while (stops.length < MAX_STOPS) {
    const rangeM = availableKwh / kwhPerMetre;
    if (coveredM + rangeM >= totalM) return { stops, incomplete: false };

    // Aim short of the true limit so the driver arrives with headroom.
    const targetM = coveredM + rangeM * (1 - ARRIVAL_BUFFER);
    const { point } = pointAtDistance(route.coordinates, cumulative, targetM);

    const candidates = (await fetchChargers(point, SEARCH_RADIUS_KM, signal)).filter(
      (charger) => !used.has(charger.id)
    );

    if (!candidates.length) {
      return {
        stops,
        incomplete: true,
        note: 'No charger found where you would need one. Try a lower reserve or a different route.'
      };
    }

    const best = candidates.reduce((a, b) => (scoreCharger(b, point) > scoreCharger(a, point) ? b : a));
    used.add(best.id);
    stops.push(best);

    // Charging to 80% resets the budget, minus the reserve we keep back.
    availableKwh = vehicle.batteryKwh * CHARGE_TO - reserveKwh;
    coveredM = targetM;
  }

  return {
    stops,
    incomplete: true,
    note: `Needs more than ${MAX_STOPS} stops — this trip is beyond what this planner will suggest.`
  };
}

/** Turn planned chargers into waypoints inserted before the destination. */
export function chargersToWaypoints(chargers: ChargerSite[]): Waypoint[] {
  return chargers.map((charger, index) => ({
    id: `charge-${charger.id}-${index}`,
    name: charger.name,
    label: `${charger.network}${charger.powerKw ? ` · ${charger.powerKw} kW` : ''}`,
    coordinate: charger.coordinate
  }));
}
