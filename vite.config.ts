import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Precache scope decision (see claude/roadmap-next-features.md item 7): the
// small AraMorph dictionary files (~3.8MB total) are worth guaranteeing
// offline via the service-worker precache — that's the "dictionary
// included" part of an offline install.
const DICTIONARY_DATA_FILES = [
  'dictprefixes',
  'dictstems',
  'dictsuffixes',
  'tableab',
  'tableac',
  'tablebc',
]

// Embeds the six AraMorph data files directly into the JS bundle at build
// time, as a virtual module, instead of the app having to `fetch()` them
// from public/dictionary-data/ at runtime. That fetch turned out to be
// unreliable on at least one real Android/Capacitor WebView -- it would
// silently resolve with only a tiny fragment of each file's real content
// (see the "no definition found on Android" investigation), while the
// exact same files read via the browser's File API (Settings' manual
// upload) always came through intact. Embedding sidesteps whatever
// WebView/asset-serving quirk caused that, on every platform, by turning
// the six fetches into plain synchronous string constants baked into the
// bundle -- there's no network/asset layer left in the loop to get it
// wrong. `public/dictionary-data/` remains the single source of truth
// (this plugin just reads it at build time) and is also still served
// as-is for the PWA's offline service-worker precache and as a
// GPL-required plain-text copy of the data.
function bundledDictDataPlugin(): Plugin {
  return virtualTextFilePlugin('virtual:dictionary-data', (readText) => {
    const entries = DICTIONARY_DATA_FILES.map((name) => {
      const content = readText(path.join('public/dictionary-data', name))
      return `${JSON.stringify(name)}: ${JSON.stringify(content)}`
    })
    return `export default {\n${entries.join(',\n')}\n};\n`
  })
}

// Same embedding approach as the dictionary above, for the ~5,300-entry
// personal vocabulary-frequency list that replaced the old CAMeL dataset
// (see that migration's notes) -- at ~270KB this needs none of the
// dictionary's worker/streaming machinery, just a plain string constant.
function bundledVocabListPlugin(): Plugin {
  return virtualTextFilePlugin('virtual:vocab-list-data', (readText) => {
    const content = readText('public/vocab-list-data/the-list.tsv')
    return `export default ${JSON.stringify(content)};\n`
  })
}

// Same embedding approach again, for the optional Al-Muʿjam al-Wasīṭ
// dictionary (see public/alwasit-data/SOURCE-README.md for provenance and
// licensing notes). At ~7.8MB this is by far the largest of the three
// bundled datasets, and the feature defaults to off in Settings --
// AlWasitDictionaryProvider imports this virtual module with a dynamic
// `import()` on first lookup rather than a static top-level import, so
// Rollup code-splits it into its own chunk that users who never enable the
// feature never fetch.
function bundledAlWasitDataPlugin(): Plugin {
  return virtualTextFilePlugin('virtual:alwasit-data', (readText) => {
    const content = readText('public/alwasit-data/alwasit.tsv')
    return `export default ${JSON.stringify(content)};\n`
  })
}

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

// https://vite.dev/config/
export default defineConfig({
  // Worker entries (aramorph.worker.ts, which imports the virtual module
  // above) are bundled by Vite in a separate build pass that does not
  // inherit the top-level `plugins` list -- it needs the virtual-module
  // plugin registered here too, or resolving `virtual:dictionary-data` from
  // inside the worker fails at build time.
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
        // The optional Al-Wasit dictionary chunk (~7.8MB) is deliberately
        // excluded from the precache list -- it defaults to off, and the
        // whole point of loading it via dynamic import() is that a user who
        // never enables the feature never downloads it. Precaching it on
        // every install would silently defeat that and blow past Workbox's
        // default 2MB per-file limit besides.
        globIgnores: ['**/_virtual_alwasit-data-*.js'],
        additionalManifestEntries: DICTIONARY_DATA_FILES.map((name) => ({
          url: `/dictionary-data/${name}`,
          revision: null,
        })),
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
