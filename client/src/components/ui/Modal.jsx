import { useEffect, useMemo, useRef, useState } from 'react'
import Button from './Button'

export default function Modal({ open, title, children, onClose, size = 'md', resizable = true }) {
  const sizes = {
    sm: '28rem',
    md: '42rem',
    lg: '56rem',
    xl: '72rem',
  }
  const initialWidth = sizes[size] || sizes.md
  const storageKey = useMemo(() => `infraflow-modal-${size}-${String(title || 'modal').replace(/\s+/g, '-').toLowerCase()}`, [size, title])
  const [dimensions, setDimensions] = useState(null)
  const resizeRef = useRef(null)

  useEffect(() => {
    if (!open || !resizable) return
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null')
      if (saved?.width && saved?.height) setDimensions(saved)
      else setDimensions(null)
    } catch {
      setDimensions(null)
    }
  }, [open, resizable, storageKey])

  useEffect(() => {
    if (!open || !resizable || !dimensions) return
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(dimensions))
    } catch {
      // Session storage can be unavailable in restricted browsers.
    }
  }, [dimensions, open, resizable, storageKey])

  if (!open) return null

  function clampDimensions(width, height) {
    const maxWidth = Math.max(320, window.innerWidth - 32)
    const maxHeight = Math.max(320, window.innerHeight - 32)
    return {
      width: Math.min(Math.max(width, 360), maxWidth),
      height: Math.min(Math.max(height, 320), maxHeight)
    }
  }

  function startResize(event) {
    if (!resizable) return
    event.preventDefault()
    const panel = resizeRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const start = {
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height
    }
    function move(moveEvent) {
      const next = clampDimensions(start.width + moveEvent.clientX - start.x, start.height + moveEvent.clientY - start.y)
      setDimensions(next)
    }
    function stop() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-2 md:items-center md:p-4">
      <div
        ref={resizeRef}
        className="relative flex max-h-[calc(100dvh-1rem)] min-h-[18rem] w-full min-w-0 animate-[slideUp_.18s_ease-out] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-slate-200 bg-white shadow-xl md:max-h-[calc(100dvh-2rem)] md:min-w-[min(22rem,calc(100vw-2rem))]"
        style={{
          width: dimensions?.width ? `${dimensions.width}px` : `min(${initialWidth}, calc(100vw - 1rem))`,
          height: dimensions?.height ? `${dimensions.height}px` : undefined,
          maxWidth: 'calc(100vw - 1rem)',
          maxHeight: 'calc(100dvh - 1rem)'
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <h2 className="min-w-0 truncate text-base font-semibold text-slate-900">{title}</h2>
          <Button variant="ghost" onClick={onClose}>Închide</Button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3 md:p-4">{children}</div>
        {resizable ? (
          <button
            type="button"
            className="absolute bottom-1 right-1 hidden h-5 w-5 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-slate-400 opacity-70 hover:opacity-100 md:block"
            title="Redimensionează"
            aria-label="Redimensionează"
            onPointerDown={startResize}
            onDoubleClick={() => setDimensions(null)}
          />
        ) : null}
      </div>
    </div>
  )
}
