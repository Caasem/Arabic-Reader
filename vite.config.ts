import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { DICT_FILE_ORDER, fingerprintDictTexts, type DictTexts } from './src/dictionary/providers/aramorph/fingerprint.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// package.json's version, exposed to the app as __APP_VERSION__
// (declared in src/types/virtual-modules.d.ts).
const appVersion = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version as string

function virtualTextFilePlugin(virtualModuleId: string, build: (readText: (relPath: string) => string) => string): Plugin {
  const resolvedVirtualModuleId = '\0' + virtualModuleId
  const readText = (relPath: string) => fs.readFileSync(path.join(__dirname, relPath), 'utf8')
  return {
    name: 'virtual-text-file:' + virtualModuleId,
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return
      return build(readText)
    },
  }
}

/**
 * The six AraMorph data files, embedded in the dictionary worker's bundle
 * instead of fetched at runtime: on at least one Android WebView that fetch
 * silently returned truncated files. public/dictionary-data/ remains the
 * source of truth (and the GPL plain-text copy). The build-time fingerprint
 * lets the worker reuse its cached parse without hashing ~4MB of text on
 * every launch.
 */
function bundledDictDataPlugin(): Plugin {
  return virtualTextFilePlugin('virtual:dictionary-data', (readText) => {
    const texts = Object.fromEntries(
      DICT_FILE_ORDER.map((name) => [name, readText(`public/dictionary-data/${name}`)])
    ) as DictTexts
    return `export default ${JSON.stringify(texts)};\nexport const fingerprint = ${JSON.stringify(fingerprintDictTexts(texts))};\n`
  })
}

/** The KSUCCA-derived vocabulary frequency list (see
 * public/vocab-list-data/SOURCE-README.md). Loaded with a dynamic import(),
 * so it becomes its own chunk that only Vocabulary Levels users download. */
function bundledVocabListPlugin(): Plugin {
  return virtualTextFilePlugin('virtual:vocab-list-data', (readText) => {
    return `export default ${JSON.stringify(readText('public/vocab-list-data/the-list.tsv'))};\n`
  })
}

/** The optional Al-Muʿjam al-Wasīṭ dictionary (see
 * public/alwasit-data/SOURCE-README.md), off by default and likewise split
 * into its own chunk via dynamic import(). */
function bundledAlWasitDataPlugin(): Plugin {
  return virtualTextFilePlugin('virtual:alwasit-data', (readText) => {
    return `export default ${JSON.stringify(readText('public/alwasit-data/alwasit.tsv'))};\n`
  })
}

// https://vite.dev/config/
export default defineConfig({
  // Relative: the app is also served from a GitHub Pages project subpath,
  // where an absolute '/' base would 404 every asset.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  // Worker bundles are built in a separate pass that doesn't inherit `plugins`.
  worker: {
    plugins: () => [bundledDictDataPlugin()],
  },
  plugins: [
    react(),
    bundledDictDataPlugin(),
    bundledVocabListPlugin(),
    bundledAlWasitDataPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Arabic Reader',
        short_name: 'Arabic Reader',
        description: 'An Arabic-language ebook reader with built-in dictionary lookup and vocabulary tracking.',
        // Relative, like `base`, so an installed Pages PWA opens /<repo>/.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#faf7f2',
        theme_color: '#9c7a4f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell, all view chunks, and the dictionary worker (which
        // carries the dictionary data) are precached for offline use.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The optional datasets aren't precached -- most users never enable
        // them -- but are cached on first use so an enabled feature keeps
        // working offline.
        globIgnores: ['**/_virtual_alwasit-data-*.js', '**/_virtual_vocab-list-data-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/_virtual_(?:alwasit|vocab-list)-data-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'optional-datasets', expiration: { maxEntries: 4 } },
          },
        ],
        // The dictionary worker chunk (~4MB with its data) exceeds Workbox's 2MB default.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
