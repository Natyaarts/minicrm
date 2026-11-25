import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      injectRegister: false,
      manifest: {
        name: 'Natya ERP',
        short_name: 'Natya',
        theme_color: '#0284c7',
        background_color: '#f8fafc',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        navigateFallback: '/index.html',
        // Never serve the SPA shell for backend routes; API/admin/media always go to the network.
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//, /^\/media\//],
        cleanupOutdatedCaches: true,
        // Main bundle is ~2.2 MB (above Workbox's 2 MiB default), so allow up to 3 MiB.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
})
