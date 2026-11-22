import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "DawaShield — दवा कवच",
        short_name: "DawaShield",
        description: "Check your family's medicines against official CDSCO quality alerts, even offline.",
        theme_color: "#1E1B4B",
        background_color: "#FAFAFC",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "hi",
        orientation: "portrait",
        categories: ["health", "medical", "utilities"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        // App shell, dataset and every Hindi / English voice clip are cached for offline use.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,mp3,json}"],
        // Web push from Firebase Cloud Messaging is shown by this small handler.
        importScripts: ["/push-sw.js"],
        // Regional languages are online-only: their translations and voice clips are
        // fetched when used and never added to the offline download.
        globIgnores: ["og.png", "**/screenshots/**", "i18n/**", "audio/pa/**", "audio/gu/**", "audio/mr/**", "audio/kn/**", "audio/ta/**"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
