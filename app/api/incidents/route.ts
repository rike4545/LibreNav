import { NextResponse } from 'next/server';
import { appEnv } from '@/lib/env';
import { Incident } from '@/types/map';

export async function GET() {
  const incidents: Incident[] = [];

  if (appEnv.incidentFeedUrls.length) {
    const feeds = await Promise.all(
      appEnv.incidentFeedUrls.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) return [] as Incident[];
          const payload = (await response.json()) as unknown;
          return normalizeFeed(payload, url);
        } catch {
          return [] as Incident[];
        }
      })
    );
    feeds.flat().forEach((item) => incidents.push(item));
  }

  if (!incidents.length) {
    incidents.push(
      {
        id: 'sample-1',
        title: 'Construction lane shift',
        kind: 'construction',
        severity: 'medium',
        source: 'sample-feed',
        coordinate: { lat: 40.741, lng: -73.989 },
        updatedAt: new Date().toISOString(),
        description: 'Fallback demo incident until a live DOT or partner feed is configured.'
      },
      {
        id: 'sample-2',
        title: 'Debris reported on shoulder',
        kind: 'hazard',
        severity: 'low',
        source: 'sample-feed',
        coordinate: { lat: 40.728, lng: -73.94 },
        updatedAt: new Date().toISOString(),
        description: 'Use INCIDENT_FEED_URLS to point this endpoint at your own normalized JSON feeds.'
      }
    );
  }

  return NextResponse.json({ results: incidents.slice(0, 200) });
}

function normalizeFeed(payload: unknown, sourceUrl: string): Incident[] {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item, index) => {
      const record = item as Record<string, unknown>;
      const lat = asNumber(record.lat);
      const lng = asNumber(record.lng);
      if (lat === null || lng === null) return null;

      const kind = normalizeKind(record.kind);
      const severity = normalizeSeverity(record.severity);
      return {
        id: String(record.id ?? `${sourceUrl}-${index}`),
        title: String(record.title ?? record.description ?? 'Road incident'),
        kind,
        severity,
        source: String(record.source ?? sourceUrl),
        coordinate: { lat, lng },
        updatedAt: String(record.updatedAt ?? record.updated_at ?? new Date().toISOString()),
        description: typeof record.description === 'string' ? record.description : undefined
      } satisfies Incident;
    })
    .filter((value): value is Incident => value !== null);
}

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : null;
}

function normalizeKind(value: unknown): Incident['kind'] {
  const raw = String(value ?? '').toLowerCase();
  if (raw.includes('crash') || raw.includes('collision')) return 'crash';
  if (raw.includes('weather')) return 'weather';
  if (raw.includes('construction') || raw.includes('work')) return 'construction';
  if (raw.includes('camera')) return 'camera';
  if (raw.includes('closure') || raw.includes('closed')) return 'closure';
  return 'hazard';
}

function normalizeSeverity(value: unknown): Incident['severity'] {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'high' || raw === 'major') return 'high';
  if (raw === 'medium' || raw === 'moderate') return 'medium';
  return 'low';
}
