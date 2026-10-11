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

/** The optional classical dictionaries Al-Ṣiḥāḥ and Maqāyīs al-Lugha (see
 * public/alsihah-data and public/almaqayis-data), off by default and split
 * into their own chunks via dynamic import() like Al-Wasit. */
function bundledLexiconPlugin(id: string, file: string, optional = false): Plugin {
  return virtualTextFilePlugin(`virtual:${id}-data`, (readText) => {
    // An optional dataset kept out of git builds as an empty dictionary when absent.
    const text = optional && !fs.existsSync(path.join(__dirname, file)) ? '' : readText(file)
    return `export default ${JSON.stringify(text)};
`
  })
}

/**
 * pdf.js reads its own data at run time: the standard fonts (text with non-embedded fonts), the
 * ICC profiles and character maps, and the WebAssembly decoders for the JBIG2 and JPEG 2000
 * images that scanned books are made of. Without them a scanned book shows every page blank.
 * The files are served from <base>/pdfjs/<folder>/ (dev) and copied there by the build, so they
 * come with the app (offline, Electron, Capacitor) and nothing is fetched from a CDN; the page
 * side is pdfDataUrls() in src/pdf/pdfjs.ts.
 */
function pdfjsDataPlugin(): Plugin {
  const root = path.join(__dirname, 'node_modules', 'pdfjs-dist')
  const folders = ['standard_fonts', 'wasm', 'cmaps', 'iccs']
  const typeOf = (file: string) => (file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
  return {
    name: 'pdfjs-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/pdfjs\/(standard_fonts|wasm|cmaps|iccs)\/([\w.-]+)(?:\?.*)?$/.exec(req.url ?? '')
        const file = m && path.join(root, m[1], m[2])
        if (!file || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', typeOf(file))
        res.end(fs.readFileSync(file))
      })
    },
    generateBundle() {
      for (const folder of folders) {
        for (const name of fs.readdirSync(path.join(root, folder))) {
          if (name.startsWith('LICENSE')) continue
          this.emitFile({ type: 'asset', fileName: `pdfjs/${folder}/${name}`, source: fs.readFileSync(path.join(root, folder, name)) })
        }
      }
    },
  }
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
    pdfjsDataPlugin(),
    bundledDictDataPlugin(),
    bundledVocabListPlugin(),
    bundledAlWasitDataPlugin(),
    bundledLexiconPlugin('alsihah', 'public/alsihah-data/alsihah.tsv'),
    bundledLexiconPlugin('almaqayis', 'public/almaqayis-data/almaqayis.tsv'),
    // Optional Arabic-Russian dictionary (see baranov-data/SOURCE-README.md), off by default.
    bundledLexiconPlugin('baranov', 'baranov-data/russian.txt', true),
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
        // Lala.ttf is the default reading font (138 KB), so it is precached too.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,ttf}', 'pdfjs/{standard_fonts,wasm}/*'],
        // The optional datasets aren't precached -- most users never enable
        // them -- but are cached on first use so an enabled feature keeps
        // working offline.
        globIgnores: ['**/_virtual_alwasit-data-*.js', '**/_virtual_alsihah-data-*.js', '**/_virtual_almaqayis-data-*.js', '**/_virtual_baranov-data-*.js', '**/_virtual_vocab-list-data-*.js'],
        runtimeCaching: [
          {
            // pdf.js's character maps and ICC profiles (1.5 MB), needed only by unusual PDFs; cached once used.
            urlPattern: /\/pdfjs\/(?:cmaps|iccs)\//,
            handler: 'CacheFirst',
            options: { cacheName: 'pdfjs-data', expiration: { maxEntries: 400 } },
          },
          {
            // sql.js's WebAssembly, loaded only for an Anki package export; cached once used.
            urlPattern: /\/assets\/sql-wasm-[\w-]+\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'anki-export', expiration: { maxEntries: 2 } },
          },
          {
            // onnxruntime's WebAssembly (14 MB), loaded only by the offline reading engine of scanned PDF pages; cached once used.
            urlPattern: /\/assets\/ort-wasm-simd-threaded-[\w-]+\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-runtime', expiration: { maxEntries: 2 } },
          },
          {
            urlPattern: /\/assets\/_virtual_(?:alwasit|alsihah|almaqayis|baranov|vocab-list)-data-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'optional-datasets', expiration: { maxEntries: 7 } },
          },
        ],
        // The dictionary worker chunk (~4MB with its data) exceeds Workbox's 2MB default.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
