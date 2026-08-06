import { TrackPoint } from '@/types/map';

/** Escape the five XML-significant characters in attribute/text content. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * GPX 1.1 track from recorded points.
 *
 * Speed goes in an extensions block rather than a bare <speed> element: that
 * element was dropped in GPX 1.1, and strict readers reject it.
 */
export function buildGpx(points: TrackPoint[], name: string): string {
  const segments = points
    .map((point) => {
      const time = new Date(point.at).toISOString();
      const speed =
        point.speedKmh !== undefined && point.speedKmh > 0
          ? `\n        <extensions><speed>${(point.speedKmh / 3.6).toFixed(2)}</speed></extensions>`
          : '';
      return `      <trkpt lat="${point.coordinate.lat.toFixed(6)}" lon="${point.coordinate.lng.toFixed(6)}">
        <time>${time}</time>${speed}
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LibreNav" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${new Date(points[0]?.at ?? Date.now()).toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${segments}
    </trkseg>
  </trk>
</gpx>
`;
}

export function downloadGpx(points: TrackPoint[], name: string) {
  if (typeof window === 'undefined' || !points.length) return;

  const blob = new Blob([buildGpx(points, name)], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^\w.-]+/g, '-').toLowerCase()}.gpx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Total length of a recorded track in km, for the recording readout. */
export function trackDistanceKm(points: TrackPoint[]): number {
  let metres = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1].coordinate;
    const b = points[i].coordinate;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    metres += 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return metres / 1000;
}
