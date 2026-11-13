import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const here = dirname(fileURLToPath(import.meta.url))

config({ path: resolve(here, '..', '.env') })

export default defineConfig({
  plugins: [svelte()],
  cacheDir: resolve(here, '.vite'),
  envDir: resolve(here, '..'),
  resolve: {
    alias: {
      '$lib': resolve(here, 'src/lib'),
      '$components': resolve(here, 'src/components'),
      '$character-sheet': resolve(here, 'src/components/character_sheet'),
      '$dialogs': resolve(here, 'src/components/dialogs'),
      '$chat': resolve(here, 'src/components/chat'),
      '$pages': resolve(here, 'src/pages')
    }
  },
  server: {
    port: 5173 + Number(process.env.SERVER_PORT ?? '4290') - 4290,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.SERVER_PORT ?? '4290'}`,
        changeOrigin: false
      }
    },
    cors: false
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'yjs', 'mermaid']
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      external: []
    }
  }
})
