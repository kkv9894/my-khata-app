/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── ZivaKhata Black & Gold Premium Palette ──────────────────────────
        // Replaces navy/cyan with deep black + warm gold
        navy: {
          950: '#0A0800',   // deepest black with warm undertone
          900: '#0F0C00',   // main app background
          800: '#1A1500',   // card background
          700: '#241D00',   // elevated card / modal
          600: '#2E2500',   // border / divider
          500: '#3D3200',   // subtle highlight
          400: '#5C4C00',   // muted text bg
        },
        // Gold replaces cyan as primary action colour
        cyan: {
          DEFAULT: '#D4A017',   // warm Indian gold — primary action
          glow:    '#D4A017',
          dim:     '#B8860B',   // dark gold for hover
          muted:   '#D4A01726', // 15% alpha backgrounds
          border:  '#D4A01740', // 25% alpha borders
        },
        gold: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#D4A017',   // main gold
          600: '#B8860B',   // dark gold
          700: '#92660A',
          800: '#6B4C08',
          900: '#4A3406',
        },
        // ── Legacy — kept so existing components don't break ─────────────────
        primary: {
          50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74',
          400: '#fb923c', 500: '#FF6B35', 600: '#ea580c',
          700: '#c2410c', 800: '#9a3412', 900: '#7c2d12',
        },
        secondary: {
          50: '#eff6ff',  100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#2563EB', 600: '#2563eb',
          700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
        },
      },

      // ── Gold glow shadows ─────────────────────────────────────────────────
      boxShadow: {
        'cyan-glow':  '0 0 20px 4px rgba(212,160,23,0.40)',
        'cyan-pulse': '0 0 32px 8px rgba(212,160,23,0.50)',
        'gold-glow':  '0 0 20px 4px rgba(212,160,23,0.40)',
        'gold-soft':  '0 2px 16px 0 rgba(212,160,23,0.20)',
        'card-dark':  '0 4px 24px 0 rgba(0,0,0,0.60)',
      },

      // ── Fonts ─────────────────────────────────────────────────────────────
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
      },

      // ── Keyframes ─────────────────────────────────────────────────────────
      keyframes: {
        'ziva-ping': {
          '0%':   { transform: 'scale(1)',    opacity: '0.6', willChange: 'transform, opacity' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        'gold-shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        'ziva-ping':    'ziva-ping 1.4s ease-out infinite',
        'slide-up':     'slide-up 0.3s ease-out',
        'gold-shimmer': 'gold-shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
};