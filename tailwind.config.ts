import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Iowan Old Style', 'Palatino Linotype', 'Times New Roman', 'serif'],
        body: ['Avenir Next', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif']
      },
      colors: {
        bg: 'hsl(var(--bg))',
        surface: 'hsl(var(--surface))',
        card: 'hsl(var(--card))',
        ink: 'hsl(var(--ink))',
        muted: 'hsl(var(--muted))',
        accent: 'hsl(var(--accent))',
        accentStrong: 'hsl(var(--accent-strong))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))'
      },
      boxShadow: {
        glow: '0 0 0 1px hsl(var(--accent) / 0.35), 0 12px 32px -20px hsl(var(--accent) / 0.6)'
      },
      keyframes: {
        pulseIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        }
      },
      animation: {
        pulseIn: 'pulseIn 320ms ease-out forwards'
      }
    }
  },
  plugins: []
};

export default config;
