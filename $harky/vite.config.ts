import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
          if (id.includes('node_modules/tesseract.js')) return 'vendor-ocr'
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
        globIgnores: ['**/vendor-pdf*', '**/vendor-capture*', '**/vendor-excel*', '**/vendor-charts*', '**/vendor-ocr*', '**/imageExport*'],
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
          {
            // motor y modelos de OCR (tesseract.js) — se descargan una vez y
            // quedan cacheados para usarse sin conexión después
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/(tesseract\.js|tesseract\.js-core|@tesseract\.js-data)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-ocr',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
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
