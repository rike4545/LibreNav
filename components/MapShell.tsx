'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { CarFront, LocateFixed, Route, ShieldAlert, Star, Zap } from 'lucide-react';
import { appEnv } from '@/lib/env';
import { getCurrentPosition } from '@/lib/geo';
import { getFavorites, getRecents, getReports, getRouteOptions, pushRecent, saveReport, saveRouteOptions, toggleFavorite } from '@/lib/storage';
import { bboxFromCenter, formatDistanceKm, formatDurationMin, formatRelativeTime } from '@/lib/utils';
import { ChargerSite, Coordinate, HazardReport, Incident, RouteOptions, RouteResponse, SearchFeature } from '@/types/map';
import { SearchPanel } from '@/components/SearchPanel';
import { TeslaMap } from '@/components/TeslaMap';

const fetcher = async <T,>(input: RequestInfo | URL) => {
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
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

  const health = useSWR<{ ok: boolean; services: Record<string, string> }>('/api/health', fetcher, { refreshInterval: 20_000 });

  useEffect(() => {
    setRecents(getRecents());
    setFavorites(getFavorites());
    setReports(getReports());
    setOptions(getRouteOptions());
  }, []);

  useEffect(() => {
    void (async () => {
      const here = await getCurrentPosition();
      if (here) {
        setOrigin(here);
        setMapCenter(here);
      }
    })();
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

  async function buildRoute(nextDestination: SearchFeature) {
    if (!origin) return;
    const response = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination: nextDestination.coordinate, options })
    });

    if (!response.ok) return;

    const data = (await response.json()) as RouteResponse;
    setDestination(nextDestination);
    setRoute(data);
    setActiveAlternativeId(null);
    setMapCenter(nextDestination.coordinate);
    pushRecent(nextDestination);
    setRecents(getRecents());
    setPanelOpen(false);
  }

  function handleFavoriteToggle(item: SearchFeature) {
    const next = toggleFavorite(item);
    setFavorites(next);
  }

  function handleReport(kind: HazardReport['kind']) {
    if (!appEnv.enableReports || !mapCenter) return;
    const report: HazardReport = {
      id: crypto.randomUUID(),
      kind,
      coordinate: mapCenter,
      createdAt: new Date().toISOString()
    };
    saveReport(report);
    setReports(getReports());
  }

  function handleOptionsChange(next: RouteOptions) {
    setOptions(next);
    saveRouteOptions(next);
    if (destination) {
      void buildRoute(destination);
    }
  }

  function applyAlternative(id: string | null) {
    if (!route) return;
    if (id === null) {
      setActiveAlternativeId(null);
      return;
    }
    const alternative = route.alternatives.find((item) => item.id === id);
    if (!alternative) return;
    setActiveAlternativeId(id);
    setRoute({
      ...route,
      geometry: alternative.geometry,
      summary: {
        ...route.summary,
        distanceKm: alternative.distanceKm,
        durationMin: alternative.durationMin
      }
    });
  }

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
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-slate-900/85 px-4 py-2 shadow-panel backdrop-blur">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="text-sm font-medium">{appEnv.appName}</span>
          <span className="text-xs text-slate-400">{health.data?.services?.photon ?? 'photon?'} / {health.data?.services?.valhalla ?? 'valhalla?'}</span>
        </div>
      </div>

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

      <div className="absolute bottom-0 left-1/2 z-30 w-[min(64rem,calc(100vw-1rem))] -translate-x-1/2 px-2 pb-2">
        <div className="rounded-[2rem] border border-border bg-slate-900/92 p-4 shadow-panel backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Tesla-style route sheet</div>
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
                onClick={() => handleReport('hazard')}
                className="flex items-center gap-2 rounded-full border border-border bg-slate-800/90 px-4 py-3 text-sm font-medium transition hover:bg-slate-700"
              >
                <ShieldAlert className="h-4 w-4" />
                Report hazard
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen((value) => !value)}
                className="flex items-center gap-2 rounded-full border border-sky-500/60 bg-sky-500/90 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                <Route className="h-4 w-4" />
                {panelOpen ? 'Hide search' : 'Show search'}
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
                      {route.alternatives.map((alternative) => (
                        <button
                          key={alternative.id}
                          type="button"
                          onClick={() => applyAlternative(alternative.id)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold ${activeAlternativeId === alternative.id ? 'bg-sky-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                        >
                          {alternative.label} · {formatDurationMin(alternative.durationMin)}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2 md:grid-cols-3">
                    {route.maneuvers.slice(0, 3).map((maneuver, index) => (
                      <div key={`${maneuver.instruction}-${index}`} className="rounded-2xl border border-border bg-slate-900/70 p-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Step {index + 1}</div>
                        <div className="mt-1 text-sm font-medium text-slate-100">{maneuver.instruction}</div>
                        <div className="mt-2 text-xs text-slate-400">{formatDistanceKm(maneuver.distanceKm)}{maneuver.timeMin ? ` · ${formatDurationMin(maneuver.timeMin)}` : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-slate-800/70 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">What is on map</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-200">
                    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-900/70 p-3">
                      <div>
                        <div className="font-semibold text-white">Chargers</div>
                        <div className="mt-1 text-xs text-slate-400">OpenStreetMap charging stations within 10 km.</div>
                      </div>
                      <div className="text-lg font-semibold">{chargerData?.results?.length ?? 0}</div>
                    </div>
                    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-900/70 p-3">
                      <div>
                        <div className="font-semibold text-white">Incidents</div>
                        <div className="mt-1 text-xs text-slate-400">Normalized feed incidents inside the current viewport area.</div>
                      </div>
                      <div className="text-lg font-semibold">{visibleIncidents.length}</div>
                    </div>
                    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-900/70 p-3">
                      <div>
                        <div className="font-semibold text-white">User reports</div>
                        <div className="mt-1 text-xs text-slate-400">Saved locally for now. Swap in Postgres or Redis later.</div>
                      </div>
                      <div className="text-lg font-semibold">{reports.length}</div>
                    </div>
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
