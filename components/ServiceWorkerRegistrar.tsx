'use client';

import { useEffect } from 'react';
import { appEnv } from '@/lib/config';

/**
 * Registers the offline shell worker.
 *
 * Scoped to basePath so a project-site deploy (/LibreNav/) registers correctly;
 * at the root the prefix is empty and this resolves to /sw.js.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // Registering over a dev server would cache Turbopack's chunks and make
    // edits appear not to apply.
    if (process.env.NODE_ENV !== 'production') return;

    const base = appEnv.basePath || '';
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {
      // Blocked by a private-mode or enterprise policy; the app still works.
    });
  }, []);

  return null;
}
