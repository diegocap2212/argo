import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL
  const localDataset = apiTarget ? null : JSON.parse(readFileSync(resolve(process.cwd(), 'src/data.json'), 'utf-8'))
  const localMeta = apiTarget ? null : JSON.parse(readFileSync(resolve(process.cwd(), 'src/data-meta.json'), 'utf-8'))
  return {
    plugins: [
      react(),
      {
        name: 'local-api-fallback',
        configureServer(server) {
          if (apiTarget) return
          server.middlewares.use((req, res, next) => {
            if (req.method === 'GET' && req.url === '/api/data') {
              res.setHeader('Content-Type', 'application/json')
              // Espelha o contrato do /api/data de produção (source/stale/count/hash), senão
              // o dev não exercita o aviso de dado congelado. Aqui é SEMPRE fallback: o dado
              // vem do src/data.json do disco, não do Blob. O `syncedAt` do data-meta.json é
              // o heartbeat do último sync e é exposto como tal, nunca como data destes itens.
              res.end(JSON.stringify({
                items: localDataset,
                syncedAt: null,
                source: 'fallback',
                stale: true,
                count: localDataset?.length ?? 0,
                hash: null,
                devHeartbeatAt: localMeta?.syncedAt ?? null,
              }))
              return
            }
            next()
          })
        },
      },
    ],
    server: {
      proxy: apiTarget ? {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      } : undefined,
    },
  }
})
