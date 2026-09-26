import { createServer, request as requestUpstream } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

const publicPort = Number(process.env.PORT ?? 3100)
const upstreamPort = publicPort + 1
const serviceWorkerPath = resolve('.output/public/sw.js')
const upstream = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(upstreamPort) },
  stdio: ['ignore', 'inherit', 'inherit'],
})

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname
  if (pathname === '/sw.js') {
    try {
      const serviceWorker = await readFile(serviceWorkerPath)
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': serviceWorker.byteLength,
        'content-type': 'text/javascript; charset=utf-8',
        'service-worker-allowed': '/',
      })
      response.end(serviceWorker)
    } catch {
      response.writeHead(500).end('Unable to read the generated service worker.')
    }
    return
  }

  const proxy = requestUpstream({
    hostname: '127.0.0.1',
    port: upstreamPort,
    path: request.url,
    method: request.method,
    headers: request.headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })
  proxy.on('error', () => response.writeHead(502).end('Nuxt test server is not ready.'))
  request.pipe(proxy)
})

server.listen(publicPort, '127.0.0.1')

function shutdown() {
  server.close()
  upstream.kill('SIGTERM')
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
upstream.on('exit', code => {
  if (code && code !== 0) process.exitCode = code
  server.close()
})
