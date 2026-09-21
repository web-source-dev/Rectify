import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 9016,
    host: true,
  },
  preview: {
    port: 9016,
    host: true,
  },
})
