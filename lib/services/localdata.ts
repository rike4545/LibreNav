import { LOCAL_DATA_BASE, getLocalDataKey } from '@/lib/config';
import { Coordinate, SearchFeature } from '@/types/map';

/**
 * Optional enrichment from OpenWeb Ninja's Real-Time Local & Maps Data.
 *
 * Everything here is a no-op without a key, and every failure degrades to an
 * empty list — the OSM stack (Photon + Overpass) remains the app's baseline so
 * the public deployment keeps working for people who have no key of their own.
 */

export function hasLocalDataKey(): boolean {
  return getLocalDataKey().length > 0;
}

type BusinessRecord = {
  business_id?: string;
  place_id?: string;
  name?: string;
  full_address?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  rating?: number;
  review_count?: number;
  type?: string;
  opening_status?: string;
  phone_number?: string;
  website?: string;
};

type SearchEnvelope = {
  status?: string;
  data?: BusinessRecord[] | { results?: BusinessRecord[] };
  error?: { message?: string };
};

/** The payload nests results under `data` — tolerate both shapes seen in the wild. */
function recordsOf(payload: SearchEnvelope): BusinessRecord[] {
  const data = payload.data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

function coordinateOf(record: BusinessRecord): Coordinate | null {
  const lat = record.latitude ?? record.lat;
  const lng = record.longitude ?? record.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export class LocalDataError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'LocalDataError';
  }
}

/**
 * Business search biased to a location.
 *
 * Complements Photon rather than replacing it: Photon is strong on addresses
 * and geography, this is strong on businesses (ratings, opening status), which
 * is exactly where OSM tagging tends to be thin.
 */
export async function searchBusinesses(
  query: string,
  options: { near?: Coordinate | null; limit?: number; signal?: AbortSignal } = {}
): Promise<SearchFeature[]> {
  const key = getLocalDataKey();
  const trimmed = query.trim();
  if (!key || trimmed.length < 2) return [];

  const url = new URL(`${LOCAL_DATA_BASE}/local-business-data/search`);
  url.searchParams.set('query', trimmed);
  url.searchParams.set('limit', String(Math.min(Math.max(options.limit ?? 10, 1), 20)));
  if (options.near) {
    url.searchParams.set('lat', options.near.lat.toFixed(6));
    url.searchParams.set('lng', options.near.lng.toFixed(6));
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    url.searchParams.set('language', navigator.language.slice(0, 2));
  }

  const response = await fetch(url, {
    headers: { 'x-api-key': key },
    signal: options.signal
  });

  if (response.status === 401 || response.status === 403) {
    throw new LocalDataError('Place data key was rejected. Check it in Settings.', response.status);
  }
  if (response.status === 429) {
    throw new LocalDataError('Place data quota reached.', 429);
  }
  if (!response.ok) {
    throw new LocalDataError(`Place data request failed (HTTP ${response.status}).`, response.status);
  }

  const payload = (await response.json().catch(() => null)) as SearchEnvelope | null;
  if (!payload) return [];

  return recordsOf(payload)
    .map((record, index): SearchFeature | null => {
      const coordinate = coordinateOf(record);
      if (!coordinate) return null;

      const address = record.full_address ?? record.address ?? '';
      const bits = [
        record.rating ? `★ ${record.rating.toFixed(1)}${record.review_count ? ` (${record.review_count})` : ''}` : null,
        record.opening_status || null,
        address || null
      ].filter(Boolean) as string[];

      return {
        id: `owl-${record.business_id ?? record.place_id ?? `${index}-${coordinate.lat},${coordinate.lng}`}`,
        name: record.name ?? address ?? 'Business',
        label: bits.join(' · ') || 'Business',
        coordinate,
        kind: record.type
      };
    })
    .filter((value): value is SearchFeature => value !== null);
}
