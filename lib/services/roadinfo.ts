import { getEndpoints } from '@/lib/config';
import { RouteLeg, SpeedLimitSpan, TravelMode } from '@/types/map';

type TraceEdge = {
  speed_limit?: number;
  names?: string[];
  begin_shape_index?: number;
  end_shape_index?: number;
};

type TraceResponse = {
  edges?: TraceEdge[];
  error?: string;
};

/**
 * Posted speed limits along a route.
 *
 * Valhalla's /route response carries no speed limits, but /trace_attributes
 * does. Replaying the route's own encoded polyline with shape_match=edge_walk
 * makes the returned begin/end_shape_index line up with our geometry exactly,
 * so this is one call per route rather than per GPS tick.
 *
 * Limits come back in the requested units (km/h here) and are null wherever
 * OSM carries no maxspeed tag — which is a lot of roads.
 */
export async function fetchSpeedLimits(
  legs: RouteLeg[],
  mode: TravelMode = 'auto',
  signal?: AbortSignal
): Promise<SpeedLimitSpan[]> {
  const { valhallaUrl } = getEndpoints();
  const spans: SpeedLimitSpan[] = [];

  for (const leg of legs) {
    if (!leg.encodedShape) continue;

    let response: Response;
    try {
      response = await fetch(`${valhallaUrl.replace(/\/+$/, '')}/trace_attributes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encoded_polyline: leg.encodedShape,
          costing: mode,
          shape_match: 'edge_walk',
          directions_options: { units: 'kilometers' },
          filters: {
            attributes: ['edge.speed_limit', 'edge.names', 'edge.begin_shape_index', 'edge.end_shape_index'],
            action: 'include'
          }
        }),
        signal
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      // Speed limits are an enhancement; a failure shouldn't break navigation.
      return spans;
    }

    if (!response.ok) return spans;
    const payload = (await response.json().catch(() => null)) as TraceResponse | null;
    if (!payload?.edges) return spans;

    for (const edge of payload.edges) {
      const begin = edge.begin_shape_index;
      const end = edge.end_shape_index;
      if (typeof begin !== 'number' || typeof end !== 'number' || end <= begin) continue;

      spans.push({
        // Leg shapes are concatenated into one geometry; shift into that frame.
        startIndex: leg.startShapeIndex + begin,
        endIndex: leg.startShapeIndex + end,
        limitKmh: typeof edge.speed_limit === 'number' && edge.speed_limit > 0 ? edge.speed_limit : null,
        roadName: edge.names?.[0]
      });
    }
  }

  return spans.sort((a, b) => a.startIndex - b.startIndex);
}

/** Posted limit at a point on the route, or null where OSM has no tag. */
export function limitAtIndex(spans: SpeedLimitSpan[], shapeIndex: number): SpeedLimitSpan | null {
  // Spans are sorted and non-overlapping, so binary search the containing run.
  let lo = 0;
  let hi = spans.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const span = spans[mid];
    if (shapeIndex < span.startIndex) hi = mid - 1;
    else if (shapeIndex >= span.endIndex) lo = mid + 1;
    else return span;
  }

  return null;
}
