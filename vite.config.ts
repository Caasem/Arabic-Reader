import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Precache scope decision (see claude/roadmap-next-features.md item 7):
// the small AraMorph dictionary files (~3.8MB total) are worth guaranteeing
// offline via the service-worker precache — that's the "dictionary included"
// part of an offline install. The 65MB Vocabulary Levels frequency-rarity
// file is deliberately NOT precached (would roughly 17x the install size for
// a feature that's off by default) — it's covered by a runtime CacheFirst
// rule instead, so once a user has enabled Vocabulary Levels once (which
// already requires fetching that file), it's cached indefinitely and reused
// offline from then on, without being forced on everyone up front.
const DICTIONARY_DATA_FILES = [
  'dictprefixes',
  'dictstems',
  'dictsuffixes',
  'tableab',
  'tableac',
  'tablebc',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Arabic Reader',
        short_name: 'Arabic Reader',
        description: 'An Arabic-language ebook reader with built-in dictionary lookup and vocabulary tracking.',
        start_url: '/',
        display: 'standalone',
        background_color: '#faf7f2',
        theme_color: '#9c7a4f',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Default globPatterns only match common web-asset extensions —
        // the AraMorph data files have no extension at all, so they're
        // listed explicitly here rather than relying on a glob to catch
        // them (a silent scope miss on offline dictionary data would be a
        // worse failure mode than being explicit).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        additionalManifestEntries: DICTIONARY_DATA_FILES.map((name) => ({
          url: `/dictionary-data/${name}`,
          revision: null,
        })),
        runtimeCaching: [
          {
            // The frequency-rarity data — cached on first fetch (i.e. the
            // first time a user enables Vocabulary Levels), then served
            // from cache on every request after that, offline included.
            urlPattern: /\/frequency-data\/.*\.gzbin$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'frequency-data-cache',
              expiration: { maxEntries: 1 },
            },
          },
        ],
        // The bundled JS is already ~700KB; raise Workbox's default 2MB
        // precache-file-size ceiling isn't needed here, but the combined
        // precache list (app shell + dictionary data) is a bit larger
        // than default apps, so this just documents that it's intentional
        // rather than an oversight if the number looks big in devtools.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
