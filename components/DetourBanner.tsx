'use client';

import { CornerUpRight, X } from 'lucide-react';

import { RerouteSuggestion } from '@/lib/services/reroute';

type Props = {
  suggestion: RerouteSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
};

/**
 * "Faster route available", offered rather than taken.
 *
 * Silently switching a driver onto unfamiliar roads mid-drive is worse than a
 * slow one, so the detour is always a choice — and dismissing it sticks until
 * the traffic ahead actually changes.
 */
export function DetourBanner({ suggestion, onAccept, onDismiss }: Props) {
  const minutes = Math.max(1, Math.round(suggestion.savedSeconds / 60));
  const jams = suggestion.avoided.length;

  return (
    <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-emerald-400/50 bg-emerald-500/20 px-4 py-2.5 shadow-panel backdrop-blur">
      <CornerUpRight className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-fg">Faster route — saves {minutes} min</div>
        <div className="truncate text-xs text-muted">
          Avoids {jams === 1 ? 'heavy traffic' : `${jams} jams`} ahead
        </div>
      </div>

      <button
        type="button"
        onClick={onAccept}
        className="shrink-0 rounded-full bg-emerald-500/90 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
      >
        Take it
      </button>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Keep current route"
        className="shrink-0 rounded-full p-1 text-muted transition hover:bg-strong hover:text-fg"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
