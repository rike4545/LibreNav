'use client';

import { Clock, ExternalLink, Navigation, Plus, X, Zap } from 'lucide-react';
import { bearingCompass } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ChargerSite, Coordinate } from '@/types/map';

type Props = {
  charger: ChargerSite;
  from: Coordinate | null;
  imperial: boolean;
  canAddStop: boolean;
  onNavigate: () => void;
  onAddStop: () => void;
  onClose: () => void;
};

export function ChargerCard({ charger, from, imperial, canAddStop, onNavigate, onAddStop, onClose }: Props) {
  const power = charger.powerKw;
  const tier = power === null ? 'unknown' : power >= 150 ? 'ultra' : power >= 50 ? 'fast' : 'slow';

  return (
    <div className="w-[min(24rem,calc(var(--safe-w)-2rem))] rounded-3xl border border-line bg-surface p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Zap
              className={cn(
                'h-4 w-4 shrink-0',
                tier === 'ultra' ? 'text-cyan-300' : tier === 'fast' ? 'text-emerald-300' : 'text-lime-300'
              )}
            />
            <h3 className="truncate text-base font-semibold text-fg">{charger.name}</h3>
          </div>
          <p className="mt-0.5 truncate text-xs text-subtle">
            {charger.network}
            {from ? ` · ${bearingCompass(from, charger.coordinate, imperial)}` : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close charger details" className="shrink-0 rounded-full p-1 text-subtle hover:bg-strong hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {power !== null ? (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-bold',
              tier === 'ultra' ? 'bg-cyan-500/20 text-fg' : tier === 'fast' ? 'bg-emerald-500/20 text-fg' : 'bg-lime-500/20 text-fg'
            )}
          >
            {power} kW
          </span>
        ) : null}
        {charger.capacity ? <Badge>{charger.capacity} bays</Badge> : null}
        {charger.fee ? <Badge>{charger.fee === 'no' ? 'Free' : 'Paid'}</Badge> : null}
        {charger.access && charger.access !== 'yes' ? <Badge>Access: {charger.access}</Badge> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {charger.plugs.map((plug) => (
          <span key={plug} className="rounded-md bg-raised px-2 py-1 text-xs font-medium text-muted">
            {plug}
          </span>
        ))}
      </div>

      {charger.address ? <p className="mt-3 text-xs text-subtle">{charger.address}</p> : null}
      {charger.openingHours ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-subtle">
          <Clock className="h-3 w-3 shrink-0" />
          {charger.openingHours}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onNavigate}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
        >
          <Navigation className="h-4 w-4" />
          Navigate
        </button>
        {canAddStop ? (
          <button
            type="button"
            onClick={onAddStop}
            className="flex items-center justify-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-fg transition hover:bg-amber-500/25"
          >
            <Plus className="h-4 w-4" />
            Add stop
          </button>
        ) : null}
        {charger.website ? (
          <a
            href={charger.website}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open charger website"
            className="flex items-center justify-center rounded-full border border-line bg-raised px-3 py-2.5 text-muted transition hover:bg-strong"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-subtle">
        Details come from OpenStreetMap tags and can be incomplete or out of date. Live availability is not included.
      </p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-muted">{children}</span>;
}
