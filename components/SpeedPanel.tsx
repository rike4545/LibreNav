'use client';

import { cn } from '@/lib/utils';

type Props = {
  /** Driver's current speed in km/h, or null when GPS gives no speed. */
  speedKmh: number | null;
  /** Posted limit in km/h, or null where OSM has no maxspeed tag. */
  limitKmh: number | null;
  imperial: boolean;
};

/** Allowance before flagging a driver as over — GPS speed is noisy. */
const TOLERANCE_KMH = 5;

export function SpeedPanel({ speedKmh, limitKmh, imperial }: Props) {
  if (speedKmh === null && limitKmh === null) return null;

  const toDisplay = (kmh: number) => Math.round(imperial ? kmh * 0.621371 : kmh);
  const unit = imperial ? 'mph' : 'km/h';
  const over = speedKmh !== null && limitKmh !== null && speedKmh > limitKmh + TOLERANCE_KMH;

  return (
    <div className="pointer-events-none flex items-end gap-2">
      {speedKmh !== null ? (
        <div
          className={cn(
            'flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center rounded-2xl border shadow-panel backdrop-blur transition-colors',
            over ? 'border-rose-400/70 bg-rose-500/90 text-fg' : 'border-line bg-surface/95 text-fg'
          )}
        >
          <span className="text-2xl font-bold leading-none tabular-nums">{toDisplay(speedKmh)}</span>
          <span className="mt-0.5 text-xs uppercase tracking-wider opacity-70">{unit}</span>
        </div>
      ) : null}

      {limitKmh !== null ? (
        // Deliberately the US/EU circular sign shape rather than an app chip —
        // it reads as a speed limit at a glance without needing a label.
        <div
          className={cn(
            'flex h-16 w-16 flex-col items-center justify-center rounded-full border-[5px] bg-white shadow-panel transition-colors',
            over ? 'border-rose-600' : 'border-rose-500/90'
          )}
        >
          <span className="text-xl font-black leading-none tabular-nums text-slate-900">{toDisplay(limitKmh)}</span>
          <span className="text-[8px] font-bold uppercase tracking-tight text-subtle">{unit}</span>
        </div>
      ) : null}
    </div>
  );
}
