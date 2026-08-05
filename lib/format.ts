import { bearingDegrees, compassPoint, haversineMeters } from '@/lib/geometry';
import { formatDistanceKm } from '@/lib/utils';
import { Coordinate } from '@/types/map';

/** "2.4 km NE" — straight-line distance plus heading from one point to another. */
export function bearingCompass(from: Coordinate, to: Coordinate, imperial = false): string {
  const distanceKm = haversineMeters(from, to) / 1000;
  return `${formatDistanceKm(distanceKm, imperial)} ${compassPoint(bearingDegrees(from, to))}`;
}
