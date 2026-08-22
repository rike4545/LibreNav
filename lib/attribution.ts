/**
 * Basemap credits, as data rather than as markup.
 *
 * A style's attribution arrives as an HTML fragment — `&copy; <a href=…>CARTO</a>,
 * …` — from whichever CDN serves the TileJSON. MapLibre drops that straight
 * into the DOM; rendering it ourselves means either doing the same with
 * `dangerouslySetInnerHTML` or parsing it first. This parses it, so a
 * compromised or merely careless tile host cannot put script, an iframe, or a
 * `javascript:` link into the app's chrome.
 */

/** A stretch of credit text, optionally linked. Order is the printed order. */
export type CreditRun = {
  text: string;
  href?: string;
};

export type MapCredit = {
  /** One entry per source that supplies a credit; printed separated by a dot. */
  sources: CreditRun[][];
  /**
   * Google's wordmark, which their terms require beside their tiles. Null for
   * every other basemap, whose credit is text alone.
   */
  logoSrc: string | null;
};

export const EMPTY_CREDIT: MapCredit = { sources: [], logoSrc: null };

/**
 * Only absolute web links survive. `javascript:` and `data:` hrefs are the
 * whole reason the fragment is parsed instead of trusted, and a relative href
 * in a third-party credit is a mistake at the source either way.
 */
function safeHref(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Adjacent runs sharing a link are one run; whitespace collapses to a space. */
function tidy(runs: CreditRun[]): CreditRun[] {
  const merged: CreditRun[] = [];

  for (const run of runs) {
    const text = run.text.replace(/\s+/g, ' ');
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.href === run.href) last.text += text;
    else merged.push({ text, href: run.href });
  }

  if (merged.length) {
    merged[0].text = merged[0].text.replace(/^\s+/, '');
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, '');
  }

  return merged.filter((run) => run.text.length > 0);
}

/**
 * Flatten an attribution fragment into text runs.
 *
 * Text nodes are kept exactly where they fall, punctuation and all, so
 * "&copy; <a>CARTO</a>, &copy; <a>OpenStreetMap</a> contributors" still reads
 * as one sentence rather than as a list of link labels. Everything that is not
 * a text node or a link contributes only its text.
 */
export function parseAttribution(html: string): CreditRun[] {
  // DOMParser builds an inert document: no scripts run and no subresources
  // load, which is what makes parsing safe to do on arbitrary markup.
  if (typeof DOMParser === 'undefined') return [];

  let body: HTMLElement;
  try {
    body = new DOMParser().parseFromString(html, 'text/html').body;
  } catch {
    return [];
  }

  const runs: CreditRun[] = [];

  const walk = (node: Node, href: string | undefined) => {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push({ text: node.textContent ?? '', href });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    // Nested anchors are invalid HTML; the innermost one wins if one appears.
    const inherited = element.tagName === 'A' ? safeHref(element.getAttribute('href')) ?? href : href;
    for (const child of Array.from(element.childNodes)) walk(child, inherited);
  };

  for (const child of Array.from(body.childNodes)) walk(child, undefined);
  return tidy(runs);
}

/** Cheap structural equality, so a repeated credit cannot loop a render. */
export function sameCredit(a: MapCredit, b: MapCredit): boolean {
  if (a.logoSrc !== b.logoSrc || a.sources.length !== b.sources.length) return false;
  return a.sources.every((runs, index) => {
    const other = b.sources[index];
    return (
      runs.length === other.length &&
      runs.every((run, i) => run.text === other[i].text && run.href === other[i].href)
    );
  });
}
