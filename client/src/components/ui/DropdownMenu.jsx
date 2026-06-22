import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'

export default function DropdownMenu({ label, items = [], active = false, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const availableItems = items.filter(Boolean)

  useEffect(() => {
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function itemClass(item) {
    return `block w-full rounded-[calc(var(--radius-control)-0.05rem)] px-3 py-2 text-left text-sm font-medium transition ${
      item.active
        ? 'bg-primary-50 text-primary-800'
        : item.danger
          ? 'text-rose-700 hover:bg-rose-50'
          : 'text-slate-700 hover:bg-slate-50'
    } ${item.disabled ? 'pointer-events-none opacity-50' : ''}`
  }

  function renderItem(item, index) {
    if (item.separator) return <div key={`sep-${index}`} className="my-1 border-t border-slate-100" />
    if (item.to) {
      return (
        <Link key={item.key || item.to || index} to={item.to} className={itemClass(item)} onClick={() => setOpen(false)}>
          {item.label}
        </Link>
      )
    }
    return (
      <button
        key={item.key || item.label || index}
        type="button"
        className={itemClass(item)}
        disabled={item.disabled}
        onClick={() => {
          setOpen(false)
          item.onClick?.()
        }}
      >
        {item.label}
      </button>
    )
  }

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        className={`inline-flex h-[var(--control-height)] items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-[var(--control-px)] text-sm font-semibold transition ${
          active
            ? 'border-primary-700 bg-primary-700 text-white shadow-sm'
            : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
        }`}
        onClick={() => setOpen(current => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <ChevronDown size={15} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          className={`absolute top-full z-50 mt-1 min-w-56 rounded-[var(--radius-panel)] border border-slate-200 bg-white p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="menu"
        >
          {availableItems.length ? availableItems.map(renderItem) : <div className="px-3 py-2 text-sm text-slate-500">Nu exista optiuni.</div>}
        </div>
      ) : null}
    </div>
  )
}
