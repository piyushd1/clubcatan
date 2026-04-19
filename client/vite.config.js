import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons/favicon.ico'],
      manifest: {
        name: 'ClubCatan',
        short_name: 'ClubCatan',
        description: 'A mobile-first Catan for friends',
        theme_color: '#154212',
        background_color: '#fafaf3',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src: '/icons/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png,ico}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/[^/]*\.partykit\.dev\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  server: {
    port: 5173,
    host: true,
  },
})
