import { PREFS_KEY, ThemeChoice } from '@/lib/storage';

/** What `data-theme` on <html> is actually set to; 'system' resolves to one. */
export type ResolvedTheme = 'dark' | 'light';

/** Matches --page in globals.css; drives the browser/OS chrome colour. */
export const PAGE_COLOR: Record<ResolvedTheme, string> = {
  dark: '#020617',
  light: '#e2e8f0'
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

export function readThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    const choice = raw ? (JSON.parse(raw) as { theme?: ThemeChoice }).theme : undefined;
    return choice === 'dark' || choice === 'light' || choice === 'system' ? choice : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;

  // The status bar behind a home-screen install reads these, not the CSS. Next
  // ships one per colour scheme; once a theme is resolved the media split is
  // wrong — an explicit 'light' under a dark OS would still match the dark tag
  // — so collapse them all onto the chosen colour.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute('media');
    meta.setAttribute('content', PAGE_COLOR[theme]);
  });
}

/** Subscribes to OS light/dark flips. Returns an unsubscribe. */
export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light');
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}

/**
 * Runs before first paint, inlined into the document by the root layout.
 *
 * This is a static export, so the HTML ships with no idea which theme the
 * visitor picked — without this the page paints the default and then snaps to
 * the stored choice once React hydrates. It has to stay dependency-free and
 * synchronous for that reason. `applyTheme` above is the same logic for the
 * live case, and the two must agree on the attribute they set.
 */
export const THEME_BOOTSTRAP = `(function(){try{
var raw=localStorage.getItem(${JSON.stringify(PREFS_KEY)});
var c=raw?(JSON.parse(raw)||{}).theme:null;
if(c!=='dark'&&c!=='light')c=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',c);
var col=c==='dark'?${JSON.stringify(PAGE_COLOR.dark)}:${JSON.stringify(PAGE_COLOR.light)};
var m=document.querySelectorAll('meta[name="theme-color"]');
for(var i=0;i<m.length;i++){m[i].removeAttribute('media');m[i].setAttribute('content',col);}
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
