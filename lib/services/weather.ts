import { Coordinate } from '@/types/map';

/**
 * Weather from Open-Meteo — free, keyless, CORS-enabled, so it fits the
 * no-backend design without asking anything of the user.
 */

const BASE = 'https://api.open-meteo.com/v1/forecast';
const AIR_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export type StopWeather = {
  /** Epoch ms the forecast is for. */
  at: number;
  temperatureC: number | null;
  precipitationMm: number | null;
  windKmh: number | null;
  /** Metres; low values are the interesting case for driving. */
  visibilityM: number | null;
  code: number | null;
  /** US AQI at the same hour, where the air-quality model covers the area. */
  aqi: number | null;
  aqiLabel: string | null;
  pm25: number | null;
  summary: string;
  /** Set when conditions are worth flagging before setting off. */
  caution: string | null;
};

/**
 * US AQI bands, as published by the EPA. Using the US scale rather than the
 * European one because its categories are the widely recognised wording.
 */
export function aqiBand(aqi: number | null): string | null {
  if (aqi === null) return null;
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

/** Colour band for the AQI chip, matching the EPA scale. */
export function aqiTone(aqi: number | null): string {
  if (aqi === null) return 'bg-raised text-muted';
  if (aqi <= 50) return 'bg-emerald-500/25 text-fg';
  if (aqi <= 100) return 'bg-yellow-500/25 text-fg';
  if (aqi <= 150) return 'bg-orange-500/30 text-fg';
  if (aqi <= 200) return 'bg-rose-500/30 text-fg';
  return 'bg-purple-500/30 text-fg';
}

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
function cautionFor(w: Omit<StopWeather, 'caution' | 'summary' | 'aqiLabel'>): string | null {
  // Unhealthy air matters most to anyone who'd otherwise drive with windows
  // down, so it ranks above the milder weather warnings.
  if ((w.aqi ?? 0) > 150) return `Poor air quality (AQI ${w.aqi})`;
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

  const air = await fetchAirQuality(point, Number(hourly.time[best]), signal);

  const base = {
    at: Number(hourly.time[best]) * 1000,
    temperatureC: pick(hourly.temperature_2m),
    precipitationMm: pick(hourly.precipitation),
    windKmh: pick(hourly.wind_speed_10m),
    visibilityM: pick(hourly.visibility),
    code: pick(hourly.weather_code),
    aqi: air.aqi,
    aqiLabel: aqiBand(air.aqi),
    pm25: air.pm25
  };

  return { ...base, summary: describe(base.code), caution: cautionFor(base) };
}

/**
 * US AQI at the given hour.
 *
 * Separate endpoint from the forecast, and its model does not cover every
 * region — a null here means "no data", not "clean air", so the UI omits the
 * chip rather than implying a reading.
 */
async function fetchAirQuality(
  point: Coordinate,
  targetUnixSeconds: number,
  signal?: AbortSignal
): Promise<{ aqi: number | null; pm25: number | null }> {
  const url = new URL(AIR_BASE);
  url.searchParams.set('latitude', point.lat.toFixed(4));
  url.searchParams.set('longitude', point.lng.toFixed(4));
  url.searchParams.set('hourly', 'us_aqi,pm2_5');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('forecast_days', '2');

  const response = await fetch(url, { signal }).catch(() => null);
  if (!response?.ok) return { aqi: null, pm25: null };

  const payload = (await response.json().catch(() => null)) as {
    hourly?: { time?: number[]; us_aqi?: (number | null)[]; pm2_5?: (number | null)[] };
  } | null;

  const hourly = payload?.hourly;
  if (!hourly?.time?.length) return { aqi: null, pm25: null };

  let best = 0;
  let bestGap = Infinity;
  hourly.time.forEach((value, index) => {
    const gap = Math.abs(Number(value) - targetUnixSeconds);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });

  const aqi = hourly.us_aqi?.[best] ?? null;
  return { aqi: typeof aqi === 'number' ? Math.round(aqi) : null, pm25: hourly.pm2_5?.[best] ?? null };
}
