import type { Config } from 'tailwindcss';

/**
 * Colours resolve through CSS variables so a single `data-theme` on <html>
 * reskins the whole app. The `<alpha-value>` form keeps Tailwind's opacity
 * modifiers (bg-surface/80) working against the variables.
 */
const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        /** Panel and sheet backgrounds. */
        surface: withAlpha('--surface'),
        /** Cards nested inside a panel. */
        raised: withAlpha('--raised'),
        /** Chips and hover states. */
        strong: withAlpha('--strong'),
        /** Primary text. */
        fg: withAlpha('--fg'),
        muted: withAlpha('--muted'),
        subtle: withAlpha('--subtle'),
        line: withAlpha('--line'),
        accent: '#38bdf8'
      },
      boxShadow: {
        panel: 'var(--shadow-panel)'
      }
    }
  },
  plugins: []
};

export default config;
