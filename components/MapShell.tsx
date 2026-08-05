'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgePercent,
  Check,
  Copy,
  Layers,
  Loader2,
  LocateFixed,
  Navigation,
  Route as RouteIcon,
  Settings2,
  ShieldAlert,
  Star,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import { ChargerCard } from '@/components/ChargerCard';
import { ManeuverIcon } from '@/components/ManeuverIcon';
import { NavMap } from '@/components/NavMap';
import { NavPanel } from '@/components/NavPanel';
import { SearchPanel } from '@/components/SearchPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { MAP_STYLES, appEnv } from '@/lib/config';
import { getCurrentPosition, watchUserPosition } from '@/lib/geo';
import { NavIndex, NavProgress, announcementFor, buildNavIndex, computeProgress, formatDistanceM, formatEtaClock } from '@/lib/nav';
import { reverseGeocode } from '@/lib/services/geocode';
import { fetchChargers, fetchPlacesAlongRoute, fetchPlacesNear } from '@/lib/services/overpass';
import { RoutingError, fetchRoute } from '@/lib/services/routing';
import {
  Preferences,
  SavedPlace,
  clearRecents,
  getPreferences,
  getRecents,
  getReports,
  getRouteOptions,
  getSavedPlaces,
  getVehicle,
  pushRecent,
  savePreferences,
  saveReport,
  saveRouteOptions,
  saveVehicle,
  setPlaceRole,
  toggleSavedPlace
} from '@/lib/storage';
import { decodeTrip, encodeTrip, estimateRange } from '@/lib/trip';
import { primeSpeech, speak, stopSpeaking } from '@/lib/voice';
import { cn, formatDistanceKm, formatDurationMin } from '@/lib/utils';
import {
  ChargerSite,
  Coordinate,
  HazardReport,
  Place,
  PlaceCategoryId,
  RouteOptions,
  RouteResponse,
  SearchFeature,
  UserPosition,
  VehicleProfile,
  Waypoint
} from '@/types/map';

/** Consecutive off-route fixes before we ask for a new route. */
const REROUTE_THRESHOLD = 3;

