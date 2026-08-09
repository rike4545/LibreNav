import { getEndpoints } from '@/lib/config';
import { decodePolyline6 } from '@/lib/geometry';
import {
  Coordinate,
  TravelMode,
  ManeuverKind,
  RouteAlternative,
  RouteLeg,
  RouteManeuver,
  RouteOptions,
  RouteResponse
} from '@/types/map';

type ValhallaManeuver = {
  type?: number;
  instruction?: string;
  verbal_pre_transition_instruction?: string;
  verbal_succinct_transition_instruction?: string;
  verbal_post_transition_instruction?: string;
  street_names?: string[];
  length?: number;
  time?: number;
  toll?: boolean;
  ferry?: boolean;
  begin_shape_index?: number;
  roundabout_exit_count?: number;
  sign?: {
    exit_number_elements?: Array<{ text?: string }>;
    exit_branch_elements?: Array<{ text?: string }>;
    exit_toward_elements?: Array<{ text?: string }>;
  };
};

type ValhallaLeg = {
  shape?: string;
  summary?: { length?: number; time?: number; has_toll?: boolean; has_ferry?: boolean; has_highway?: boolean };
  maneuvers?: ValhallaManeuver[];
};

type ValhallaTrip = {
  legs?: ValhallaLeg[];
  summary?: { length?: number; time?: number; has_toll?: boolean; has_ferry?: boolean; has_highway?: boolean };
};

type ValhallaResponse = {
  trip?: ValhallaTrip;
  alternates?: Array<{ trip?: ValhallaTrip }>;
  error?: string;
  error_code?: number;
};

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingError';
  }
}

/**
 * Valhalla maneuver type ids → the icon shapes we render.
 * https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
 */
const MANEUVER_KINDS: Record<number, ManeuverKind> = {
  1: 'start',
  2: 'start',
  3: 'start',
  4: 'destination',
  5: 'destination',
  6: 'destination',
  7: 'continue',
  8: 'continue',
  9: 'slight-right',
  10: 'right',
  11: 'sharp-right',
  12: 'uturn',
  13: 'uturn',
  14: 'sharp-left',
  15: 'left',
  16: 'slight-left',
  17: 'ramp-straight',
  18: 'ramp-right',
  19: 'ramp-left',
  20: 'exit-right',
  21: 'exit-left',
  22: 'continue',
  23: 'slight-right',
  24: 'slight-left',
  25: 'merge',
  26: 'roundabout',
  27: 'roundabout',
  28: 'ferry',
  29: 'ferry',
  37: 'merge',
  38: 'merge'
};

/**
 * Costing weights for the chosen mode.
 *
 * Valhalla "use_*" weights run 0 (avoid) → 1 (prefer). A hard 0 makes routing
 * fail where the only path is tolled, so avoidance biases low rather than
 * forbidding. Each mode takes a different option bag — sending `auto` keys
 * under `bicycle` is simply ignored, which would make the toggles look broken.
 */
function buildCostingOptions(options: RouteOptions) {
  switch (options.mode) {
    case 'bicycle':
      return {
        bicycle: {
          // Riders asking for scenic want quiet lanes; otherwise favour directness.
          use_roads: options.preferTwisty ? 0.25 : 0.5,
          use_hills: options.preferTwisty ? 0.5 : 0.25,
          use_ferry: options.avoidFerries ? 0.1 : 0.5,
          bicycle_type: 'hybrid'
        }
      };
    case 'pedestrian':
      return {
        pedestrian: {
          walking_speed: 5.1,
          use_ferry: options.avoidFerries ? 0.1 : 0.5
        }
      };
    case 'motor_scooter':
      return {
        motor_scooter: {
          use_highways: options.avoidHighways ? 0.0 : 0.3,
          use_tolls: options.avoidTolls ? 0.1 : 0.5,
          use_ferry: options.avoidFerries ? 0.1 : 0.5,
          use_hills: options.preferTwisty ? 0.5 : 0.25
        }
      };
    case 'truck':
      return {
        truck: {
          use_tolls: options.avoidTolls ? 0.1 : 0.5,
          use_highways: options.avoidHighways ? 0.1 : 0.9,
          use_ferry: options.avoidFerries ? 0.1 : 0.5
        }
      };
    default:
      return {
        auto: {
          use_tolls: options.avoidTolls ? 0.1 : 0.5,
          use_highways: options.avoidHighways ? 0.1 : 0.7,
          use_ferry: options.avoidFerries ? 0.1 : 0.5,
          use_living_streets: options.preferTwisty ? 0.6 : 0.1,
          use_tracks: options.preferTwisty ? 0.3 : 0.0
        }
      };
  }
}

