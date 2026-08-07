'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  ChevronDown,
  Clock3,
  Coffee,
  CreditCard,
  Croissant,
  Fuel,
  Home,
  Loader2,
  MapPin,
  ParkingSquare,
  Plus,
  RefreshCw,
  Bike,
  Car,
  Footprints,
  Search,
  SlidersHorizontal,
  Truck,
  Star,
  Toilet,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import { PLACE_CATEGORIES } from '@/lib/services/overpass';
import { searchPlaces } from '@/lib/services/geocode';
import { hasLocalDataKey, searchBusinesses } from '@/lib/services/localdata';
import { SavedPlace } from '@/lib/storage';
import { bearingCompass } from '@/lib/format';
import { cn, formatDistanceKm } from '@/lib/utils';
import { Coordinate, Place, PlaceCategoryId, RouteOptions, SearchFeature, TravelMode, Waypoint } from '@/types/map';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: Coordinate | null;
  waypoints: Waypoint[];
  saved: SavedPlace[];
  recents: SearchFeature[];
  options: RouteOptions;
  imperial: boolean;
  categoryLoading: PlaceCategoryId | null;
  categoryResults: Place[];
  activeCategory: PlaceCategoryId | null;
  hasRoute: boolean;
  onOptionsChange: (options: RouteOptions) => void;
  onSetDestination: (feature: SearchFeature) => void;
  onAddStop: (feature: SearchFeature) => void;
  onRemoveWaypoint: (id: string) => void;
  onMoveWaypoint: (id: string, direction: -1 | 1) => void;
  onToggleSaved: (feature: SearchFeature) => void;
  onSetRole: (id: string, role: 'home' | 'work' | null) => void;
  onCategorySelect: (category: PlaceCategoryId | null, alongRoute: boolean) => void;
  onClearRecents: () => void;
  loopKm: number;
  loopBusy: boolean;
  imperialLoop: boolean;
  onLoopKmChange: (km: number) => void;
  onGenerateLoop: () => void;
  showLoops: boolean;
};

const MODES: Array<{ mode: TravelMode; label: string; icon: typeof Car }> = [
  { mode: 'auto', label: 'Drive', icon: Car },
  { mode: 'truck', label: 'Truck', icon: Truck },
  { mode: 'bicycle', label: 'Bike', icon: Bike },
  { mode: 'pedestrian', label: 'Walk', icon: Footprints }
];

const CATEGORY_ICONS: Record<PlaceCategoryId, ReactNode> = {
  fuel: <Fuel className="h-4 w-4" />,
  charging: <Zap className="h-4 w-4" />,
  food: <Croissant className="h-4 w-4" />,
  coffee: <Coffee className="h-4 w-4" />,
  parking: <ParkingSquare className="h-4 w-4" />,
  toilets: <Toilet className="h-4 w-4" />,
  hotel: <Home className="h-4 w-4" />,
  atm: <CreditCard className="h-4 w-4" />
};

