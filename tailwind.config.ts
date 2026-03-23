import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        panel: '#0f172a',
        accent: '#38bdf8',
        border: 'rgba(148, 163, 184, 0.18)'
      },
      boxShadow: {
        panel: '0 14px 40px rgba(2, 6, 23, 0.38)'
      }
    }
  },
  plugins: []
};

export default config;
