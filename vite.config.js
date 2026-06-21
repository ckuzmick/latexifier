import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend dev server proxies the API to the Express backend so the whole
// app is reachable from a single origin (http://localhost:5173).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3019',
    },
  },
})
