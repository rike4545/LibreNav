import { Coordinate } from '@/types/map';

/**
 * Weather from Open-Meteo — free, keyless, CORS-enabled, so it fits the
 * no-backend design without asking anything of the user.
 */

const BASE = 'https://api.open-meteo.com/v1/forecast';

export type StopWeather = {
  /** Epoch ms the forecast is for. */
  at: number;
  temperatureC: number | null;
  precipitationMm: number | null;
  windKmh: number | null;
  /** Metres; low values are the interesting case for driving. */
  visibilityM: number | null;
  code: number | null;
  summary: string;
  /** Set when conditions are worth flagging before setting off. */
  caution: string | null;
};

/** WMO weather codes, condensed to what a driver needs. */
function describe(code: number | null): string {
  if (code === null) return 'Unknown';
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

/**
 * Driving hazards, in descending order of seriousness. Freezing takes priority
 * over precipitation: wet at 1°C is a very different drive from wet at 12°C.
 */
function cautionFor(w: Omit<StopWeather, 'caution' | 'summary'>): string | null {
  const freezing = w.temperatureC !== null && w.temperatureC <= 1;
  const wet = (w.precipitationMm ?? 0) > 0.2;

  if (freezing && wet) return 'Ice risk — freezing and wet';
  if (w.code !== null && w.code >= 71 && w.code <= 86) return 'Snow expected';
  if (w.visibilityM !== null && w.visibilityM < 1000) return 'Poor visibility';
  if (w.code !== null && w.code >= 95) return 'Thunderstorms';
  if ((w.precipitationMm ?? 0) > 4) return 'Heavy rain';
  if ((w.windKmh ?? 0) > 60) return 'Strong wind';
  if (freezing) return 'Near freezing';
  return null;
}

type Forecast = {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    visibility?: (number | null)[];
    weather_code?: (number | null)[];
  };
};

/**
 * Conditions at a point at a given time.
 *
 * Forecasting for the *arrival* time rather than now is the whole point — the
 * weather when you set off says little about the weather three hours away.
 */
export async function fetchWeatherAt(
  point: Coordinate,
  arrivalMs: number,
  signal?: AbortSignal
): Promise<StopWeather | null> {
  const url = new URL(BASE);
  url.searchParams.set('latitude', point.lat.toFixed(4));
  url.searchParams.set('longitude', point.lng.toFixed(4));
  url.searchParams.set('hourly', 'temperature_2m,precipitation,wind_speed_10m,visibility,weather_code');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('timezone', 'UTC');
  // Two days covers any trip this app plans for.
  url.searchParams.set('forecast_days', '2');

  const response = await fetch(url, { signal }).catch(() => null);
  if (!response?.ok) return null;

  const payload = (await response.json().catch(() => null)) as Forecast | null;
  const hourly = payload?.hourly;
  if (!hourly?.time?.length) return null;

  // Times come back as unix seconds; pick the closest hour to arrival.
  const targetSeconds = arrivalMs / 1000;
  let best = 0;
  let bestGap = Infinity;
  hourly.time.forEach((value, index) => {
    const gap = Math.abs(Number(value) - targetSeconds);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });

  const pick = <T,>(list: (T | null)[] | undefined): T | null => (list ? (list[best] ?? null) : null);

  const base = {
    at: Number(hourly.time[best]) * 1000,
    temperatureC: pick(hourly.temperature_2m),
    precipitationMm: pick(hourly.precipitation),
    windKmh: pick(hourly.wind_speed_10m),
    visibilityM: pick(hourly.visibility),
    code: pick(hourly.weather_code)
  };

  return { ...base, summary: describe(base.code), caution: cautionFor(base) };
}
