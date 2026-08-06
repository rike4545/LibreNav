import { VehicleProfile } from '@/types/map';

/**
 * Endpoints are resolved at runtime, not build time, so the same static bundle
 * works against the public OSM services or a self-hosted Docker stack.
 * Precedence: localStorage override → NEXT_PUBLIC_* build env → public default.
 */
export type Endpoints = {
  valhallaUrl: string;
  photonUrl: string;
  overpassUrl: string;
  mapStyleUrl: string;
};

export type MapStyleOption = {
  id: string;
  label: string;
  url: string;
  /** Dark styles get light-on-dark route colors and UI chrome. */
  dark: boolean;
};

/**
 * Free, key-less vector styles. OpenFreeMap is unmetered; CARTO basemaps are
 * free for reasonable use. All three send Access-Control-Allow-Origin: *.
 */
export const MAP_STYLES: MapStyleOption[] = [
  { id: 'liberty', label: 'Streets', url: 'https://tiles.openfreemap.org/styles/liberty', dark: false },
  { id: 'dark', label: 'Dark', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', dark: true },
  { id: 'positron', label: 'Minimal', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', dark: false },
  { id: 'voyager', label: 'Voyager', url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json', dark: false },
  { id: 'bright', label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright', dark: false }
];

/**
 * Terrarium-encoded elevation tiles from the AWS Open Data registry
 * (originally Mapzen). Open licence, no key, and MapLibre reads the encoding
 * natively — which is what makes a 3D terrain mode possible without a vendor.
 */
export const TERRAIN_DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const DEFAULT_ENDPOINTS: Endpoints = {
  // FOSSGIS runs the public Valhalla instance for OSM. Fair-use, no key.
  valhallaUrl: process.env.NEXT_PUBLIC_VALHALLA_URL || 'https://valhalla1.openstreetmap.de',
  // Komoot hosts the public Photon geocoder. Fair-use, no key.
  photonUrl: process.env.NEXT_PUBLIC_PHOTON_URL || 'https://photon.komoot.io',
  overpassUrl: process.env.NEXT_PUBLIC_OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
  mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL || MAP_STYLES[0].url
};

/**
 * Overpass mirrors, tried in order. The main instance returns 504 under load
 * often enough that failover is worth the extra code.
 */
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

export const DEFAULT_VEHICLE: VehicleProfile = {
  batteryKwh: 75,
  consumptionKwh100km: 17,
  socPercent: 80,
  reservePercent: 10
};

export const appEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'LibreNav',
  defaultLat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? 40.7128),
  defaultLng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? -74.006),
  defaultZoom: Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM ?? 12),
  enableReports: (process.env.NEXT_PUBLIC_ENABLE_REPORTS ?? 'true') === 'true',
  /** Set by the Pages build so share links carry the right path. */
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || ''
};

const ENDPOINTS_KEY = 'librenav.endpoints';

let cached: Endpoints | null = null;

export function getEndpoints(): Endpoints {
  if (cached) return cached;
  if (typeof window === 'undefined') return DEFAULT_ENDPOINTS;

  try {
    const raw = window.localStorage.getItem(ENDPOINTS_KEY);
    const overrides = raw ? (JSON.parse(raw) as Partial<Endpoints>) : {};
    cached = { ...DEFAULT_ENDPOINTS, ...stripEmpty(overrides) };
  } catch {
    cached = DEFAULT_ENDPOINTS;
  }

  return cached;
}

export function saveEndpoints(next: Partial<Endpoints>): Endpoints {
  const merged = { ...DEFAULT_ENDPOINTS, ...stripEmpty(next) };
  cached = merged;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ENDPOINTS_KEY, JSON.stringify(next));
  }
  return merged;
}

/**
 * Style URL for the selected basemap.
 *
 * Any URL that isn't one of the built-ins is treated as a custom basemap and
 * overrides the picker — otherwise NEXT_PUBLIC_MAP_STYLE_URL and the Settings
 * field would be stored, shown, and then silently ignored by the style
 * switcher, which is exactly what self-hosters point at their own tiles with.
 */
export function resolveMapStyleUrl(styleId: string): string {
  const { mapStyleUrl } = getEndpoints();
  if (mapStyleUrl && !MAP_STYLES.some((style) => style.url === mapStyleUrl)) {
    return mapStyleUrl;
  }
  return MAP_STYLES.find((style) => style.id === styleId)?.url ?? MAP_STYLES[0].url;
}

export function resetEndpoints(): Endpoints {
  cached = DEFAULT_ENDPOINTS;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(ENDPOINTS_KEY);
  }
  return DEFAULT_ENDPOINTS;
}

function stripEmpty<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as Partial<T>;
}
