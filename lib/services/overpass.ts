import { OVERPASS_MIRRORS, getEndpoints } from '@/lib/config';
import { haversineMeters, samplePath } from '@/lib/geometry';
import { ChargerSite, Coordinate, Place, PlaceCategoryId } from '@/types/map';

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassPayload = { elements?: OverpassElement[] };

/**
 * Run an Overpass query, falling back through mirrors. The main instance
 * returns 504 under load regularly enough that a single-endpoint client feels
 * broken to users.
 */
/** Give up on a mirror after this long and try the next one. */
const MIRROR_TIMEOUT_MS = 20_000;

async function runOverpass(query: string, signal?: AbortSignal): Promise<OverpassElement[]> {
  const configured = getEndpoints().overpassUrl;
  const endpoints = [configured, ...OVERPASS_MIRRORS.filter((mirror) => mirror !== configured)];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    // A mirror that hangs is worse than one that 504s — without a deadline the
    // whole failover chain stalls behind it. Observed 70s+ on a busy mirror.
    const timeout = AbortSignal.timeout(MIRROR_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: combined
      });

      if (!response.ok) {
        lastError = new Error(`Overpass ${endpoint} returned HTTP ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as OverpassPayload;
      return payload.elements ?? [];
    } catch (error) {
      // Only the caller cancelling should stop the chain; a timeout moves on.
      if (signal?.aborted) throw error;
      lastError = error as Error;
    }
  }

  throw lastError ?? new Error('All Overpass mirrors failed.');
}

function pointOf(element: OverpassElement): Coordinate | null {
  if (element.center) return { lat: element.center.lat, lng: element.center.lon };
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { lat: element.lat, lng: element.lon };
  }
  return null;
}

function addressOf(tags: Record<string, string>): string | undefined {
  const value = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ');
  return value || undefined;
}

/* ------------------------------------------------------------------ chargers */

const SOCKET_LABELS: Array<[string, string]> = [
  ['socket:type2', 'Type 2'],
  ['socket:type2_cable', 'Type 2 (tethered)'],
  ['socket:type2_combo', 'CCS2'],
  ['socket:ccs', 'CCS'],
  ['socket:chademo', 'CHAdeMO'],
  ['socket:tesla_supercharger', 'Supercharger'],
  ['socket:tesla_supercharger_ccs', 'Supercharger CCS'],
  ['socket:tesla_destination', 'Tesla Destination'],
  ['socket:type1', 'Type 1'],
  ['socket:type1_combo', 'CCS1'],
  ['socket:schuko', 'Schuko']
];

/**
 * Peak power in kW. OSM records this inconsistently — a global `charge`
 * ("50 kW"), a per-socket `socket:ccs:output` ("150 kW"), or a bare number.
 * Take the highest value we can parse so the badge reflects the fastest stall.
 */
function powerOf(tags: Record<string, string>): number | null {
  const candidates = Object.entries(tags)
    .filter(([key]) => key === 'charge' || key === 'maxpower' || /^socket:.*:output$/.test(key))
    .map(([, value]) => {
      const match = value.match(/(\d+(?:\.\d+)?)\s*(kw|w)?/i);
      if (!match) return null;
      const amount = Number(match[1]);
      if (!Number.isFinite(amount)) return null;
      return match[2]?.toLowerCase() === 'w' && amount > 1000 ? amount / 1000 : amount;
    })
    .filter((value): value is number => value !== null && value > 0 && value < 1000);

  return candidates.length ? Math.round(Math.max(...candidates)) : null;
}

export async function fetchChargers(
  center: Coordinate,
  radiusKm: number,
  signal?: AbortSignal
): Promise<ChargerSite[]> {
  const radius = Math.round(Math.min(Math.max(radiusKm, 1), 50) * 1000);
  const query = `[out:json][timeout:25];
(
  node["amenity"="charging_station"](around:${radius},${center.lat.toFixed(5)},${center.lng.toFixed(5)});
  way["amenity"="charging_station"](around:${radius},${center.lat.toFixed(5)},${center.lng.toFixed(5)});
);
out center tags 200;`;

  const elements = await runOverpass(query, signal);

  return elements
    .map((element): ChargerSite | null => {
      const point = pointOf(element);
      if (!point) return null;
      const tags = element.tags ?? {};

      const plugs = SOCKET_LABELS.filter(([key]) => tags[key] && tags[key] !== 'no').map(([, label]) => label);
      const capacity = Number.parseInt(tags.capacity ?? '', 10);

      return {
        id: `${element.type}/${element.id}`,
        name: tags.name || tags.operator || tags.brand || 'Charging station',
        network: tags.network || tags.operator || tags.brand || 'Unknown network',
        plugs: plugs.length ? plugs : ['Unlisted connector'],
        powerKw: powerOf(tags),
        coordinate: point,
        address: addressOf(tags),
        access: tags.access,
        fee: tags.fee,
        capacity: Number.isFinite(capacity) ? capacity : null,
        openingHours: tags.opening_hours,
        website: tags.website || tags['contact:website']
      };
    })
    .filter((value): value is ChargerSite => value !== null)
    .sort((a, b) => haversineMeters(center, a.coordinate) - haversineMeters(center, b.coordinate));
}

/* -------------------------------------------------------------------- places */

type CategorySpec = {
  id: PlaceCategoryId;
  label: string;
  /** Overpass tag filters; each becomes its own node/way clause. */
  filters: string[];
};

export const PLACE_CATEGORIES: CategorySpec[] = [
  { id: 'fuel', label: 'Fuel', filters: ['["amenity"="fuel"]'] },
  { id: 'charging', label: 'Charging', filters: ['["amenity"="charging_station"]'] },
  { id: 'food', label: 'Food', filters: ['["amenity"="restaurant"]', '["amenity"="fast_food"]'] },
  { id: 'coffee', label: 'Coffee', filters: ['["amenity"="cafe"]'] },
  { id: 'parking', label: 'Parking', filters: ['["amenity"="parking"]["access"!="private"]'] },
  { id: 'toilets', label: 'Restrooms', filters: ['["amenity"="toilets"]'] },
  { id: 'hotel', label: 'Hotels', filters: ['["tourism"="hotel"]', '["tourism"="motel"]'] },
  { id: 'atm', label: 'ATM', filters: ['["amenity"="atm"]', '["amenity"="bank"]'] }
];

function toPlace(element: OverpassElement, category: PlaceCategoryId): Place | null {
  const point = pointOf(element);
  if (!point) return null;
  const tags = element.tags ?? {};

  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || tags.brand || tags.operator || PLACE_CATEGORIES.find((c) => c.id === category)?.label || 'Place',
    category,
    coordinate: point,
    address: addressOf(tags),
    brand: tags.brand,
    openingHours: tags.opening_hours
  };
}

export async function fetchPlacesNear(
  category: PlaceCategoryId,
  center: Coordinate,
  radiusKm: number,
  signal?: AbortSignal
): Promise<Place[]> {
  const spec = PLACE_CATEGORIES.find((item) => item.id === category);
  if (!spec) return [];

  const radius = Math.round(Math.min(Math.max(radiusKm, 1), 50) * 1000);
  const anchor = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
  const clauses = spec.filters
    .flatMap((filter) => [`node${filter}(around:${radius},${anchor});`, `way${filter}(around:${radius},${anchor});`])
    .join('\n  ');

  const elements = await runOverpass(`[out:json][timeout:25];\n(\n  ${clauses}\n);\nout center tags 120;`, signal);

  return elements
    .map((element) => toPlace(element, category))
    .filter((value): value is Place => value !== null)
    .map((place) => ({ ...place, distanceKm: haversineMeters(center, place.coordinate) / 1000 }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, 60);
}

/**
 * Search a corridor around the route rather than a circle around the driver —
 * what you actually want when looking for fuel on a long trip. Overpass has no
 * native buffer, so we sample the path and union `around:` clauses.
 */
export async function fetchPlacesAlongRoute(
  category: PlaceCategoryId,
  path: [number, number][],
  corridorKm = 3,
  signal?: AbortSignal
): Promise<Place[]> {
  const spec = PLACE_CATEGORIES.find((item) => item.id === category);
  if (!spec || path.length < 2) return [];

  // Cap the sample count: each point multiplies the query cost on Overpass.
  const spacingM = Math.max(4000, Math.round((pathLengthKm(path) * 1000) / 40));
  const samples = samplePath(path, spacingM).slice(0, 40);
  const radius = Math.round(Math.min(Math.max(corridorKm, 0.5), 10) * 1000);
  const anchors = samples.map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`).join(',');

  const clauses = spec.filters
    .flatMap((filter) => [`node${filter}(around:${radius},${anchors});`, `way${filter}(around:${radius},${anchors});`])
    .join('\n  ');

  const elements = await runOverpass(`[out:json][timeout:50];\n(\n  ${clauses}\n);\nout center tags 200;`, signal);
  const start = { lng: path[0][0], lat: path[0][1] };

  return elements
    .map((element) => toPlace(element, category))
    .filter((value): value is Place => value !== null)
    .map((place) => ({ ...place, distanceKm: haversineMeters(start, place.coordinate) / 1000 }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, 80);
}

function pathLengthKm(path: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversineMeters({ lng: path[i - 1][0], lat: path[i - 1][1] }, { lng: path[i][0], lat: path[i][1] });
  }
  return total / 1000;
}
