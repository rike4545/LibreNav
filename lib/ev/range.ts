/**
 * Pure EV range estimation.
 *
 * Kept separate from trip URL serialization and browser/service code so the
 * calculation can be tested deterministically and evaluated for reuse.
 * This is a planning estimate, not a promise of real-world range.
 */

export type RangeVehicleProfile = {
  /** Usable battery capacity in kWh. */
  batteryKwh: number;
  /** Average consumption in kWh per 100 km. */
  consumptionKwh100km: number;
  /** Current state of charge, from 0 to 100. */
  socPercent: number;
  /** Desired charge remaining on arrival, from 0 to 100. */
  reservePercent: number;
};

export type RangeRoute = {
  summary: {
    /** Route distance in kilometres. */
    distanceKm: number;
  };
};

export type RangeEstimate = {
  /** Distance the current charge covers, in km. */
  rangeKm: number;
  /** kWh the net climb adds (negative when the trip descends overall). */
  climbKwh: number;
  /** Charge left on arrival, in percent. Negative means it won't make it. */
  arrivalSocPercent: number;
  /** Whether arrival charge stays above the driver's reserve. */
  reachable: boolean;
  /** Where along the route the charge runs to reserve, in km from the start. */
  reserveReachedKm: number | null;
};

/**
 * Energy model: flat consumption over distance, plus terrain energy.
 *
 * The caller provides the net terrain energy estimate. Temperature, speed,
 * payload, battery health, wind, and driving style are not modelled.
 */
export function estimateRange(
  route: RangeRoute | null,
  vehicle: RangeVehicleProfile,
  climbKwh = 0
): RangeEstimate | null {
  if (
    !route ||
    !Number.isFinite(vehicle.batteryKwh) ||
    !Number.isFinite(vehicle.consumptionKwh100km) ||
    !Number.isFinite(vehicle.socPercent) ||
    !Number.isFinite(vehicle.reservePercent) ||
    !Number.isFinite(climbKwh) ||
    vehicle.batteryKwh <= 0 ||
    vehicle.consumptionKwh100km <= 0 ||
    vehicle.socPercent < 0 ||
    vehicle.socPercent > 100 ||
    vehicle.reservePercent < 0 ||
    vehicle.reservePercent > 100 ||
    !Number.isFinite(route.summary.distanceKm) ||
    route.summary.distanceKm < 0
  ) {
    return null;
  }

  const usableKwh = vehicle.batteryKwh * (vehicle.socPercent / 100);
  const rangeKm = (usableKwh / vehicle.consumptionKwh100km) * 100;

  const neededKwh = (route.summary.distanceKm / 100) * vehicle.consumptionKwh100km + climbKwh;
  const arrivalSocPercent = ((usableKwh - neededKwh) / vehicle.batteryKwh) * 100;

  const reserveKwh = vehicle.batteryKwh * (vehicle.reservePercent / 100);
  const distanceToReserveKm =
    ((usableKwh - reserveKwh - Math.max(0, climbKwh)) / vehicle.consumptionKwh100km) * 100;

  return {
    rangeKm,
    climbKwh,
    arrivalSocPercent,
    reachable: arrivalSocPercent >= vehicle.reservePercent,
    reserveReachedKm: distanceToReserveKm < route.summary.distanceKm ? Math.max(0, distanceToReserveKm) : null
  };
}
