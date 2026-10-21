import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Două aplicații într-un singur build: POS-ul (instalabil, merge offline) și panoul de administrare.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'POS Cafenea',
        short_name: 'POS',
        description: 'Vânzare la tejghea, funcționează și fără internet',
        start_url: '/pos.html',
        scope: '/',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#f6f3ee',
        theme_color: '#3b2a20',
        lang: 'ro',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: null,
        // API-ul nu se pune niciodată în cache: datele offline stau în IndexedDB.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        pos: resolve(__dirname, 'pos.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: Number(process.env.PORT_WEB ?? 5173),
    proxy: { '/api': { target: `http://localhost:${process.env.PORT_API ?? 3000}`, changeOrigin: false } },
  },
});
