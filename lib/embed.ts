import { Coordinate, RouteResponse, VehicleProfile, Waypoint } from '@/types/map';

/**
 * Host-app bridge.
 *
 * LibreNav is a web app, so the way to put it inside another app is a WebView
 * (iOS WKWebView, Android WebView, React Native) or an iframe. One contract
 * covers all of them, but the outbound channel differs: WKWebView uses a
 * script-message handler, React Native its own bridge, and an iframe the real
 * parent frame. Inbound is window.postMessage everywhere, which Swift reaches
 * through evaluateJavaScript.
 *
 * Two channels, deliberately: the URL for the initial state (which survives a
 * cold start and a reload), and postMessage for anything after that.
 */

export type EmbedConfig = {
  /** True when running inside a host app; hides chrome the host provides. */
  embedded: boolean;
  /**
   * Origin allowed to talk to us, from ?host=. When set, inbound messages from
   * anywhere else are ignored and outbound messages target it specifically.
   */
  hostOrigin: string | null;
  /** Begin guidance as soon as a route is ready, from ?autostart=1. */
  autostart: boolean;
};

export function readEmbedConfig(): EmbedConfig {
  if (typeof window === 'undefined') {
    return { embedded: false, hostOrigin: null, autostart: false };
  }

  const params = new URLSearchParams(window.location.search);
  const host = params.get('host');

  return {
    embedded: params.get('embed') === '1',
    // Only accept a well-formed origin; a malformed one would silently widen
    // the check to everything.
    hostOrigin: host && /^https?:\/\/[^/]+$/.test(host) ? host : null,
    autostart: params.get('autostart') === '1'
  };
}

/* ----------------------------------------------------- outbound (to host) */

export type AppEvent =
  | { type: 'librenav:ready' }
  | {
      type: 'librenav:route';
      distanceKm: number;
      durationMin: number;
      /** ISO timestamp, including any live-traffic delay. */
      etaIso: string;
      stops: number;
    }
  | {
      type: 'librenav:progress';
      remainingKm: number;
      remainingMin: number;
      etaIso: string;
      speedKmh: number | null;
      /** 0–1 along the route. */
      fraction: number;
    }
  | { type: 'librenav:arrived' }
  | { type: 'librenav:cancelled' }
  | { type: 'librenav:error'; message: string };

type ReactNativeBridge = { postMessage: (payload: string) => void };

/** WKWebView's channel: window.webkit.messageHandlers.<name>.postMessage(). */
type WebKitBridge = { messageHandlers?: Record<string, { postMessage: (payload: unknown) => void }> };

/** Script-message handler name the Swift host registers. */
export const WEBKIT_HANDLER = 'librenav';

/**
 * Send an event to whatever is hosting us.
 *
 * React Native exposes its own bridge rather than a real parent frame, so both
 * paths are attempted — a plain iframe/WKWebView gets the postMessage, RN gets
 * the string channel.
 */
export function emitToHost(event: AppEvent, config: EmbedConfig) {
  if (typeof window === 'undefined' || !config.embedded) return;

  // WKWebView has no usable parent frame and no RN bridge — it listens on its
  // own script-message handler, so a Swift host needs this path specifically.
  const webkit = (window as unknown as { webkit?: WebKitBridge }).webkit;
  const handler = webkit?.messageHandlers?.[WEBKIT_HANDLER];
  if (handler) {
    try {
      handler.postMessage(event);
    } catch {
      /* Handler removed while navigating away. */
    }
  }

  const rn = (window as unknown as { ReactNativeWebView?: ReactNativeBridge }).ReactNativeWebView;
  if (rn?.postMessage) {
    try {
      rn.postMessage(JSON.stringify(event));
    } catch {
      /* Bridge went away mid-navigation; nothing useful to do. */
    }
  }

  // Never post to '*' when we know the host: that would leak position data to
  // any frame that happens to be listening.
  const target = config.hostOrigin ?? '*';
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(event, target);
    else window.postMessage(event, target);
  } catch {
    /* Cross-origin restrictions; the RN path above may still have worked. */
  }
}

/* ---------------------------------------------------- inbound (from host) */

export type HostCommand =
  | {
      type: 'librenav:navigate';
      stops: Array<{ lat: number; lng: number; name?: string }>;
      autostart?: boolean;
    }
  | { type: 'librenav:cancel' }
  | { type: 'librenav:recenter' }
  | { type: 'librenav:setVehicle'; vehicle: Partial<VehicleProfile> }
  | { type: 'librenav:setUnits'; imperial: boolean };

function isCommand(value: unknown): value is HostCommand {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && type.startsWith('librenav:');
}

/**
 * Listen for host commands. Returns an unsubscribe function.
 *
 * Messages are rejected unless they carry a librenav: type and, when ?host= was
 * supplied, come from that exact origin — an embedded page can otherwise be
 * driven by any frame on the page.
 */
export function listenToHost(config: EmbedConfig, onCommand: (command: HostCommand) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: MessageEvent) => {
    if (config.hostOrigin && event.origin !== config.hostOrigin) return;

    // React Native sends strings; browsers send structured clones.
    let payload: unknown = event.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        return;
      }
    }

    if (isCommand(payload)) onCommand(payload);
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Turn a host command's stops into waypoints. */
export function stopsToWaypoints(stops: Array<{ lat: number; lng: number; name?: string }>): Waypoint[] {
  return stops
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
    .map((stop, index) => ({
      id: `host-${index}-${stop.lat},${stop.lng}`,
      name: stop.name || (index === 0 ? 'Start' : `Stop ${index}`),
      label: `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`,
      coordinate: { lat: stop.lat, lng: stop.lng } as Coordinate
    }));
}

/** Summary event for a freshly computed route. */
export function routeEvent(route: RouteResponse, delaySeconds: number, stops: number): AppEvent {
  const durationMin = route.summary.durationMin + delaySeconds / 60;
  return {
    type: 'librenav:route',
    distanceKm: route.summary.distanceKm,
    durationMin,
    etaIso: new Date(Date.now() + durationMin * 60_000).toISOString(),
    stops
  };
}
