// vite.config.ts — ZivaKhata
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

    proxy: {
      '/api': {
        target:       'http://localhost:3000',
        changeOrigin: true,
        secure:       false,
      },
    },
  },

  build: {
    chunkSizeWarningLimit: 1000,
  },
})