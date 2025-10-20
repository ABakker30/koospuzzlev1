import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
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
})
