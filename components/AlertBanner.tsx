'use client';

import { AlertTriangle, Camera, Car, Construction, ShieldAlert, TrafficCone } from 'lucide-react';
import { formatDistanceM } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { RoadAlert, RoadAlertKind } from '@/types/map';

type Props = {
  alert: RoadAlert;
  distanceM: number;
  imperial: boolean;
};

const STYLES: Record<RoadAlertKind, { label: string; icon: typeof Camera; tone: string }> = {
  'speed-camera': { label: 'Speed camera', icon: Camera, tone: 'border-amber-400/60 bg-amber-500/20 text-fg' },
  police: { label: 'Police reported', icon: ShieldAlert, tone: 'border-sky-400/60 bg-sky-500/20 text-fg' },
  crash: { label: 'Crash reported', icon: Car, tone: 'border-rose-400/60 bg-rose-500/20 text-fg' },
  closure: { label: 'Road closed', icon: Construction, tone: 'border-rose-400/60 bg-rose-500/20 text-fg' },
  traffic: { label: 'Heavy traffic', icon: TrafficCone, tone: 'border-orange-400/60 bg-orange-500/20 text-fg' },
  hazard: { label: 'Hazard reported', icon: AlertTriangle, tone: 'border-amber-400/60 bg-amber-500/20 text-fg' }
};

export function AlertBanner({ alert, distanceM, imperial }: Props) {
  const style = STYLES[alert.kind] ?? STYLES.hazard;
  const Icon = style.icon;
  const imminent = distanceM < 250;

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 shadow-panel backdrop-blur transition-transform',
        style.tone,
        imminent && 'scale-105'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className="text-sm font-semibold">{style.label}</span>
      <span className="text-sm tabular-nums opacity-90">{formatDistanceM(distanceM, imperial)}</span>
      {alert.limitKmh ? (
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-900">
          {imperial ? `${Math.round(alert.limitKmh * 0.621371)} mph` : `${alert.limitKmh} km/h`}
        </span>
      ) : null}
      {alert.source === 'local' ? <span className="text-xs uppercase tracking-wider opacity-60">yours</span> : null}
      {alert.source === 'waze' ? <span className="text-xs uppercase tracking-wider opacity-60">live</span> : null}
    </div>
  );
}
