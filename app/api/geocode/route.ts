import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appEnv } from '@/lib/env';
import { parseLngLat } from '@/lib/utils';
import { SearchFeature } from '@/types/map';

const querySchema = z.object({
  q: z.string().trim().min(2)
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({ q: request.nextUrl.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ results: [] });
  }

  const url = new URL('/api', appEnv.photonUrl);
  url.searchParams.set('q', parsed.data.q);
  url.searchParams.set('limit', '8');

  const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) {
    return NextResponse.json({ results: [] }, { status: 502 });
  }

  const payload = (await response.json()) as {
    features?: Array<{
      properties?: Record<string, unknown>;
      geometry?: { coordinates?: number[] };
    }>;
  };

  const results: SearchFeature[] = (payload.features ?? [])
    .map((feature, index) => {
      const coordinate = parseLngLat(feature.geometry?.coordinates);
      if (!coordinate) return null;
      const props = feature.properties ?? {};
      const name = String(props.name ?? props.street ?? props.city ?? `Result ${index + 1}`);
      const label = String(props.country ? `${props.country}${props.state ? ` · ${props.state}` : ''}` : props.osm_value ?? name);
      return {
        id: String(props.osm_id ?? `${coordinate.lat},${coordinate.lng}`),
        name,
        label,
        coordinate
      } satisfies SearchFeature;
    })
    .filter((value): value is SearchFeature => value !== null);

  return NextResponse.json({ results });
}