export async function fetchRoute(
  stops: Coordinate[],
  options: RouteOptions,
  signal?: AbortSignal,
  /**
   * Areas the route must not pass through, as Valhalla exclude_polygons:
   * an array of rings, each a list of [lng, lat] pairs. Used to route around
   * live jams.
   */
  excludePolygons?: number[][][]
): Promise<RouteResponse> {
  if (stops.length < 2) {
    throw new RoutingError('A route needs at least an origin and a destination.');
  }

  const { valhallaUrl } = getEndpoints();
  const body = {
    locations: stops.map((stop, index) => ({
      lat: stop.lat,
      lon: stop.lng,
      // Intermediate stops are "break" points so Valhalla emits per-leg
      // arrival maneuvers rather than routing straight through them.
      type: index === 0 || index === stops.length - 1 ? 'break' : 'break_through'
    })),
    costing: options.mode,
    costing_options: buildCostingOptions(options),
    directions_options: { units: 'kilometers' },
    // Alternates only apply to two-point routes in Valhalla.
    alternates: options.alternatives && stops.length === 2 ? 2 : 0,
    ...(excludePolygons?.length ? { exclude_polygons: excludePolygons } : {})
  };

  let response: Response;
  try {
    response = await fetch(`${trimSlash(valhallaUrl)}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new RoutingError('Could not reach the routing service. Check your connection or endpoint settings.');
  }

  const payload = (await response.json().catch(() => null)) as ValhallaResponse | null;

  if (!response.ok || !payload || payload.error) {
    throw new RoutingError(payload?.error || `Routing failed (HTTP ${response.status}).`);
  }

  const primary = parseTrip(payload.trip);
  if (!primary) {
    throw new RoutingError('No drivable route found between these stops.');
  }

  const alternatives = (payload.alternates ?? [])
    .map((alternate, index): RouteAlternative | null => {
      const parsed = parseTrip(alternate.trip);
      if (!parsed) return null;
      return {
        id: `alt-${index + 1}`,
        label: `Alt ${index + 1}`,
        distanceKm: parsed.summary.distanceKm,
        durationMin: parsed.summary.durationMin,
        hasToll: parsed.summary.hasToll,
        coordinates: parsed.coordinates
      };
    })
    .filter((value): value is RouteAlternative => value !== null);

  return { ...primary, alternatives };
}

function parseTrip(trip: ValhallaTrip | undefined): Omit<RouteResponse, 'alternatives'> | null {
  const legs = trip?.legs ?? [];
  if (!legs.length || !legs[0].shape) return null;

  const coordinates: [number, number][] = [];
  const maneuvers: RouteManeuver[] = [];
  const legSummaries: RouteLeg[] = [];

  legs.forEach((leg, legIndex) => {
    if (!leg.shape) return;
    const legShape = decodePolyline6(leg.shape);
    // Legs share a vertex at each waypoint; drop the duplicate when joining.
    const offset = coordinates.length === 0 ? 0 : coordinates.length - 1;
    if (coordinates.length === 0) {
      coordinates.push(...legShape);
    } else {
      coordinates.push(...legShape.slice(1));
    }

    legSummaries.push({
      distanceKm: leg.summary?.length ?? 0,
      durationMin: (leg.summary?.time ?? 0) / 60,
      startShapeIndex: offset,
      // Kept verbatim so trace_attributes can edge_walk it for speed limits.
      encodedShape: leg.shape
    });

    for (const maneuver of leg.maneuvers ?? []) {
      const localIndex = maneuver.begin_shape_index ?? 0;
      const shapeIndex = Math.min(offset + localIndex, coordinates.length - 1);
      const point = coordinates[shapeIndex];
      if (!point) continue;

      maneuvers.push({
        kind: MANEUVER_KINDS[maneuver.type ?? 8] ?? 'continue',
        instruction: maneuver.instruction ?? 'Continue',
        verbalInstruction: maneuver.verbal_pre_transition_instruction ?? maneuver.verbal_succinct_transition_instruction,
        verbalPostInstruction: maneuver.verbal_post_transition_instruction,
        streetNames: maneuver.street_names ?? [],
        distanceKm: maneuver.length ?? 0,
        timeMin: (maneuver.time ?? 0) / 60,
        coordinate: { lng: point[0], lat: point[1] },
        shapeIndex,
        sign: parseSign(maneuver.sign),
        roundaboutExit: maneuver.roundabout_exit_count,
        legIndex
      });
    }
  });

  if (coordinates.length < 2) return null;

  const totals = legs.reduce(
    (acc, leg) => ({
      distanceKm: acc.distanceKm + (leg.summary?.length ?? 0),
      durationMin: acc.durationMin + (leg.summary?.time ?? 0) / 60,
      hasToll: acc.hasToll || Boolean(leg.summary?.has_toll),
      hasFerry: acc.hasFerry || Boolean(leg.summary?.has_ferry),
      hasHighway: acc.hasHighway || Boolean(leg.summary?.has_highway)
    }),
    { distanceKm: 0, durationMin: 0, hasToll: false, hasFerry: false, hasHighway: false }
  );

  return { coordinates, maneuvers, legs: legSummaries, summary: totals };
}

function parseSign(sign: ValhallaManeuver['sign']): RouteManeuver['sign'] {
  if (!sign) return undefined;
  const text = (elements?: Array<{ text?: string }>) =>
    (elements ?? []).map((element) => element.text).filter((value): value is string => Boolean(value));

  const exitNumbers = text(sign.exit_number_elements);
  const exitBranches = text(sign.exit_branch_elements);
  const exitToward = text(sign.exit_toward_elements);

  if (!exitNumbers.length && !exitBranches.length && !exitToward.length) return undefined;
  return { exitNumbers, exitBranches, exitToward };
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, '');
}
