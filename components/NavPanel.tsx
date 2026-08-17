'use client';

import { AlertTriangle, Pause, Volume2, VolumeX, X } from 'lucide-react';
import { ManeuverIcon } from '@/components/ManeuverIcon';
import { NavProgress, formatDistanceM, formatDuration, formatEtaClock } from '@/lib/nav';
import { cn, formatSpeed } from '@/lib/utils';
import { RouteResponse, UserPosition } from '@/types/map';

type Props = {
  route: RouteResponse;
  progress: NavProgress | null;
  userPosition: UserPosition | null;
  imperial: boolean;
  voiceOn: boolean;
  rerouting: boolean;
  onToggleVoice: () => void;
  onStop: () => void;
  onCancel: () => void;
  /**
   * Slotted below the stats so anything transient (a faster-route offer) joins
   * the same vertical stack instead of being positioned over it by guesswork.
   */
  banner?: React.ReactNode;
};

export function NavPanel({ route, progress, userPosition, imperial, voiceOn, rerouting, onToggleVoice, onStop, onCancel, banner }: Props) {
  const step = progress ? route.maneuvers[progress.stepIndex] : route.maneuvers[0];
  const next = progress ? route.maneuvers[progress.stepIndex + 1] : route.maneuvers[1];
  if (!step) return null;

  const distance = progress ? formatDistanceM(progress.distanceToManeuverM, imperial) : '—';
  const imminent = progress !== null && progress.distanceToManeuverM < 150;
  const sign = step.sign;

  return (
    <div className="safe-top safe-x pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col items-center gap-2 pb-3">
      {/* Primary maneuver banner */}
      <div
        className={cn(
          'pointer-events-auto w-full max-w-2xl rounded-3xl border shadow-panel backdrop-blur transition-colors',
          imminent ? 'border-sky-400/60 bg-sky-950/95' : 'border-line bg-surface/95'
        )}
      >
        <div className="flex items-center gap-4 p-4">
          <div
            className={cn(
              'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl transition-colors',
              imminent ? 'bg-sky-400 text-slate-950' : 'bg-raised text-sky-700 dark:text-sky-300'
            )}
          >
            <ManeuverIcon kind={step.kind} className="h-9 w-9" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-3xl font-semibold leading-none tabular-nums text-fg">{distance}</div>
            <div className="mt-1.5 truncate text-base text-muted">{step.instruction}</div>

            {sign ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sign.exitNumbers.map((exit) => (
                  <span key={exit} className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-fg">
                    Exit {exit}
                  </span>
                ))}
                {[...sign.exitBranches, ...sign.exitToward].slice(0, 3).map((label) => (
                  <span key={label} className="rounded-md bg-strong px-2 py-0.5 text-xs font-medium text-muted">
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={onToggleVoice}
              aria-label={voiceOn ? 'Mute voice guidance' : 'Unmute voice guidance'}
              className="rounded-full border border-line bg-raised p-2.5 text-muted transition hover:bg-strong"
            >
              {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-subtle" />}
            </button>
            {/* Two different intents: pause guidance but keep the route, or
                drop the trip entirely. */}
            <button
              type="button"
              onClick={onStop}
              aria-label="End guidance, keep route"
              title="End guidance"
              className="rounded-full border border-line bg-raised p-2.5 text-muted transition hover:bg-strong"
            >
              <Pause className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel route"
              title="Cancel route"
              className="rounded-full border border-rose-500/40 bg-rose-500/20 p-2.5 text-rose-700 transition dark:text-rose-200 hover:bg-rose-500/30"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {next ? (
          <div className="flex items-center gap-2.5 border-t border-line px-4 py-2.5 text-sm text-subtle">
            <span className="text-xs uppercase tracking-[0.18em]">Then</span>
            <ManeuverIcon kind={next.kind} className="h-4 w-4 shrink-0" />
            <span className="truncate">{next.streetNames[0] ?? next.instruction}</span>
          </div>
        ) : null}
      </div>

      {rerouting ? (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-sm font-medium text-fg shadow-panel backdrop-blur">
          <AlertTriangle className="h-4 w-4" />
          Off route — finding a new way
        </div>
      ) : null}

      {/* Trip status strip */}
      {progress ? (
        <div className="pointer-events-auto flex items-center gap-5 rounded-full border border-line bg-surface px-5 py-2.5 shadow-panel">
          <Stat label="Arrive" value={formatEtaClock(progress.remainingSeconds)} />
          <Divider />
          <Stat label="Left" value={formatDuration(progress.remainingSeconds)} />
          <Divider />
          <Stat label="Distance" value={formatDistanceM(progress.remainingDistanceM, imperial)} />
          {userPosition && userPosition.speedKmh > 2 ? (
            <>
              <Divider />
              <Stat label="Speed" value={formatSpeed(userPosition.speedKmh, imperial)} />
            </>
          ) : null}
        </div>
      ) : null}

      {banner}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-[0.18em] text-subtle">{label}</div>
      <div className="text-base font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-7 w-px bg-strong" />;
}
