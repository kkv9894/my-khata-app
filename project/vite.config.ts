// vite.config.ts
// ZivaKhata — Vite configuration
//
// CRITICAL FOR @xenova/transformers (Whisper on-device STT):
//   optimizeDeps.exclude  → prevents Vite from pre-bundling WASM/Worker internals
//   worker.format 'es'    → required for the Whisper WASM worker to load correctly
//   fs.allow              → lets the dev server serve the WASM binary from node_modules
//
// DO NOT REMOVE the transformers exclusions — the build will break silently.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // ── Whisper / Transformers.js ─────────────────────────────────────────────
  // Vite must NOT pre-bundle these — they ship their own WASM + Worker setup.
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
  },

  // ESM worker format — required for the Whisper WASM thread to initialise
  worker: {
    format: 'es',
  },

  // ── Existing defines (keep as-is) ─────────────────────────────────────────
  define: {
    'global':          'window',
    'process.env':     {},
    'process.browser': true,
  },

  // ── Dev server (keep as-is) ───────────────────────────────────────────────
  server: {
    host:       true,
    port:       5185,
    strictPort: false,
    cors:       true,
    hmr: { clientPort: 443 },

    // Allow Vite to serve WASM files from node_modules during local dev
    fs: {
      allow: ['..'],
    },

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

  // ── Build settings ────────────────────────────────────────────────────────
  build: {
    // Whisper WASM binary is ~244MB — don't warn on large chunks
    chunkSizeWarningLimit: 10000,

    rollupOptions: {
      // Keep transformers in its own chunk — avoids poisoning the main bundle
      output: {
        manualChunks: {
          transformers: ['@xenova/transformers'],
        },
      },
    },
  },
})