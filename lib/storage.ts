import { DEFAULT_VEHICLE } from '@/lib/config';
import { VoiceSettings, defaultVoiceSettings } from '@/lib/voice';
import { HazardReport, RouteOptions, SearchFeature, VehicleProfile } from '@/types/map';

const RECENTS_KEY = 'librenav.recents';
const FAVORITES_KEY = 'librenav.favorites';
const REPORTS_KEY = 'librenav.reports';
const OPTIONS_KEY = 'librenav.options';
const PREFS_KEY = 'librenav.prefs';
const VEHICLE_KEY = 'librenav.vehicle';
const VOICE_KEY = 'librenav.voice';

export type SavedPlace = SearchFeature & {
  /** 'home' and 'work' are pinned; everything else is a plain favorite. */
  role?: 'home' | 'work';
  savedAt: string;
};

export type ThemeChoice = 'dark' | 'light' | 'system';

export type Preferences = {
  /** UI theme. 'system' follows the OS setting. */
  theme: ThemeChoice;
  imperial: boolean;
  voiceGuidance: boolean;
  mapStyleId: string;
  showChargers: boolean;
  /** Minimum charger power in kW to display. 0 shows everything. */
  minChargerKw: number;
  /** Only show chargers offering this connector. null shows all. */
  chargerConnector: string | null;
  /** Only show chargers on this network/operator. null shows all. */
  chargerNetwork: string | null;
  /** Render elevation as 3D terrain. */
  terrain3d: boolean;
  /** Warn on approach to speed cameras and reported hazards. */
  alertsEnabled: boolean;
};

export const defaultRouteOptions: RouteOptions = {
  mode: 'auto',
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  preferTwisty: false,
  alternatives: true
};

export const defaultPreferences: Preferences = {
  theme: 'system',
  // Follow the locale's convention rather than assuming metric.
  imperial: typeof navigator !== 'undefined' && /^en-(US|GB|MM|LR)/i.test(navigator.language ?? ''),
  voiceGuidance: true,
  mapStyleId: 'liberty',
  showChargers: true,
  minChargerKw: 0,
  chargerConnector: null,
  chargerNetwork: null,
  terrain3d: false,
  alertsEnabled: true
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
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private-mode failures shouldn't take the app down.
  }
}

export function getRecents(): SearchFeature[] {
  return safeRead<SearchFeature[]>(RECENTS_KEY, []);
}

export function pushRecent(item: SearchFeature): SearchFeature[] {
  const next = [item, ...getRecents().filter((entry) => entry.id !== item.id)].slice(0, 12);
  safeWrite(RECENTS_KEY, next);
  return next;
}

export function clearRecents(): SearchFeature[] {
  safeWrite(RECENTS_KEY, []);
  return [];
}

export function getSavedPlaces(): SavedPlace[] {
  return safeRead<SavedPlace[]>(FAVORITES_KEY, []);
}

export function toggleSavedPlace(item: SearchFeature): SavedPlace[] {
  const current = getSavedPlaces();
  const exists = current.some((entry) => entry.id === item.id);
  const next = exists
    ? current.filter((entry) => entry.id !== item.id)
    : [{ ...item, savedAt: new Date().toISOString() }, ...current].slice(0, 60);
  safeWrite(FAVORITES_KEY, next);
  return next;
}

export function renameSavedPlace(id: string, name: string): SavedPlace[] {
  const next = getSavedPlaces().map((entry) => (entry.id === id ? { ...entry, name } : entry));
  safeWrite(FAVORITES_KEY, next);
  return next;
}

/** Assign home/work. Only one place can hold each role. */
export function setPlaceRole(id: string, role: 'home' | 'work' | null): SavedPlace[] {
  const next = getSavedPlaces().map((entry) => {
    if (entry.id === id) return { ...entry, role: role ?? undefined };
    return entry.role === role ? { ...entry, role: undefined } : entry;
  });
  safeWrite(FAVORITES_KEY, next);
  return next;
}

export function getReports(): HazardReport[] {
  // Reports expire after a day — a stale hazard pin is worse than none.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return safeRead<HazardReport[]>(REPORTS_KEY, []).filter((report) => new Date(report.createdAt).getTime() > cutoff);
}

export function saveReport(report: HazardReport): HazardReport[] {
  const next = [report, ...getReports()].slice(0, 200);
  safeWrite(REPORTS_KEY, next);
  return next;
}

export function removeReport(id: string): HazardReport[] {
  const next = getReports().filter((report) => report.id !== id);
  safeWrite(REPORTS_KEY, next);
  return next;
}

export function getRouteOptions(): RouteOptions {
  return { ...defaultRouteOptions, ...safeRead<Partial<RouteOptions>>(OPTIONS_KEY, {}) };
}

export function saveRouteOptions(options: RouteOptions): RouteOptions {
  safeWrite(OPTIONS_KEY, options);
  return options;
}

export function getPreferences(): Preferences {
  return { ...defaultPreferences, ...safeRead<Partial<Preferences>>(PREFS_KEY, {}) };
}

export function savePreferences(preferences: Preferences): Preferences {
  safeWrite(PREFS_KEY, preferences);
  return preferences;
}

export function getVoiceSettings(): VoiceSettings {
  return { ...defaultVoiceSettings, ...safeRead<Partial<VoiceSettings>>(VOICE_KEY, {}) };
}

export function saveVoiceSettings(settings: VoiceSettings): VoiceSettings {
  safeWrite(VOICE_KEY, settings);
  return settings;
}

export function getVehicle(): VehicleProfile {
  return { ...DEFAULT_VEHICLE, ...safeRead<Partial<VehicleProfile>>(VEHICLE_KEY, {}) };
}

export function saveVehicle(vehicle: VehicleProfile): VehicleProfile {
  safeWrite(VEHICLE_KEY, vehicle);
  return vehicle;
}
