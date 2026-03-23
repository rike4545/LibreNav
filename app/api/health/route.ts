import { NextResponse } from 'next/server';
import { appEnv } from '@/lib/env';

async function check(url: string) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

export async function GET() {
  const [photon, valhalla] = await Promise.all([
    check(new URL('/api?q=berlin&limit=1', appEnv.photonUrl).toString()),
    check(new URL('/status', appEnv.valhallaUrl).toString())
  ]);

  return NextResponse.json({ ok: photon === 'ok' && valhalla === 'ok', services: { photon, valhalla } });
}
