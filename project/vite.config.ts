import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  define: {
    'global':          'window',
    'process.env':     {},
    'process.browser': true,
  },

  server: {
    host:       true,
    port:       5185,
    strictPort: false,
    cors:       true,
    hmr: { clientPort: 443 },

    // Proxy /api/* to Vercel dev server during local development
    // Run `vercel dev` in a separate terminal first (starts on port 3000)
    proxy: {
      '/api': {
        target:       'http://localhost:3000',
        changeOrigin: true,
        secure:       false,
      },
    },
  },
});