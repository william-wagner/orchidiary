import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "jornada.webp", "jornada-ciclo.webp"],
      manifest: {
        name: "Orchidiary",
        short_name: "Orchidiary",
        description: "Herbário pessoal: guia de cultivo e diário das suas orquídeas",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        background_color: "#F7F5EC",
        theme_color: "#F7F5EC",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // a animação da página inicial tem ~2,7 MB; o padrão do Workbox (2 MB) a deixaria fora do cache
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // A API nunca é cacheada pelo service worker
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    // Acessível pelo celular na rede/Tailscale; a API roda na 8787
    host: true,
    allowedHosts: [".ts.net", "localhost"],
    proxy: { "/api": "http://localhost:8787" },
  },
});
