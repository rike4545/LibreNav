'use client';

import { CalendarClock, X } from 'lucide-react';

import { clockAt, describeLeadTime, describeShortfall, planDeparture } from '@/lib/departure';
import { cn } from '@/lib/utils';

type Props = {
  /** Travel time including any traffic delay, in seconds. */
  travelSeconds: number;
  /** Target arrival as "HH:MM", or null when no plan is set. */
  target: string | null;
  onChange: (target: string | null) => void;
};

/**
 * "Leave by" planning.
 *
 * Collapsed to a single button until asked for — most drives are "go now", and
 * this should not compete with the ETA for attention.
 */
export function DeparturePlanner({ travelSeconds, target, onChange }: Props) {
  if (!target) {
    return (
      <button
        type="button"
        onClick={() => onChange(suggestedTarget(travelSeconds))}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1 text-xs font-semibold text-muted transition hover:bg-strong hover:text-fg"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Leave by…
      </button>
    );
  }

  const plan = planDeparture(target, travelSeconds);

  return (
    <div
      className={cn(
        'mt-2 w-full rounded-xl border p-3',
        plan && !plan.achievable ? 'border-amber-500/40 bg-amber-500/10' : 'border-line bg-raised'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
          <span className="shrink-0">Arrive by</span>
          <input
            type="time"
            value={target}
            onChange={(event) => onChange(event.target.value || null)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm tabular-nums text-fg outline-none focus:border-sky-400"
          />
        </label>

        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear departure plan"
          className="rounded-full p-1 text-subtle transition hover:bg-strong hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {plan ? (
        <p className="mt-2 text-sm">
          {plan.achievable ? (
            <>
              <span className="font-semibold text-fg">Leave by {clockAt(plan.leaveByMs)}</span>
              <span className="text-subtle"> · {describeLeadTime(plan.secondsUntilDeparture)}</span>
              {plan.tomorrow ? <span className="text-subtle"> · tomorrow</span> : null}
            </>
          ) : (
            <>
              <span className="font-semibold text-fg">Leave now</span>
              <span className="text-muted">
                {' '}
                — arriving {describeShortfall(plan.lateSeconds)} late at {clockAt(Date.now() + travelSeconds * 1000)}
              </span>
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Seed the picker with the current ETA rounded up to the next five minutes, so
 * the first thing shown is achievable and the driver adjusts from there rather
 * than starting at an arbitrary time.
 */
function suggestedTarget(travelSeconds: number): string {
  const eta = new Date(Date.now() + travelSeconds * 1000);
  eta.setMinutes(Math.ceil(eta.getMinutes() / 5) * 5, 0, 0);
  return `${String(eta.getHours()).padStart(2, '0')}:${String(eta.getMinutes()).padStart(2, '0')}`;
}