export function MapShell() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [activeAlternativeId, setActiveAlternativeId] = useState<string | null>(null);

  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [mapCenter, setMapCenter] = useState<Coordinate>({ lat: appEnv.defaultLat, lng: appEnv.defaultLng });

  const [navActive, setNavActive] = useState(false);
  const [progress, setProgress] = useState<NavProgress | null>(null);
  const [rerouting, setRerouting] = useState(false);

  const [preferences, setPreferences] = useState<Preferences>(() => getPreferences());
  const [vehicle, setVehicle] = useState<VehicleProfile>(() => getVehicle());
  const [options, setOptions] = useState<RouteOptions>(() => getRouteOptions());
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [recents, setRecents] = useState<SearchFeature[]>([]);
  const [reports, setReports] = useState<HazardReport[]>([]);

  const [chargers, setChargers] = useState<ChargerSite[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [activeCategory, setActiveCategory] = useState<PlaceCategoryId | null>(null);
  const [categoryLoading, setCategoryLoading] = useState<PlaceCategoryId | null>(null);
  const [selectedCharger, setSelectedCharger] = useState<ChargerSite | null>(null);

  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [fitRouteToken, setFitRouteToken] = useState(0);
  const [recenterToken, setRecenterToken] = useState(0);

  const navIndexRef = useRef<NavIndex | null>(null);
  const shapeHintRef = useRef(0);
  const announcedRef = useRef(new Set<string>());
  const offRouteCountRef = useRef(0);
  const routeAbortRef = useRef<AbortController | null>(null);

  const destination = waypoints.length > 1 ? waypoints[waypoints.length - 1] : null;

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  /* -------------------------------------------------- persisted state */
  useEffect(() => {
    setSaved(getSavedPlaces());
    setRecents(getRecents());
    setReports(getReports());
  }, []);

  /* ------------------------------------------------------- geolocation */
  useEffect(() => {
    void (async () => {
      const here = await getCurrentPosition();
      if (here) setMapCenter(here);
      else setGeoDenied(true);
    })();

    return watchUserPosition((position) => {
      setUserPosition(position);
      setGeoDenied(false);
    });
  }, []);

  /* ------------------------------------------------- shared trip links */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shared = decodeTrip(window.location.search);
    if (!shared) return;

    setOptions(shared.options);
    setWaypoints(shared.waypoints);
    setMapCenter(shared.waypoints[0].coordinate);
    setPanelOpen(false);
    // Clean the URL so a refresh doesn't re-apply a trip the user has edited.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  /* ------------------------------------------------------------ routing */
  // Snapshot the stop coordinates so live GPS drift doesn't retrigger routing.
  const stopsKey = useMemo(
    () => waypoints.map((point) => `${point.coordinate.lat.toFixed(5)},${point.coordinate.lng.toFixed(5)}`).join(';'),
    [waypoints]
  );

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoute(null);
      setRouteError(null);
      setProgress(null);
      navIndexRef.current = null;
      return;
    }

    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setRouteLoading(true);
    setRouteError(null);

    fetchRoute(
      waypoints.map((point) => point.coordinate),
      options,
      controller.signal
    )
      .then((result) => {
        setRoute(result);
        setActiveAlternativeId(null);
        navIndexRef.current = buildNavIndex(result);
        shapeHintRef.current = 0;
        announcedRef.current.clear();
        offRouteCountRef.current = 0;
        setRerouting(false);
        setFitRouteToken((token) => token + 1);
      })
      .catch((cause: Error) => {
        if (cause.name === 'AbortError') return;
        setRoute(null);
        navIndexRef.current = null;
        setRouteError(cause instanceof RoutingError ? cause.message : 'Routing failed. Try again in a moment.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });

    return () => controller.abort();
    // stopsKey stands in for the waypoint coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, options]);

  /* ------------------------------------------- navigation progress loop */
  useEffect(() => {
    if (!navActive || !route || !userPosition || !navIndexRef.current) return;

    const next = computeProgress(route, navIndexRef.current, userPosition, shapeHintRef.current);
    if (!next) return;

    shapeHintRef.current = next.stepIndex > 0 ? route.maneuvers[next.stepIndex - 1].shapeIndex : 0;
    setProgress(next);

    if (next.isOffRoute) {
      offRouteCountRef.current += 1;
    } else {
      offRouteCountRef.current = 0;
      if (rerouting) setRerouting(false);
    }

    // Announce the upcoming turn once per distance band.
    const maneuver = route.maneuvers[next.stepIndex];
    if (preferences.voiceGuidance && maneuver && !next.isOffRoute) {
      const line = announcementFor(maneuver, next.distanceToManeuverM, announcedRef.current, preferences.imperial);
      if (line) speak(line, { interrupt: next.distanceToManeuverM < 120 });
    }
  }, [navActive, route, userPosition, preferences.voiceGuidance, preferences.imperial, rerouting]);

  /* --------------------------------------------------------- rerouting */
  useEffect(() => {
    if (!navActive || !userPosition || offRouteCountRef.current < REROUTE_THRESHOLD || rerouting) return;

    setRerouting(true);
    offRouteCountRef.current = 0;
    if (preferences.voiceGuidance) speak('Recalculating route.', { interrupt: true });

    // Re-route from where the driver actually is, keeping every stop ahead.
    setWaypoints((current) => [
      {
        id: `gps-${Date.now()}`,
        name: 'Current location',
        label: 'Live position',
        coordinate: userPosition.coordinate,
        isCurrentLocation: true
      },
      ...current.slice(1)
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, navActive, userPosition]);

  /* ---------------------------------------------------------- chargers */
  useEffect(() => {
    if (!preferences.showChargers) {
      setChargers([]);
      return;
    }

    const controller = new AbortController();
    // Debounce so panning the map doesn't hammer Overpass.
    const timer = setTimeout(() => {
      fetchChargers(mapCenter, 12, controller.signal)
        .then(setChargers)
        .catch((cause: Error) => {
          if (cause.name !== 'AbortError') setChargers([]);
        });
    }, 700);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mapCenter.lat, mapCenter.lng, preferences.showChargers]);

  const visibleChargers = useMemo(
    () => chargers.filter((charger) => preferences.minChargerKw === 0 || (charger.powerKw ?? 0) >= preferences.minChargerKw),
    [chargers, preferences.minChargerKw]
  );

  /* ------------------------------------------------------------ actions */
  const originWaypoint = useCallback((): Waypoint => {
    const point = userPosition?.coordinate ?? mapCenter;
    return {
      id: 'origin',
      name: userPosition ? 'Current location' : 'Map center',
      label: userPosition ? 'Live position' : `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
      coordinate: point,
      isCurrentLocation: Boolean(userPosition)
    };
  }, [userPosition, mapCenter]);

  const setDestination = useCallback(
    (feature: SearchFeature) => {
      const stop: Waypoint = { id: feature.id, name: feature.name, label: feature.label, coordinate: feature.coordinate };
      setWaypoints((current) => (current.length > 1 ? [...current.slice(0, -1), stop] : [originWaypoint(), stop]));
      setRecents(pushRecent(feature));
      setSelectedCharger(null);
      setPanelOpen(false);
      setMapCenter(feature.coordinate);
    },
    [originWaypoint]
  );

  const addStop = useCallback(
    (feature: SearchFeature) => {
      setWaypoints((current) => {
        if (current.length < 2) return current;
        const stop: Waypoint = {
          id: `${feature.id}-${current.length}`,
          name: feature.name,
          label: feature.label,
          coordinate: feature.coordinate
        };
        // New stops land just before the final destination.
        return [...current.slice(0, -1), stop, current[current.length - 1]];
      });
      setSelectedCharger(null);
      showToast(`Added ${feature.name} as a stop`);
    },
    [showToast]
  );

  const removeWaypoint = useCallback((id: string) => {
    setWaypoints((current) => {
      const next = current.filter((point) => point.id !== id);
      return next.length < 2 ? [] : next;
    });
  }, []);

  const moveWaypoint = useCallback((id: string, direction: -1 | 1) => {
    setWaypoints((current) => {
      const index = current.findIndex((point) => point.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleCategory = useCallback(
    (category: PlaceCategoryId | null, alongRoute: boolean) => {
      setActiveCategory(category);
      if (!category) {
        setPlaces([]);
        return;
      }

      setCategoryLoading(category);
      const anchor = userPosition?.coordinate ?? mapCenter;
      const request =
        alongRoute && route ? fetchPlacesAlongRoute(category, route.coordinates, 3) : fetchPlacesNear(category, anchor, 10);

      request
        .then((found) => {
          setPlaces(found);
          if (!found.length) showToast('Nothing found nearby for that category.');
        })
        .catch(() => {
          setPlaces([]);
          showToast('Place search is unavailable right now.');
        })
        .finally(() => setCategoryLoading(null));
    },
    [userPosition, mapCenter, route, showToast]
  );

  const handleLongPress = useCallback(
    (point: Coordinate) => {
      void reverseGeocode(point).then((feature) => {
        setDestination(
          feature ?? {
            id: `pin-${point.lat.toFixed(5)},${point.lng.toFixed(5)}`,
            name: 'Dropped pin',
            label: `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
            coordinate: point
          }
        );
      });
    },
    [setDestination]
  );

  function toggleNavigation() {
    if (navActive) {
      setNavActive(false);
      setProgress(null);
      stopSpeaking();
      return;
    }

    if (!route) return;
    if (!userPosition) {
      showToast('Waiting for GPS — navigation needs your live position.');
      return;
    }

    announcedRef.current.clear();
    shapeHintRef.current = 0;
    offRouteCountRef.current = 0;
    setNavActive(true);
    setPanelOpen(false);
    setSelectedCharger(null);

    if (preferences.voiceGuidance) {
      primeSpeech();
      speak(`Starting navigation. ${route.maneuvers[0]?.verbalInstruction ?? ''}`);
    }
  }

  async function handleShare() {
    if (waypoints.length < 2) return;
    const url = `${window.location.origin}${window.location.pathname}?${encodeTrip(waypoints, options)}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      showToast('Could not copy — your browser blocked clipboard access.');
    }
  }

  function handleReport(kind: HazardReport['kind']) {
    const report: HazardReport = {
      id: `${Date.now()}-${kind}`,
      kind,
      coordinate: userPosition?.coordinate ?? mapCenter,
      createdAt: new Date().toISOString()
    };
    setReports(saveReport(report));
    showToast('Hazard saved on this device.');
  }

  function updatePreferences(next: Preferences) {
    setPreferences(savePreferences(next));
    if (!next.voiceGuidance) stopSpeaking();
  }

  function cycleMapStyle() {
    const index = MAP_STYLES.findIndex((style) => style.id === preferences.mapStyleId);
    const next = MAP_STYLES[(index + 1) % MAP_STYLES.length];
    updatePreferences({ ...preferences, mapStyleId: next.id });
    showToast(`Map style: ${next.label}`);
  }

  const activeRouteSummary = useMemo(() => {
    if (!route) return null;
    const alternative = route.alternatives.find((item) => item.id === activeAlternativeId);
    return {
      distanceKm: alternative?.distanceKm ?? route.summary.distanceKm,
      durationMin: alternative?.durationMin ?? route.summary.durationMin,
      hasToll: alternative?.hasToll ?? route.summary.hasToll,
      hasFerry: route.summary.hasFerry
    };
  }, [route, activeAlternativeId]);

  const range = useMemo(() => estimateRange(route, vehicle), [route, vehicle]);

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100">
      <NavMap
        center={mapCenter}
        styleId={preferences.mapStyleId}
        waypoints={waypoints}
        route={route}
        activeAlternativeId={activeAlternativeId}
        chargers={visibleChargers}
        places={places}
        reports={reports}
        userPosition={userPosition}
        snappedPosition={navActive ? progress?.snapped ?? null : null}
        navActive={navActive}
        courseDeg={progress?.courseDeg ?? null}
        fitRouteToken={fitRouteToken}
        recenterToken={recenterToken}
        onCenterChange={setMapCenter}
        onChargerSelect={setSelectedCharger}
        onPlaceSelect={(place) =>
          setDestination({ id: place.id, name: place.name, label: place.address ?? '', coordinate: place.coordinate })
        }
        onAlternativeSelect={(id) => setActiveAlternativeId(id === 'main' ? null : id)}
        onMapLongPress={handleLongPress}
      />

      {navActive && route ? (
        <NavPanel
          route={route}
          progress={progress}
          userPosition={userPosition}
          imperial={preferences.imperial}
          voiceOn={preferences.voiceGuidance}
          rerouting={rerouting}
          onToggleVoice={() => updatePreferences({ ...preferences, voiceGuidance: !preferences.voiceGuidance })}
          onStop={toggleNavigation}
        />
      ) : (
        <>
          <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-slate-900/90 px-4 py-2 shadow-panel backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-semibold">{appEnv.appName}</span>
              {geoDenied ? <span className="text-xs text-amber-300">GPS off</span> : null}
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <Link
                href="/discounts"
                aria-label="Discounts"
                className="rounded-full border border-border bg-slate-900/90 p-2.5 text-slate-300 shadow-panel backdrop-blur transition hover:bg-slate-800"
              >
                <BadgePercent className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={cycleMapStyle}
                aria-label="Change map style"
                className="rounded-full border border-border bg-slate-900/90 p-2.5 text-slate-300 shadow-panel backdrop-blur transition hover:bg-slate-800"
              >
                <Layers className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                className="rounded-full border border-border bg-slate-900/90 p-2.5 text-slate-300 shadow-panel backdrop-blur transition hover:bg-slate-800"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="absolute left-3 top-16 z-30 w-[min(26rem,calc(100vw-1.5rem))]">
            <SearchPanel
              open={panelOpen}
              onOpenChange={setPanelOpen}
              anchor={userPosition?.coordinate ?? mapCenter}
              waypoints={waypoints}
              saved={saved}
              recents={recents}
              options={options}
              imperial={preferences.imperial}
              categoryLoading={categoryLoading}
              categoryResults={places}
              activeCategory={activeCategory}
              hasRoute={Boolean(route)}
              onOptionsChange={(next) => setOptions(saveRouteOptions(next))}
              onSetDestination={setDestination}
              onAddStop={addStop}
              onRemoveWaypoint={removeWaypoint}
              onMoveWaypoint={moveWaypoint}
              onToggleSaved={(feature) => setSaved(toggleSavedPlace(feature))}
              onSetRole={(id, role) => setSaved(setPlaceRole(id, role))}
              onCategorySelect={handleCategory}
              onClearRecents={() => setRecents(clearRecents())}
            />
          </div>
        </>
      )}

      {selectedCharger ? (
        <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 lg:left-auto lg:right-4 lg:translate-x-0">
          <ChargerCard
            charger={selectedCharger}
            from={userPosition?.coordinate ?? mapCenter}
            imperial={preferences.imperial}
            canAddStop={waypoints.length > 1}
            onNavigate={() =>
              setDestination({
                id: selectedCharger.id,
                name: selectedCharger.name,
                label: selectedCharger.network,
                coordinate: selectedCharger.coordinate
              })
            }
            onAddStop={() =>
              addStop({
                id: selectedCharger.id,
                name: selectedCharger.name,
                label: selectedCharger.network,
                coordinate: selectedCharger.coordinate
              })
            }
            onClose={() => setSelectedCharger(null)}
          />
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <SettingsPanel
            preferences={preferences}
            vehicle={vehicle}
            onPreferencesChange={updatePreferences}
            onVehicleChange={(next) => setVehicle(saveVehicle(next))}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      ) : null}

      {!navActive && !selectedCharger ? (
        <div className="absolute inset-x-0 bottom-0 z-20 px-2 pb-2">
          <div className="mx-auto w-[min(60rem,100%)] rounded-[1.75rem] border border-border bg-slate-900/95 p-4 shadow-panel backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {routeLoading ? (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                    <span className="text-sm">Finding the best route…</span>
                  </div>
                ) : routeError ? (
                  <div className="flex items-start gap-2 text-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="text-sm">{routeError}</span>
                  </div>
                ) : activeRouteSummary && destination ? (
                  <>
                    <div className="truncate text-lg font-semibold text-white">{destination.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="text-2xl font-semibold tabular-nums text-white">
                        {formatDurationMin(activeRouteSummary.durationMin)}
                      </span>
                      <span className="text-slate-400">
                        {formatDistanceKm(activeRouteSummary.distanceKm, preferences.imperial)}
                      </span>
                      <span className="text-slate-400">arrive {formatEtaClock(activeRouteSummary.durationMin * 60)}</span>
                      {activeRouteSummary.hasToll ? <Tag tone="amber">Tolls</Tag> : null}
                      {activeRouteSummary.hasFerry ? <Tag tone="sky">Ferry</Tag> : null}
                      {waypoints.length > 2 ? (
                        <Tag tone="slate">
                          {waypoints.length - 2} stop{waypoints.length > 3 ? 's' : ''}
                        </Tag>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-semibold text-white">Where to?</div>
                    <div className="mt-1 text-sm text-slate-400">
                      Search above, tap a charger, or long-press the map to drop a destination.
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <IconButton label="Recenter" onClick={() => setRecenterToken((token) => token + 1)}>
                  <LocateFixed className="h-4 w-4" />
                </IconButton>
                {route ? (
                  <IconButton label="Fit route" onClick={() => setFitRouteToken((token) => token + 1)}>
                    <RouteIcon className="h-4 w-4" />
                  </IconButton>
                ) : null}
                {destination ? (
                  <IconButton
                    label="Save"
                    onClick={() =>
                      setSaved(
                        toggleSavedPlace({
                          id: destination.id,
                          name: destination.name,
                          label: destination.label,
                          coordinate: destination.coordinate
                        })
                      )
                    }
                  >
                    <Star
                      className={cn('h-4 w-4', saved.some((item) => item.id === destination.id) && 'fill-current text-yellow-300')}
                    />
                  </IconButton>
                ) : null}
                {waypoints.length > 1 ? (
                  <IconButton label={copied ? 'Copied' : 'Share'} onClick={() => void handleShare()}>
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </IconButton>
                ) : null}
                <IconButton label="Hazard" onClick={() => handleReport('hazard')}>
                  <ShieldAlert className="h-4 w-4" />
                </IconButton>

                {route ? (
                  <button
                    type="button"
                    onClick={toggleNavigation}
                    className="flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-sky-400"
                  >
                    <Navigation className="h-4 w-4" />
                    Start
                  </button>
                ) : null}
              </div>
            </div>

            {route && route.alternatives.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <AlternateChip active={activeAlternativeId === null} onClick={() => setActiveAlternativeId(null)}>
                  Fastest · {formatDurationMin(route.summary.durationMin)}
                </AlternateChip>
                {route.alternatives.map((alternative) => (
                  <AlternateChip
                    key={alternative.id}
                    active={activeAlternativeId === alternative.id}
                    onClick={() => setActiveAlternativeId(alternative.id)}
                  >
                    {alternative.label} · {formatDurationMin(alternative.durationMin)}
                  </AlternateChip>
                ))}
              </div>
            ) : null}

            {route ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
                {/* minmax(0,…) lets the turn list shrink; a bare 1fr floors at its
                    longest instruction and pushes the range card off-panel. */}
                <div className="rounded-2xl border border-border bg-slate-800/50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">First turns</div>
                  <div className="mt-2 space-y-1.5">
                    {route.maneuvers.slice(0, 3).map((maneuver, index) => (
                      <div key={`${maneuver.shapeIndex}-${index}`} className="flex items-center gap-2.5">
                        <ManeuverIcon kind={maneuver.kind} className="h-4 w-4 shrink-0 text-sky-300" />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{maneuver.instruction}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {formatDistanceM(maneuver.distanceKm * 1000, preferences.imperial)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {range ? (
                  <div
                    className={cn(
                      'rounded-2xl border p-3',
                      range.reachable ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                      <Zap className="h-3.5 w-3.5" />
                      Range estimate
                    </div>
                    {range.reachable ? (
                      <p className="mt-2 text-sm text-emerald-100">
                        Arrive with about <strong className="tabular-nums">{Math.round(range.arrivalSocPercent)}%</strong>. Current
                        charge covers {formatDistanceKm(range.rangeKm, preferences.imperial)}.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-amber-100">
                        {range.reserveReachedKm !== null
                          ? `You'd hit your reserve about ${formatDistanceKm(range.reserveReachedKm, preferences.imperial)} in. Add a charging stop.`
                          : 'This trip is beyond your current charge. Add a charging stop.'}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCategory('charging', true)}
                      className="mt-2 text-xs font-semibold text-sky-300 underline-offset-2 hover:underline"
                    >
                      Find chargers along this route
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute bottom-40 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-slate-800/95 px-4 py-2 text-sm text-slate-100 shadow-panel backdrop-blur">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center gap-2 rounded-full border border-border bg-slate-800/90 px-3.5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function AlternateChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-semibold transition',
        active ? 'bg-sky-500 text-slate-950' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-700'
      )}
    >
      {children}
    </button>
  );
}

function Tag({ tone, children }: { tone: 'amber' | 'sky' | 'slate'; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-amber-500/20 text-amber-200',
    sky: 'bg-sky-500/20 text-sky-200',
    slate: 'bg-slate-700 text-slate-300'
  };
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}
