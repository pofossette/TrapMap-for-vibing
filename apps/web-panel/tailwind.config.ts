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
          accentStrong: 'var(--panel-accent-strong)',
          accentContrast: 'var(--panel-accent-contrast)',
          success: 'var(--panel-success)',
          warning: 'var(--panel-warning)',
          danger: 'var(--panel-danger)',
        },
      },
      borderRadius: {
        'panel-xs': 'var(--panel-radius-xs)',
        'panel-sm': 'var(--panel-radius-sm)',
        'panel-md': 'var(--panel-radius-md)',
        'panel-lg': 'var(--panel-radius-lg)',
        panel: '1.5rem',
      },
      boxShadow: {
        panel: '0 22px 45px rgba(15, 23, 42, 0.16)',
      },
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
