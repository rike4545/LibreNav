'use client';

import { useEffect } from 'react';

/**
 * How much screen the on-screen keyboard is covering, published as `--kb`.
 *
 * iOS does not shrink the layout viewport when the keyboard opens: `100dvh`
 * still measures the whole screen, so a bottom sheet sized against it keeps
 * its full height, and iOS slides the entire page up to get the focused field
 * clear of the keys. The sheet then rides off the top of the screen — chips
 * colliding with the clock, and the very search field being typed into pushed
 * out of sight above it. The visual viewport is the only thing that knows how
 * much of the screen is left, so publish that and let the layout sit inside it.
 */

/**
 * A collapsing URL bar moves the visual viewport by roughly 50px, and rounding
 * moves it by one. No keyboard is anywhere near this short, so anything under
 * the floor is browser chrome and must not be mistaken for one.
 */
const KEYBOARD_MIN_PX = 120;

export function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const apply = () => {
      const covered = window.innerHeight - viewport.height;
      const inset = covered > KEYBOARD_MIN_PX ? Math.round(covered) : 0;
      root.style.setProperty('--kb', `${inset}px`);
    };

    const sync = () => {
      apply();

      // iOS decides whether to scroll the page at focus time, before the
      // layout above has reacted to the keyboard. Once it has, the field is
      // visible without any scrolling and the leftover offset does nothing but
      // hide the top of the app — which is what strands the map under a band
      // of page background after the keyboard closes. Undo it once the
      // keyboard animation has settled rather than on every frame, so this
      // never fights a scroll iOS is still performing.
      clearTimeout(settle);
      settle = setTimeout(() => {
        apply();
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      }, 300);
    };

    sync();
    viewport.addEventListener('resize', sync);

    return () => {
      clearTimeout(settle);
      viewport.removeEventListener('resize', sync);
      root.style.removeProperty('--kb');
    };
  }, []);
}
