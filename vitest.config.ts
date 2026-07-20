import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // quickhull3d uses a deep self-import that vitest's default externalized
    // resolution can't follow; inline it so it's transformed like in Vite.
    server: {
      deps: {
        inline: ['quickhull3d'],
      },
    },
  },
})
