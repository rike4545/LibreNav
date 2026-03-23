import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appEnv } from '@/lib/env';
import { ChargerSite } from '@/types/map';

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(40).default(8)
});

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    lat: request.nextUrl.searchParams.get('lat'),
    lng: request.nextUrl.searchParams.get('lng'),
    radiusKm: request.nextUrl.searchParams.get('radiusKm') ?? 8
  });

  if (!parsed.success) {
    return NextResponse.json({ results: [] }, { status: 400 });
  }

  const { lat, lng, radiusKm } = parsed.data;
  const radiusMeters = Math.round(radiusKm * 1000);
  const overpassQuery = `
    [out:json][timeout:18];
    (
      node["amenity"="charging_station"](around:${radiusMeters},${lat},${lng});
      way["amenity"="charging_station"](around:${radiusMeters},${lat},${lng});
      relation["amenity"="charging_station"](around:${radiusMeters},${lat},${lng});
    );
    out center tags;
  `;

  const response = await fetch(appEnv.overpassUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: overpassQuery,
    cache: 'no-store'
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json({ results: [] }, { status: 502 });
  }

  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const results: ChargerSite[] = (payload.elements ?? [])
    .map((element) => {
      const point = element.center ?? (typeof element.lat === 'number' && typeof element.lon === 'number' ? { lat: element.lat, lon: element.lon } : null);
      if (!point) return null;
      const tags = element.tags ?? {};
      const socketMap: Array<[string, string]> = [
        ['socket:type2', 'Type 2'],
        ['socket:ccs', 'CCS'],
        ['socket:tesla_supercharger', 'Tesla Supercharger'],
        ['socket:tesla_destination', 'Tesla Destination'],
        ['socket:chademo', 'CHAdeMO'],
        ['socket:type2_combo', 'CCS Combo']
      ];
      const plugs = socketMap
        .filter(([key]) => tags[key] && tags[key] !== 'no')
        .map(([, label]) => label);

      const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ');
      return {
        id: String(element.id),
        name: tags.name ?? tags.operator ?? 'Charging station',
        network: tags.network ?? tags.operator ?? 'Unknown network',
        plugs: plugs.length ? plugs : ['Unknown plug'],
        powerKw: tags['socket:output'] ? Number.parseInt(tags['socket:output'], 10) || null : null,
        coordinate: { lat: point.lat, lng: point.lon },
        address: address || undefined
      } satisfies ChargerSite;
    })
    .filter((value): value is ChargerSite => value !== null)
    .slice(0, 100);

  return NextResponse.json({ results });
}
