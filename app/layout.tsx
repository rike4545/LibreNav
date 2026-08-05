import type { Metadata, Viewport } from 'next';
import './globals.css';

// Static export can't resolve basePath at request time, so bake it in.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'LibreNav — open-source navigation',
  description:
    'Turn-by-turn navigation, EV charger discovery, and multi-stop trip planning built entirely on OpenStreetMap. No account, no tracking.',
  manifest: `${basePath}/manifest.json`,
  applicationName: 'LibreNav',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LibreNav'
  },
  icons: {
    icon: `${basePath}/favicon-32.png`,
    apple: `${basePath}/apple-touch-icon.png`
  },
  openGraph: {
    title: 'LibreNav',
    description: 'Open-source navigation built on open maps.',
    type: 'website'
  }
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom is the map's job; page zoom just fights the fixed layout.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
