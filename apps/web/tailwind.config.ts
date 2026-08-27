import type { Config } from 'tailwindcss';

/**
 * Design system (dark observability dashboard).
 * Chart/series and map colors were validated with the dataviz palette
 * validator against the panel surface #0B1220 (CVD + contrast checks).
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
          950: '#04070D',
          900: '#060A12',
          800: '#0B1220',
          700: '#101A2C',
          600: '#16233A',
        },
        line: {
          DEFAULT: 'rgba(148,163,184,0.14)',
          strong: 'rgba(148,163,184,0.28)',
        },
        txt: {
          DEFAULT: '#E8EEF7',
          soft: '#94A3B8',
          mute: '#64748B',
        },
        accent: {
          DEFAULT: '#22D3EE',
          soft: 'rgba(34,211,238,0.14)',
        },
        series: {
          1: '#0899B8',
          2: '#DE640D',
          3: '#8B5CF6',
        },
        status: {
          good: '#34D399',
          warn: '#FBBF24',
          serious: '#FB923C',
          bad: '#F87171',
        },
        mag: {
          m1: '#38BDF8',
          m2: '#FACC15',
          m3: '#FB923C',
          m4: '#F87171',
          m5: '#E879F9',
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
        panel: '0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 30px rgba(0,0,0,0.35)',
        float: '0 18px 44px rgba(0,0,0,0.5)',
        glow: '0 0 18px rgba(34,211,238,0.25)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'row-flash': {
          '0%': { backgroundColor: 'rgba(34,211,238,0.22)' },
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
