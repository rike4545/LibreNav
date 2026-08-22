'use client';

import { ReactNode, useEffect } from 'react';
import { AlertTriangle, Check, KeyRound, Mountain, TrafficCone, X, Zap } from 'lucide-react';
import { MapStyleOption, StylePreview } from '@/lib/config';
import { Preferences } from '@/lib/storage';
import { cn } from '@/lib/utils';

type Props = {
  styles: MapStyleOption[];
  currentId: string;
  /** Whether it is each style's dark rendering that will actually load. */
  dark: boolean;
  /** Google entries are filtered out without a key. Say so rather than hide silently. */
  googleHidden: boolean;
  preferences: Preferences;
  /** Live traffic needs a LocalData key; without one the switch is inert. */
  trafficAvailable: boolean;
  onSelect: (id: string) => void;
  onPreferencesChange: (next: Preferences) => void;
  onOpenSettings: () => void;
  onClose: () => void;
};

type OverlayRow = {
  key: keyof Preferences;
  label: string;
  hint: string;
  icon: ReactNode;
  /** Present and false when the overlay cannot work yet, with the reason. */
  blockedBy?: string;
};

/**
 * A map in miniature: ground, a coastline, a couple of roads.
 *
 * Deliberately not a real tile. A preview fetched per style would be eight
 * network requests to open a picker, would be blank on the first paint, and
 * would show nothing at all offline — which is precisely when someone is most
 * likely to be reaching for a different basemap.
 */
function StyleSwatch({ preview }: { preview: StylePreview }) {
  return (
    <svg viewBox="0 0 64 40" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <rect width="64" height="40" fill={preview.land} />
      <path d="M0 27 Q 14 21 30 25 T 64 20 L64 40 L0 40 Z" fill={preview.water} />
      <path d="M-2 33 Q 18 19 38 21 T 66 9" stroke={preview.road} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M10 -2 Q 15 13 31 17 T 48 42" stroke={preview.road} strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A switch that reads as a switch: the whole row is the target, not a checkbox. */
function OverlayToggle({ row, on, onToggle }: { row: OverlayRow; on: boolean; onToggle: () => void }) {
  const blocked = Boolean(row.blockedBy);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on && !blocked}
      aria-label={row.label}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
        on && !blocked ? 'border-sky-400/50 bg-sky-500/10' : 'border-line bg-raised hover:bg-strong'
      )}
    >
      <span className={cn('shrink-0', on && !blocked ? 'text-sky-700 dark:text-sky-300' : 'text-subtle')}>{row.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-fg">{row.label}</span>
        <span className="block text-[11px] leading-tight text-subtle">{row.blockedBy ?? row.hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition',
          on && !blocked ? 'bg-sky-400' : 'bg-strong'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all',
            on && !blocked ? 'left-[1.125rem]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}

export function LayersSheet({
  styles,
  currentId,
  dark,
  googleHidden,
  preferences,
  trafficAvailable,
  onSelect,
  onPreferencesChange,
  onOpenSettings,
  onClose
}: Props) {
  const overlays: OverlayRow[] = [
    {
      key: 'showChargers',
      label: 'Chargers',
      hint: 'EV charging points from OpenStreetMap.',
      icon: <Zap className="h-4 w-4" />
    },
    {
      key: 'showTraffic',
      label: 'Traffic',
      hint: 'Live jams and incidents.',
      icon: <TrafficCone className="h-4 w-4" />,
      // Nothing to draw and nothing to fetch without a key, so say why rather
      // than offer a switch that appears to do nothing.
      blockedBy: trafficAvailable ? undefined : 'Needs a LocalData key — add one in Settings.'
    },
    {
      key: 'alertsEnabled',
      label: 'Road alerts',
      hint: 'Speed cameras and reported hazards.',
      icon: <AlertTriangle className="h-4 w-4" />
    },
    {
      key: 'terrain3d',
      label: '3D terrain',
      hint: 'Elevation shading, with the camera tilted.',
      icon: <Mountain className="h-4 w-4" />
    }
  ];

  // Escape closes it, the same as the backdrop. A sheet that can only be
  // dismissed by aiming at a small X is a sheet people leave open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close layers"
        className="absolute inset-0 z-40 bg-[rgb(var(--page)/0.55)]"
      />

      <div className="safe-bottom safe-x absolute inset-x-0 bottom-0 z-50">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Layers"
          className="sheet-max mx-auto w-[min(60rem,100%)] rounded-[1.75rem] border border-line bg-surface shadow-panel"
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-subtle">Layers</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 shrink-0 rounded-full p-1.5 text-subtle transition hover:bg-strong hover:text-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="sheet-scroll border-t border-line p-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Basemap</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {styles.map((style) => {
                const active = style.id === currentId;
                // Picking "Minimal" in the dark gets you Dark Matter, so the
                // swatch has to show the rendering that will actually load.
                const preview = dark ? style.previewDark ?? style.preview : style.preview;

                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => onSelect(style.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex flex-col overflow-hidden rounded-2xl border text-left transition',
                      active ? 'border-sky-400 ring-2 ring-sky-400/30' : 'border-line hover:border-subtle'
                    )}
                  >
                    <span className="relative block h-16 w-full">
                      <StyleSwatch preview={preview} />
                      {active ? (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-sky-400 p-1 text-slate-950">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-1 flex-col gap-0.5 bg-raised px-2.5 py-2">
                      <span className="text-xs font-semibold text-fg">{style.label}</span>
                      <span className="text-[11px] leading-tight text-subtle">{style.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Overlays</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {overlays.map((row) => (
                <OverlayToggle
                  key={row.key}
                  row={row}
                  on={Boolean(preferences[row.key])}
                  onToggle={() => {
                    // A blocked overlay would switch on and still draw nothing.
                    if (row.blockedBy) {
                      onOpenSettings();
                      return;
                    }
                    onPreferencesChange({ ...preferences, [row.key]: !preferences[row.key] });
                  }}
                />
              ))}
            </div>

            {googleHidden ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-5 flex w-full items-center gap-2.5 rounded-xl border border-line bg-raised px-3 py-2.5 text-left transition hover:bg-strong"
              >
                <KeyRound className="h-4 w-4 shrink-0 text-subtle" />
                <span className="min-w-0 flex-1 text-xs text-muted">
                  Google basemaps need a key of your own. Add one in Settings.
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
