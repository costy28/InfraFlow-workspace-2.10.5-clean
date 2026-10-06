import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

const STORAGE_KEY = 'infraflow_workspace_tabs_v1'

function safeStoredTabs() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter(tab => tab && typeof tab.url === 'string' && typeof tab.label === 'string')
      : []
  } catch {
    return []
  }
}

export default function WorkspaceTabs({ location, label, onNavigate }) {
  const currentUrl = `${location.pathname}${location.search}${location.hash}`
  const [tabs, setTabs] = useState(safeStoredTabs)
  const [activeUrl, setActiveUrl] = useState(currentUrl)

  useEffect(() => {
    setTabs(current => {
      const existing = current.find(tab => tab.url === currentUrl)
      if (existing) {
        return current.map(tab => tab.url === currentUrl && tab.label !== label ? { ...tab, label } : tab)
      }
      return [...current, { url: currentUrl, label }]
    })
    setActiveUrl(currentUrl)
  }, [currentUrl, label])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs)) } catch {}
  }, [tabs])

  const visibleTabs = useMemo(() => tabs.length ? tabs : [{ url: currentUrl, label }], [tabs, currentUrl, label])

  function openTab(tab) {
    if (tab.url === activeUrl) return
    setActiveUrl(tab.url)
    onNavigate(tab.url)
  }

  function closeTab(event, tab) {
    event.stopPropagation()
    if (visibleTabs.length <= 1) return
    const index = visibleTabs.findIndex(item => item.url === tab.url)
    const remaining = visibleTabs.filter(item => item.url !== tab.url)
    setTabs(remaining)
    if (tab.url !== activeUrl) return
    const next = remaining[Math.max(0, index - 1)] || remaining[0]
    setActiveUrl(next.url)
    onNavigate(next.url)
  }

  return (
    <div className="border-b border-slate-200 bg-white px-3 sm:px-4">
      <div className="flex min-w-0 gap-1 overflow-x-auto py-2" aria-label="File de lucru">
        {visibleTabs.map(tab => {
          const active = tab.url === activeUrl
          return (
            <div
              key={tab.url}
              className={`group flex max-w-56 flex-none items-center rounded-[var(--radius-control)] border text-sm transition ${
                active
                  ? 'workspace-tab-active border-primary-200 bg-primary-50 font-semibold text-primary-800'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'
              }`}
              title={tab.label}
            >
              <button type="button" onClick={() => openTab(tab)} className="min-w-0 truncate px-3 py-1.5 text-left">
                {tab.label}
              </button>
              {visibleTabs.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Închide fila ${tab.label}`}
                  onClick={event => closeTab(event, tab)}
                  className="mr-1 grid h-5 w-5 flex-none place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
