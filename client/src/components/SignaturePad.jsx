import { useRef, useState } from 'react'

function svgDataUrl(canvas) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${canvas.toDataURL('image/png')}" width="100%" height="100%"/></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

export default function SignaturePad({ onChange, label = 'Semnează cu degetul' }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect()
    const source = event.touches?.[0] || event
    return { x: (source.clientX - rect.left) * canvasRef.current.width / rect.width, y: (source.clientY - rect.top) * canvasRef.current.height / rect.height }
  }
  function start(event) {
    event.preventDefault()
    drawing.current = true
    const pos = point(event)
    const context = canvasRef.current.getContext('2d')
    context.beginPath()
    context.moveTo(pos.x, pos.y)
  }
  function draw(event) {
    event.preventDefault()
    if (!drawing.current) return
    const pos = point(event)
    const context = canvasRef.current.getContext('2d')
    context.lineWidth = 2
    context.lineCap = 'round'
    context.lineTo(pos.x, pos.y)
    context.stroke()
    setHasSignature(true)
    onChange?.(svgDataUrl(canvasRef.current))
  }
  function stop(event) {
    event.preventDefault()
    drawing.current = false
  }
  function clear() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onChange?.('')
  }

  return <div className="space-y-2">
    <canvas ref={canvasRef} width="700" height="220" className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
      onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
    <div className="flex items-center justify-between text-xs text-slate-500"><span>{label}</span>{hasSignature ? <button type="button" onClick={clear} className="text-rose-600">Șterge</button> : null}</div>
  </div>
}
