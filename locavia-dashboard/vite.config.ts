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
            if (req.method === 'GET' && req.url === '/api/login') {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ authenticated: true, configured: false }))
              return
            }
            if (req.method === 'GET' && req.url === '/api/data') {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ items: localDataset, syncedAt: localMeta?.syncedAt ?? null }))
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
