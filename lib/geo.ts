import { Coordinate } from '@/types/map';

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
