import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    // Permitir el proxy de DevSpaces
    allowedHosts: ['.proxy.devspaces.amazon.dev'],
  },
})
