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
  Circle,
  CloudSun,
  Coffee,
  Mountain,
  Route as RouteIcon,
  Settings2,
  ShieldAlert,
  Square,
  Star,
  XCircle,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import { AlertBanner } from '@/components/AlertBanner';
import { ChargerCard } from '@/components/ChargerCard';
import { ManeuverIcon } from '@/components/ManeuverIcon';
import { NavMap } from '@/components/NavMap';
import { NavPanel } from '@/components/NavPanel';
import { ReportSheet } from '@/components/ReportSheet';
import { SearchPanel } from '@/components/SearchPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { SpeedPanel } from '@/components/SpeedPanel';
import { useResolvedTheme } from '@/components/ThemeSync';
import { MAP_STYLES, appEnv, autoMapStyleId } from '@/lib/config';
import { getCurrentPosition, watchUserPosition } from '@/lib/geo';
import { boundsOf, boxAround, haversineMeters, pathAhead } from '@/lib/geometry';
import { NavIndex, NavProgress, alertAnnouncement, announcementFor, buildNavIndex, computeProgress, formatDistanceM, formatEtaClock, nextAlertAhead } from '@/lib/nav';
import { fetchSpeedCameras, positionAlertsOnRoute } from '@/lib/services/alerts';
import { WazeThrottled, fetchWazeTraffic } from '@/lib/services/waze';
import { reverseGeocode } from '@/lib/services/geocode';
import { fetchChargers, fetchPlacesAlongRoute, fetchPlacesNear } from '@/lib/services/overpass';
import { hasLocalDataKey } from '@/lib/services/localdata';
import { LoopError, generateLoop } from '@/lib/services/loops';
import { fetchSpeedLimits, limitAtIndex } from '@/lib/services/roadinfo';
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
  clearTrips,
  getTrips,
  getVoiceSettings,
  pushRecent,
  savePreferences,
  saveReport,
  saveRouteOptions,
  saveVehicle,
  saveTrip,
  saveVoiceSettings,
  setPlaceRole,
  toggleSavedPlace
} from '@/lib/storage';
import { emitToHost, listenToHost, readEmbedConfig, routeEvent, stopsToWaypoints } from '@/lib/embed';
import { downloadGpx, trackDistanceKm } from '@/lib/gpx';
import type { TripRecord } from '@/lib/storage';
import { estimateTrafficDelay } from '@/lib/traffic';
import { ChargePlanError, chargersToWaypoints, planChargingStops } from '@/lib/services/chargeplan';
import { ElevationProfile, climbEnergyKwh, fetchElevationProfile } from '@/lib/services/elevation';
import { StopWeather, aqiTone, fetchWeatherAt } from '@/lib/services/weather';
import { DeparturePlanner } from '@/components/DeparturePlanner';
import { DetourBanner } from '@/components/DetourBanner';
import { RerouteSuggestion, findJamDetour, severeJams } from '@/lib/services/reroute';
import { planDeparture } from '@/lib/departure';
import { encodePlusCode } from '@/lib/pluscode';
import { decodeTrip, encodeTrip, estimateRange } from '@/lib/trip';
import { VoiceSettings, configureVoice, primeSpeech, speak, stopSpeaking } from '@/lib/voice';
import { releaseWakeLock, requestWakeLock } from '@/lib/wakelock';
import { cn, formatDistanceKm, formatDurationMin } from '@/lib/utils';
import {
  ChargerSite,
  Coordinate,
  HazardKind,
  HazardReport,
  RoadAlert,
  SpeedLimitSpan,
  TrackPoint,
  TrafficJam,
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

/** How many times to retry charger loading after an Overpass outage. */
const MAX_CHARGER_RETRIES = 3;

/**
 * How far ahead live traffic is fetched for, in km.
 *
 * Far enough to give warning of a jam at motorway speed (40 km is over 20
 * minutes at 110 km/h), short enough that the box stays a corridor rather than
 * half a country.
 */
const TRAFFIC_LOOKAHEAD_KM = 40;

/** Distance driven before the traffic box is moved up the route. */
const TRAFFIC_REBOX_KM = 15;

/**
 * Radius of the traffic box when there is no destination set.
 *
 * Free-driving has no corridor to look down, so this is a circle around the
 * driver instead. Matches the charger search radius, which is the area the
 * driver is already being shown.
 */
const FREE_DRIVE_RADIUS_KM = 12;

/** How far the driver moves before that box is re-centred. */
const FREE_DRIVE_REANCHOR_KM = 5;

export function MapShell() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [activeAlternativeId, setActiveAlternativeId] = useState<string | null>(null);

  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [geoResolved, setGeoResolved] = useState(false);
  const [mapCenter, setMapCenter] = useState<Coordinate>({ lat: appEnv.defaultLat, lng: appEnv.defaultLng });

  const [navActive, setNavActive] = useState(false);
  const [progress, setProgress] = useState<NavProgress | null>(null);
  const [rerouting, setRerouting] = useState(false);

  const [preferences, setPreferences] = useState<Preferences>(() => getPreferences());
  const resolvedTheme = useResolvedTheme();
  // 'auto' is a UI-level id with no tiles behind it; NavMap only ever sees a
  // real basemap, which also means a theme flip reloads the style for free.
  const mapStyleId =
    preferences.mapStyleId === 'auto' ? autoMapStyleId(resolvedTheme) : preferences.mapStyleId;
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
  const [chargerError, setChargerError] = useState(false);
  const [chargerAttempt, setChargerAttempt] = useState(0);

  const [speedLimits, setSpeedLimits] = useState<SpeedLimitSpan[]>([]);
  const [cameras, setCameras] = useState<RoadAlert[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<RoadAlert[]>([]);
  const [jams, setJams] = useState<TrafficJam[]>([]);
  const [trafficThrottled, setTrafficThrottled] = useState(false);
  const [weather, setWeather] = useState<StopWeather | null>(null);
  /** Target arrival "HH:MM" for departure planning; null means "leaving now". */
  const [targetArrival, setTargetArrival] = useState<string | null>(null);
  /** A faster way round the jams ahead, once one has been found. */
  const [detour, setDetour] = useState<RerouteSuggestion | null>(null);
  /** Jam set already evaluated, so one bad jam costs one routing request. */
  const detourCheckedRef = useRef('');
  /** Route vertex the traffic box currently starts from. */
  const [trafficFromIndex, setTrafficFromIndex] = useState(0);
  /** Centre of the traffic box while free-driving; null whenever a route is set. */
  const [freeTrafficAnchor, setFreeTrafficAnchor] = useState<Coordinate | null>(null);
  const [elevation, setElevation] = useState<ElevationProfile | null>(null);
  const [planningCharge, setPlanningCharge] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => getVoiceSettings());
  const [reportOpen, setReportOpen] = useState(false);
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [recording, setRecording] = useState(false);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loopKm, setLoopKm] = useState(40);
  const [loopBusy, setLoopBusy] = useState(false);
  const loopRotationRef = useRef(0);

  // Read once: the host contract is fixed for the life of the page.
  const embed = useMemo(() => readEmbedConfig(), []);
  const arrivedRef = useRef(false);
  const autostartRef = useRef(false);

  // Start collapsed so the map is unobstructed on open; the search field
  // stays visible, everything else is one tap away.
  const [panelOpen, setPanelOpen] = useState(false);
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
  const pendingDestinationRef = useRef<Waypoint | null>(null);
  const warnedNoOriginRef = useRef(false);
  const lastChargerFetchRef = useRef<Coordinate | null>(null);
  const announcedAlertsRef = useRef(new Set<string>());

  const destination = waypoints.length > 1 ? waypoints[waypoints.length - 1] : null;

  /** Plus Code for the destination, computed locally — no lookup involved. */
  const destinationPlusCode = destination ? encodePlusCode(destination.coordinate) : null;

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  useEffect(() => () => void releaseWakeLock(), []);

  useEffect(() => configureVoice(voiceSettings), [voiceSettings]);

  /* -------------------------------------------------------- host bridge */
  useEffect(() => {
    if (!embed.embedded) return;

    emitToHost({ type: 'librenav:ready' }, embed);

    return listenToHost(embed, (command) => {
      switch (command.type) {
        case 'librenav:navigate': {
          const stops = stopsToWaypoints(command.stops);
          if (stops.length < 2) {
            emitToHost({ type: 'librenav:error', message: 'Need at least two stops.' }, embed);
            return;
          }
          arrivedRef.current = false;
          setWaypoints(stops);
          setPanelOpen(false);
          if (command.autostart) autostartRef.current = true;
          break;
        }
        case 'librenav:cancel':
          clearRoute();
          emitToHost({ type: 'librenav:cancelled' }, embed);
          break;
        case 'librenav:recenter':
          setRecenterToken((token) => token + 1);
          break;
        case 'librenav:setVehicle':
          setVehicle((current) => saveVehicle({ ...current, ...command.vehicle }));
          break;
        case 'librenav:setUnits':
          setPreferences((current) => savePreferences({ ...current, imperial: command.imperial }));
          break;
      }
    });
    // clearRoute is stable enough for the life of the bridge.
  }, [embed]);

  /* ---------------------------------------------------------- theming */
  // ThemeSync in the root layout owns data-theme now. It does what this effect
  // did and covers /discounts too, picks the theme up before first paint, and
  // follows other tabs. updatePreferences writes through savePreferences, which
  // is what tells it a change happened.

  /* -------------------------------------------------- persisted state */
  useEffect(() => {
    // Static export prerenders this component, so localStorage cannot be read
    // until after mount. Seeding these in an effect is the point, not a slip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(getSavedPlaces());
    setRecents(getRecents());
    setReports(getReports());
    setTrips(getTrips());
  }, []);

  /* ------------------------------------------------------- geolocation */
  useEffect(() => {
    void (async () => {
      const here = await getCurrentPosition();
      if (here) setMapCenter(here);
      else setGeoDenied(true);
      // Settled either way — a pending share destination can now be paired
      // with an origin, using the map centre if the fix was refused.
      setGeoResolved(true);
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

    // Same reason: window.location is only readable once mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptions(shared.options);
    setMapCenter(shared.waypoints[0].coordinate);
    setPanelOpen(false);

    if (shared.waypoints.length > 1) {
      setWaypoints(shared.waypoints);
    } else {
      // Legacy ?to= links (and one-stop trips) carry only a destination.
      // Routing needs two points, so hold it until we have an origin.
      pendingDestinationRef.current = shared.waypoints[0];
    }

    // Clean the URL so a refresh doesn't re-apply a trip the user has edited.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    const pending = pendingDestinationRef.current;
    if (!pending) return;

    // Must be a real fix, not the map centre: the share effect already moved
    // the centre onto the destination, so falling back to it would route a
    // point to itself. Keep waiting — a later fix still completes the trip.
    if (!userPosition) {
      if (geoResolved && !warnedNoOriginRef.current) {
        warnedNoOriginRef.current = true;
        showToast('Turn on location to route to this shared destination.');
      }
      return;
    }

    pendingDestinationRef.current = null;
    setWaypoints([
      {
        id: 'origin',
        name: 'Current location',
        label: 'Live position',
        coordinate: userPosition.coordinate,
        isCurrentLocation: true
      },
      pending
    ]);
    setRecents(pushRecent({ id: pending.id, name: pending.name, label: pending.label, coordinate: pending.coordinate }));
  }, [geoResolved, userPosition, showToast]);

  /* ------------------------------------------------------------ routing */
  // Snapshot the stop coordinates so live GPS drift doesn't retrigger routing.
  const stopsKey = useMemo(
    () => waypoints.map((point) => `${point.coordinate.lat.toFixed(5)},${point.coordinate.lng.toFixed(5)}`).join(';'),
    [waypoints]
  );

  useEffect(() => {
    if (waypoints.length < 2) {
      // Clearing here rather than in cleanup on purpose — cleanup also runs
      // between two valid routes, which would blank the line mid-recompute.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  /* ------------------------------- road data for the current route */
  useEffect(() => {
    if (!route) {
      // As above: dropping these on every route recompute would strip the
      // speed limits and cameras off a route that still has them.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSpeedLimits([]);
      setCameras([]);
      setElevation(null);
      return;
    }

    const controller = new AbortController();
    announcedAlertsRef.current.clear();

    // Both are per-route one-shots, not per-tick work.
    fetchSpeedLimits(route.legs, options.mode, controller.signal)
      .then(setSpeedLimits)
      .catch(() => setSpeedLimits([]));

    fetchSpeedCameras(route.coordinates, 0.4, controller.signal)
      .then(setCameras)
      .catch(() => setCameras([]));

    fetchElevationProfile(route.coordinates, controller.signal)
      .then(setElevation)
      .catch(() => setElevation(null));

    return () => controller.abort();
    // options.mode is read above. In practice a mode change also produces a
    // new route, but depending on it directly is what makes that a fact
    // rather than a coincidence.
  }, [route, options.mode]);

  /**
   * Advance the traffic box as the drive progresses.
   *
   * Keyed off distance travelled rather than the raw shape index, so this
   * fires roughly once per TRAFFIC_REBOX_KM instead of on every GPS fix —
   * re-boxing per tick would refetch a metered endpoint continuously.
   */
  useEffect(() => {
    if (!navActive || !progress || !navIndexRef.current) {
      setTrafficFromIndex(0);
      return;
    }

    const { cumulative } = navIndexRef.current;
    const travelled = cumulative[progress.shapeIndex] ?? 0;
    const boxedAt = cumulative[trafficFromIndex] ?? 0;

    if (travelled - boxedAt >= TRAFFIC_REBOX_KM * 1000) setTrafficFromIndex(progress.shapeIndex);
  }, [navActive, progress, trafficFromIndex]);

  /**
   * Re-centre the free-drive traffic box only once the driver has actually
   * left it. Returning the same reference below the threshold keeps the bounds
   * memo stable, so a GPS tick does not trigger a metered request.
   */
  useEffect(() => {
    // Deliberately tied to a real fix rather than the map centre. Falling back
    // to the centre would fire a metered request on app open for a default
    // location nobody is driving through, and again on every pan.
    if (route || !userPosition) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFreeTrafficAnchor(null);
      return;
    }

    const here = userPosition.coordinate;
    setFreeTrafficAnchor((current) =>
      current && haversineMeters(current, here) < FREE_DRIVE_REANCHOR_KM * 1000 ? current : here
    );
  }, [route, userPosition]);

  /**
   * Where to ask for live traffic.
   *
   * With a route, the stretch that still matters — while driving, the road
   * ahead. A cross-country bbox spends the same metered request on an area
   * mostly nowhere near the car, and a capped response could drop the segment
   * being driven.
   *
   * Without a route, a box around the driver. Free-driving with no destination
   * is an ordinary way to use a nav app, and it used to show no hazards at all.
   */
  const trafficBounds = useMemo(() => {
    const box = route
      ? boundsOf(pathAhead(route.coordinates, navActive ? trafficFromIndex : 0, TRAFFIC_LOOKAHEAD_KM))
      : freeTrafficAnchor
        ? boxAround(freeTrafficAnchor, FREE_DRIVE_RADIUS_KM)
        : null;

    if (!box) return null;
    return {
      southWest: { lat: box[0][1], lng: box[0][0] },
      northEast: { lat: box[1][1], lng: box[1][0] }
    };
  }, [route, navActive, trafficFromIndex, freeTrafficAnchor]);

  /* --------------------------------------------------------- live traffic */
  useEffect(() => {
    if (!trafficBounds || !hasLocalDataKey()) {
      // Cleanup would clear on every bounds change, i.e. every pan, and the
      // alerts would strobe. Only the loss of a key or bounds should empty it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveAlerts([]);
      setJams([]);
      return;
    }

    const bounds = trafficBounds;
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    setTrafficThrottled(false);
    const load = () => {
      // Every call is metered, so don't spend one on a backgrounded tab.
      if (document.visibilityState === 'hidden') return;

      fetchWazeTraffic(bounds, controller.signal)
        .then((traffic) => {
          setLiveAlerts(traffic.alerts);
          setJams(traffic.jams);
        })
        .catch((cause: Error) => {
          // Quota exhaustion is worth surfacing — otherwise stale traffic looks
          // like clear roads. Other failures leave the last good data alone.
          if (cause instanceof WazeThrottled) setTrafficThrottled(true);
        });
    };

    load();
    // Waze reports turn over quickly, but the endpoint is slow and metered —
    // three minutes keeps it current without burning the user's quota.
    timer = setInterval(load, 180_000);

    // Coming back to a foreground tab, the last data is up to three minutes
    // old; refresh rather than waiting out the remainder of the interval.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, [trafficBounds]);

  /**
   * Everything worth warning about, placed along the route in order: OSM speed
   * cameras, live Waze reports, and the driver's own.
   */
  const routeAlerts = useMemo(() => {
    const local: RoadAlert[] = reports.map((report) => ({
      id: report.id,
      kind: report.kind === 'camera' ? 'speed-camera' : report.kind,
      coordinate: report.coordinate,
      note: report.note,
      source: 'local'
    }));
    const all = [...cameras, ...liveAlerts, ...local];

    // No route means nothing to measure "along" — but they still belong on the
    // map. Only the on-approach warning needs a position, and that runs solely
    // during guidance, which implies a route.
    if (!route || !navIndexRef.current) return all;

    return positionAlertsOnRoute(all, route.coordinates, navIndexRef.current.cumulative);
  }, [route, cameras, liveAlerts, reports]);

  /**
   * Same alerts, minus the driver's own.
   *
   * The map draws local reports from their own source, so feeding them to the
   * alerts source as well stacks two near-identical circles on one point. The
   * full list above still drives the spoken warning, which does want them.
   */
  const mapAlerts = useMemo(() => routeAlerts.filter((alert) => alert.source !== 'local'), [routeAlerts]);

  /** Posted limit where the driver currently is. */
  const currentLimitKmh = useMemo(() => {
    if (!navActive || !progress || !speedLimits.length) return null;
    return limitAtIndex(speedLimits, progress.shapeIndex)?.limitKmh ?? null;
  }, [navActive, progress, speedLimits]);

  /** The alert being approached, if any. */
  const upcomingAlert = useMemo(() => {
    if (!navActive || !progress || !navIndexRef.current) return null;
    const travelled = navIndexRef.current.totalM - progress.remainingDistanceM;
    return nextAlertAhead(routeAlerts, travelled);
  }, [navActive, progress, routeAlerts]);

  /* ------------------------------------------- navigation progress loop */
  useEffect(() => {
    if (!navActive || !route || !userPosition || !navIndexRef.current) return;

    const next = computeProgress(route, navIndexRef.current, userPosition, shapeHintRef.current);
    if (!next) return;

    // Hint with where the driver actually matched, not the previous maneuver:
    // on a long leg between turns the maneuver vertex falls far outside the
    // scan window, forcing a full-path rescan on every GPS tick.
    shapeHintRef.current = next.shapeIndex;
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

    // Cameras and hazards get their own callout, once each on approach.
    if (preferences.voiceGuidance && upcomingAlert) {
      const warning = alertAnnouncement(
        upcomingAlert.alert,
        upcomingAlert.distanceM,
        announcedAlertsRef.current,
        preferences.imperial
      );
      if (warning) speak(warning);
    }
    // upcomingAlert is read but deliberately not a dependency: it is derived
    // from the same GPS tick that already re-runs this effect, so the closure
    // is current, and depending on it would re-enter the announcer between
    // ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ------------------------------------------------- GPS track recording */
  useEffect(() => {
    if (!recording || !userPosition) return;
    // Accumulating a stream of GPS fixes: each new position appends, so the
    // write is the effect's whole purpose and has nowhere else to live.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrack((current) => {
      const last = current[current.length - 1];
      // Drop near-duplicate fixes so a parked car doesn't bloat the GPX.
      if (last && haversineMeters(last.coordinate, userPosition.coordinate) < 5) return current;
      return [...current, { coordinate: userPosition.coordinate, at: Date.now(), speedKmh: userPosition.speedKmh }];
    });
  }, [recording, userPosition]);

  /* ---------------------------------------------------------- chargers */
  useEffect(() => {
    if (!preferences.showChargers) {
      // Only when chargers are switched off. Clearing in cleanup would empty
      // the map on every pan and read as "no chargers near you".
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChargers([]);
      // Forget the anchor so re-enabling refetches instead of waiting for the
      // view to move past the distance gate below.
      lastChargerFetchRef.current = null;
      return;
    }

    // Debouncing alone isn't enough: the follow camera fires moveend on every
    // GPS tick, so a long drive would re-query Overpass continuously and get
    // rate-limited. Only refetch once the view leaves the area we already have.
    const last = lastChargerFetchRef.current;
    if (last && haversineMeters(last, mapCenter) < 5000) return;

    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(() => {
      const anchor = mapCenter;
      fetchChargers(anchor, 12, controller.signal)
        .then((found) => {
          lastChargerFetchRef.current = anchor;
          setChargers(found);
          setChargerError(false);
          setChargerAttempt(0);
        })
        .catch((cause: Error) => {
          if (cause.name === 'AbortError') return;
          // Every Overpass mirror can be down at once. Say so rather than
          // leaving an empty map that reads as "no chargers near you".
          setChargers([]);
          setChargerError(true);
          // Outages are usually brief, and nothing else re-triggers this
          // effect until the driver happens to pan — so retry a few times.
          if (chargerAttempt < MAX_CHARGER_RETRIES) {
            retryTimer = setTimeout(() => setChargerAttempt((n) => n + 1), 15_000);
          }
        });
    }, 700);

    return () => {
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      controller.abort();
    };
    // The coordinates, not the object: mapCenter is rebuilt on every map move,
    // so depending on it would defeat the distance gate above and re-query
    // Overpass continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenter.lat, mapCenter.lng, preferences.showChargers, chargerAttempt]);

  const visibleChargers = useMemo(
    () =>
      chargers.filter((charger) => {
        if (preferences.minChargerKw > 0 && (charger.powerKw ?? 0) < preferences.minChargerKw) return false;
        if (preferences.chargerConnector && !charger.plugs.includes(preferences.chargerConnector)) return false;
        if (preferences.chargerNetwork && charger.network !== preferences.chargerNetwork) return false;
        return true;
      }),
    [chargers, preferences.minChargerKw, preferences.chargerConnector, preferences.chargerNetwork]
  );

  /** Networks present in what's currently loaded, for the filter dropdown. */
  const chargerNetworks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const charger of chargers) {
      if (charger.network && charger.network !== 'Unknown network') {
        counts.set(charger.network, (counts.get(charger.network) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([name]) => name);
  }, [chargers]);

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

  /**
   * Drop the trip entirely.
   *
   * Separate from ending guidance: stopping navigation keeps the route on
   * screen so you can restart or review it, whereas this clears the plan.
   */
  function clearRoute() {
    setNavActive(false);
    setProgress(null);
    stopSpeaking();
    void releaseWakeLock();
    setWaypoints([]);
    setRoute(null);
    setRouteError(null);
    setActiveAlternativeId(null);
    setSpeedLimits([]);
    setCameras([]);
    setLiveAlerts([]);
    setJams([]);
    setWeather(null);
    setElevation(null);
    navIndexRef.current = null;
    announcedRef.current.clear();
    announcedAlertsRef.current.clear();
    setPanelOpen(true);
  }

  function toggleNavigation() {
    if (navActive) {
      setNavActive(false);
      setProgress(null);
      stopSpeaking();
      void releaseWakeLock();
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
    // Must follow the click: the API requires a user gesture.
    void requestWakeLock();

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

  /**
   * Copy the destination's Plus Code. Useful for somewhere with no street
   * address — it can be read aloud over the phone and pasted straight back
   * into the search field, which resolves it offline.
   */
  async function handleCopyPlusCode() {
    if (!destinationPlusCode) return;

    try {
      await navigator.clipboard.writeText(destinationPlusCode);
      showToast(`Copied ${destinationPlusCode}`);
    } catch {
      showToast('Could not copy — your browser blocked clipboard access.');
    }
  }

  function handleReport(kind: HazardKind) {
    const report: HazardReport = {
      id: `${Date.now()}-${kind}`,
      kind,
      coordinate: userPosition?.coordinate ?? mapCenter,
      createdAt: new Date().toISOString()
    };
    setReports(saveReport(report));
    setReportOpen(false);
    showToast('Report saved on this device.');
  }

  /**
   * Build a round trip from where we are.
   *
   * Rotating the ring each time means pressing again gives a genuinely
   * different drive of the same length rather than the same one back.
   */
  async function makeLoop() {
    const start = userPosition?.coordinate ?? mapCenter;
    setLoopBusy(true);
    loopRotationRef.current = (loopRotationRef.current + 73) % 360;

    try {
      const loop = await generateLoop(start, loopKm, options, loopRotationRef.current);
      setWaypoints(loop.waypoints);
      setPanelOpen(false);

      // Dense street grids can't always produce a ring of the requested size.
      // Say so rather than presenting a 10 km loop as though 15 km was asked.
      const miss = Math.abs(loop.distanceKm - loopKm) / loopKm;
      const actual = formatDistanceKm(loop.distanceKm, preferences.imperial);
      showToast(
        miss > 0.25
          ? `Closest loop from here is ${actual} — try another distance or press again.`
          : `Loop found: ${actual}`
      );
    } catch (cause) {
      showToast(cause instanceof LoopError ? cause.message : 'Could not build a loop from here.');
    } finally {
      setLoopBusy(false);
    }
  }

  /**
   * Insert the charging stops the trip needs.
   *
   * Planned against the current route in one pass, then inserted together so
   * routing runs once rather than per stop.
   */
  async function addChargingStops() {
    if (!route || waypoints.length < 2) return;
    setPlanningCharge(true);

    try {
      const climb = elevation ? climbEnergyKwh(elevation.ascentM, elevation.descentM) : 0;
      const plan = await planChargingStops(route, vehicle, climb);

      if (!plan.stops.length) {
        showToast(plan.note ?? 'No charging stop needed for this trip.');
        return;
      }

      setWaypoints((current) => [
        ...current.slice(0, -1),
        ...chargersToWaypoints(plan.stops),
        current[current.length - 1]
      ]);

      const summary = `Added ${plan.stops.length} charging stop${plan.stops.length > 1 ? 's' : ''}`;
      showToast(plan.incomplete && plan.note ? `${summary}. ${plan.note}` : summary);
    } catch (cause) {
      showToast(cause instanceof ChargePlanError ? cause.message : 'Could not plan charging stops.');
    } finally {
      setPlanningCharge(false);
    }
  }

  function toggleRecording() {
    if (recording) {
      setRecording(false);
      if (track.length > 1) {
        const startedAt = track[0].at;
        const endedAt = track[track.length - 1].at;
        const distanceKm = trackDistanceKm(track);
        const durationMin = Math.max(0, (endedAt - startedAt) / 60_000);
        setTrips(
          saveTrip({
            id: `trip-${startedAt}`,
            startedAt: new Date(startedAt).toISOString(),
            endedAt: new Date(endedAt).toISOString(),
            distanceKm,
            durationMin,
            // Guard the divide: a track can start and end in the same minute.
            averageKmh: durationMin > 0 ? distanceKm / (durationMin / 60) : 0,
            destination: destination?.name
          })
        );
      }
      if (track.length > 1) {
        downloadGpx(track, `LibreNav ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
        showToast(`Exported ${track.length} points (${formatDistanceKm(trackDistanceKm(track), preferences.imperial)}).`);
      } else {
        showToast('Track too short to export.');
      }
      setTrack([]);
      return;
    }
    if (!userPosition) {
      showToast('Waiting for GPS — recording needs your position.');
      return;
    }
    setTrack([]);
    setRecording(true);
    showToast('Recording track.');
  }

  function updatePreferences(next: Preferences) {
    // Switching theme should carry the basemap with it — a light map under dark
    // chrome (or the reverse) is exactly what made the sheets hard to read.
    if (next.theme !== preferences.theme && next.mapStyleId === preferences.mapStyleId) {
      const resolved =
        next.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : next.theme;
      const wanted = resolved === 'dark' ? 'dark' : 'liberty';
      if (MAP_STYLES.some((style) => style.id === wanted)) next = { ...next, mapStyleId: wanted };
    }

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

  const range = useMemo(() => {
    const climb = elevation ? climbEnergyKwh(elevation.ascentM, elevation.descentM) : 0;
    return estimateRange(route, vehicle, climb);
  }, [route, vehicle, elevation]);

  /** Delay from jams that genuinely sit on this route. */
  const trafficDelay = useMemo(
    () => (route ? estimateTrafficDelay(jams, route.coordinates, speedLimits) : null),
    [route, jams, speedLimits]
  );

  /** Door-to-door time including traffic — what both the ETA and "leave by" use. */
  const travelSeconds = (activeRouteSummary?.durationMin ?? 0) * 60 + (trafficDelay?.seconds ?? 0);

  /* ------------------------------------------- routing around bad jams */
  useEffect(() => {
    if (!route || !trafficDelay?.onRoute.length || waypoints.length < 2) {
      // trafficDelay and jams change on every traffic poll, so clearing from
      // cleanup would dismiss and re-raise the detour banner on each tick.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetour(null);
      return;
    }

    const severe = severeJams(trafficDelay.onRoute);
    if (!severe.length) {
      setDetour(null);
      return;
    }

    // Each detour costs a routing request, so evaluate a given set of jams
    // once rather than on every traffic refresh.
    const signature = severe
      .map((entry) => entry.jam.id)
      .sort()
      .join('|');
    if (detourCheckedRef.current === signature) return;
    detourCheckedRef.current = signature;

    const controller = new AbortController();

    findJamDetour(
      waypoints.map((point) => point.coordinate),
      options,
      { durationMin: route.summary.durationMin, delaySeconds: trafficDelay.seconds },
      trafficDelay.onRoute,
      jams,
      speedLimits,
      controller.signal
    )
      .then(setDetour)
      .catch(() => setDetour(null));

    return () => controller.abort();
  }, [route, trafficDelay, jams, speedLimits, waypoints, options]);

  /** Switch to the detour. The jam set stays marked so it won't re-prompt. */
  function acceptDetour() {
    if (!detour) return;

    setRoute(detour.route);
    navIndexRef.current = buildNavIndex(detour.route);
    shapeHintRef.current = 0;
    announcedRef.current.clear();
    setActiveAlternativeId(null);
    setFitRouteToken((token) => token + 1);
    showToast(`Rerouted — saving ${Math.max(1, Math.round(detour.savedSeconds / 60))} min`);
    setDetour(null);
  }

  /* ----------------------------------------------- weather at destination */
  useEffect(() => {
    if (!route || !destination) return;

    const controller = new AbortController();
    // Forecast for arrival, not departure — that is the whole point of asking.
    // With a departure plan set, that arrival is the planned one, which can be
    // tomorrow morning; forecasting for "if I left now" would be misleading.
    const plan = targetArrival ? planDeparture(targetArrival, travelSeconds) : null;
    const arrival =
      plan?.achievable
        ? plan.arrivalMs
        : Date.now() + (route.summary.durationMin + (trafficDelay?.seconds ?? 0) / 60) * 60_000;

    fetchWeatherAt(destination.coordinate, arrival, controller.signal)
      .then(setWeather)
      .catch(() => setWeather(null));

    // Dropping the old forecast belongs here rather than in the guard above:
    // cleanup runs on the way out of every one of these dependencies, so a
    // forecast for the previous destination or arrival time can never outlive
    // the trip it described. These deps deliberately exclude the traffic tick,
    // so this does not thrash.
    return () => {
      controller.abort();
      setWeather(null);
    };
    // Re-fetching on every traffic tick would be wasteful; the route and the
    // planned arrival are what actually change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, destination?.id, targetArrival]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-surface text-fg">
      <NavMap
        center={mapCenter}
        styleId={mapStyleId}
        waypoints={waypoints}
        route={route}
        activeAlternativeId={activeAlternativeId}
        chargers={visibleChargers}
        places={places}
        reports={reports}
        alerts={mapAlerts}
        jams={jams}
        terrain3d={preferences.terrain3d}
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
          onCancel={clearRoute}
          banner={
            detour ? (
              <DetourBanner suggestion={detour} onAccept={acceptDetour} onDismiss={() => setDetour(null)} />
            ) : null
          }
        />
      ) : (
        <>
          {detour ? (
            <div className="safe-x pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-30 flex justify-center">
              <DetourBanner suggestion={detour} onAccept={acceptDetour} onDismiss={() => setDetour(null)} />
            </div>
          ) : null}

          <header className="safe-top safe-x pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 pb-3">
            {/*
              `min-w-0` plus truncation on the status text is what keeps this
              pill from stealing width from the buttons. Both are flex children
              of a `justify-between` row, and every extra chip that can appear
              here — REC, traffic, chargers — grows the pill; on a 320px phone
              it squeezed the button cluster until the round buttons went oval.
              The buttons are fixed-size targets, so the text yields instead.
            */}
            <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 shadow-panel">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <span className="hidden text-sm font-semibold sm:inline">{appEnv.appName}</span>
              {geoDenied ? <span className="hidden text-xs text-amber-400 sm:inline">GPS off</span> : null}
              {recording ? (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-rose-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                  {track.length ? formatDistanceKm(trackDistanceKm(track), preferences.imperial) : 'REC'}
                </span>
              ) : null}
              {trafficThrottled ? (
                <span className="truncate text-xs text-amber-300" title="Live traffic quota reached; pausing requests.">
                  Traffic paused
                </span>
              ) : null}
              {chargerError && preferences.showChargers ? (
                <span className="truncate text-xs text-amber-300" title="Every Overpass mirror failed to respond.">
                  Chargers unavailable
                </span>
              ) : null}
            </div>

            <div className="pointer-events-auto flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
              <a
                href="https://buymeacoffee.com/myevcompanionapp"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Support this project"
                title="Support this project"
                className="rounded-full border border-amber-400/40 bg-amber-500/15 p-2.5 text-amber-800 shadow-panel dark:text-amber-200 backdrop-blur transition hover:bg-amber-500/25"
              >
                <Coffee className="h-4 w-4" />
              </a>
              <Link
                href="/discounts"
                aria-label="Discounts"
                className="rounded-full border border-line bg-surface p-2.5 text-muted shadow-panel transition hover:bg-strong"
              >
                <BadgePercent className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={toggleRecording}
                aria-label={recording ? 'Stop recording and export GPX' : 'Record GPS track'}
                title={recording ? 'Stop and export GPX' : 'Record GPS track'}
                className={cn(
                  'rounded-full border p-2 shadow-panel transition sm:p-2.5',
                  recording
                    ? 'border-rose-400/60 bg-rose-500/25 text-rose-700 hover:bg-rose-500/35 dark:text-rose-200'
                    : 'border-line bg-surface/95 text-muted hover:bg-strong'
                )}
              >
                {recording ? <Square className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => updatePreferences({ ...preferences, terrain3d: !preferences.terrain3d })}
                aria-label="Toggle 3D terrain"
                aria-pressed={preferences.terrain3d}
                title="3D terrain"
                className={cn(
                  'rounded-full border p-2 shadow-panel transition sm:p-2.5',
                  preferences.terrain3d
                    ? 'border-emerald-400/60 bg-emerald-500/20 text-fg'
                    : 'border-line bg-surface/95 text-muted hover:bg-strong'
                )}
              >
                <Mountain className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={cycleMapStyle}
                aria-label="Change map style"
                className="rounded-full border border-line bg-surface p-2.5 text-muted shadow-panel transition hover:bg-strong"
              >
                <Layers className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                className="rounded-full border border-line bg-surface p-2.5 text-muted shadow-panel transition hover:bg-strong"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </header>

        </>
      )}

      {/* Speed + posted limit, and whatever is coming up on the road */}
      {navActive ? (
        <>
          <div className="absolute bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] left-4 z-30">
            <SpeedPanel
              speedKmh={userPosition && userPosition.speedKmh > 1 ? userPosition.speedKmh : null}
              limitKmh={currentLimitKmh}
              imperial={preferences.imperial}
            />
          </div>
          {preferences.alertsEnabled && upcomingAlert ? (
            <div className="pointer-events-none absolute bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] left-1/2 z-30 -translate-x-1/2">
              <AlertBanner
                alert={upcomingAlert.alert}
                distanceM={upcomingAlert.distanceM}
                imperial={preferences.imperial}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {reportOpen ? (
        <div className="absolute bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-1/2 z-50 -translate-x-1/2">
          <ReportSheet onReport={handleReport} onClose={() => setReportOpen(false)} />
        </div>
      ) : null}

      {selectedCharger ? (
        <div className="absolute bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-1/2 z-40 -translate-x-1/2 lg:left-auto lg:right-[max(1rem,env(safe-area-inset-right))] lg:translate-x-0">
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
        <div className="safe-pad absolute inset-0 z-50 flex items-center justify-center bg-surface/95 backdrop-blur-sm">
          <SettingsPanel
            preferences={preferences}
            vehicle={vehicle}
            chargerNetworks={chargerNetworks}
            voiceSettings={voiceSettings}
            trips={trips}
            imperial={preferences.imperial}
            onClearTrips={() => setTrips(clearTrips())}
            onVoiceSettingsChange={(next) => setVoiceSettings(saveVoiceSettings(next))}
            onPreferencesChange={updatePreferences}
            onVehicleChange={(next) => setVehicle(saveVehicle(next))}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      ) : null}

      {!navActive && !selectedCharger && !reportOpen ? (
        <div className="safe-bottom safe-x absolute inset-x-0 bottom-0 z-20">
          <div className="sheet-max mx-auto w-[min(60rem,100%)] rounded-[1.75rem] border border-line bg-surface shadow-panel">
            {/* One surface: search, discovery, and the trip all live here, so
                there is no separate "where to?" prompt competing with it. */}
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
              loopKm={loopKm}
              loopBusy={loopBusy}
              onLoopKmChange={setLoopKm}
              onGenerateLoop={() => void makeLoop()}
              imperialLoop={preferences.imperial}
              showLoops={preferences.showLoops}
            />

            {panelOpen && route && destination ? (
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="flex w-full items-center justify-between gap-3 border-t border-line px-4 py-3 text-left transition hover:bg-raised"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-fg">{destination.name}</span>
                  <span className="block text-xs text-subtle">
                    {formatDurationMin(activeRouteSummary?.durationMin ?? 0)} ·{' '}
                    {formatDistanceKm(activeRouteSummary?.distanceKm ?? 0, preferences.imperial)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-accent">Show trip</span>
              </button>
            ) : null}

            <div
              className={cn(
                'sheet-scroll border-t border-line p-4',
                (panelOpen && route) || (!route && !panelOpen && !routeLoading && !routeError) ? 'hidden' : ''
              )}
            >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {routeLoading ? (
                  <div className="flex items-center gap-2 text-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                    <span className="text-sm">Finding the best route…</span>
                  </div>
                ) : routeError ? (
                  <div className="flex items-start gap-2 text-rose-700 dark:text-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="text-sm">{routeError}</span>
                  </div>
                ) : activeRouteSummary && destination ? (
                  <>
                    <div className="truncate text-lg font-semibold text-fg">{destination.name}</div>
                    {destinationPlusCode ? (
                      <button
                        type="button"
                        onClick={() => void handleCopyPlusCode()}
                        title="Copy Plus Code"
                        className="mt-0.5 font-mono text-xs tracking-tight text-subtle transition hover:text-accent"
                      >
                        {destinationPlusCode}
                      </button>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="text-2xl font-semibold tabular-nums text-fg">
                        {formatDurationMin(activeRouteSummary.durationMin)}
                      </span>
                      <span className="text-subtle">
                        {formatDistanceKm(activeRouteSummary.distanceKm, preferences.imperial)}
                      </span>
                      <span className="text-subtle">
                        arrive {formatEtaClock(activeRouteSummary.durationMin * 60 + (trafficDelay?.seconds ?? 0))}
                      </span>
                      {trafficDelay && trafficDelay.seconds > 60 ? (
                        <Tag tone="amber">
                          +{Math.round(trafficDelay.seconds / 60)} min traffic
                        </Tag>
                      ) : null}
                      {activeRouteSummary.hasToll ? <Tag tone="amber">Tolls</Tag> : null}
                      {activeRouteSummary.hasFerry ? <Tag tone="sky">Ferry</Tag> : null}
                      {waypoints.length > 2 ? (
                        <Tag tone="slate">
                          {waypoints.length - 2} stop{waypoints.length > 3 ? 's' : ''}
                        </Tag>
                      ) : null}
                      {!targetArrival ? (
                        <DeparturePlanner
                          travelSeconds={travelSeconds}
                          target={targetArrival}
                          onChange={setTargetArrival}
                        />
                      ) : null}
                    </div>
                  </>
                ) : (
                  // The search field directly above already asks the question,
                  // so this stays a quiet hint rather than a second headline.
                  <div className="text-sm text-subtle">
                    Tap a charger or long-press the map to drop a destination.
                  </div>
                )}
              </div>

              <div className="-mx-1 flex w-full items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
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
                <IconButton label="Report" onClick={() => setReportOpen(true)}>
                  <ShieldAlert className="h-4 w-4" />
                </IconButton>

              </div>

              {route || waypoints.length > 1 ? (
                <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                  {waypoints.length > 1 ? (
                    <button
                      type="button"
                      onClick={clearRoute}
                      className="flex items-center justify-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-4 py-2.5 text-sm font-semibold text-fg transition hover:bg-rose-500/25"
                    >
                      <XCircle className="h-4 w-4" />
                      Cancel
                    </button>
                  ) : null}

                  {route ? (
                    <button
                      type="button"
                      onClick={toggleNavigation}
                      className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-sky-400 sm:flex-initial"
                    >
                      <Navigation className="h-4 w-4" />
                      Start
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Full sheet width — inside the info column it wrapped to two lines. */}
            {targetArrival && activeRouteSummary && destination ? (
              <DeparturePlanner travelSeconds={travelSeconds} target={targetArrival} onChange={setTargetArrival} />
            ) : null}

            {route && route.alternatives.length ? (
              <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
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
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_15rem]">
                {/* minmax(0,…) lets the turn list shrink; a bare 1fr floors at its
                    longest instruction and pushes the range card off-panel. */}
                <div className="rounded-2xl border border-line bg-raised p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-subtle">First turns</div>
                  <div className="mt-2 space-y-1.5">
                    {route.maneuvers.slice(0, 3).map((maneuver, index) => (
                      <div key={`${maneuver.shapeIndex}-${index}`} className="flex items-center gap-2.5">
                        <ManeuverIcon kind={maneuver.kind} className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
                        <span className="min-w-0 flex-1 truncate text-sm text-muted">{maneuver.instruction}</span>
                        <span className="shrink-0 text-xs tabular-nums text-subtle">
                          {formatDistanceM(maneuver.distanceKm * 1000, preferences.imperial)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {weather ? (
                  <div
                    className={cn(
                      'rounded-2xl border p-3',
                      weather.caution ? 'border-amber-500/40 bg-amber-500/10' : 'border-line bg-raised'
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                      <CloudSun className="h-3.5 w-3.5" />
                      On arrival
                    </div>
                    <p className="mt-2 text-sm text-fg">
                      {weather.summary}
                      {weather.temperatureC !== null
                        ? `, ${Math.round(preferences.imperial ? weather.temperatureC * 1.8 + 32 : weather.temperatureC)}°${preferences.imperial ? 'F' : 'C'}`
                        : ''}
                    </p>
                    {/* Omitted entirely where the model has no reading, since a
                        blank chip would read as clean air rather than no data. */}
                    {weather.aqi !== null ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', aqiTone(weather.aqi))}>
                          AQI {weather.aqi}
                        </span>
                        <span className="text-xs text-muted">{weather.aqiLabel}</span>
                      </div>
                    ) : null}
                    {weather.caution ? (
                      <p className="mt-1 text-sm font-semibold text-fg">{weather.caution}</p>
                    ) : null}
                  </div>
                ) : null}

                {range ? (
                  <div
                    className={cn(
                      'rounded-2xl border p-3',
                      range.reachable ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                      <Zap className="h-3.5 w-3.5" />
                      Range estimate
                    </div>
                    {range.reachable ? (
                      <p className="mt-2 text-sm text-fg">
                        Arrive with about <strong className="tabular-nums">{Math.round(range.arrivalSocPercent)}%</strong>. Current
                        charge covers {formatDistanceKm(range.rangeKm, preferences.imperial)}.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-fg">
                        {range.reserveReachedKm !== null
                          ? `You'd hit your reserve about ${formatDistanceKm(range.reserveReachedKm, preferences.imperial)} in. Add a charging stop.`
                          : 'This trip is beyond your current charge. Add a charging stop.'}
                      </p>
                    )}
                    {elevation && Math.abs(range.climbKwh) > 0.3 ? (
                      <p className="mt-1.5 text-xs text-muted">
                        {range.climbKwh > 0 ? 'Includes' : 'Net descent recovers'}{' '}
                        <strong className="tabular-nums">{Math.abs(range.climbKwh).toFixed(1)} kWh</strong>{' '}
                        for {formatDistanceM(elevation.ascentM, preferences.imperial)} of climb.
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {!range.reachable ? (
                        <button
                          type="button"
                          onClick={() => void addChargingStops()}
                          disabled={planningCharge}
                          className="flex items-center gap-1.5 rounded-full bg-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
                        >
                          {planningCharge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                          {planningCharge ? 'Planning…' : 'Add charging stops'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleCategory('charging', true)}
                        className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                      >
                        Find chargers along this route
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute bottom-40 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-raised px-4 py-2 text-sm text-fg shadow-panel backdrop-blur">
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
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-2 text-xs font-medium text-muted transition hover:bg-strong sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-sm"
    >
      {children}
      <span>{label}</span>
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
        'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
        active ? 'bg-sky-500 text-slate-950' : 'bg-strong text-muted hover:bg-strong'
      )}
    >
      {children}
    </button>
  );
}

function Tag({ tone, children }: { tone: 'amber' | 'sky' | 'slate'; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-amber-500/20 text-amber-800 dark:text-amber-200',
    sky: 'bg-sky-500/20 text-sky-800 dark:text-sky-200',
    slate: 'bg-strong text-muted'
  };
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}
