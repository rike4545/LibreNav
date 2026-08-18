import type { StyleSpecification } from 'maplibre-gl';

/**
 * Google Map Tiles API as a MapLibre basemap.
 *
 * Google's 2D tiles are a plain REST tile service, but every tile has to carry
 * a session token that is obtained by POSTing first — which a raster source's
 * URL template cannot do on its own. So tiles are requested through a custom
 * `google://` protocol: the handler mints the session on the first tile and
 * every later tile reuses it. That keeps style creation synchronous, which is
 * what lets this slot in beside the static style URLs.
 *
 * Requires the caller's own key with the Map Tiles API enabled. See
 * lib/config getGoogleMapsKey for why the key lives in localStorage.
 */

export type GoogleMapType = 'roadmap' | 'satellite';

export const GOOGLE_PROTOCOL = 'google';

/** Google's own wording: sessions last two weeks. Renew early to be safe. */
const SESSION_SAFETY_MARGIN_MS = 60 * 60 * 1000;
const SESSION_KEY_PREFIX = 'librenav.googleSession.';

/**
 * MapLibre's default font stack is Open Sans, which a bare raster style has no
 * glyph source for — the charger cluster counts are a symbol layer and would
 * silently render nothing. OpenMapTiles' public font server carries that stack
 * and sends Access-Control-Allow-Origin.
 */
const GLYPHS_URL = 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf';

/**
 * Google's own styler format, roadmap only — the Map Tiles API accepts the
 * same array the Maps JS API takes. This is the standard night palette: dark
 * ground, lighter roads, muted labels, so it sits under the app's dark chrome
 * the way Dark Matter does.
 */
const DARK_ROADMAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] }
];

type CachedSession = { token: string; expiresAtMs: number };

/** Light and dark roadmaps are separate sessions, so they cache separately. */
function variantOf(mapType: GoogleMapType, dark: boolean): string {
  return dark ? `${mapType}-dark` : mapType;
}

/** One promise per map type, so parallel first tiles mint a single session. */
const pending = new Map<string, Promise<string>>();

function cacheKey(variant: string): string {
  return `${SESSION_KEY_PREFIX}${variant}`;
}

function readCachedSession(variant: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(variant));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSession;
    if (!cached.token || cached.expiresAtMs - SESSION_SAFETY_MARGIN_MS < Date.now()) return null;
    return cached.token;
  } catch {
    return null;
  }
}

function writeCachedSession(variant: string, token: string, expirySeconds: number) {
  if (typeof window === 'undefined') return;
  try {
    const record: CachedSession = { token, expiresAtMs: Number(expirySeconds) * 1000 };
    window.localStorage.setItem(cacheKey(variant), JSON.stringify(record));
  } catch {
    // A full or blocked store just means a new session next reload.
  }
}

async function createSession(mapType: GoogleMapType, key: string, dark = false): Promise<string> {
  const response = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapType,
      language: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
      region: 'US',
      // Retina tiles; still one 256pt tile as far as the renderer is concerned.
      scale: 'scaleFactor2x',
      highDpi: true,
      // Stylers are roadmap-only; imagery has nothing to restyle.
      ...(dark && mapType === 'roadmap' ? { styles: DARK_ROADMAP_STYLES } : {})
    })
  });

  if (!response.ok) {
    throw new Error(`Google session request failed (${response.status}). Check the key and that Map Tiles API is enabled.`);
  }

  const result = (await response.json()) as { session?: string; expiry?: string };
  if (!result.session) throw new Error('Google session response carried no token.');

  writeCachedSession(variantOf(mapType, dark), result.session, Number(result.expiry ?? 0));
  return result.session;
}

async function sessionToken(mapType: GoogleMapType, key: string, dark = false): Promise<string> {
  const variant = variantOf(mapType, dark);
  const cached = readCachedSession(variant);
  if (cached) return cached;

  const inFlight = pending.get(variant);
  if (inFlight) return inFlight;

  const request = createSession(mapType, key, dark).finally(() => pending.delete(variant));
  pending.set(variant, request);
  return request;
}

