import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'

export default function DropdownMenu({ label, items = [], active = false, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const ref = useRef(null)
  const menuRef = useRef(null)
  const availableItems = items.filter(Boolean)

  useEffect(() => {
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false)
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

  useLayoutEffect(() => {
    if (!open) return undefined
    function updatePosition() {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const menuWidth = Math.max(224, rect.width)
      const preferredLeft = align === 'right' ? rect.right - menuWidth : rect.left
      const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - menuWidth - 8))
      const roomBelow = window.innerHeight - rect.bottom
      const estimatedHeight = Math.min(360, Math.max(48, availableItems.length * 42 + 8))
      const opensUp = roomBelow < estimatedHeight && rect.top > roomBelow
      setPosition({ left, top: opensUp ? undefined : rect.bottom + 4, bottom: opensUp ? window.innerHeight - rect.top + 4 : undefined, width: menuWidth, maxHeight: Math.max(120, opensUp ? rect.top - 16 : roomBelow - 12) })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, align, availableItems.length])

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
    if (item.separator || item.type === 'separator') return <div key={`sep-${index}`} className="my-1 border-t border-slate-100" />
    if (item.to) {
      return (
        <Link key={item.key || item.to || index} to={item.to} role="menuitem" className={itemClass(item)} onClick={() => setOpen(false)}>
          {item.label}
        </Link>
      )
    }
    return (
      <button
        key={item.key || item.label || index}
        type="button"
        role="menuitem"
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
      {open && position ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] overflow-y-auto rounded-[var(--radius-panel)] border border-slate-200 bg-white p-1 shadow-xl"
          style={position}
          role="menu"
        >
          {availableItems.length ? availableItems.map(renderItem) : <div className="px-3 py-2 text-sm text-slate-500">Nu exista optiuni.</div>}
        </div>, document.body
      ) : null}
    </div>
  )
}
