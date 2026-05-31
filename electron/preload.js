'use strict'

/**
 * InfraFlow ERP — Electron preload script
 * Expune API-ul sigur din main process către renderer (contextIsolation = true)
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Salvează configurația serverului.
   * @param {object} config - { server_url, ... }
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  /**
   * Returnează configurația curentă sau null dacă nu există.
   * @returns {Promise<object|null>}
   */
  getConfig: () => ipcRenderer.invoke('get-config'),

  /**
   * Resetează configurația și revine la ecranul de setup.
   */
  resetConfig: () => ipcRenderer.invoke('reset-config'),

  /**
   * Încearcă din nou conexiunea la server (de pe ecranul offline).
   */
  retryConnection: () => ipcRenderer.invoke('retry-connection'),

  /**
   * Deschide un URL în browser-ul extern implicit.
   * @param {string} url
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
})
