import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Entry points are spelled out (instead of relying on auto-detection) so builds work
// no matter which folder the command is started from.
const root = __dirname
const shared = { '@shared': resolve(root, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: { outDir: resolve(root, 'out/main'), rollupOptions: { input: { index: resolve(root, 'src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: { outDir: resolve(root, 'out/preload'), rollupOptions: { input: { index: resolve(root, 'src/preload/index.ts') } } }
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    resolve: { alias: shared },
    plugins: [react()],
    build: { outDir: resolve(root, 'out/renderer'), rollupOptions: { input: { index: resolve(root, 'src/renderer/index.html') } } }
  }
})
