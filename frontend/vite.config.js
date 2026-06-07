import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5417,
    proxy: {
      '/api': {
        target: 'http://localhost:8417',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8417',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
