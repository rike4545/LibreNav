import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appEnv } from '@/lib/env';
import { RouteResponse } from '@/types/map';

const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

const routeSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
  options: z
    .object({
      avoidTolls: z.boolean().default(false),
      avoidHighways: z.boolean().default(false),
      avoidFerries: z.boolean().default(false),
      preferTwisty: z.boolean().default(false),
      alternatives: z.boolean().default(true)
    })
    .default({})
});

type ValhallaTrip = {
  legs?: Array<{
    shape?: string;
    summary?: {
      length?: number;
      time?: number;
      has_toll?: boolean;
      has_ferry?: boolean;
    };
    maneuvers?: Array<{
      instruction?: string;
      length?: number;
      time?: number;
      toll?: boolean;
      ferry?: boolean;
    }>;
  }>;
};

type ValhallaResponse = {
  trip?: ValhallaTrip;
  alternates?: Array<{ trip?: ValhallaTrip }>;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = routeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid route payload' }, { status: 400 });
  }

  const { origin, destination, options } = parsed.data;

  const costingOptions = {
    auto: {
      use_tolls: options.avoidTolls ? 0 : 0.6,
      use_highways: options.avoidHighways ? 0 : 0.7,
      use_ferry: options.avoidFerries ? 0 : 0.5,
      use_tracks: options.preferTwisty ? 0.35 : 0.05,
      top_speed: 75
    }
  };

  const valhallaRequest = {
    locations: [
      { lat: origin.lat, lon: origin.lng },
      { lat: destination.lat, lon: destination.lng }
    ],
    costing: 'auto',
    costing_options: costingOptions,
    directions_options: {
      units: 'kilometers'
    },
    alternatives: options.alternatives ? 2 : 0
  };

  const response = await fetch(new URL('/route', appEnv.valhallaUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valhallaRequest),
    cache: 'no-store'
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Valhalla request failed' }, { status: 502 });
  }

  const payload = (await response.json()) as ValhallaResponse;
  const primaryLeg = payload.trip?.legs?.[0];

  if (!primaryLeg?.shape) {
    return NextResponse.json({ error: 'No route geometry returned' }, { status: 502 });
  }

  const geometry = polylineToFeature(primaryLeg.shape);
  const result: RouteResponse = {
    geometry,
    summary: {
      distanceKm: primaryLeg.summary?.length ?? 0,
      durationMin: (primaryLeg.summary?.time ?? 0) / 60,
      hasToll: Boolean(primaryLeg.summary?.has_toll || primaryLeg.maneuvers?.some((maneuver) => maneuver.toll)),
      hasFerry: Boolean(primaryLeg.summary?.has_ferry || primaryLeg.maneuvers?.some((maneuver) => maneuver.ferry)),
      estimatedArrivalSoc: null
    },
    maneuvers: (primaryLeg.maneuvers ?? []).map((maneuver) => ({
      instruction: maneuver.instruction ?? 'Continue',
      distanceKm: maneuver.length ?? 0,
      timeMin: (maneuver.time ?? 0) / 60
    })),
    alternatives: (payload.alternates ?? [])
      .map((alternate, index) => {
        const leg = alternate.trip?.legs?.[0];
        if (!leg?.shape) return null;
        return {
          id: `alt-${index + 1}`,
          label: `Alt ${index + 1}`,
          distanceKm: leg.summary?.length ?? 0,
          durationMin: (leg.summary?.time ?? 0) / 60,
          geometry: polylineToFeature(leg.shape)
        };
      })
      .filter((value): value is RouteResponse['alternatives'][number] => value !== null)
  };

  return NextResponse.json(result);
}

function polylineToFeature(shape: string): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: decodePolyline6(shape)
    }
  };
}

function decodePolyline6(input: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];

  while (index < input.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = input.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = input.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lng / 1e6, lat / 1e6]);
  }

  return coordinates;
}
