'use client';

import { useEffect, useState } from 'react';
import { PREFS_CHANGED_EVENT, PREFS_KEY } from '@/lib/storage';
import { ResolvedTheme, applyTheme, readThemeChoice, resolveTheme, watchSystemTheme } from '@/lib/theme';

/**
 * Keeps <html data-theme> matching the stored preference.
 *
 * THEME_BOOTSTRAP in the layout gets the first paint right; this keeps it right
 * afterwards — when the OS flips while the app is open on 'system', when
 * Settings changes the choice, and when another tab does. It lives in the root
 * layout rather than in MapShell so /discounts is covered too.
 */
export function ThemeSync() {
  useEffect(() => {
    let stopWatching: (() => void) | null = null;

    const sync = () => {
      const choice = readThemeChoice();
      applyTheme(resolveTheme(choice));

      stopWatching?.();
      // Only track the OS while the user has actually delegated to it.
      stopWatching = choice === 'system' ? watchSystemTheme(applyTheme) : null;
    };

    sync();

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === PREFS_KEY) sync();
    };

    window.addEventListener(PREFS_CHANGED_EVENT, sync);
    window.addEventListener('storage', onStorage);

    return () => {
      stopWatching?.();
      window.removeEventListener(PREFS_CHANGED_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return null;
}

/**
 * The theme currently in force, for the parts of the UI that CSS variables
 * can't reach — picking a dark basemap, mainly.
 *
 * It follows the `data-theme` attribute rather than re-deriving the choice,
 * so ThemeSync stays the single writer and there is no second copy of the
 * preference/matchMedia subscriptions to keep in step.
 */
export function useResolvedTheme(): ResolvedTheme {
  // Read on the very first render, not in the effect. THEME_BOOTSTRAP has
  // already stamped the attribute by the time any component runs, and a
  // consumer that starts on the wrong value then corrects itself can have the
  // correction dropped — NavMap ignores a style swap requested before its
  // first style has loaded, which left a dark basemap under a light UI.
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    typeof document === 'undefined' || document.documentElement.dataset.theme !== 'light' ? 'dark' : 'light'
  );

  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    read();

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
