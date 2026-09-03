// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // SSR error wrapper entry point
    server: { entry: "server" },
  },
  // Nitro preset: "vercel" emits to .vercel/output — Vercel detects this automatically.
  // On Lovable's own build infra, LOVABLE_NITRO_PRESET overrides this, so it is safe to commit.
  nitro: {
    preset: "vercel",
  },
});
