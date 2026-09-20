import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    // Los specs de e2e/ corren con Playwright (npm run e2e), no con Vitest —
    // si Vitest los recoge, falla porque test() de Playwright no funciona aquí.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cobertura obligatoria solo sobre lo que mueve dinero de verdad — el
      // store, backups/migraciones y calculos financieros puros. El resto
      // (pantallas, settings, etc.) no bloquea el build por falta de tests
      // de UI, pero estos tres si, porque un bug ahi ya causo corrupcion de
      // datos en produccion (ver "Completado" en ROADMAP.md).
      include: [
        'src/store/finance.ts',
        'src/data/backup.ts',
        'src/data/dataHealth.ts',
        'src/data/helpers.ts',
        'src/data/currencies.ts',
        'src/data/recovery.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
