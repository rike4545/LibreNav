import { getEndpoints } from '@/lib/config';
import { decodePlusCode, isFullPlusCode, isShortPlusCode, recoverPlusCode } from '@/lib/pluscode';
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

  const plus = await resolvePlusCodeQuery(trimmed, options.near ?? null, options.signal);
  if (plus) return [plus];

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

/**
 * Accept a pasted Plus Code, in any of the three forms people share.
 *
 *   87G8Q257+6R          full code, resolves on its own
 *   Q257+6R              short code, resolved against where the user is
 *   Q257+6R New York     short code with a locality, which is how they are
 *                        printed on signage and pasted out of Google Maps
 *
 * The locality form needs a geocode first, so this is async — the other two
 * resolve offline, which is the whole point of Plus Codes for rural addresses.
 */
async function resolvePlusCodeQuery(
  query: string,
  near: Coordinate | null,
  signal?: AbortSignal
): Promise<SearchFeature | null> {
  const value = query.trim().toUpperCase();

  if (isFullPlusCode(value)) {
    const area = decodePlusCode(value);
    return area ? plusCodeFeature(value, area.center) : null;
  }

  // Split the code token off whatever locality follows it.
  const [token, ...rest] = value.split(/\s+/);
  if (!isShortPlusCode(token)) return null;

  const locality = rest.join(' ').trim();

  if (!locality) {
    if (!near) return null;
    const area = recoverPlusCode(token, near);
    return area ? plusCodeFeature(token, area.center) : null;
  }

  // Resolve the locality, then recover the short code near it. The locality is
  // plain text, so this cannot recurse back into a Plus Code lookup.
  //
  // Deliberately unbiased by the user's position: the locality is the anchor
  // the code came with, and the whole point of writing it down is that the
  // place is somewhere else. Biasing by `near` resolved "CWC8+R9 Mountain
  // View" to a Mountain View 21 miles from the driver instead of the one in
  // California the code actually belongs to.
  const matches = await searchPlaces(locality, { limit: 1, signal }).catch(() => []);
  const anchor = matches[0]?.coordinate ?? near;
  if (!anchor) return null;

  const area = recoverPlusCode(token, anchor);
  return area ? plusCodeFeature(`${token} ${locality}`, area.center) : null;
}

function plusCodeFeature(code: string, coordinate: Coordinate): SearchFeature {
  return {
    id: `plus-${coordinate.lat.toFixed(6)},${coordinate.lng.toFixed(6)}`,
    name: code,
    label: 'Plus Code',
    coordinate
  };
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
