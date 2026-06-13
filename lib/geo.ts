import { Coordinate, UserPosition } from '@/types/map';

export async function getCurrentPosition(): Promise<Coordinate | null> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 10_000
      }
    );
  });
}

export function watchUserPosition(callback: (position: UserPosition) => void): () => void {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) return () => {};

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      callback({
        coordinate: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        heading: pos.coords.heading,
        speedKmh: (pos.coords.speed ?? 0) * 3.6,
        accuracyM: pos.coords.accuracy
      });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 3_000 }
  );

  return () => navigator.geolocation.clearWatch(id);
}
