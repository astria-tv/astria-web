import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/olaris/app/',
  plugins: [react()],
  server: {
    proxy: {
      '/olaris/m': 'http://localhost:8080',
      '/olaris/s': 'http://localhost:8080'
    },
  },
})
