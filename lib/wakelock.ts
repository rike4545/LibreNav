/**
 * Screen wake lock for navigation.
 *
 * A phone that sleeps mid-drive is the single most irritating failure in a
 * hands-free context, and the driver can't reasonably wake it. Unsupported
 * browsers simply no-op.
 */

type WakeLockSentinel = { released: boolean; release: () => Promise<void> };

let sentinel: WakeLockSentinel | null = null;
let wanted = false;
let listening = false;

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

async function acquire() {
  if (!supported() || !wanted || sentinel) return;
  try {
    sentinel = (await navigator.wakeLock.request('screen')) as unknown as WakeLockSentinel;
  } catch {
    // Denied (often a low-battery mode). Nothing useful to do.
    sentinel = null;
  }
}

/**
 * Browsers drop the lock whenever the page is hidden — switching apps at a
 * traffic light would silently end it — so reacquire when we come back.
 */
function onVisibility() {
  if (document.visibilityState === 'visible' && wanted && !sentinel) void acquire();
}

export async function requestWakeLock() {
  if (!supported()) return;
  wanted = true;

  if (!listening) {
    document.addEventListener('visibilitychange', onVisibility);
    listening = true;
  }

  await acquire();
}

export async function releaseWakeLock() {
  wanted = false;

  if (listening) {
    document.removeEventListener('visibilitychange', onVisibility);
    listening = false;
  }

  const current = sentinel;
  sentinel = null;
  if (current && !current.released) await current.release().catch(() => {});
}

export function wakeLockSupported(): boolean {
  return supported();
}
