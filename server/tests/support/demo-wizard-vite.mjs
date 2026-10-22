import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
if (process.env.NODE_ENV !== 'test' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.SYNTHETIC_API_ORIGIN || '')) throw Error('synthetic_test_only')
const root = path.resolve(import.meta.dirname, '../../..')
const { createServer } = await import(pathToFileURL(path.join(root, 'client/node_modules/vite/dist/node/index.js')))
const require = createRequire(path.join(root, 'client/package.json'))
const tailwindConfig = (await import(pathToFileURL(path.join(root, 'client/tailwind.config.js')))).default
const target = process.env.SYNTHETIC_API_ORIGIN
const server = await createServer({ root: path.join(root, 'client'), configFile: path.join(root, 'client/vite.config.js'),
  css: { postcss: { plugins: [require('tailwindcss')({ ...tailwindConfig, content: [...tailwindConfig.content, './synthetic/**/*.{js,jsx}'] }), require('autoprefixer')()] } },
  server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': target, '/icons': target, '/storage': target } } })
await server.listen()
process.send({ port: server.httpServer.address().port })
process.on('message', async message => { if (message === 'stop') { await server.close(); process.exit(0) } })
