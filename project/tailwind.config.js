/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── ZivaKhata brand palette ─────────────────────────────────────────
        navy: {
          950: '#060B19',   // deepest bg
          900: '#0A1128',   // main app bg
          800: '#0F1A3E',   // card bg
          700: '#162050',   // elevated card / modal
          600: '#1E2D6B',   // border / divider
          500: '#2A3F8F',   // subtle highlight
          400: '#3D56B5',   // muted text bg
        },
        cyan: {
          DEFAULT: '#00E5FF',  // primary action — neon cyan
          glow:    '#00E5FF',
          dim:     '#00B8CC',  // darker variant for hover
          muted:   '#00E5FF26', // 15% alpha for backgrounds
          border:  '#00E5FF40', // 25% alpha for borders
        },
        // ── Legacy — untouched so existing components don't break ───────────
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
      // ── Drop shadows using cyan glow ─────────────────────────────────────
      boxShadow: {
        'cyan-glow':  '0 0 20px 4px rgba(0,229,255,0.45)',
        'cyan-pulse': '0 0 32px 8px rgba(0,229,255,0.55)',
        'card-dark':  '0 4px 24px 0 rgba(0,0,0,0.45)',
      },
      // ── Keyframes for mic pulse ring ─────────────────────────────────────
      keyframes: {
        'ziva-ping': {
          '0%':   { transform: 'scale(1)',    opacity: '0.8' },
          '100%': { transform: 'scale(1.65)', opacity: '0'   },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      animation: {
        'ziva-ping': 'ziva-ping 1.1s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-up':  'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
};