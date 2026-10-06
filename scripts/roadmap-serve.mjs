// Serves docs/ locally so the roadmap site (docs/roadmap/index.html) can read roadmap.json.
// Usage: npm run roadmap  ->  http://localhost:4177
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../docs', import.meta.url)))
const port = Number(process.env.PORT) || 4177
const types = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path === '/') { res.writeHead(302, { Location: '/roadmap/' }); return res.end() }
  if (path.endsWith('/')) path += 'index.html'
  const file = normalize(join(root, path))
  if (!file.startsWith(root)) { res.writeHead(403); return res.end() }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('Not found')
  }
}).listen(port, '127.0.0.1', () => console.log(`Roadmap: http://localhost:${port}`))
