import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The UI talks to two backends. Both are proxied through the dev server rather than called
 * cross-origin, so the browser sees a single origin and no preflight is involved during development:
 *
 *   /api        -> query-service     (read side, mounted under /api/v1 on the backend itself)
 *   /ingest     -> ingestion-service (write side, used by the publish form; backend has no prefix,
 *                                     so the /ingest segment is stripped before forwarding)
 *   /prom       -> Prometheus, read-only. The service telemetry the Overview screen shows (request
 *                  rate, latency percentile, JVM and Kafka publish timings) is scraped there and
 *                  cannot be derived from the REST APIs, so the console queries it directly.
 *   /qactuator  -> query-service's Actuator health endpoint. query-service mounts its REST API at
 *                  /api/v1 but Actuator sits at the server root, outside that prefix, so it is not
 *                  reachable through the /api proxy above — this gives the Overview screen's service
 *                  health matrix a real status instead of a hardcoded one. ingestion-service needs no
 *                  such route: /ingest/actuator/health already reaches it through the rewrite above.
 *
 * The same paths are proxied by nginx in the container image, so the client code is identical in
 * both modes.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.PULSESTREAM_QUERY_URL ?? 'http://localhost:8083',
        changeOrigin: true,
      },
      '/ingest': {
        target: process.env.PULSESTREAM_INGESTION_URL ?? 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
      },
      '/qactuator': {
        target: process.env.PULSESTREAM_QUERY_URL ?? 'http://localhost:8083',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qactuator/, '/actuator'),
      },
      '/prom': {
        target: process.env.PULSESTREAM_PROMETHEUS_URL ?? 'http://localhost:9090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/prom/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Recharts and React are the bulk of the bundle and change far less often than the app
        // code, so they get their own long-lived chunk.
        manualChunks: {
          vendor: ['react', 'react-dom', 'recharts'],
        },
      },
    },
  },
});
