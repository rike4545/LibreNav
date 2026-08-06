'use client';

import { AlertTriangle, Camera, Car, Construction, ShieldAlert, TrafficCone, X } from 'lucide-react';
import { HazardKind } from '@/types/map';

type Props = {
  onReport: (kind: HazardKind) => void;
  onClose: () => void;
};

const KINDS: Array<{ kind: HazardKind; label: string; icon: typeof Camera; tone: string }> = [
  { kind: 'police', label: 'Police', icon: ShieldAlert, tone: 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/30' },
  { kind: 'crash', label: 'Crash', icon: Car, tone: 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30' },
  { kind: 'traffic', label: 'Traffic', icon: TrafficCone, tone: 'bg-orange-500/20 text-orange-200 hover:bg-orange-500/30' },
  { kind: 'hazard', label: 'Hazard', icon: AlertTriangle, tone: 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30' },
  { kind: 'closure', label: 'Closure', icon: Construction, tone: 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30' },
  { kind: 'camera', label: 'Camera', icon: Camera, tone: 'bg-purple-500/20 text-purple-200 hover:bg-purple-500/30' }
];

export function ReportSheet({ onReport, onClose }: Props) {
  return (
    <div className="w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-border bg-slate-900/97 p-4 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Report at your location</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close report sheet"
          className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {KINDS.map(({ kind, label, icon: Icon, tone }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onReport(kind)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-semibold transition ${tone}`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Reports are saved in this browser only and expire after 24 hours. LibreNav has no server, so there is nothing to
        share them with other drivers.
      </p>
    </div>
  );
}
