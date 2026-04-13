import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/astria/app/',
  plugins: [react()],
  server: {
    proxy: {
      '/astria/m': 'http://localhost:8080',
      '/astria/s': 'http://localhost:8080'
    },
  },
})
