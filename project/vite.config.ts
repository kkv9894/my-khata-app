import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'global': 'window',
    'process.env': {},
    'process.browser': true,
  },
  server: {
    host: true,
    port: 5185,
    strictPort: false,  // ← was true — now tries next port instead of crashing
    cors: true,
    // HMR over ngrok / mobile network
    hmr: {
      clientPort: 443,
    },
  },
});