import { Coordinate } from '@/types/map';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function formatDistanceKm(value: number) {
  return `${value.toFixed(1)} km`;
}

export function formatDurationMin(value: number) {
  if (value >= 60) {
    const hours = Math.floor(value / 60);
    const mins = Math.round(value % 60);
    return `${hours}h ${mins}m`;
  }

  return `${Math.round(value)} min`;
}

export function parseLngLat(input: unknown): Coordinate | null {
  if (!Array.isArray(input) || input.length < 2) return null;
  const [lng, lat] = input;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  return { lat, lng };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function bboxFromCenter(center: Coordinate, radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.2));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta
  };
}

export function formatRelativeTime(iso: string) {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaMin = Math.round(deltaMs / 60_000);
  if (deltaMin < 1) return 'just now';
  if (deltaMin < 60) return `${deltaMin} min ago`;
  const deltaHr = Math.round(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr} hr ago`;
  return `${Math.round(deltaHr / 24)} d ago`;
}
