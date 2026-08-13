import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.UMODEL_API_TARGET || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
            return 'vendor-monaco'
          }
          if (id.includes('@xyflow')) {
            return 'vendor-flow'
          }
          if (id.includes('@cosmos.gl')) {
            return 'vendor-cosmos'
          }
          if (id.includes('@hpcc-js')) {
            return 'vendor-graphviz'
          }
          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }
          if (id.includes('react') || id.includes('react-dom')) {
            return 'vendor-react'
          }
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/healthz': apiTarget,
    },
  },
})
