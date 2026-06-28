import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix), not just VITE_*. This runs in NODE, on the
  // dev server — so we can read the dashboard's App Secret here and NEVER ship it
  // to the browser. Vite only inlines VITE_-prefixed vars into the client bundle;
  // DASH_APP_* stay server-side. loadEnv merges client/.env (host) with
  // process.env (Docker compose `environment:`), so the same config works in both.
  const env = loadEnv(mode, process.cwd(), '');

  // In Docker the API is http://api:4000 (compose service name); on the host it's
  // http://localhost:4000. Polling is only needed inside Docker on Windows.
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:4000";
  const usePolling = !!env.VITE_USE_POLLING;

  // Phase 7: the API now requires auth on /v1. The proxy attaches the dashboard
  // service's credentials so the browser stays dumb (no key in client code).
  const appKey = env.DASH_APP_KEY || "nfy_key_dashboard";
  const appSecret = env.DASH_APP_SECRET || "nfy_secret_dashboard_dev";

  return {
    plugins: [react()],
    server: {
      host: true, // listen on 0.0.0.0 so the container port is reachable
      proxy: {
        "/v1": {
          target: proxyTarget,
          changeOrigin: true,
          configure: (proxy) => {
            // Runs in Node, per proxied request. Stamp the auth headers on the
            // way out — the browser never sees or sends them.
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("x-app-key", appKey);
              proxyReq.setHeader("x-app-secret", appSecret);
            });
          },
        },
      },
      watch: usePolling ? { usePolling: true } : undefined,
    },
  }
})
