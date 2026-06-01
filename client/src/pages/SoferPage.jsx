/**
 * SoferPage — PWA mobilă pentru șoferi
 * Ruta: /sofer  (fără Layout — standalone)
 * Funcții: foi de parcurs, completare VERSO, semnătură, offline queue
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────
const OFFLINE_KEY = 'infraflow_sofer_offline_queue'
const SESSION_KEY = 'infraflow_sofer_session'

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10) }
function nowIso() { return new Date().toISOString() }
function localId() { return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

function getQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]') } catch { return [] }
}
function saveQueue(q) { localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)) }
function addToQueue(op) { saveQueue([...getQueue(), op]) }

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}
function saveSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) }
function signatureSvg(canvas) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${canvas.toDataURL('image/png')}" width="100%" height="100%"/></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}
function vapidBytes(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission === 'denied') return
  if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') return
  const registration = await navigator.serviceWorker.ready
  const keys = await api.get('/fleet/push/vapid-public')
  if (!keys.data.enabled) return
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(keys.data.publicKey) })
  await api.post('/fleet/push/subscribe', { subscription, device_name: navigator.userAgent.slice(0, 100) })
}

// ── PWA Install & SW ──────────────────────────────────────────────────────────
function usePWA() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handler = e => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('online', () => setOnline(true))
    window.addEventListener('offline', () => setOnline(false))

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sofer-sw.js', { scope: '/sofer' }).catch(() => {})
      // Listen for sync messages
      navigator.serviceWorker.addEventListener('message', ev => {
        if (ev.data?.type === 'SYNC_REQUESTED') window.dispatchEvent(new Event('sofer-sync'))
      })
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = () => { if (installPrompt) { installPrompt.prompt(); setInstallPrompt(null) } }
  return { online, installPrompt, install }
}

// ── Signature Canvas ──────────────────────────────────────────────────────────
function SignatureCanvas({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  function start(e) {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e, canvasRef.current)
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
  }

  function draw(e) {
    e.preventDefault()
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e, canvasRef.current)
    ctx.lineTo(pos.x, pos.y); ctx.stroke()
    setHasSignature(true)
    onChange(signatureSvg(canvasRef.current))
  }

  function stop(e) { e.preventDefault(); drawing.current = false }

  function clear() {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    setHasSignature(false)
    onChange(null)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">Semnătură șofer</span>
        {hasSignature ? <button type="button" onClick={clear} className="text-xs text-rose-500">✕ Șterge</button> : null}
      </div>
      <canvas
        ref={canvasRef} width={320} height={100}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-white touch-none"
        style={{ cursor: 'crosshair' }}
        onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}
      />
      {!hasSignature ? <p className="text-center text-xs text-slate-400">Semnează cu degetul sau mouse-ul</p> : null}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SoferPage() {
  const { online, installPrompt, install } = usePWA()

  const [screen, setScreen] = useState('login') // login | home | newTrip | closeTrip | history
  const [user, setUser] = useState(getSession)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [logging, setLogging] = useState(false)

  const [myTrips, setMyTrips] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [openTrip, setOpenTrip] = useState(null)
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')

  const [offlineQueue, setOfflineQueue] = useState(getQueue)

  // New trip form
  const [newTripForm, setNewTripForm] = useState({
    asset_id: '', data: today(), km_plecare: '', sofer_text: '', scop_deplasare: '', itinerariu: '',
  })

  // Close trip form
  const [closeTripForm, setCloseTripForm] = useState({
    km_sosire: '', ora_sosire: '', combustibil_sold_final: '', combustibil_primit: '0',
    itinerariu: '', sarcini_transport: '', observatii: '', signature: null,
  })

  const [error, setError] = useState('')

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) { setScreen('home'); loadData() }
    // PWA head tags
    let link = document.querySelector('link[rel="manifest"]')
    if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link) }
    link.href = '/sofer-manifest.json'
    document.title = 'InfraFlow Șofer'
  }, [])

  async function login(e) {
    e.preventDefault(); setLoginError(''); setLogging(true)
    try {
      const res = await api.post('/auth/login', loginForm)
      const u = res.data?.user || res.data
      saveSession(u)
      setUser(u)
      setScreen('home')
      await loadData()
      enablePushNotifications().catch(() => {})
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Autentificare eșuată.')
    } finally { setLogging(false) }
  }

  function logout() { sessionStorage.removeItem(SESSION_KEY); setUser(null); setScreen('login') }

  // ── Load data ───────────────────────────────────────────────────────────────
  async function loadData() {
    if (!navigator.onLine) return
    setLoading(true); setError('')
    try {
      const [tripsRes, assetsRes] = await Promise.all([
        api.get('/fleet/trip-logs'),
        api.get('/fleet/assets'),
      ])
      const trips = tripsRes.data?.trip_logs || []
      setMyTrips(trips)
      const vehicleList = (assetsRes.data?.assets || assetsRes.data?.fleetAssets || []).filter(a => a.tip !== 'utilaj')
      setVehicles(vehicleList)
      const open = trips.find(t => ['draft', 'trimisa', 'in_lucru', 'deschisa', 'completata'].includes(t.status))
      if (open) setOpenTrip(open)
      else setOpenTrip(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la încărcare date.')
    } finally { setLoading(false) }
  }

  // ── Offline sync ─────────────────────────────────────────────────────────────
  const syncOffline = useCallback(async () => {
    const q = getQueue()
    if (!q.length || !navigator.onLine) return
    setSyncStatus(`Sincronizare ${q.length} operații...`)
    const remaining = []
    for (const op of q) {
      try {
        if (op.type === 'close_trip') {
          await api.patch(`/fleet/trip-logs/${op.uuid}/close`, op.data)
        } else if (op.type === 'update_trip') {
          await api.patch(`/fleet/trip-logs/${op.uuid}`, op.data)
        } else if (op.type === 'new_trip') {
          await api.post('/fleet/trip-logs', op.data)
        }
      } catch { remaining.push(op) }
    }
    saveQueue(remaining)
    setOfflineQueue(remaining)
    setSyncStatus(remaining.length ? `${remaining.length} operații în așteptare` : '✅ Sincronizat')
    await loadData()
    setTimeout(() => setSyncStatus(''), 3000)
  }, [])

  useEffect(() => {
    window.addEventListener('online', syncOffline)
    window.addEventListener('sofer-sync', syncOffline)
    if (navigator.onLine && getQueue().length && user) syncOffline()
    return () => {
      window.removeEventListener('online', syncOffline)
      window.removeEventListener('sofer-sync', syncOffline)
    }
  }, [syncOffline, user])

  // ── New Trip ─────────────────────────────────────────────────────────────────
  async function startTrip(e) {
    e.preventDefault(); setError('')
    const data = { ...newTripForm, km_plecare: Number(newTripForm.km_plecare) || 0 }
    if (navigator.onLine) {
      try {
        await api.post('/fleet/trip-logs', data)
        setScreen('home'); await loadData()
      } catch (err) { setError(err.response?.data?.error || 'Eroare la creare foaie parcurs.') }
    } else {
      addToQueue({ type: 'new_trip', data, localId: localId() })
      setOfflineQueue(getQueue())
      setSyncStatus('Salvat offline — va fi trimis la reconectare')
      setScreen('home')
    }
  }

  // ── Close Trip ────────────────────────────────────────────────────────────────
  async function closeTrip(e) {
    e.preventDefault(); setError('')
    if (!closeTripForm.km_sosire) { setError('Introduceți km la sosire.'); return }
    const data = {
      km_sosire: Number(closeTripForm.km_sosire),
      data_sosire: closeTripForm.ora_sosire ? `${today()}T${closeTripForm.ora_sosire}` : nowIso(),
      combustibil_sold_final: Number(closeTripForm.combustibil_sold_final || 0),
      combustibil_primit: Number(closeTripForm.combustibil_primit || 0),
      itinerariu: closeTripForm.itinerariu,
      sarcini_transport: closeTripForm.sarcini_transport,
      observatii: closeTripForm.observatii,
      signature_sofer: closeTripForm.signature,
    }
    if (navigator.onLine) {
      try {
        await api.patch(`/fleet/trip-logs/${openTrip.uuid}/verso`, {
          km_sfarsit: data.km_sosire,
          combustibil_primit: data.combustibil_primit,
          combustibil_sfarsit: data.combustibil_sold_final,
          observatii: data.observatii,
          activitati: [{ ora_plecare: openTrip.data_plecare?.slice(11, 16) || '', ora_sosire: closeTripForm.ora_sosire, destinatie: data.itinerariu, km_parcursi: Number(data.km_sosire) - Number(openTrip.km_plecare || 0), activitate: data.sarcini_transport }]
        })
        if (!data.signature_sofer) throw new Error('Semnătura șoferului este obligatorie.')
        await api.post(`/fleet/trip-logs/${openTrip.uuid}/semneaza-sofer`, { signature_svg: data.signature_sofer })
        setScreen('home'); setOpenTrip(null); await loadData()
      } catch (err) { setError(err.response?.data?.error || 'Eroare la închidere foaie.') }
    } else {
      addToQueue({ type: 'close_trip', uuid: openTrip.uuid, data })
      setOfflineQueue(getQueue())
      setSyncStatus('Foaia va fi închisă la reconectare')
      setScreen('home')
    }
  }

  // ── Colors ────────────────────────────────────────────────────────────────────
  const BG = 'bg-slate-900'
  const CARD = 'bg-slate-800 rounded-2xl p-4'
  const BTN = 'w-full rounded-xl py-3 text-sm font-semibold text-white transition'
  const INPUT = 'w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-sm text-white placeholder-slate-400 focus:border-blue-400 focus:outline-none'
  const LABEL = 'mb-1 block text-xs font-medium text-slate-300'

  // ── Screens ───────────────────────────────────────────────────────────────────

  if (screen === 'login') return (
    <div className={`min-h-screen ${BG} flex items-center justify-center p-4`}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-3">🚗</div>
          <h1 className="text-2xl font-bold text-white">InfraFlow</h1>
          <p className="text-slate-400 text-sm mt-1">Portal Șofer</p>
        </div>
        <form onSubmit={login} className="space-y-4">
          <div><label className={LABEL}>Utilizator</label><input className={INPUT} value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="utilizator" required /></div>
          <div><label className={LABEL}>Parolă</label><input type="password" className={INPUT} value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="••••••" required /></div>
          {loginError ? <div className="rounded-xl bg-rose-900/50 px-4 py-2 text-sm text-rose-300">{loginError}</div> : null}
          <button type="submit" disabled={logging} className={`${BTN} bg-blue-600 hover:bg-blue-500 disabled:opacity-50`}>
            {logging ? 'Se conectează...' : '🔑 Conectare'}
          </button>
        </form>
        {!online ? <div className="rounded-xl bg-amber-900/40 px-4 py-2 text-center text-xs text-amber-300">⚠️ Offline — Login necesită conexiune</div> : null}
      </div>
    </div>
  )

  if (screen === 'newTrip') return (
    <div className={`min-h-screen ${BG} p-4`}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setScreen('home')} className="text-slate-400 text-lg">← Înapoi</button>
        <h2 className="text-lg font-bold text-white">Foaie parcurs nouă</h2>
      </div>
      <form onSubmit={startTrip} className="space-y-4">
        <div>
          <label className={LABEL}>Autovehicul *</label>
          <select className={INPUT} value={newTripForm.asset_id} onChange={e => setNewTripForm({ ...newTripForm, asset_id: e.target.value })} required>
            <option value="">Alege autovehicul...</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.nrInmatriculare || v.license_plate || v.code} — {v.marca || v.model || ''}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Data</label>
          <input type="date" className={INPUT} value={newTripForm.data} onChange={e => setNewTripForm({ ...newTripForm, data: e.target.value })} />
        </div>
        <div>
          <label className={LABEL}>Km la plecare *</label>
          <input type="number" className={INPUT} value={newTripForm.km_plecare} onChange={e => setNewTripForm({ ...newTripForm, km_plecare: e.target.value })} placeholder="ex: 145230" required />
        </div>
        <div>
          <label className={LABEL}>Șofer (dacă diferit)</label>
          <input className={INPUT} value={newTripForm.sofer_text} onChange={e => setNewTripForm({ ...newTripForm, sofer_text: e.target.value })} placeholder={user?.name || user?.username || ''} />
        </div>
        <div>
          <label className={LABEL}>Scopul deplasării</label>
          <input className={INPUT} value={newTripForm.scop_deplasare} onChange={e => setNewTripForm({ ...newTripForm, scop_deplasare: e.target.value })} placeholder="ex: Transport materiale șantier" />
        </div>
        <div>
          <label className={LABEL}>Itinerariu inițial</label>
          <input className={INPUT} value={newTripForm.itinerariu} onChange={e => setNewTripForm({ ...newTripForm, itinerariu: e.target.value })} placeholder="ex: Depou → DN7 km 12" />
        </div>
        {error ? <div className="rounded-xl bg-rose-900/50 px-4 py-2 text-sm text-rose-300">{error}</div> : null}
        <button type="submit" className={`${BTN} bg-green-600 hover:bg-green-500`}>
          {online ? '🚀 Deschide foaie parcurs' : '💾 Salvează offline'}
        </button>
      </form>
    </div>
  )

  if (screen === 'closeTrip' && openTrip) return (
    <div className={`min-h-screen ${BG} p-4 pb-20`}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setScreen('home')} className="text-slate-400 text-lg">← Înapoi</button>
        <h2 className="text-lg font-bold text-white">Închide foaie {openTrip.nr_foaie}</h2>
      </div>
      <div className={`${CARD} mb-4 text-sm text-slate-300`}>
        <div className="font-semibold text-white mb-1">{openTrip.asset_label || openTrip.asset_id}</div>
        <div>Plecare: {openTrip.data_plecare?.slice(0, 16) || openTrip.data} · Km: {openTrip.km_plecare}</div>
      </div>
      <form onSubmit={closeTrip} className="space-y-4">
        <div>
          <label className={LABEL}>Km la sosire *</label>
          <input type="number" className={INPUT} value={closeTripForm.km_sosire} onChange={e => setCloseTripForm({ ...closeTripForm, km_sosire: e.target.value })} placeholder="ex: 145345" required />
          {closeTripForm.km_sosire && openTrip.km_plecare ? (
            <p className="mt-1 text-xs text-blue-400">Km parcurși: {Number(closeTripForm.km_sosire) - Number(openTrip.km_plecare)}</p>
          ) : null}
        </div>
        <div>
          <label className={LABEL}>Ora sosire</label>
          <input type="time" className={INPUT} value={closeTripForm.ora_sosire} onChange={e => setCloseTripForm({ ...closeTripForm, ora_sosire: e.target.value })} />
        </div>
        <div>
          <label className={LABEL}>Combustibil final (L)</label>
          <input type="number" step="0.1" className={INPUT} value={closeTripForm.combustibil_sold_final} onChange={e => setCloseTripForm({ ...closeTripForm, combustibil_sold_final: e.target.value })} placeholder="0" />
        </div>
        <div>
          <label className={LABEL}>Combustibil primit (L)</label>
          <input type="number" step="0.1" className={INPUT} value={closeTripForm.combustibil_primit} onChange={e => setCloseTripForm({ ...closeTripForm, combustibil_primit: e.target.value })} placeholder="0" />
        </div>
        <div>
          <label className={LABEL}>Itinerariu parcurs (VERSO)</label>
          <textarea rows={3} className={INPUT} value={closeTripForm.itinerariu} onChange={e => setCloseTripForm({ ...closeTripForm, itinerariu: e.target.value })} placeholder="ex: Depou → DN7 km 12 → Depou" />
        </div>
        <div>
          <label className={LABEL}>Sarcini transportate</label>
          <textarea rows={2} className={INPUT} value={closeTripForm.sarcini_transport} onChange={e => setCloseTripForm({ ...closeTripForm, sarcini_transport: e.target.value })} placeholder="ex: 5t criblură" />
        </div>
        <div>
          <label className={LABEL}>Observații</label>
          <input className={INPUT} value={closeTripForm.observatii} onChange={e => setCloseTripForm({ ...closeTripForm, observatii: e.target.value })} placeholder="Orice de menționat" />
        </div>

        {/* Signature */}
        <div className="rounded-xl bg-slate-800 p-3">
          <SignatureCanvas onChange={sig => setCloseTripForm(prev => ({ ...prev, signature: sig }))} />
        </div>

        {error ? <div className="rounded-xl bg-rose-900/50 px-4 py-2 text-sm text-rose-300">{error}</div> : null}

        <button type="submit" className={`${BTN} bg-rose-600 hover:bg-rose-500`}>
          {online ? '🔒 Închide foaie parcurs' : '💾 Salvează offline (va fi trimis la reconectare)'}
        </button>
      </form>
    </div>
  )

  if (screen === 'history') return (
    <div className={`min-h-screen ${BG} p-4 pb-20`}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setScreen('home')} className="text-slate-400 text-lg">← Înapoi</button>
        <h2 className="text-lg font-bold text-white">Istoric foi parcurs</h2>
      </div>
      <div className="space-y-3">
        {myTrips.slice(0, 30).map(t => (
          <div key={t.uuid || t.id} className={CARD}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-sm">{t.nr_foaie}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.status === 'inchisa' ? 'bg-green-800 text-green-200' : 'bg-amber-800 text-amber-200'}`}>{t.status}</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              <span>{t.asset_label || t.asset_id}</span> · <span>{t.data}</span>
            </div>
            {t.km_plecare != null ? (
              <div className="mt-1 text-xs text-slate-400">
                Km: {t.km_plecare} → {t.km_sosire ?? '…'} {t.km_sosire ? `(${t.km_sosire - t.km_plecare} km)` : ''}
              </div>
            ) : null}
            {t.itinerariu ? <div className="mt-1 text-xs text-slate-500 truncate">{t.itinerariu}</div> : null}
          </div>
        ))}
        {myTrips.length === 0 ? <p className="text-center text-slate-400 py-8">Nicio foaie de parcurs.</p> : null}
      </div>
    </div>
  )

  // Home screen
  return (
    <div className={`min-h-screen ${BG} p-4 pb-24`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">🚗 Portal Șofer</h1>
          <p className="text-slate-400 text-xs">{user?.name || user?.username}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${online ? 'bg-green-900/50 text-green-300' : 'bg-amber-900/50 text-amber-300'}`}>
            {online ? '🟢 Online' : '🟡 Offline'}
          </span>
          {installPrompt ? (
            <button onClick={install} className="rounded-full bg-blue-700 px-3 py-1 text-xs text-white">+ Instalează</button>
          ) : null}
          <button onClick={logout} className="text-slate-400 text-xs hover:text-white">Ieșire</button>
        </div>
      </div>

      {/* Sync status */}
      {syncStatus ? <div className="mb-4 rounded-xl bg-blue-900/40 px-4 py-2 text-center text-xs text-blue-300">{syncStatus}</div> : null}
      {error ? <div className="mb-4 rounded-xl bg-rose-900/50 px-4 py-2 text-sm text-rose-300">{error}</div> : null}

      {/* Active trip card */}
      {openTrip ? (
        <div className="mb-6 rounded-2xl bg-amber-900/40 border border-amber-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-amber-200">🟡 Foaie deschisă</span>
            <span className="text-xs text-amber-300">{openTrip.nr_foaie}</span>
          </div>
          <div className="text-white font-semibold">{openTrip.asset_label || openTrip.asset_id}</div>
          <div className="text-xs text-amber-300 mt-1">
            Plecare: {openTrip.data_plecare?.slice(0, 16) || openTrip.data} · Km plecare: {openTrip.km_plecare}
          </div>
          {openTrip.itinerariu ? <div className="text-xs text-slate-400 mt-1 truncate">{openTrip.itinerariu}</div> : null}
          {openTrip.status === 'trimisa' ? <button onClick={async () => { await api.post(`/fleet/trip-logs/${openTrip.uuid}/incepe`, { km_start: openTrip.km_plecare }); await loadData() }} className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white">Confirmă primirea și pleacă</button> : null}
          <button
            onClick={() => {
              setCloseTripForm({ km_sosire: '', ora_sosire: new Date().toTimeString().slice(0, 5), combustibil_sold_final: '', combustibil_primit: '0', itinerariu: openTrip.itinerariu || '', sarcini_transport: '', observatii: '', signature: null })
              setScreen('closeTrip')
            }}
            className="mt-3 w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white hover:bg-amber-500"
          >Completează verso și semnează</button>
        </div>
      ) : (
        <button
          onClick={() => { setNewTripForm({ asset_id: vehicles[0]?.id || '', data: today(), km_plecare: '', sofer_text: '', scop_deplasare: '', itinerariu: '' }); setScreen('newTrip') }}
          className={`${BTN} bg-green-600 hover:bg-green-500 mb-4`}
        >🚀 Deschide foaie parcurs nouă</button>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className={CARD}>
          <div className="text-2xl font-bold text-white">{myTrips.filter(t => t.status === 'inchisa').length}</div>
          <div className="text-xs text-slate-400">Foi închise</div>
        </div>
        <div className={CARD}>
          <div className="text-2xl font-bold text-amber-400">{myTrips.filter(t => t.status === 'deschisa').length}</div>
          <div className="text-xs text-slate-400">Deschise</div>
        </div>
      </div>

      {/* Recent trips */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-300">Ultimele foi</span>
        <button onClick={() => setScreen('history')} className="text-xs text-blue-400 hover:underline">Vezi toate →</button>
      </div>
      <div className="space-y-2 mb-6">
        {myTrips.slice(0, 5).map(t => (
          <div key={t.uuid || t.id} className={`${CARD} flex items-center justify-between`}>
            <div>
              <div className="text-sm font-medium text-white">{t.nr_foaie} · {t.asset_label || t.asset_id}</div>
              <div className="text-xs text-slate-400">{t.data} {t.km_sosire ? `· ${t.km_sosire - t.km_plecare} km` : ''}</div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs ${t.status === 'inchisa' ? 'bg-green-800 text-green-200' : 'bg-amber-800 text-amber-200'}`}>{t.status}</span>
          </div>
        ))}
        {myTrips.length === 0 && !loading ? <p className="text-center text-slate-500 py-4 text-sm">Nicio foaie înregistrată.</p> : null}
        {loading ? <p className="text-center text-slate-500 py-4 text-sm">Se încarcă...</p> : null}
      </div>

      {/* Offline queue */}
      {offlineQueue.length > 0 ? (
        <div className="rounded-2xl border border-amber-700 bg-amber-900/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-amber-200">📋 Coadă offline ({offlineQueue.length})</span>
            {online ? <button onClick={syncOffline} className="text-xs text-blue-400">↺ Sincronizează</button> : null}
          </div>
          {offlineQueue.map((op, i) => (
            <div key={i} className="text-xs text-slate-400">
              {op.type === 'new_trip' ? '🆕 Foaie nouă' : op.type === 'close_trip' ? '🔒 Închidere foaie' : op.type} — salvat offline
            </div>
          ))}
        </div>
      ) : null}

      {/* Refresh */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center">
        {online ? (
          <button onClick={loadData} disabled={loading}
            className="rounded-full bg-slate-700 px-6 py-2 text-xs text-slate-300 shadow-lg disabled:opacity-50 hover:bg-slate-600"
          >{loading ? 'Se actualizează...' : '↺ Actualizează'}</button>
        ) : (
          <div className="rounded-full bg-amber-900/60 px-6 py-2 text-xs text-amber-300">
            Offline — modificările se vor trimite la reconectare
          </div>
        )}
      </div>
    </div>
  )
}
