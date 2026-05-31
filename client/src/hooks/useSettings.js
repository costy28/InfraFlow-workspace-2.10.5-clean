import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'

const SettingsContext = createContext({
  settings: {},
  modules: null,
  loading: true,
  reloadSettings: async () => {},
})

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)

  async function reloadSettings() {
    setLoading(true)
    try {
      const response = await api.get('/settings')
      setSettings(response.data.settings || {})
    } catch {
      setSettings({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => reloadSettings())
    window.addEventListener('infraflow-settings-updated', reloadSettings)
    return () => window.removeEventListener('infraflow-settings-updated', reloadSettings)
  }, [])

  const modules = useMemo(() => {
    const enabled = settings.modules_enabled
    return Array.isArray(enabled) && enabled.length > 0 ? enabled : null
  }, [settings.modules_enabled])

  return (
    <SettingsContext.Provider value={{ settings, modules, loading, reloadSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
