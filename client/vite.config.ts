import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the Express server so the dashboard can use
    // same-origin relative URLs like fetch("/v1/notifications").
    proxy: { "/v1": "http://localhost:4000" },
  },
})
