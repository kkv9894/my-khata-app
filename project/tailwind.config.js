/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── ZivaKhata — Black / Grey / White Dark Theme ──────────────────────
        navy: {
          950: '#0A0A0A',   // deepest black
          900: '#111111',   // main app background
          800: '#1C1C1C',   // card background
          700: '#242424',   // elevated card / modal
          600: '#333333',   // border / divider
          500: '#444444',   // subtle highlight
          400: '#666666',   // muted text background
        },
        // White as primary accent — replaces cyan
        cyan: {
          DEFAULT: '#FFFFFF',    // primary action — pure white
          glow:    '#FFFFFF',
          dim:     '#CCCCCC',    // hover state
          muted:   '#FFFFFF15',  // 8% alpha backgrounds
          border:  '#FFFFFF25',  // 15% alpha borders
        },
        // ── Legacy — kept so nothing breaks ──────────────────────────────────
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
      // ── Shadows — white glow instead of cyan/gold ─────────────────────────
      boxShadow: {
        'cyan-glow':  '0 0 20px 4px rgba(255,255,255,0.12)',
        'cyan-pulse': '0 0 32px 8px rgba(255,255,255,0.18)',
        'card-dark':  '0 4px 24px 0 rgba(0,0,0,0.60)',
      },
      // ── Keyframes ─────────────────────────────────────────────────────────
      keyframes: {
        'ziva-ping': {
          '0%':   { transform: 'scale(1)',   opacity: '0.5', willChange: 'transform, opacity' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      animation: {
        'ziva-ping': 'ziva-ping 1.4s ease-out infinite',
        'slide-up':  'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
};