export function SearchPanel({
  open,
  onOpenChange,
  anchor,
  waypoints,
  saved,
  recents,
  options,
  imperial,
  categoryLoading,
  categoryResults,
  activeCategory,
  hasRoute,
  onOptionsChange,
  onSetDestination,
  onAddStop,
  onRemoveWaypoint,
  onMoveWaypoint,
  onToggleSaved,
  onSetRole,
  onCategorySelect,
  onClearRecents,
  loopKm,
  loopBusy,
  imperialLoop,
  onLoopKmChange,
  onGenerateLoop,
  showLoops
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [loopOpen, setLoopOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced autocomplete. Each keystroke aborts the in-flight request so a
  // slow response can't overwrite results for a newer query.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      abortRef.current?.abort();
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Photon is the baseline and always runs; the business API only joins in
      // when the user has supplied their own key, and never blocks the result.
      const geocoded = searchPlaces(trimmed, { near: anchor, signal: controller.signal });
      const businesses = hasLocalDataKey()
        ? searchBusinesses(trimmed, { near: anchor, signal: controller.signal }).catch(() => [])
        : Promise.resolve([]);

      Promise.allSettled([geocoded, businesses])
        .then(([geoResult, bizResult]) => {
          if (controller.signal.aborted) return;
          const places = geoResult.status === 'fulfilled' ? geoResult.value : [];
          const found = bizResult.status === 'fulfilled' ? bizResult.value : [];

          // Businesses lead: someone typing a place name usually wants the shop,
          // not the street it sits on.
          const merged = [...found, ...places];
          const seen = new Set<string>();
          const unique = merged.filter((item) => {
            const key = `${item.coordinate.lat.toFixed(4)},${item.coordinate.lng.toFixed(4)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          setResults(unique);
          if (unique.length) setError(null);
          else setError(geoResult.status === 'rejected' ? 'Search is unavailable right now.' : 'No matches found.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 280);

    return () => clearTimeout(timer);
  }, [query, anchor]);

  const savedIds = useMemo(() => new Set(saved.map((item) => item.id)), [saved]);
  const home = saved.find((item) => item.role === 'home');
  const work = saved.find((item) => item.role === 'work');

  function choose(feature: SearchFeature, asStop: boolean) {
    if (asStop) onAddStop(feature);
    else onSetDestination(feature);
    setQuery('');
    setResults([]);
  }

  return (
    <div className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-subtle" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => onOpenChange(true)}
          placeholder="Search places, addresses, or coordinates"
          aria-label="Search for a destination"
          className="w-full border-0 bg-transparent text-base text-fg outline-none placeholder:text-subtle"
        />
        {searching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400" /> : null}
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="shrink-0 rounded-full p-1 text-subtle hover:bg-strong hover:text-muted"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-label={open ? 'Collapse panel' : 'Expand panel'}
            className="shrink-0 rounded-full p-1 text-subtle hover:bg-strong"
          >
            <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
          </button>
        )}
      </div>

      {results.length ? (
        <div className="max-h-64 overflow-y-auto border-t border-line">
          {results.map((feature) => (
            <div key={feature.id} className="flex items-center gap-1 border-b border-line/50 px-2 py-1 last:border-0 hover:bg-strong">
              <button type="button" onClick={() => choose(feature, false)} className="flex min-w-0 flex-1 items-start gap-3 px-2 py-2 text-left">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg">{feature.name}</div>
                  <div className="truncate text-xs text-subtle">
                    {feature.label}
                    {anchor ? ` · ${bearingCompass(anchor, feature.coordinate, imperial)}` : ''}
                  </div>
                </div>
              </button>
              {waypoints.length > 0 ? (
                <button
                  type="button"
                  onClick={() => choose(feature, true)}
                  title="Add as a stop"
                  aria-label={`Add ${feature.name} as a stop`}
                  className="shrink-0 rounded-full p-2 text-subtle transition hover:bg-strong hover:text-amber-300"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onToggleSaved(feature)}
                aria-label={`${savedIds.has(feature.id) ? 'Unsave' : 'Save'} ${feature.name}`}
                className="shrink-0 rounded-full p-2 text-subtle transition hover:bg-strong hover:text-yellow-300"
              >
                <Star className={cn('h-4 w-4', savedIds.has(feature.id) && 'fill-current text-yellow-300')} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {error && query.trim().length >= 2 && !searching && !results.length ? (
        <div className="border-t border-line px-4 py-3 text-sm text-subtle">{error}</div>
      ) : null}

      {open ? (
        <div className="max-h-[min(45vh,26rem)] overflow-y-auto border-t border-line px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {PLACE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onCategorySelect(activeCategory === category.id ? null : category.id, false)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  activeCategory === category.id
                    ? 'border-purple-400 bg-purple-500/25 text-fg'
                    : 'border-line bg-raised text-muted hover:bg-strong'
                )}
              >
                {categoryLoading === category.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : CATEGORY_ICONS[category.id]}
                {category.label}
              </button>
            ))}
          </div>

          {activeCategory && hasRoute ? (
            <button
              type="button"
              onClick={() => onCategorySelect(activeCategory, true)}
              className="mt-2 w-full rounded-xl border border-purple-400/30 bg-purple-500/10 px-3 py-2 text-xs font-semibold text-fg transition hover:bg-purple-500/20"
            >
              Search along the whole route instead
            </button>
          ) : null}

          {activeCategory && categoryResults.length ? (
            <div className="mt-3 space-y-1.5">
              {categoryResults.slice(0, 12).map((place) => (
                <div key={place.id} className="flex items-center gap-1 rounded-xl bg-raised hover:bg-strong">
                  <button
                    type="button"
                    onClick={() => choose({ id: place.id, name: place.name, label: place.address ?? '', coordinate: place.coordinate }, false)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left"
                  >
                    <span className="text-purple-300">{CATEGORY_ICONS[place.category]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{place.name}</span>
                      {place.address ? <span className="block truncate text-xs text-subtle">{place.address}</span> : null}
                    </span>
                    {place.distanceKm !== undefined ? (
                      <span className="shrink-0 text-xs tabular-nums text-subtle">{formatDistanceKm(place.distanceKm, imperial)}</span>
                    ) : null}
                  </button>
                  {waypoints.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => choose({ id: place.id, name: place.name, label: place.address ?? '', coordinate: place.coordinate }, true)}
                      aria-label={`Add ${place.name} as a stop`}
                      className="shrink-0 rounded-full p-2 text-subtle hover:bg-strong hover:text-amber-300"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {waypoints.length > 0 ? (
            <section className="mt-4">
              <SectionHeading>
                Trip ({waypoints.length} {waypoints.length === 1 ? 'stop' : 'stops'})
              </SectionHeading>
              <div className="mt-2 space-y-1.5">
                {waypoints.map((waypoint, index) => (
                  <div key={waypoint.id} className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-slate-950',
                        index === 0 ? 'bg-emerald-400' : index === waypoints.length - 1 ? 'bg-sky-400' : 'bg-amber-400'
                      )}
                    >
                      {index === 0 ? 'A' : index === waypoints.length - 1 ? 'B' : index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">{waypoint.name}</div>
                      <div className="truncate text-xs text-subtle">{waypoint.label}</div>
                    </div>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onMoveWaypoint(waypoint.id, -1)}
                      aria-label={`Move ${waypoint.name} earlier`}
                      className="shrink-0 rounded p-1 text-subtle hover:bg-strong disabled:opacity-25"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === waypoints.length - 1}
                      onClick={() => onMoveWaypoint(waypoint.id, 1)}
                      aria-label={`Move ${waypoint.name} later`}
                      className="shrink-0 rounded p-1 text-subtle hover:bg-strong disabled:opacity-25"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveWaypoint(waypoint.id)}
                      aria-label={`Remove ${waypoint.name}`}
                      className="shrink-0 rounded p-1 text-subtle hover:bg-strong hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-4">
            <button
              type="button"
              onClick={() => setShowOptions((value) => !value)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-subtle hover:text-muted"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Route preferences
              </span>
              <ChevronDown className={cn('h-4 w-4 transition', showOptions && 'rotate-180')} />
            </button>
            {showOptions ? (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MODES.map(({ mode, label, icon: Icon }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onOptionsChange({ ...options, mode })}
                      aria-pressed={options.mode === mode}
                      title={label}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        options.mode === mode
                          ? 'border-sky-400 bg-sky-500/25 text-fg'
                          : 'border-line bg-raised text-muted hover:bg-strong'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip label="Avoid tolls" active={options.avoidTolls} onClick={() => onOptionsChange({ ...options, avoidTolls: !options.avoidTolls })} />
                <Chip label="Avoid highways" active={options.avoidHighways} onClick={() => onOptionsChange({ ...options, avoidHighways: !options.avoidHighways })} />
                <Chip label="Avoid ferries" active={options.avoidFerries} onClick={() => onOptionsChange({ ...options, avoidFerries: !options.avoidFerries })} />
                <Chip label="Scenic roads" active={options.preferTwisty} onClick={() => onOptionsChange({ ...options, preferTwisty: !options.preferTwisty })} />
                <Chip label="Show alternates" active={options.alternatives} onClick={() => onOptionsChange({ ...options, alternatives: !options.alternatives })} />
              </div>
              </>
            ) : null}
          </section>

          {showLoops ? (
          <section className="mt-4 rounded-2xl border border-line bg-raised p-3">
            <button
              type="button"
              onClick={() => setLoopOpen((value) => !value)}
              aria-expanded={loopOpen}
              className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
            >
              <span className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Round trip
              </span>
              <ChevronDown className={cn('h-4 w-4 transition', loopOpen && 'rotate-180')} />
            </button>
            {loopOpen ? (
            <>
            <p className="mt-1.5 text-xs text-subtle">
              A loop from here and back — for a drive out, a meet, or a Sunday run.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="range"
                min={5}
                max={300}
                step={5}
                value={loopKm}
                onChange={(event) => onLoopKmChange(Number(event.target.value))}
                aria-label="Loop distance"
                className="w-full accent-sky-500"
              />
              <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-fg">
                {formatDistanceKm(loopKm, imperialLoop)}
              </span>
            </div>
            <button
              type="button"
              onClick={onGenerateLoop}
              disabled={loopBusy}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
            >
              {loopBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {loopBusy ? 'Finding a loop…' : 'Generate loop'}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-subtle">
              Distance is approximate — roads rarely allow an exact loop. Press again for a different one.
            </p>
            </>
            ) : null}
          </section>
          ) : null}

          {home || work ? (
            <section className="mt-4 grid grid-cols-2 gap-2">
              {home ? <RoleButton icon={<Home className="h-4 w-4" />} place={home} onClick={() => onSetDestination(home)} /> : <div />}
              {work ? <RoleButton icon={<Briefcase className="h-4 w-4" />} place={work} onClick={() => onSetDestination(work)} /> : null}
            </section>
          ) : null}

          <section className="mt-4">
            <SectionHeading>Saved places</SectionHeading>
            <PlaceList
              items={saved}
              empty="Tap the star on any result to save it."
              imperial={imperial}
              anchor={anchor}
              onSelect={onSetDestination}
              renderExtra={(place) => (
                <>
                  <button
                    type="button"
                    onClick={() => onSetRole(place.id, (place as SavedPlace).role === 'home' ? null : 'home')}
                    aria-label={`Set ${place.name} as home`}
                    className={cn('rounded p-1.5 hover:bg-strong', (place as SavedPlace).role === 'home' ? 'text-emerald-300' : 'text-subtle')}
                  >
                    <Home className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetRole(place.id, (place as SavedPlace).role === 'work' ? null : 'work')}
                    aria-label={`Set ${place.name} as work`}
                    className={cn('rounded p-1.5 hover:bg-strong', (place as SavedPlace).role === 'work' ? 'text-sky-300' : 'text-subtle')}
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleSaved(place)}
                    aria-label={`Remove ${place.name}`}
                    className="rounded p-1.5 text-subtle hover:bg-strong hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            />
          </section>

          <section className="mt-4">
            <div className="flex items-center justify-between">
              <SectionHeading>Recent</SectionHeading>
              {recents.length ? (
                <button type="button" onClick={onClearRecents} className="text-xs text-subtle hover:text-muted">
                  Clear
                </button>
              ) : null}
            </div>
            <PlaceList
              items={recents}
              empty="Destinations you pick show up here."
              imperial={imperial}
              anchor={anchor}
              onSelect={onSetDestination}
              icon={<Clock3 className="h-4 w-4 shrink-0 text-subtle" />}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.2em] text-subtle">{children}</div>;
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
        active ? 'border-sky-400 bg-sky-500/25 text-fg' : 'border-line bg-raised text-muted hover:bg-strong'
      )}
    >
      {label}
    </button>
  );
}

function RoleButton({ icon, place, onClick }: { icon: ReactNode; place: SavedPlace; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2.5 text-left transition hover:bg-strong"
    >
      <span className="text-sky-300">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg">{place.name}</span>
        <span className="block text-[11px] uppercase tracking-wider text-subtle">{place.role}</span>
      </span>
    </button>
  );
}

function PlaceList({
  items,
  empty,
  anchor,
  imperial,
  onSelect,
  renderExtra,
  icon
}: {
  items: SearchFeature[];
  empty: string;
  anchor: Coordinate | null;
  imperial: boolean;
  onSelect: (feature: SearchFeature) => void;
  renderExtra?: (item: SearchFeature) => ReactNode;
  icon?: ReactNode;
}) {
  if (!items.length) {
    return <div className="mt-2 rounded-xl bg-raised px-3 py-2.5 text-xs text-subtle">{empty}</div>;
  }

  return (
    <div className="mt-2 space-y-1">
      {items.slice(0, 8).map((item) => (
        <div key={item.id} className="flex items-center gap-1 rounded-xl hover:bg-strong">
          <button type="button" onClick={() => onSelect(item)} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left">
            {icon ?? <Star className="h-4 w-4 shrink-0 fill-current text-yellow-400/80" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">{item.name}</span>
              <span className="block truncate text-xs text-subtle">
                {item.label}
                {anchor ? ` · ${bearingCompass(anchor, item.coordinate, imperial)}` : ''}
              </span>
            </span>
          </button>
          {renderExtra ? <div className="flex shrink-0 items-center pr-1">{renderExtra(item)}</div> : null}
        </div>
      ))}
    </div>
  );
}
