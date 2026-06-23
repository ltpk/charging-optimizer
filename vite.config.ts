import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // React + MUI/emotion are stable across deploys; splitting them out lets repeat
        // visitors keep these cached while only the small app chunk re-downloads
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui'
        },
      },
    },
  },
})
