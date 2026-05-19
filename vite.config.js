import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Avoid stale index / modules when switching branches or ports (esp. if 5173 is reused).
    headers: { 'Cache-Control': 'no-store, max-age=0' },
    port: 5173,
    strictPort: false,
  },
})
