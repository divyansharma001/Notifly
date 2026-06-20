import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// In Docker the API is reachable at http://api:4000 (the compose service name);
// on the host it's http://localhost:4000. Driven by env so the same config works
// in both. Polling is enabled only in Docker, where native file events don't
// cross the Windows<->container boundary reliably.
const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:4000";
const usePolling = !!process.env.VITE_USE_POLLING;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so the container port is reachable
    proxy: { "/v1": proxyTarget },
    watch: usePolling ? { usePolling: true } : undefined,
  },
})
