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
  typedRoutes: true
};

export default nextConfig;
