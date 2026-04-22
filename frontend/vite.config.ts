import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // OAuth endpoints that AI clients hit directly from the frontend
      // origin (per the RFC 8414 well-known metadata). /oauth/authorize
      // is intentionally NOT proxied — it's an HTML consent page served
      // by the SPA (ConsentPage component).
      '/oauth/register': { target: 'http://localhost:8000', changeOrigin: true },
      '/oauth/token':    { target: 'http://localhost:8000', changeOrigin: true },
      '/oauth/revoke':   { target: 'http://localhost:8000', changeOrigin: true },
      '/.well-known': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
})
