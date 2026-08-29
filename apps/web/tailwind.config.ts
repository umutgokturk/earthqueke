import type { Config } from 'tailwindcss';

/**
 * Design system — theme-aware via CSS variables (globals.css defines the
 * light-default and dark palettes). Chart/series and map colors were
 * validated with the dataviz palette validator on BOTH surfaces.
 */
const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        txt: {
          DEFAULT: 'rgb(var(--txt) / <alpha-value>)',
          soft: 'rgb(var(--txt-soft) / <alpha-value>)',
          mute: 'rgb(var(--txt-mute) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'var(--accent-soft)',
        },
        series: {
          1: 'rgb(var(--series-1) / <alpha-value>)',
          2: 'rgb(var(--series-2) / <alpha-value>)',
          3: 'rgb(var(--series-3) / <alpha-value>)',
        },
        status: {
          good: 'rgb(var(--status-good) / <alpha-value>)',
          warn: 'rgb(var(--status-warn) / <alpha-value>)',
          serious: 'rgb(var(--status-serious) / <alpha-value>)',
          bad: 'rgb(var(--status-bad) / <alpha-value>)',
        },
        mag: {
          m1: 'rgb(var(--mag-m1) / <alpha-value>)',
          m2: 'rgb(var(--mag-m2) / <alpha-value>)',
          m3: 'rgb(var(--mag-m3) / <alpha-value>)',
          m4: 'rgb(var(--mag-m4) / <alpha-value>)',
          m5: 'rgb(var(--mag-m5) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        float: 'var(--shadow-float)',
        glow: '0 0 18px rgb(var(--accent) / 0.25)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'row-flash': {
          '0%': { backgroundColor: 'rgb(var(--accent) / 0.22)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'toast-in': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'row-flash': 'row-flash 2.4s ease-out 1',
        'toast-in': 'toast-in 0.22s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
