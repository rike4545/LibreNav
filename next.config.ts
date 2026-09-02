import type { NextConfig } from 'next';

/**
 * GitHub Pages serves project sites from /<repo>, so the deploy workflow sets
 * BASE_PATH. Locally it stays empty and the app runs from the root.
 */
const basePath = process.env.BASE_PATH ?? '';

const nextConfig: NextConfig = {
  // Fully static: no server, no API routes. Every data call runs in the browser
  // against the public OSM services (see lib/services/).
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  // Pages resolves /discounts to /discounts/index.html.
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath
  },
  typedRoutes: true,
  /**
   * Dev-only overlay button.
   *
   * It defaults to the bottom-left, sitting on the search field — the control
   * you reach for most while testing. Every corner of a full-bleed map app has
   * chrome in it, so this is a choice of what to cover rather than whether:
   * top-left is the status pill, which is the only one of the four that is
   * purely a readout and not something you press.
   *
   * None of this reaches the deployed site; `output: 'export'` leaves the
   * overlay out of the build entirely.
   */
  devIndicators: {
    position: 'top-left'
  }
};

export default nextConfig;
