import { getEndpoints } from '@/lib/config';
import { buildCostingOptions } from '@/lib/services/routing';
import { RouteOptions, Waypoint } from '@/types/map';

type OptimizedLocation = { original_index?: number };
type OptimizedResponse = {
  locations?: OptimizedLocation[];
  trip?: { locations?: OptimizedLocation[] };
  error?: string;
};

export class TripOptimizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TripOptimizationError';
  }
}

/**
 * Reorders intermediate stops while keeping the origin, destination, and
 * explicitly locked stops fixed. Valhalla's optimized_route requires at least
 * four locations, so short locked segments are deliberately left untouched.
 */
export async function optimizeWaypoints(
  waypoints: Waypoint[],
  options: RouteOptions,
  signal?: AbortSignal
): Promise<Waypoint[]> {
  if (waypoints.length < 4) {
    throw new TripOptimizationError('Add at least two intermediate stops to optimize this trip.');
  }
  if (!['auto', 'bicycle', 'pedestrian'].includes(options.mode)) {
    throw new TripOptimizationError('Stop-order optimization is available for driving, cycling, and walking.');
  }

  const { valhallaUrl } = getEndpoints();
  const optimizeSegment = async (segment: Waypoint[]): Promise<Waypoint[]> => {
    if (segment.length < 4) return segment;

    const timeout = AbortSignal.timeout(20_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${valhallaUrl.replace(/\/+$/, '')}/optimized_route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: segment.map((point) => ({ lat: point.coordinate.lat, lon: point.coordinate.lng })),
          costing: options.mode,
          costing_options: buildCostingOptions(options),
          units: 'kilometers'
        }),
        signal: requestSignal
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeout.aborted || (error as Error).name === 'TimeoutError') {
        throw new TripOptimizationError('Trip optimization took too long. Please try again.');
      }
      throw new TripOptimizationError('Could not reach the optimization service. Check your connection.');
    }

    let payload: OptimizedResponse | null;
    try {
      payload = (await response.json()) as OptimizedResponse;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      if (response.status === 429) throw new TripOptimizationError('The routing service is busy. Wait a moment and try again.');
      if (response.status >= 500) throw new TripOptimizationError('The routing service is temporarily unavailable. Please try again shortly.');
      throw new TripOptimizationError(payload?.error || `Optimization failed (HTTP ${response.status}).`);
    }
    if (!payload || typeof payload !== 'object') {
      throw new TripOptimizationError('The optimization service returned an unreadable response.');
    }
    if (payload.error) throw new TripOptimizationError(payload.error);

    const locations = payload.locations ?? payload.trip?.locations;
    if (!Array.isArray(locations) || locations.length !== segment.length) {
      throw new TripOptimizationError('The optimization service returned an incomplete stop order.');
    }
    const indexes = locations.map((location) => location.original_index);
    if (
      indexes.some((index) => !Number.isInteger(index) || (index as number) < 0 || (index as number) >= segment.length) ||
      new Set(indexes).size !== segment.length ||
      indexes[0] !== 0 ||
      indexes[indexes.length - 1] !== segment.length - 1
    ) {
      throw new TripOptimizationError('The optimization service returned an invalid stop order.');
    }
    return (indexes as number[]).map((index) => segment[index]);
  };

  const ordered: Waypoint[] = [waypoints[0]];
  let anchor = 0;
  for (let index = 1; index < waypoints.length - 1; index += 1) {
    if (!waypoints[index].locked) continue;
    const segment = await optimizeSegment(waypoints.slice(anchor, index + 1));
    ordered.push(...segment.slice(1));
    anchor = index;
  }
  const finalSegment = await optimizeSegment(waypoints.slice(anchor));
  ordered.push(...finalSegment.slice(1));
  return ordered;
}
