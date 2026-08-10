import { Coordinate } from '@/types/map';

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, in degrees clockwise from north. */
export function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLng = (b.lng - a.lng) * DEG;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/**
 * Point reached by travelling `distanceM` from `origin` on `bearingDeg`.
 * Great-circle form, so it stays accurate at high latitudes where a flat
 * approximation would skew the shape of a generated loop.
 */
export function destinationPoint(origin: Coordinate, bearingDeg: number, distanceM: number): Coordinate {
  const angular = distanceM / EARTH_RADIUS_M;
  const bearing = bearingDeg * DEG;
  const lat1 = origin.lat * DEG;
  const lng1 = origin.lng * DEG;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: lat2 / DEG,
    // Keep longitude in −180..180 so a loop near the antimeridian stays valid.
    lng: (((lng2 / DEG + 540) % 360) - 180)
  };
}

export function compassPoint(bearing: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(bearing / 45) % 8];
}

/**
 * Local equirectangular projection around `origin`, in metres. Accurate enough
 * for the short spans we measure (a route segment is rarely over a few km) and
 * far cheaper than repeated haversine calls inside the position-matching loop.
 */
function project(point: Coordinate, origin: Coordinate): [number, number] {
  const x = (point.lng - origin.lng) * DEG * Math.cos(origin.lat * DEG) * EARTH_RADIUS_M;
  const y = (point.lat - origin.lat) * DEG * EARTH_RADIUS_M;
  return [x, y];
}

export type SnapResult = {
  /** Index of the geometry vertex starting the segment we matched. */
  index: number;
  /** 0–1 position along that segment. */
  t: number;
  /** Perpendicular distance from the input point to the route, in metres. */
  distanceM: number;
  /** The matched point on the route itself. */
  snapped: Coordinate;
};

/**
 * Find the closest point on a polyline. Scans a window around `hintIndex` when
 * given, so a long route stays cheap to match against on every GPS tick.
 */
export function snapToPath(
  point: Coordinate,
  path: [number, number][],
  hintIndex = 0,
  window = 60
): SnapResult | null {
  if (path.length < 2) return null;

  const from = Math.max(0, hintIndex - 5);
  const to = Math.min(path.length - 1, hintIndex + window);
  let best: SnapResult | null = null;

  for (let i = from; i < to; i += 1) {
    const a: Coordinate = { lng: path[i][0], lat: path[i][1] };
    const b: Coordinate = { lng: path[i + 1][0], lat: path[i + 1][1] };

    const [px, py] = project(point, a);
    const [bx, by] = project(b, a);
    const lenSq = bx * bx + by * by;

    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
    const dx = px - bx * t;
    const dy = py - by * t;
    const distanceM = Math.sqrt(dx * dx + dy * dy);

    if (!best || distanceM < best.distanceM) {
      best = {
        index: i,
        t,
        distanceM,
        snapped: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
      };
    }
  }

  // A windowed scan can miss when GPS jumps (tunnel exit, app resume). Widen once.
  if (best && best.distanceM > 120 && (from > 0 || to < path.length - 1)) {
    const full = snapToPath(point, path, 0, path.length);
    if (full && full.distanceM < best.distanceM) return full;
  }

  return best;
}

/** Cumulative distance in metres from the start of the path to each vertex. */
export function cumulativeDistances(path: [number, number][]): number[] {
  const out = new Array<number>(path.length);
  out[0] = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = { lng: path[i - 1][0], lat: path[i - 1][1] };
    const b = { lng: path[i][0], lat: path[i][1] };
    out[i] = out[i - 1] + haversineMeters(a, b);
  }
  return out;
}

/** Distance in metres from the path start to an exact snapped position. */
export function distanceAlong(snap: SnapResult, path: [number, number][], cumulative: number[]): number {
  const a = { lng: path[snap.index][0], lat: path[snap.index][1] };
  const b = { lng: path[snap.index + 1][0], lat: path[snap.index + 1][1] };
  return cumulative[snap.index] + haversineMeters(a, b) * snap.t;
}

export function boundsOf(coordinates: [number, number][]): [[number, number], [number, number]] | null {
  if (!coordinates.length) return null;
  let minLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLng = minLng;
  let maxLat = minLat;

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat]
  ];
}

/**
 * Thin a path down to points at least `spacingM` apart. Used to build the
 * Overpass "along the route" query without blowing past its URL length limit.
 */
/**
 * A bounding box of roughly `radiusKm` around a point.
 *
 * Longitude degrees shrink toward the poles, so the lng span is divided by
 * cos(lat) — without that the box is far too narrow in Scandinavia and too
 * wide near the equator.
 */
export function boxAround(center: Coordinate, radiusKm: number): [[number, number], [number, number]] {
  const latSpan = radiusKm / 110.54;
  // Guard the pole, where cos(lat) approaches zero and the span explodes.
  const cosLat = Math.max(0.01, Math.cos((center.lat * Math.PI) / 180));
  const lngSpan = radiusKm / (111.32 * cosLat);

  return [
    [center.lng - lngSpan, Math.max(-90, center.lat - latSpan)],
    [center.lng + lngSpan, Math.min(90, center.lat + latSpan)]
  ];
}

/**
 * The next `maxKm` of a path, starting at `fromIndex`.
 *
 * Used to box the stretch of road that still matters. Boxing an entire
 * cross-country route covers an enormous area, most of it behind the driver or
 * hours away, which wastes a metered request and risks a capped response that
 * drops the part actually being driven.
 */
export function pathAhead(path: [number, number][], fromIndex: number, maxKm: number): [number, number][] {
  const start = Math.max(0, Math.min(fromIndex, path.length - 1));
  const limitM = maxKm * 1000;

  const slice: [number, number][] = [path[start]];
  let travelled = 0;

  for (let i = start + 1; i < path.length; i += 1) {
    travelled += haversineMeters(
      { lng: path[i - 1][0], lat: path[i - 1][1] },
      { lng: path[i][0], lat: path[i][1] }
    );
    slice.push(path[i]);
    if (travelled >= limitM) break;
  }

  return slice;
}

export function samplePath(path: [number, number][], spacingM: number): Coordinate[] {
  if (!path.length) return [];
  const out: Coordinate[] = [{ lng: path[0][0], lat: path[0][1] }];
  let accumulated = 0;

  for (let i = 1; i < path.length; i += 1) {
    const a = { lng: path[i - 1][0], lat: path[i - 1][1] };
    const b = { lng: path[i][0], lat: path[i][1] };
    accumulated += haversineMeters(a, b);
    if (accumulated >= spacingM) {
      out.push(b);
      accumulated = 0;
    }
  }

  return out;
}

/** Valhalla returns polyline6 for shapes; the classic algorithm at 1e6 precision. */
export function decodePolyline6(input: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];

  while (index < input.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = input.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = input.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / 1e6, lat / 1e6]);
  }

  return coordinates;
}
