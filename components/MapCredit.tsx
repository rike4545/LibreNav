'use client';

import { Fragment } from 'react';
import { MapCredit as Credit } from '@/lib/attribution';

type Props = {
  credit: Credit;
};

/**
 * The basemap credit, sat under the search bar.
 *
 * It used to be MapLibre's own control, floating in the bottom-left corner of
 * the map, where it had to be boxed to stay legible over the cartography and
 * still wrapped "OpenStreetMap contributors" onto a second line to avoid the
 * zoom buttons. Down here it gets a full-width line of its own in the app's
 * chrome and reads as a caption instead of as clutter dropped on the map.
 *
 * It is deliberately not part of the sheet above it: the credit is a licence
 * term of the tiles on screen, so it has to outlast the sheet being swapped
 * for a charger card or hidden during turn-by-turn.
 */
export function MapCredit({ credit }: Props) {
  if (!credit.sources.length && !credit.logoSrc) return null;

  return (
    <div className="map-credit">
      {credit.logoSrc ? (
        // Google's own asset: their logo is a trademark, so it is served from
        // their CDN rather than redrawn. next/image buys nothing here either —
        // the export runs unoptimized, and this is an 18px trademark that has
        // to come from Google's own CDN.
        // eslint-disable-next-line @next/next/no-img-element -- see above
        <img src={credit.logoSrc} alt="Google" height={18} />
      ) : null}

      <p>
        {credit.sources.map((runs, index) => (
          <Fragment key={index}>
            {index > 0 ? <span aria-hidden> · </span> : null}
            {runs.map((run, position) =>
              run.href ? (
                <a key={position} href={run.href} target="_blank" rel="noreferrer noopener">
                  {run.text}
                </a>
              ) : (
                <Fragment key={position}>{run.text}</Fragment>
              )
            )}
          </Fragment>
        ))}
      </p>
    </div>
  );
}
