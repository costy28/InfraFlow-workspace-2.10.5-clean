'use strict'

/**
 * InfraFlow ERP — Electron main process
 *
 * Arhitectură:
 *   - Încarcă config din %APPDATA%\InfraFlow\config.json
 *   - Dacă nu există config → afișează ecran de configurare (setup.html)
 *   - Dacă există config → verifică serverul, încarcă URL-ul serverului
 *   - La eșec conexiune → afișează ecran offline (offline.html)
 *
 * IPC channels:
 *   'save-config'  → salvează config și validează conexiunea la server
 *   'get-config'   → returnează config curentă
 *   'reset-config' → șterge config și relansează
 *   'open-external'→ deschide URL în browser extern
 */

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require('electron')
const path   = require('path')
const fs     = require('fs')
const https  = require('https')
const http   = require('http')

// ─────────────────────────────────────────────────
// Constante
// ─────────────────────────────────────────────────
const CONFIG_PATH  = path.join(app.getPath('appData'), 'InfraFlow', 'config.json')
const ICON_PATH    = path.join(__dirname, 'infraflow-client.ico')
const CHECK_TIMEOUT_MS = 6000

let mainWindow = null
let tray       = null
let retryTimer = null

// ─────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveConfig(config) {
  const dir = path.dirname(CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

function deleteConfig() {
  try { fs.unlinkSync(CONFIG_PATH) } catch {}
}

// ─────────────────────────────────────────────────
// Check server availability (fără fetch — Node http/https)
// ─────────────────────────────────────────────────
function checkServer(serverUrl) {
  return new Promise((resolve) => {
    try {
      const url    = new URL(`${serverUrl}/api/v1/health`)
      const client = url.protocol === 'https:' ? https : http

      const req = client.get({
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        timeout:  CHECK_TIMEOUT_MS,
        headers:  { 'User-Agent': 'InfraFlow-Client/2.10.0' }
      }, (res) => {
        // Orice răspuns HTTP = server funcțional
        res.resume()
        resolve({ ok: true, status: res.statusCode })
      })

      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }) })
      req.on('error', (e)  => resolve({ ok: false, error: e.message }))
    } catch (e) {
      resolve({ ok: false, error: e.message })
    }
  })
}

// ─────────────────────────────────────────────────
// Creare fereastră principală
// ─────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1440,
    height:    900,
    minWidth:  1024,
    minHeight: 700,
    icon:      fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    title:     'InfraFlow ERP',
    backgroundColor: '#1e3a5f',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js'),
      // Permite încărcarea http:// din rețea locală
      webSecurity:      false,
    },
    show: false,
  })

  // Elimină meniu implicit în producție
  if (app.isPackaged) {
    Menu.setApplicationMenu(null)
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.on('closed', () => {
    mainWindow = null
    if (retryTimer) clearTimeout(retryTimer)
  })

  loadApp()
}

// ─────────────────────────────────────────────────
// Logic principal de încărcare
// ─────────────────────────────────────────────────
async function loadApp() {
  if (!mainWindow) return

  const config = loadConfig()

  // Fără config → ecran configurare
  if (!config?.server_url) {
    mainWindow.loadFile(path.join(__dirname, 'setup.html'))
    return
  }

  const serverUrl = config.server_url.replace(/\/$/, '')
  mainWindow.setTitle(`InfraFlow ERP — ${serverUrl}`)

  // Ecran loading
  mainWindow.loadFile(path.join(__dirname, 'loading.html'))

  // Verifică serverul
  const check = await checkServer(serverUrl)

  if (!mainWindow) return

  if (check.ok) {
    mainWindow.loadURL(serverUrl)
    updateTray(true, serverUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, 'offline.html'))
    updateTray(false, serverUrl)

    // Retry automat la 15 secunde
    retryTimer = setTimeout(() => {
      if (mainWindow) loadApp()
    }, 15000)
  }
}

// ─────────────────────────────────────────────────
// System Tray
// ─────────────────────────────────────────────────
function createTray() {
  if (!fs.existsSync(ICON_PATH)) return

  try {
    tray = new Tray(ICON_PATH)
    tray.setToolTip('InfraFlow ERP Client')
    updateTray(false, '')

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch {
    // Tray opțional, nu blocăm dacă eșuează
  }
}

function updateTray(connected, serverUrl) {
  if (!tray) return
  const status = connected ? '🟢 Conectat' : '🔴 Deconectat'
  const url    = serverUrl ? `\n${serverUrl}` : ''
  tray.setToolTip(`InfraFlow ERP Client\n${status}${url}`)

  const contextMenu = Menu.buildFromTemplate([
    { label: `InfraFlow ERP — ${connected ? 'Conectat ✅' : 'Deconectat ❌'}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Deschide fereastra', click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus() }
        else createWindow()
      }
    },
    {
      label: 'Reîncarcă', click: () => {
        if (retryTimer) clearTimeout(retryTimer)
        if (mainWindow) loadApp()
      }
    },
    { type: 'separator' },
    {
      label: 'Schimbă serverul', click: () => {
        deleteConfig()
        if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'setup.html'))
      }
    },
    { type: 'separator' },
    { label: 'Ieșire', click: () => app.quit() }
  ])
  tray.setContextMenu(contextMenu)
}

// ─────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────

// Salvare config + validare server
ipcMain.handle('save-config', async (_event, config) => {
  if (!config?.server_url) {
    return { ok: false, error: 'Adresa serverului este obligatorie.' }
  }

  const serverUrl = config.server_url.trim().replace(/\/$/, '')

  // Validare URL
  try { new URL(serverUrl) } catch {
    return { ok: false, error: 'URL invalid. Exemplu: http://192.168.100.27:4180' }
  }

  // Test conexiune
  const check = await checkServer(serverUrl)
  if (!check.ok) {
    return {
      ok: false,
      error: `Nu mă pot conecta la ${serverUrl}.\n` +
             `Verifică că serverul InfraFlow este pornit și adresa este corectă.`
    }
  }

  // Salvează și reîncarcă
  saveConfig({ ...config, server_url: serverUrl, saved_at: new Date().toISOString() })
  setTimeout(() => loadApp(), 500)
  return { ok: true }
})

// Citire config curentă
ipcMain.handle('get-config', () => loadConfig())

// Reset config + reîncărcare la setup
ipcMain.handle('reset-config', () => {
  deleteConfig()
  if (mainWindow) {
    mainWindow.loadFile(path.join(__dirname, 'setup.html'))
  }
})

// Retry manual (de pe offline.html)
ipcMain.handle('retry-connection', () => {
  if (retryTimer) clearTimeout(retryTimer)
  if (mainWindow) loadApp()
})

// Deschide URL în browser extern
ipcMain.handle('open-external', (_event, url) => {
  shell.openExternal(url)
})

// ─────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────
app.whenReady().then(() => {
  createTray()
  createWindow()
})

app.on('window-all-closed', () => {
  // Pe Windows/Linux → ieșire la închiderea ferestrei
  // (tray-ul permite redeschiderea)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // macOS — redeschide fereastra la click pe dock icon
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  if (retryTimer) clearTimeout(retryTimer)
})
