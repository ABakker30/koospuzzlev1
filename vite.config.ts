import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// Build stamp: baked into the bundle AND written to dist/version.json.
// swRecovery.ts compares the two at runtime to detect a wedged service
// worker (stuck on an old bundle) and self-heal.
const BUILD_TS = Date.now()

const versionStampPlugin = (): Plugin => ({
  name: 'version-stamp',
  closeBundle() {
    try {
      writeFileSync('dist/version.json', JSON.stringify({ ts: BUILD_TS }))
    } catch {
      /* dev builds have no dist */
    }
  },
})

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    __BUILD_TS__: JSON.stringify(BUILD_TS),
  },
  esbuild: {
    // Strip debug logging from production bundles; console.error is kept so
    // real failures remain visible in the field.
    pure: mode === 'production' ? ['console.log', 'console.info', 'console.debug', 'console.warn'] : [],
    drop: mode === 'production' ? ['debugger'] : [],
  },
  plugins: [
    react(),
    versionStampPlugin(),
    VitePWA({
      // autoUpdate: new deploys apply on next load (not a manual prompt), so
      // cold-opened deep links (e.g. shared /c/ challenge links) reliably get
      // the current bundle instead of a stale cached one.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB (default is 2 MB)
        // Delete the previous version's precache when a new SW activates, so
        // old bundles don't pile up and blow the storage quota (which traps
        // users on a stale bundle that can't update).
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      },
      manifest: {
        name: 'Koos Puzzle',
        short_name: 'Koos',
        description: 'Build, solve and share 3D puzzles',
        theme_color: '#667eea',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    port: 3000,
    host: true, // Expose to network for mobile access
    open: true,
    fs: {
      // Allow serving files from node_modules
      allow: ['..']
    }
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  worker: {
    format: 'es',
  },
  assetsInclude: ['**/*.wasm'],
}))
