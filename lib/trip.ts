import { RouteOptions, RouteResponse, VehicleProfile, Waypoint } from '@/types/map';
import { defaultRouteOptions } from '@/lib/storage';

/**
 * Trips serialize into the URL so a shared link restores every stop and the
 * routing preferences, not just a destination pin.
 *
 * Format: ?trip=lat,lng,name|lat,lng,name|…&opts=thfa
 */

export function encodeTrip(waypoints: Waypoint[], options: RouteOptions): string {
  const params = new URLSearchParams();

  const trip = waypoints
    .map((point) => {
      const lat = point.coordinate.lat.toFixed(5);
      const lng = point.coordinate.lng.toFixed(5);
      // Commas and pipes are the separators, so strip them from names.
      const name = point.name.replace(/[|,]/g, ' ').trim().slice(0, 60);
      return `${lat},${lng},${name}`;
    })
    .join('|');

  params.set('trip', trip);

  const flags = [
    options.avoidTolls ? 't' : '',
    options.avoidHighways ? 'h' : '',
    options.avoidFerries ? 'f' : '',
    options.preferTwisty ? 'w' : '',
    options.alternatives ? 'a' : ''
  ].join('');

  if (flags) params.set('opts', flags);
  return params.toString();
}

export function decodeTrip(search: string): { waypoints: Waypoint[]; options: RouteOptions } | null {
  const params = new URLSearchParams(search);
  const raw = params.get('trip');

  // Accept the older ?to=lat,lng&toName= links so existing shares keep working.
  if (!raw) {
    const legacy = params.get('to');
    if (!legacy) return null;
    const [lat, lng] = legacy.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      waypoints: [
        {
          id: 'shared-destination',
          name: params.get('toName') ?? 'Shared destination',
          label: params.get('toLabel') ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          coordinate: { lat, lng }
        }
      ],
      options: defaultRouteOptions
    };
  }

  const waypoints = raw
    .split('|')
    .map((chunk, index): Waypoint | null => {
      const [latRaw, lngRaw, ...nameParts] = chunk.split(',');
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

      const name = nameParts.join(',').trim();
      return {
        id: `shared-${index}-${lat},${lng}`,
        name: name || `Stop ${index + 1}`,
        label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        coordinate: { lat, lng }
      };
    })
    .filter((value): value is Waypoint => value !== null);

  if (!waypoints.length) return null;

  const flags = params.get('opts') ?? '';
  return {
    waypoints,
    options: {
      avoidTolls: flags.includes('t'),
      avoidHighways: flags.includes('h'),
      avoidFerries: flags.includes('f'),
      preferTwisty: flags.includes('w'),
      alternatives: flags.includes('a')
    }
  };
}

/* ------------------------------------------------------------ EV range model */

export type RangeEstimate = {
  /** Distance the current charge covers, in km. */
  rangeKm: number;
  /** Charge left on arrival, in percent. Negative means it won't make it. */
  arrivalSocPercent: number;
  /** Whether arrival charge stays above the driver's reserve. */
  reachable: boolean;
  /** Where along the route the charge runs to reserve, in km from the start. */
  reserveReachedKm: number | null;
};

/**
 * A deliberately simple energy model: usable charge divided by a flat
 * consumption rate. It ignores elevation, temperature, and speed, so treat the
 * output as a planning hint rather than a guarantee.
 */
export function estimateRange(route: RouteResponse | null, vehicle: VehicleProfile): RangeEstimate | null {
  if (!route || vehicle.batteryKwh <= 0 || vehicle.consumptionKwh100km <= 0) return null;

  const usableKwh = vehicle.batteryKwh * (vehicle.socPercent / 100);
  const rangeKm = (usableKwh / vehicle.consumptionKwh100km) * 100;

  const neededKwh = (route.summary.distanceKm / 100) * vehicle.consumptionKwh100km;
  const arrivalSocPercent = ((usableKwh - neededKwh) / vehicle.batteryKwh) * 100;

  const reserveKwh = vehicle.batteryKwh * (vehicle.reservePercent / 100);
  const distanceToReserveKm = ((usableKwh - reserveKwh) / vehicle.consumptionKwh100km) * 100;

  return {
    rangeKm,
    arrivalSocPercent,
    reachable: arrivalSocPercent >= vehicle.reservePercent,
    reserveReachedKm: distanceToReserveKm < route.summary.distanceKm ? Math.max(0, distanceToReserveKm) : null
  };
}
