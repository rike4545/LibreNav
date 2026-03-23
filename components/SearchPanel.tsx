'use client';

import { ReactNode, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, Clock3, MapPinned, Search, Star } from 'lucide-react';
import { Coordinate, RouteOptions, SearchFeature } from '@/types/map';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  origin: Coordinate | null;
  destination: SearchFeature | null;
  recents: SearchFeature[];
  favorites: SearchFeature[];
  options: RouteOptions;
  onOptionsChange: (options: RouteOptions) => void;
  onSelect: (feature: SearchFeature) => Promise<void>;
  onFavoriteToggle: (feature: SearchFeature) => void;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Search failed');
  return (await response.json()) as { results: SearchFeature[] };
};

export function SearchPanel({ open, onOpenChange, origin, destination, recents, favorites, options, onOptionsChange, onSelect, onFavoriteToggle }: Props) {
  const [query, setQuery] = useState('');
  const searchUrl = query.trim().length >= 2 ? `/api/geocode?q=${encodeURIComponent(query.trim())}` : null;
  const { data, isLoading } = useSWR(searchUrl, fetcher);
  const favoriteIds = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-slate-900/92 shadow-panel backdrop-blur">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Search</div>
          <div className="mt-1 text-lg font-semibold text-white">OpenStreetMap routing</div>
        </div>
        <ChevronDown className={cn('h-5 w-5 text-slate-400 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="border-t border-border px-5 py-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-slate-800/90 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a place or address"
              className="w-full border-0 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="mt-4 rounded-2xl bg-slate-800/60 p-3 text-sm text-slate-300">
            <div>Origin: {origin ? `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}` : 'Waiting for GPS'}</div>
            <div className="mt-1">Destination: {destination?.name ?? 'None selected'}</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <OptionChip label="Avoid tolls" active={options.avoidTolls} onClick={() => onOptionsChange({ ...options, avoidTolls: !options.avoidTolls })} />
            <OptionChip label="Avoid highways" active={options.avoidHighways} onClick={() => onOptionsChange({ ...options, avoidHighways: !options.avoidHighways })} />
            <OptionChip label="Avoid ferries" active={options.avoidFerries} onClick={() => onOptionsChange({ ...options, avoidFerries: !options.avoidFerries })} />
            <OptionChip label="Prefer twisty" active={options.preferTwisty} onClick={() => onOptionsChange({ ...options, preferTwisty: !options.preferTwisty })} />
            <OptionChip label="Alternatives" active={options.alternatives} onClick={() => onOptionsChange({ ...options, alternatives: !options.alternatives })} />
          </div>

          <div className="mt-4 space-y-2">
            {isLoading ? <div className="text-sm text-slate-400">Searching…</div> : null}
            {data?.results?.map((feature) => (
              <div
                key={feature.id}
                className="flex items-start justify-between rounded-2xl border border-border bg-slate-800/70 px-4 py-3 transition hover:bg-slate-700/80"
              >
                <button type="button" onClick={() => void onSelect(feature)} className="flex-1 text-left">
                  <div className="text-sm font-semibold text-white">{feature.name}</div>
                  <div className="mt-1 text-xs text-slate-400">{feature.label}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onFavoriteToggle(feature)}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-700 hover:text-yellow-300"
                  aria-label="Toggle favorite"
                >
                  <Star className={cn('h-4 w-4', favoriteIds.has(feature.id) && 'fill-current text-yellow-300')} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <PanelList title="Favorites" icon={<Star className="h-4 w-4" />} items={favorites} onSelect={onSelect} />
            <PanelList title="Recents" icon={<Clock3 className="h-4 w-4" />} items={recents} onSelect={onSelect} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OptionChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-2 text-xs font-semibold transition',
        active ? 'border-sky-400 bg-sky-500/20 text-sky-100' : 'border-border bg-slate-800/60 text-slate-300 hover:bg-slate-700/70'
      )}
    >
      {label}
    </button>
  );
}

function PanelList({ title, icon, items, onSelect }: { title: string; icon: ReactNode; items: SearchFeature[]; onSelect: (feature: SearchFeature) => Promise<void> }) {
  return (
    <div className="rounded-2xl border border-border bg-slate-800/50 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        {icon}
        {title}
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-xl bg-slate-900/50 px-3 py-2 text-xs text-slate-500">No saved places yet.</div>
        ) : (
          items.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void onSelect(item)}
              className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-slate-700/50"
            >
              <MapPinned className="mt-0.5 h-4 w-4 text-sky-400" />
              <div>
                <div className="text-sm text-slate-100">{item.name}</div>
                <div className="text-xs text-slate-500">{item.label}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
