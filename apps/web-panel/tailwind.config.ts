import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: 'var(--panel-bg)',
          surface: 'var(--panel-surface)',
          elevated: 'var(--panel-elevated)',
          line: 'var(--panel-line)',
          text: 'var(--panel-text)',
          muted: 'var(--panel-muted)',
          accent: 'var(--panel-accent)',
          success: 'var(--panel-success)',
          warning: 'var(--panel-warning)',
          danger: 'var(--panel-danger)',
        },
      },
      borderRadius: {
        panel: '1.5rem',
      },
      boxShadow: {
        panel: '0 22px 45px rgba(15, 23, 42, 0.16)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
