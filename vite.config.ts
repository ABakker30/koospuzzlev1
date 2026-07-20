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
        // Precache ONLY the small app shell (HTML/CSS/icons). We deliberately
        // do NOT precache the big hashed JS/wasm bundles: hashed assets are
        // immutable, so the browser's HTTP cache already serves them optimally
        // and a new deploy (new hash) is fetched fresh. Precaching them just
        // duplicated storage and — on machines with a small storage quota —
        // failed the SW install with QuotaExceededError, trapping users on a
        // stale bundle that could never update. Trade-off: no full offline app
        // (fine for an online, Supabase-backed app); gain: reliable updates and
        // no quota crashes. The 2 MB cap is a backstop so nothing large sneaks
        // back into the precache.
        globPatterns: ['**/*.{css,html,ico,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        // Delete the previous version's precache when a new SW activates, so
        // old entries don't pile up.
        cleanupOutdatedCaches: true,
        // NO runtime caching. We used to cache all Supabase responses
        // (NetworkFirst, maxEntries: 50), but cross-origin/opaque responses
        // (Storage images/thumbnails) get PADDED by Chrome to ~7-8MB each in
        // Cache storage — so 50 entries ballooned to ~400MB and blew the quota
        // on low-disk machines within seconds of loading. maxEntries caps count,
        // not padded size. An online, Supabase-backed app doesn't need SW
        // caching of API/Storage anyway — the browser HTTP cache handles GETs.
        runtimeCaching: []
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
