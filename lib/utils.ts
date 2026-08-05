export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function formatDistanceKm(value: number, imperial = false): string {
  if (imperial) {
    const miles = value * 0.621371;
    return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} km`;
}

export function formatDurationMin(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function formatSpeed(kmh: number, imperial = false): string {
  return imperial ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
}

export function formatRelativeTime(iso: string): string {
  const deltaMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (deltaMin < 1) return 'just now';
  if (deltaMin < 60) return `${deltaMin} min ago`;
  const deltaHr = Math.round(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr} hr ago`;
  return `${Math.round(deltaHr / 24)} d ago`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
