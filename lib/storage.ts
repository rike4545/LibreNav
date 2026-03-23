import { HazardReport, RouteOptions, SearchFeature } from '@/types/map';

const RECENTS_KEY = 'open-nav.recents';
const FAVORITES_KEY = 'open-nav.favorites';
const REPORTS_KEY = 'open-nav.reports';
const OPTIONS_KEY = 'open-nav.options';

const defaultRouteOptions: RouteOptions = {
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  preferTwisty: false,
  alternatives: true
};

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getRecents() {
  return safeRead<SearchFeature[]>(RECENTS_KEY, []);
}

export function pushRecent(item: SearchFeature) {
  const current = getRecents().filter((entry) => entry.id !== item.id);
  safeWrite(RECENTS_KEY, [item, ...current].slice(0, 8));
}

export function getFavorites() {
  return safeRead<SearchFeature[]>(FAVORITES_KEY, []);
}

export function toggleFavorite(item: SearchFeature) {
  const current = getFavorites();
  const exists = current.some((entry) => entry.id === item.id);
  const next = exists ? current.filter((entry) => entry.id !== item.id) : [item, ...current].slice(0, 20);
  safeWrite(FAVORITES_KEY, next);
  return next;
}

export function getReports() {
  return safeRead<HazardReport[]>(REPORTS_KEY, []);
}

export function saveReport(report: HazardReport) {
  const current = getReports();
  const next = [report, ...current].slice(0, 200);
  safeWrite(REPORTS_KEY, next);
  return next;
}

export function getRouteOptions() {
  return {
    ...defaultRouteOptions,
    ...safeRead<RouteOptions>(OPTIONS_KEY, defaultRouteOptions)
  } satisfies RouteOptions;
}

export function saveRouteOptions(options: RouteOptions) {
  safeWrite(OPTIONS_KEY, options);
  return options;
}
