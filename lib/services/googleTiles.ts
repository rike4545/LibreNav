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

type CachedSession = { token: string; expiresAtMs: number };

/** One promise per map type, so parallel first tiles mint a single session. */
const pending = new Map<string, Promise<string>>();

function cacheKey(mapType: GoogleMapType): string {
  return `${SESSION_KEY_PREFIX}${mapType}`;
}

function readCachedSession(mapType: GoogleMapType): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(mapType));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSession;
    if (!cached.token || cached.expiresAtMs - SESSION_SAFETY_MARGIN_MS < Date.now()) return null;
    return cached.token;
  } catch {
    return null;
  }
}

function writeCachedSession(mapType: GoogleMapType, token: string, expirySeconds: number) {
  if (typeof window === 'undefined') return;
  try {
    const record: CachedSession = { token, expiresAtMs: Number(expirySeconds) * 1000 };
    window.localStorage.setItem(cacheKey(mapType), JSON.stringify(record));
  } catch {
    // A full or blocked store just means a new session next reload.
  }
}

async function createSession(mapType: GoogleMapType, key: string): Promise<string> {
  const response = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapType,
      language: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
      region: 'US',
      // Retina tiles; still one 256pt tile as far as the renderer is concerned.
      scale: 'scaleFactor2x',
      highDpi: true
    })
  });

  if (!response.ok) {
    throw new Error(`Google session request failed (${response.status}). Check the key and that Map Tiles API is enabled.`);
  }

  const result = (await response.json()) as { session?: string; expiry?: string };
  if (!result.session) throw new Error('Google session response carried no token.');

  writeCachedSession(mapType, result.session, Number(result.expiry ?? 0));
  return result.session;
}

async function sessionToken(mapType: GoogleMapType, key: string): Promise<string> {
  const cached = readCachedSession(mapType);
  if (cached) return cached;

  const inFlight = pending.get(mapType);
  if (inFlight) return inFlight;

  const request = createSession(mapType, key).finally(() => pending.delete(mapType));
  pending.set(mapType, request);
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
  if (!key) throw new Error('No Google Maps key configured.');

  const session = await sessionToken(mapType, key);
  const tileUrl =
    `https://tile.googleapis.com/v1/2dtiles${url.pathname}` +
    `?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;

  const response = await fetch(tileUrl, { signal: abortController?.signal });
  if (!response.ok) throw new Error(`Google tile ${url.pathname} failed (${response.status}).`);
  return { data: await response.arrayBuffer() };
}

/** A complete MapLibre style backed by Google tiles. Synchronous by design. */
export function googleMapStyle(mapType: GoogleMapType, key: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      'google-basemap': {
        type: 'raster',
        tiles: [`${GOOGLE_PROTOCOL}://${mapType}/{z}/{x}/{y}?key=${encodeURIComponent(key)}`],
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
  signal?: AbortSignal
): Promise<string> {
  const session = await sessionToken(mapType, key);
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
  for (const mapType of ['roadmap', 'satellite'] as GoogleMapType[]) {
    try {
      window.localStorage.removeItem(cacheKey(mapType));
    } catch {
      // Nothing to do; a stale session just fails once and is re-minted.
    }
  }
}