/**
 * MapLibre protocol handler for `google://{mapType}/{z}/{x}/{y}?key=…`.
 * Register once with maplibregl.addProtocol(GOOGLE_PROTOCOL, googleTileProtocol).
 */
export async function googleTileProtocol(
  params: { url: string },
  abortController?: AbortController
): Promise<{ data: ArrayBuffer }> {
  const url = new URL(params.url.replace(`${GOOGLE_PROTOCOL}://`, 'https://'));
  const mapType = url.hostname as GoogleMapType;
  const key = url.searchParams.get('key') ?? '';
  const dark = url.searchParams.get('dark') === '1';
  if (!key) throw new Error('No Google Maps key configured.');

  const session = await sessionToken(mapType, key, dark);
  const tileUrl =
    `https://tile.googleapis.com/v1/2dtiles${url.pathname}` +
    `?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;

  const response = await fetch(tileUrl, { signal: abortController?.signal });
  if (!response.ok) throw new Error(`Google tile ${url.pathname} failed (${response.status}).`);
  return { data: await response.arrayBuffer() };
}

/** A complete MapLibre style backed by Google tiles. Synchronous by design. */
export function googleMapStyle(mapType: GoogleMapType, key: string, dark = false): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      'google-basemap': {
        type: 'raster',
        tiles: [
          `${GOOGLE_PROTOCOL}://${mapType}/{z}/{x}/{y}?key=${encodeURIComponent(key)}${dark ? '&dark=1' : ''}`
        ],
        tileSize: 256,
        maxzoom: 19
        // No `attribution` here on purpose: Google requires the live copyright
        // for the current viewport plus their logo, which the attribution
        // control in NavMap renders instead.
      }
    },
    layers: [{ id: 'google-basemap', type: 'raster', source: 'google-basemap' }]
  };
}

/**
 * Copyright line Google requires on screen for the tiles currently in view.
 *
 * It genuinely varies with the viewport — imagery credits differ by region —
 * which is why this is refetched as the map settles rather than hardcoded.
 */
export async function fetchGoogleCopyright(
  mapType: GoogleMapType,
  key: string,
  bounds: { north: number; south: number; east: number; west: number },
  zoom: number,
  signal?: AbortSignal,
  dark = false
): Promise<string> {
  const session = await sessionToken(mapType, key, dark);
  const query = new URLSearchParams({
    session,
    key,
    zoom: String(Math.floor(zoom)),
    north: String(bounds.north),
    south: String(bounds.south),
    east: String(bounds.east),
    west: String(bounds.west)
  });

  const response = await fetch(`https://tile.googleapis.com/tile/v1/viewport?${query}`, { signal });
  if (!response.ok) throw new Error(`Google viewport request failed (${response.status}).`);

  const result = (await response.json()) as { copyright?: string };
  return result.copyright ?? '';
}

/**
 * Checks a key by minting a throwaway session.
 *
 * Worth doing at the moment the key is pasted: a bad key otherwise surfaces as
 * a blank basemap some time later, with nothing on screen saying why.
 */
export async function verifyGoogleMapsKey(key: string): Promise<{ ok: boolean; message: string }> {
  if (!key.trim()) return { ok: false, message: 'Paste a key first.' };
  try {
    await createSession('roadmap', key.trim());
    return { ok: true, message: 'Key works — Google styles are in the list above.' };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not reach Google.';
    return { ok: false, message };
  }
}

/** Clears cached sessions, e.g. after the key changes. */
export function resetGoogleSessions() {
  pending.clear();
  if (typeof window === 'undefined') return;
  for (const variant of ['roadmap', 'roadmap-dark', 'satellite', 'satellite-dark']) {
    try {
      window.localStorage.removeItem(cacheKey(variant));
    } catch {
      // Nothing to do; a stale session just fails once and is re-minted.
    }
  }
}
