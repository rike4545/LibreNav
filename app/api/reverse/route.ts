import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appEnv } from '@/lib/env';

const reverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

export async function GET(request: NextRequest) {
  const parsed = reverseSchema.safeParse({
    lat: request.nextUrl.searchParams.get('lat'),
    lng: request.nextUrl.searchParams.get('lng')
  });

  if (!parsed.success) {
    return NextResponse.json({ label: null }, { status: 400 });
  }

  const url = new URL('/reverse', appEnv.photonUrl);
  url.searchParams.set('lat', parsed.data.lat.toString());
  url.searchParams.set('lon', parsed.data.lng.toString());

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    return NextResponse.json({ label: null }, { status: 502 });
  }

  const payload = (await response.json()) as { features?: Array<{ properties?: Record<string, unknown> }> };
  const first = payload.features?.[0]?.properties ?? {};
  const label = [first.name, first.city, first.state, first.country].filter(Boolean).join(', ');

  return NextResponse.json({ label });
}
