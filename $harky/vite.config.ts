import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  build: {
    // ExcelJS is intentionally isolated behind a user-triggered dynamic import.
    // Keep the warning focused on chunks that can affect first load.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/exceljs')) return 'vendor-excel'
          if (id.includes('node_modules/jspdf')) return 'vendor-pdf'
          if (id.includes('node_modules/html2canvas')) return 'vendor-capture'
          if (id.includes('node_modules/recharts')) return 'vendor-charts'
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons'
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '$harky — Finanzas personales',
        short_name: '$harky',
        description: 'Registra ingresos, gastos, presupuestos y metas de ahorro.',
        theme_color: '#3b82f6',
        background_color: '#0a0e16',
        display: 'standalone',
        start_url: '/',
        orientation: 'any',
        categories: ['finance', 'productivity'],
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // cachear todos los assets estáticos
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // no cachear los chunks de exportación grandes (se cargan on-demand)
        globIgnores: ['**/vendor-pdf*', '**/vendor-capture*', '**/vendor-excel*', '**/vendor-charts*', '**/imageExport*'],
        runtimeCaching: [
          {
            // fonts de Google
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 3000 },
})
