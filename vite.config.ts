// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
export default defineConfig({
  // Railway, no Cloudflare. El bundle SSR que produce Vite ya exporta un handler
  // { fetch } estándar de la Web; el plugin de Cloudflare solo aportaba el
  // adaptador que lo ejecuta. Ese papel lo hace ahora server/index.js sobre Node.
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      allowedHosts: ["puppet-wincing-frenzied.ngrok-free.dev"],
      proxy: {
        "/garmin": { target: "http://localhost:8503", changeOrigin: true },
        "/plan": { target: "http://localhost:8503", changeOrigin: true },
        "/insights": { target: "http://localhost:8503", changeOrigin: true },
        "/update": { target: "http://localhost:8503", changeOrigin: true },
        "/diagnose": { target: "http://localhost:8503", changeOrigin: true },
        "/diagnosis": { target: "http://localhost:8503", changeOrigin: true },
        "/gym": { target: "http://localhost:8503", changeOrigin: true },
      },
    },
  },
});
