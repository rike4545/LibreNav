'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { CarFront, Check, Copy, LocateFixed, Navigation, NavigationOff, Route, ShieldAlert, Star, Zap } from 'lucide-react';
import { appEnv } from '@/lib/env';
import { getCurrentPosition, watchUserPosition } from '@/lib/geo';
import { getFavorites, getRecents, getReports, getRouteOptions, pushRecent, saveReport, saveRouteOptions, toggleFavorite } from '@/lib/storage';
import { bboxFromCenter, formatDistanceKm, formatDurationMin, formatRelativeTime } from '@/lib/utils';
import { ChargerSite, Coordinate, HazardReport, Incident, RouteManeuver, RouteOptions, RouteResponse, SearchFeature, UserPosition } from '@/types/map';
import { SearchPanel } from '@/components/SearchPanel';
import { TeslaMap } from '@/components/TeslaMap';

const fetcher = async <T,>(input: RequestInfo | URL) => {
  const response = await fetch(input);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
};

export function MapShell() {
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<SearchFeature | null>(null);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [recents, setRecents] = useState<SearchFeature[]>([]);
  const [favorites, setFavorites] = useState<SearchFeature[]>([]);
  const [reports, setReports] = useState<HazardReport[]>([]);
  const [mapCenter, setMapCenter] = useState<Coordinate>({ lat: appEnv.defaultLat, lng: appEnv.defaultLng });
  const [panelOpen, setPanelOpen] = useState(true);
  const [options, setOptions] = useState<RouteOptions>({
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false,
    preferTwisty: false,
    alternatives: true
  });
  const [activeAlternativeId, setActiveAlternativeId] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [navActive, setNavActive] = useState(false);
  const [navStepIdx, setNavStepIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  // Pending destination from URL share link (need origin before we can route)
  const pendingShareRef = useRef<SearchFeature | null>(null);
  const pendingRoutedRef = useRef(false);

  const health = useSWR<{ ok: boolean; services: Record<string, string> }>('/api/health', fetcher, { refreshInterval: 20_000 });

  // Restore persisted state
  useEffect(() => {
    setRecents(getRecents());
    setFavorites(getFavorites());
    setReports(getReports());
    setOptions(getRouteOptions());
  }, []);

  // Parse share URL params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const to = params.get('to');
    const toName = params.get('toName');
    const toLabel = params.get('toLabel');
    if (to) {
      const [lat, lng] = to.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        pendingShareRef.current = {
          id: `share-${lat}-${lng}`,
          name: toName ?? 'Shared destination',
          label: toLabel ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          coordinate: { lat, lng }
        };
      }
    }
  }, []);

  // GPS: one-shot for origin + watch for live position
  useEffect(() => {
    void (async () => {
      const here = await getCurrentPosition();
      if (here) {
        setOrigin(here);
        setMapCenter(here);
        // If a shared destination is waiting, route to it now
        if (pendingShareRef.current && !pendingRoutedRef.current) {
          pendingRoutedRef.current = true;
          void buildRoute(pendingShareRef.current, here);
        }
      }
    })();

    const stop = watchUserPosition((pos) => {
      setUserPosition(pos);
      setOrigin((prev) => prev ?? pos.coordinate);
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chargerUrl = useMemo(() => `/api/chargers?lat=${mapCenter.lat}&lng=${mapCenter.lng}&radiusKm=10`, [mapCenter]);
  const { data: chargerData } = useSWR<{ results: ChargerSite[] }>(chargerUrl, fetcher, { refreshInterval: 90_000 });

  const bbox = useMemo(() => bboxFromCenter(mapCenter, 20), [mapCenter]);
  const { data: incidentData } = useSWR<{ results: Incident[] }>('/api/incidents', fetcher, { refreshInterval: 60_000 });
  const visibleIncidents = useMemo(
    () =>
      (incidentData?.results ?? []).filter(
        (item) =>
          item.coordinate.lat >= bbox.minLat &&
          item.coordinate.lat <= bbox.maxLat &&
          item.coordinate.lng >= bbox.minLng &&
          item.coordinate.lng <= bbox.maxLng
      ),
    [bbox, incidentData?.results]
  );

  const routeSummary = useMemo(() => {
    if (!route) return null;
    return `${formatDistanceKm(route.summary.distanceKm)} · ${formatDurationMin(route.summary.durationMin)}`;
  }, [route]);

  const activeManeuver: RouteManeuver | null = useMemo(() => {
    if (!navActive || !route) return null;
    return route.maneuvers[navStepIdx] ?? null;
  }, [navActive, route, navStepIdx]);

  // Auto-advance step when GPS is close to the next maneuver coordinate
  useEffect(() => {
    if (!navActive || !route || !userPosition) return;
    const step = route.maneuvers[navStepIdx];
    if (!step?.coordinate) return;
    const dlat = userPosition.coordinate.lat - step.coordinate.lat;
    const dlng = userPosition.coordinate.lng - step.coordinate.lng;
    const distM = Math.sqrt(dlat * dlat + dlng * dlng) * 111_000;
    if (distM < 60 && navStepIdx < route.maneuvers.length - 1) {
      setNavStepIdx((i) => i + 1);
    }
  }, [navActive, route, navStepIdx, userPosition]);

  const buildRoute = useCallback(async (nextDestination: SearchFeature, originOverride?: Coordinate) => {
    const from = originOverride ?? origin;
    if (!from) return;
    const response = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: from, destination: nextDestination.coordinate, options })
    });
    if (!response.ok) return;
    const data = (await response.json()) as RouteResponse;
    setDestination(nextDestination);
    setRoute(data);
    setActiveAlternativeId(null);
    setNavActive(false);
    setNavStepIdx(0);
    setMapCenter(nextDestination.coordinate);
    pushRecent(nextDestination);
    setRecents(getRecents());
    setPanelOpen(false);
  }, [origin, options]);

  function handleFavoriteToggle(item: SearchFeature) {
    setFavorites(toggleFavorite(item));
  }

  function handleReport(kind: HazardReport['kind']) {
    if (!appEnv.enableReports || !mapCenter) return;
    const report: HazardReport = { id: crypto.randomUUID(), kind, coordinate: mapCenter, createdAt: new Date().toISOString() };
    saveReport(report);
    setReports(getReports());
  }

  function handleOptionsChange(next: RouteOptions) {
    setOptions(next);
    saveRouteOptions(next);
    if (destination) void buildRoute(destination);
  }

  function applyAlternative(id: string | null) {
    if (!route) return;
    setActiveAlternativeId(id);
    if (id === null) return;
    const alt = route.alternatives.find((a) => a.id === id);
    if (!alt) return;
    setRoute({ ...route, geometry: alt.geometry, summary: { ...route.summary, distanceKm: alt.distanceKm, durationMin: alt.durationMin } });
  }

  async function handleShare() {
    if (!destination) return;
    const { lat, lng } = destination.coordinate;
    const url = `${window.location.origin}?to=${lat},${lng}&toName=${encodeURIComponent(destination.name)}&toLabel=${encodeURIComponent(destination.label)}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const speedKmh = userPosition ? Math.round(userPosition.speedKmh) : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <TeslaMap
        center={mapCenter}
        origin={origin}
        destination={destination?.coordinate ?? null}
        route={route}
        reports={reports}
        chargers={chargerData?.results ?? []}
        incidents={visibleIncidents}
        activeAlternativeId={activeAlternativeId}
        onCenterChange={setMapCenter}
        userPosition={userPosition}
        activeManeuver={activeManeuver}
        navigationMode={navActive}
      />

      {/* Top status bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-slate-900/85 px-4 py-2 shadow-panel backdrop-blur">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="text-sm font-medium">{appEnv.appName}</span>
          <span className="text-xs text-slate-400">{health.data?.services?.photon ?? 'photon?'} / {health.data?.services?.valhalla ?? 'valhalla?'}</span>
          {speedKmh !== null && speedKmh > 2 && (
            <span className="rounded-full bg-slate-700/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
              {speedKmh} km/h
            </span>
          )}
        </div>
      </div>

      {/* Search panel */}
      <div className="absolute left-4 top-20 z-30 w-[min(27rem,calc(100vw-2rem))]">
        <SearchPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          origin={origin}
          destination={destination}
          recents={recents}
          favorites={favorites}
          options={options}
          onOptionsChange={handleOptionsChange}
          onSelect={buildRoute}
          onFavoriteToggle={handleFavoriteToggle}
        />
      </div>

      {/* Right sidebar */}
      <div className="absolute right-4 top-24 z-30 hidden w-80 space-y-3 lg:block">
        <InfoCard title="Nearby chargers" icon={<Zap className="h-4 w-4" />}>
          {(chargerData?.results ?? []).slice(0, 4).map((charger) => (
            <div key={charger.id} className="rounded-2xl border border-border bg-slate-800/60 p-3">
              <div className="text-sm font-semibold text-white">{charger.name}</div>
              <div className="mt-1 text-xs text-slate-400">{charger.network}</div>
              <div className="mt-2 text-xs text-slate-300">{charger.plugs.join(' · ')}{charger.powerKw ? ` · ${charger.powerKw} kW` : ''}</div>
            </div>
          ))}
        </InfoCard>

        <InfoCard title="Live incidents" icon={<CarFront className="h-4 w-4" />}>
          {visibleIncidents.slice(0, 3).map((incident) => (
            <div key={incident.id} className="rounded-2xl border border-border bg-slate-800/60 p-3">
              <div className="text-sm font-semibold text-white">{incident.title}</div>
              <div className="mt-1 text-xs text-slate-400">{incident.kind} · {incident.source}</div>
              <div className="mt-2 text-xs text-slate-300">{incident.description ?? 'No extra detail provided.'}</div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">{formatRelativeTime(incident.updatedAt)}</div>
            </div>
          ))}
        </InfoCard>
      </div>

      {/* Bottom route sheet */}
      <div className="absolute bottom-0 left-1/2 z-30 w-[min(64rem,calc(100vw-1rem))] -translate-x-1/2 px-2 pb-2">
        <div className="rounded-[2rem] border border-border bg-slate-900/92 p-4 shadow-panel backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Route sheet</div>
              <div className="mt-1 text-xl font-semibold text-white">{destination?.name ?? 'Pick a destination'}</div>
              <div className="mt-1 text-sm text-slate-400">{destination?.label ?? 'Search above to start routing.'}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => origin && setMapCenter(origin)}
                className="flex items-center gap-2 rounded-full border border-border bg-slate-800/90 px-4 py-3 text-sm font-medium transition hover:bg-slate-700"
              >
                <LocateFixed className="h-4 w-4" />
                Recenter
              </button>
              <button
                type="button"
                onClick={() => destination && handleFavoriteToggle(destination)}
                disabled={!destination}
                className="flex items-center gap-2 rounded-full border border-border bg-slate-800/90 px-4 py-3 text-sm font-medium transition hover:bg-slate-700 disabled:opacity-50"
              >
                <Star className="h-4 w-4" />
                Favorite
              </button>
              <button
                type="button"
                onClick={() => void handleShare()}
                disabled={!destination}
                className="flex items-center gap-2 rounded-full border border-border bg-slate-800/90 px-4 py-3 text-sm font-medium transition hover:bg-slate-700 disabled:opacity-50"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Share route'}
              </button>
              <button
                type="button"
                onClick={() => handleReport('hazard')}
                className="flex items-center gap-2 rounded-full border border-border bg-slate-800/90 px-4 py-3 text-sm font-medium transition hover:bg-slate-700"
              >
                <ShieldAlert className="h-4 w-4" />
                Report hazard
              </button>
              {route && (
                <button
                  type="button"
                  onClick={() => {
                    setNavActive((v) => !v);
                    setNavStepIdx(0);
                  }}
                  className={`flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold transition ${
                    navActive
                      ? 'border-rose-500/60 bg-rose-500/90 text-white hover:bg-rose-400'
                      : 'border-sky-500/60 bg-sky-500/90 text-slate-950 hover:bg-sky-400'
                  }`}
                >
                  {navActive ? <NavigationOff className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
                  {navActive ? 'Stop nav' : 'Start nav'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-border bg-slate-800/90 px-4 py-3 text-sm font-medium transition hover:bg-slate-700"
              >
                <Route className="h-4 w-4" />
                {panelOpen ? 'Hide search' : 'Search'}
              </button>
            </div>
          </div>

          {route && destination ? (
            <>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr,1fr]">
                <div className="rounded-3xl border border-border bg-slate-800/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">ETA</div>
                      <div className="mt-1 text-2xl font-semibold text-white">{routeSummary}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="rounded-full bg-slate-700/80 px-3 py-1">{route.summary.hasToll ? 'Contains tolls' : 'No toll detected'}</span>
                      <span className="rounded-full bg-slate-700/80 px-3 py-1">{route.summary.hasFerry ? 'Contains ferry' : 'No ferry detected'}</span>
                    </div>
                  </div>

                  {route.alternatives.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applyAlternative(null)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold ${activeAlternativeId === null ? 'bg-sky-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                      >
                        Main route
                      </button>
                      {route.alternatives.map((alt) => (
                        <button
                          key={alt.id}
                          type="button"
                          onClick={() => applyAlternative(alt.id)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold ${activeAlternativeId === alt.id ? 'bg-sky-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                        >
                          {alt.label} · {formatDurationMin(alt.durationMin)}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {/* Turn-by-turn steps */}
                  <div className="mt-4">
                    {navActive ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Step {navStepIdx + 1} of {route.maneuvers.length}</div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={navStepIdx === 0}
                              onClick={() => setNavStepIdx((i) => Math.max(0, i - 1))}
                              className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold disabled:opacity-40 hover:bg-slate-600"
                            >
                              ← Prev
                            </button>
                            <button
                              type="button"
                              disabled={navStepIdx >= route.maneuvers.length - 1}
                              onClick={() => setNavStepIdx((i) => Math.min(route.maneuvers.length - 1, i + 1))}
                              className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold disabled:opacity-40 hover:bg-slate-600"
                            >
                              Next →
                            </button>
                          </div>
                        </div>
                        {activeManeuver && (
                          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3">
                            <div className="text-sm font-semibold text-sky-100">{activeManeuver.instruction}</div>
                            <div className="mt-1 text-xs text-slate-400">{formatDistanceKm(activeManeuver.distanceKm)}{activeManeuver.timeMin ? ` · ${formatDurationMin(activeManeuver.timeMin)}` : ''}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-3">
                        {route.maneuvers.slice(0, 3).map((maneuver, index) => (
                          <div key={`${maneuver.instruction}-${index}`} className="rounded-2xl border border-border bg-slate-900/70 p-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Step {index + 1}</div>
                            <div className="mt-1 text-sm font-medium text-slate-100">{maneuver.instruction}</div>
                            <div className="mt-2 text-xs text-slate-400">{formatDistanceKm(maneuver.distanceKm)}{maneuver.timeMin ? ` · ${formatDurationMin(maneuver.timeMin)}` : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-slate-800/70 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">What is on map</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-200">
                    <MapStat label="Chargers" detail="OpenStreetMap charging stations within 10 km." count={chargerData?.results?.length ?? 0} />
                    <MapStat label="Incidents" detail="Normalized feed incidents inside the current viewport area." count={visibleIncidents.length} />
                    <MapStat label="User reports" detail="Saved locally. Click map dots for details." count={reports.length} />
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-slate-900/92 p-4 shadow-panel backdrop-blur">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        {icon}
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MapStat({ label, detail, count }: { label: string; detail: string; count: number }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-900/70 p-3">
      <div>
        <div className="font-semibold text-white">{label}</div>
        <div className="mt-1 text-xs text-slate-400">{detail}</div>
      </div>
      <div className="text-lg font-semibold">{count}</div>
    </div>
  );
}
