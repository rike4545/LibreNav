'use client';

import { useEffect } from 'react';
import { Check, KeyRound, X } from 'lucide-react';
import { MapStyleOption, StylePreview } from '@/lib/config';
import { cn } from '@/lib/utils';

type Props = {
  styles: MapStyleOption[];
  currentId: string;
  /** Whether it is each style's dark rendering that will actually load. */
  dark: boolean;
  /** Google entries are filtered out without a key. Say so rather than hide silently. */
  googleHidden: boolean;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
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

export function LayersSheet({ styles, currentId, dark, googleHidden, onSelect, onOpenSettings, onClose }: Props) {
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
        aria-label="Close map styles"
        className="absolute inset-0 z-40 bg-[rgb(var(--page)/0.55)]"
      />

      <div className="safe-bottom safe-x absolute inset-x-0 bottom-0 z-50">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Map style"
          className="sheet-max mx-auto w-[min(60rem,100%)] rounded-[1.75rem] border border-line bg-surface shadow-panel"
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-subtle">Map style</h2>
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

            {googleHidden ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-line bg-raised px-3 py-2.5 text-left transition hover:bg-strong"
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
