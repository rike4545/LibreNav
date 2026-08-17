import next from 'eslint-config-next';

/**
 * Next 16 dropped `next lint`, and this project never had a config file to
 * migrate — so `npm run lint` errored out and CI (typecheck + build) was the
 * only gate. eslint-config-next ships a flat-config array now, which is the
 * whole setup: it carries the react, react-hooks, import, jsx-a11y and
 * @next/next plugins, and its own TypeScript entry.
 */
const config = [{ ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'] }, ...next];

export default config;
