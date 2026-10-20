import * as http from 'node:http'
import * as os from 'node:os'

import { createFetchProxy } from 'remix/fetch-proxy'
import { createHmrReadyFetch, run } from 'remix/node-hmr'
import { createRequestListener } from 'remix/node-fetch-server'

const host = process.env.HOST ?? '127.0.0.1'
const hmrProxyPort = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 44100
const hmrEventPort = process.env.HMR_PORT
  ? Number.parseInt(process.env.HMR_PORT, 10)
  : hmrProxyPort + 1
const appPort = process.env.APP_PORT ? Number.parseInt(process.env.APP_PORT, 10) : hmrEventPort + 1
const hmrEventPathname = '/hmr'

const hmrRunner = run('server.ts', {
  env: {
    ...process.env,
    PORT: String(appPort),
    HMR_PROXY_PORT: String(hmrProxyPort),
  },
  nodeArgs: ['--inspect=127.0.0.1:9229', '--import', 'remix/node-tsx', '--import', 'remix/component-hmr/node'],
  browserHmrChannel: { port: hmrEventPort, pathname: hmrEventPathname },
})

const appFetch = createHmrReadyFetch(
  hmrRunner,
  createFetchProxy(`http://127.0.0.1:${appPort}`, {
    xForwardedHeaders: true,
  }),
)
const hmrEventFetch = createFetchProxy(`http://127.0.0.1:${hmrEventPort}`)

const server = http.createServer(
  createRequestListener((request) =>
    new URL(request.url).pathname === hmrEventPathname
      ? hmrEventFetch(request)
      : appFetch(request),
  ),
)

server.listen(hmrProxyPort, host, () => {
  if (host === '0.0.0.0') {
    for (let address of getLanAddresses()) {
      console.log(`On your network: http://${address}:${hmrProxyPort}`)
    }
  }
})

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface?.family === 'IPv4' && !iface.internal)
    .map((iface) => iface!.address)
}

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close(() => hmrRunner.close().finally(() => process.exit(0)))
  server.closeAllConnections()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
