'use client';

import { useEffect, useState } from 'react';
import { ResolvedTheme, applyTheme, systemTheme, watchSystemTheme } from '@/lib/theme';

/** Keeps every route in sync with the OS after the pre-paint bootstrap. */
export function ThemeSync() {
  useEffect(() => {
    const stopWatching = watchSystemTheme(applyTheme);
    applyTheme(systemTheme());
    return stopWatching;
  }, []);

  return null;
}

/**
 * The theme currently in force, for the parts of the UI that CSS variables
 * can't reach — picking a dark basemap, mainly.
 *
 * It follows the `data-theme` attribute rather than re-deriving the choice,
 * so ThemeSync stays the single writer and there is no second copy of the
 * matchMedia subscriptions to keep in step.
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
