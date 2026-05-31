import { defineConfig, transformWithOxc } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Citește versiunea din version.json (sursă unică de adevăr)
let APP_VERSION = '2.10.1'
try {
  const versionFile = resolve(__dirname, '../version.json')
  APP_VERSION = JSON.parse(readFileSync(versionFile, 'utf8')).version
} catch {
  // fallback la server/package.json
  try {
    const pkgFile = resolve(__dirname, '../server/package.json')
    APP_VERSION = JSON.parse(readFileSync(pkgFile, 'utf8')).version
  } catch { /* rămâne fallback */ }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Injectează versiunea în bundle-ul React la build time
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    {
      name: 'infraflow-jsx-in-js',
      enforce: 'pre',
      async transform(code, id) {
        if (id.includes('/node_modules/') || id.includes('\\node_modules\\')) return null
        if (!id.includes('/client/src/') && !id.includes('\\client\\src\\')) return null
        if (!id.endsWith('.js')) return null
        return transformWithOxc(code, id, {
          lang: 'jsx',
        })
      },
    },
    react(),
  ],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4180',
      '/icons': 'http://localhost:4180',
      '/storage': 'http://localhost:4180',
    },
  },
})
