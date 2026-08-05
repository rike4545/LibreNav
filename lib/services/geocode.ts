import { getEndpoints } from '@/lib/config';
import { Coordinate, SearchFeature } from '@/types/map';

type PhotonProperties = {
  osm_id?: number | string;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
};

type PhotonFeature = {
  properties?: PhotonProperties;
  geometry?: { coordinates?: number[] };
};

/**
 * Photon returns a flat bag of address parts. Build a display name plus a
 * secondary line the way a maps app would: what it is, then where it is.
 */
function toFeature(feature: PhotonFeature, index: number): SearchFeature | null {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;

  const props = feature.properties ?? {};
  const street = [props.housenumber, props.street].filter(Boolean).join(' ');
  const name = props.name || street || props.city || props.state || `Result ${index + 1}`;

  const contextParts = [
    // Don't repeat the street when it's already the headline.
    name === street ? null : street || null,
    props.district || props.locality || null,
    props.city || props.county || null,
    props.state || null,
    props.country || null
  ].filter((part): part is string => Boolean(part) && part !== name);

  // Collapse duplicates like "New York · New York".
  const label = [...new Set(contextParts)].slice(0, 3).join(' · ');

  return {
    id: `${props.osm_type ?? 'X'}${props.osm_id ?? `${lat},${lng}`}`,
    name,
    label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    coordinate: { lat, lng },
    kind: props.osm_key && props.osm_value ? `${props.osm_key}/${props.osm_value}` : undefined
  };
}

export async function searchPlaces(
  query: string,
  options: { near?: Coordinate | null; limit?: number; signal?: AbortSignal } = {}
): Promise<SearchFeature[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const direct = parseCoordinateQuery(trimmed);
  if (direct) return [direct];

  const { photonUrl } = getEndpoints();
  const url = new URL('/api', photonUrl);
  url.searchParams.set('q', trimmed);
  url.searchParams.set('limit', String(options.limit ?? 8));

  // Bias toward the user so "main street" resolves nearby rather than abroad.
  if (options.near) {
    url.searchParams.set('lat', options.near.lat.toFixed(5));
    url.searchParams.set('lon', options.near.lng.toFixed(5));
  }

  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: options.signal });
  if (!response.ok) throw new Error(`Search failed (HTTP ${response.status}).`);

  const payload = (await response.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();

  return (payload.features ?? [])
    .map(toFeature)
    .filter((value): value is SearchFeature => value !== null)
    .filter((value) => {
      if (seen.has(value.id)) return false;
      seen.add(value.id);
      return true;
    });
}

export async function reverseGeocode(point: Coordinate, signal?: AbortSignal): Promise<SearchFeature | null> {
  const { photonUrl } = getEndpoints();
  const url = new URL('/reverse', photonUrl);
  url.searchParams.set('lat', point.lat.toString());
  url.searchParams.set('lon', point.lng.toString());
  url.searchParams.set('limit', '1');

  const response = await fetch(url, { signal }).catch(() => null);
  if (!response?.ok) return null;

  const payload = (await response.json().catch(() => null)) as { features?: PhotonFeature[] } | null;
  const first = payload?.features?.[0];
  if (!first) return null;

  const feature = toFeature(first, 0);
  // Keep the tapped point, not the centroid of whatever OSM object matched.
  return feature ? { ...feature, coordinate: point, id: `pin-${point.lat.toFixed(5)},${point.lng.toFixed(5)}` } : null;
}

/** Accept pasted coordinates: "40.7128, -74.0060" or "40.7128 -74.006". */
export function parseCoordinateQuery(query: string): SearchFeature | null {
  const match = query.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return {
    id: `coord-${lat},${lng}`,
    name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    label: 'Coordinates',
    coordinate: { lat, lng }
  };
}
