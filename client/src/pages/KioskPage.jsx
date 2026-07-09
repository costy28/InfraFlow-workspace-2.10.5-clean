/**
 * Kiosk — self-service pentru angajati
 * v2.8: activare cont, login kiosk, resetare parolă,
 *       foi de parcurs proprii, completare verso, semnătură offline.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/forms/Input'
import Modal from '../components/ui/Modal'
import Select from '../components/forms/Select'
import { useAuth } from '../hooks/useAuth'
import axios from 'axios'

// ─── Keys localStorage ───────────────────────────────────────────────────────
const OFFLINE_KEY = 'infraflow_kiosk_offline_queue'
const CACHE_KEY   = 'infraflow_kiosk_cache'
const KIOSK_TOKEN_KEY = 'infraflow_kiosk_token'
const KIOSK_EMP_KEY   = 'infraflow_kiosk_employee_id'
const KIOSK_NAME_KEY  = 'infraflow_kiosk_employee_name'

// ─── Axios kiosk (token separat) ─────────────────────────────────────────────
function kioskApi(token) {
  return axios.create({
    baseURL: '/api',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}
function alertTone(days) {
  if (days === null) return null
  if (days < 0) return 'danger'
  if (days <= 30) return 'warning'
  return null
}
function businessDaysEstimate(start, end) {
  if (!start || !end) return 0
  let count = 0
  for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}
function calendarDaysEstimate(start, end) {
  if (!start || !end) return 0
  const first = new Date(`${start}T12:00:00Z`)
  const last = new Date(`${end}T12:00:00Z`)
  return last >= first ? Math.floor((last - first) / 86400000) + 1 : 0
}
function localId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
function getQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]') } catch { return [] }
}
function saveQueue(q) { localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)) }
function addToQueue(op) { const q = [...getQueue(), op]; saveQueue(q); return q }
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}
function saveCache(p) { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...p, cachedAt: new Date().toISOString() })) }
function isNetworkError(err) { return !err?.response || err.code === 'ECONNABORTED' }
function leaveTone(status) {
  if (status === 'aprobata' || status === 'aprobat') return 'success'
  if (status === 'respinsa' || status === 'respins') return 'danger'
  return 'warning'
}
function statusBadge(status) {
  if (status === 'deschisa') return { tone: 'warning', label: 'ÎN CURSĂ' }
  if (status === 'completata') return { tone: 'warning', label: '🟡 COMPLETATĂ' }
  if (status === 'inchisa') return { tone: 'success', label: '✅ ÎNCHISĂ' }
  if (status === 'in_faz') return { tone: 'success', label: 'FAZ' }
  return { tone: 'default', label: status || '—' }
}

// ─── Signature Canvas Component ───────────────────────────────────────────────
function SignatureCanvas({ onConfirm }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches?.[0] || e
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  function startDraw(e) {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1e3a5f'
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function doDraw(e) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setIsEmpty(false)
  }

  function endDraw(e) {
    e.preventDefault()
    drawing.current = false
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        style={{ width: '100%', height: '200px', background: 'white', border: '2px solid #334155', borderRadius: '8px', touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={startDraw}
        onMouseMove={doDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={doDraw}
        onTouchEnd={endDraw}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={clearCanvas}
          variant="secondary"
        >Șterge și refă</Button>
        <Button
          type="button"
          disabled={isEmpty}
          onClick={() => onConfirm(canvasRef.current.toDataURL('image/png'))}
        >Confirmă semnătura</Button>
      </div>
    </div>
  )
}

// ─── Kiosk inline styles ──────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #1e3a5f 0%, #2d6a4f 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' },
  card: { background: 'white', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  title: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#1e293b' },
  sub: { margin: '4px 0 0', fontSize: '13px', color: '#64748b' },
  err: { background: '#fef2f2', color: '#dc2626', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '16px' },
  ok: { background: '#f0fdf4', color: '#16a34a', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '4px' },
  input: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' },
  select: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', boxSizing: 'border-box', background: 'white' },
  btn: (disabled) => ({ width: '100%', background: disabled ? '#94a3b8' : '#1e3a5f', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '15px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.7 : 1 }),
  link: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline', padding: '4px 0' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
}

// ─── Kiosk form field ────────────────────────────────────────────────────────
function KField({ label, type = 'text', value, onChange, placeholder = '', maxLength, required, autoFocus }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={S.label}>{label}{required ? ' *' : ''}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength}
        required={required} autoFocus={autoFocus}
        style={S.input} autoComplete={type === 'password' ? 'new-password' : undefined} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function KioskPage() {
  const { user, login } = useAuth()

  // ── Kiosk-specific auth (separate de useAuth) ─────────────────────────────
  const [kioskToken, setKioskToken] = useState(() => localStorage.getItem(KIOSK_TOKEN_KEY) || null)
  const [kioskEmpId, setKioskEmpId] = useState(() => localStorage.getItem(KIOSK_EMP_KEY) || null)
  const [kioskEmpName, setKioskEmpName] = useState(() => localStorage.getItem(KIOSK_NAME_KEY) || null)

  // Screen state: 'login' | 'activate' | 'reset' | 'reset_confirm'
  const [authScreen, setAuthScreen] = useState('login')

  // Login form
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Activate form
  const [actForm, setActForm] = useState({ act_tip: 'CI', cnp: '', act_serie: '', act_numar: '', functia: '', username: '', password: '', confirm: '' })
  const [actError, setActError] = useState('')
  const [actSuccess, setActSuccess] = useState('')
  const [actLoading, setActLoading] = useState(false)

  // Reset form
  const [resetForm, setResetForm] = useState({ cnp: '', act_serie: '', act_numar: '' })
  const [resetError, setResetError] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Reset confirm form
  const [confirmForm, setConfirmForm] = useState({ cnp: '', cod: '', password_nou: '', confirm: '' })
  const [confirmError, setConfirmError] = useState('')
  const [confirmMsg, setConfirmMsg] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Dashboard data
  const [employee, setEmployee] = useState(null)
  const [coBalance, setCoBalance] = useState(null)
  const [myLeaves, setMyLeaves] = useState([])
  const [myAuth, setMyAuth] = useState([])
  const [myTrips, setMyTrips] = useState([])
  const [myDocuments, setMyDocuments] = useState([])
  const [kioskSummary, setKioskSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  const [offlineQueue, setOfflineQueue] = useState(() => getQueue())
  const [syncStatus, setSyncStatus] = useState('')

  // Leave form
  const emptyLeaveForm = { tip: 'CO', data_start: '', data_sfarsit: '', motiv: '', serie: '', numar: '', tip_certificat: 'initial', data_acordarii: '', cod_indemnizatie: '', cod_diagnostic: '', medic_nume: '', cod_parafa: '', unitate_emitenta: '' }
  const [leaveForm, setLeaveForm] = useState(emptyLeaveForm)
  const [medicalFile, setMedicalFile] = useState(null)
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [leaveSuccess, setLeaveSuccess] = useState(false)

  // Verso modal
  const [versoTrip, setVersoTrip] = useState(null) // foaie de editat
  const [versoForm, setVersoForm] = useState({ activitati: [], km_sosire: '', km_necont: 0, km_cat1: 0, km_cat2: 0, km_cat3: 0, observatii: '' })
  const [versoActModal, setVersoActModal] = useState(false)
  const [versoActForm, setVersoActForm] = useState({ locul_plecarii: '', locul_sosirii: '', ziua: '', ora: '08', minut: '00', km_incarcat: 0, km_gol: 0, tone: '', marfa: '' })
  const [versoSigModal, setVersoSigModal] = useState(false)
  const [versoSig, setVersoSig] = useState(null) // base64 png
  const [versoSigNume, setVersoSigNume] = useState('')
  const [versoSaving, setVersoSaving] = useState(false)
  const [versoSaved, setVersoSaved] = useState(false)

  // ── Determine if authenticated ───────────────────────────────────────────
  const isAuthenticated = !!(user || (kioskToken && kioskEmpId))

  // ── Get API client based on auth type ────────────────────────────────────
  const getApi = useCallback(() => {
    if (kioskToken) return kioskApi(kioskToken)
    return api
  }, [kioskToken])

  // ── Load dashboard data ───────────────────────────────────────────────────
  const loadKiosk = useCallback(async () => {
    setLoading(true)
    try {
      if (kioskToken) {
        // Kiosk user: use dedicated endpoints
        const kApi = kioskApi(kioskToken)
        const [tripsRes, profileRes, documentsRes] = await Promise.allSettled([
          kApi.get('/hr/kiosk/my-trips'),
          kApi.get('/hr/kiosk/me').catch(() => null),
          kApi.get('/hr/kiosk/my-documents').catch(() => ({ data: { documents: [] } }))
        ])
        if (tripsRes.status === 'fulfilled') {
          setMyTrips(tripsRes.value.data?.trips || [])
        }
        if (profileRes.status === 'fulfilled' && profileRes.value?.data) {
          const profile = profileRes.value.data
          setKioskSummary(profile)
          setEmployee(profile.angajat || null)
          setCoBalance(profile.concedii ? {
            year: new Date().getFullYear(),
            zile_ramase: profile.concedii.co_ramase || 0,
            zile_efectuate: profile.concedii.co_efectuate || 0,
            zile_drept: profile.concedii.co_total || 0,
          } : null)
          setMyLeaves(profile.cereri || [])
          setMyAuth(profile.autorizatii || [])
          const docs = documentsRes.status === 'fulfilled' ? (documentsRes.value?.data?.documents || []) : []
          setMyDocuments(docs)
          saveCache({ kioskEmpId, employee: profile.angajat, coBalance: profile.concedii, myLeaves: profile.cereri, myAuth: profile.autorizatii, myDocuments: docs, kioskSummary: profile })
        }
      } else if (user) {
        // Regular app user
        const summaryRes = await api.get('/kiosk/data')
        const summary = summaryRes.data || {}
        setKioskSummary(summary)
        const emp = summary.angajat
        if (!emp) { setEmployee(null); setOnline(true); return }
        setEmployee(emp)
        setCoBalance({
          year: new Date().getFullYear(),
          zile_ramase: summary.concedii?.co_ramase || 0,
          zile_efectuate: summary.concedii?.co_efectuate || 0,
          zile_drept: summary.concedii?.co_total || 0,
        })
        setMyLeaves(summary.cereri || summary.cereri_asteptare || [])
        setMyAuth(summary.autorizatii || [])
        const [tripsRes, documentsRes] = await Promise.allSettled([
          api.get(`/fleet/trip-logs?sofer_id=${emp.id}`).catch(() => null),
          api.get('/hr/kiosk/my-documents').catch(() => ({ data: { documents: [] } })),
        ])
        if (tripsRes.status === 'fulfilled' && tripsRes.value) {
          const all = tripsRes.value.data?.trip_logs || []
          setMyTrips(all.slice(0, 60))
        }
        const docs = documentsRes.status === 'fulfilled' ? (documentsRes.value?.data?.documents || []) : []
        setMyDocuments(docs)
        saveCache({ userId: user?.id, employee: emp, coBalance: summary.concedii, myLeaves: summary.cereri_asteptare, myAuth: summary.autorizatii, myDocuments: docs })
      }
      setOnline(true)
      setError('')
    } catch (err) {
      setOnline(false)
      const cached = readCache()
      if (cached && (String(cached.userId) === String(user?.id) || kioskToken)) {
        setEmployee(cached.employee || null)
        setCoBalance(cached.coBalance || null)
        setMyLeaves(cached.myLeaves || [])
        setMyAuth(cached.myAuth || [])
        setMyDocuments(cached.myDocuments || [])
        setError('Offline — se afișează ultimele date salvate.')
      } else {
        setError('Nu s-au putut încărca datele. Conectează dispozitivul la rețeaua locală.')
      }
    } finally {
      setLoading(false)
    }
  }, [user, kioskToken, kioskEmpId])

  const syncOffline = useCallback(async () => {
    const queue = getQueue()
    setOfflineQueue(queue)
    if (!queue.length || !isAuthenticated) return
    const syncQueue = queue.filter(op => op.type !== 'versoFoaie') // verso se sincronizează separat
    if (!syncQueue.length) return
    setSyncStatus(`Se sincronizează ${syncQueue.length} operațiuni...`)
    try {
      const syncApi = kioskToken ? kioskApi(kioskToken) : api
      const response = await syncApi.post('/hr/kiosk/sync', { operations: syncQueue })
      const failedIds = new Set((response.data?.failed || []).map(i => i.id))
      const remaining = queue.filter(i => failedIds.has(i.id))
      saveQueue(remaining)
      setOfflineQueue(remaining)
      setOnline(true)
      setSyncStatus(remaining.length ? `${remaining.length} operațiuni rămase.` : 'Sincronizare finalizată.')
      if (!remaining.length) await loadKiosk()
    } catch (err) {
      if (isNetworkError(err)) { setOnline(false); setSyncStatus('Offline — sincronizarea se reia automat.') }
      else setSyncStatus(err.response?.data?.error || 'Sincronizarea nu a reușit.')
    }
  }, [isAuthenticated, kioskToken, loadKiosk])

  // Sync verso items when online
  const syncVerso = useCallback(async () => {
    const queue = getQueue()
    const versoItems = queue.filter(op => op.type === 'versoFoaie')
    if (!versoItems.length) return
    const syncApi = kioskToken ? kioskApi(kioskToken) : api
    const done = []
    for (const item of versoItems) {
      try {
        await syncApi.patch(`/fleet/trip-logs/${item.foaie_uuid}/verso-kiosk`, item.data)
        done.push(item.id)
      } catch (_) { /* rămâne în coadă */ }
    }
    if (done.length) {
      const remaining = queue.filter(op => !done.includes(op.id))
      saveQueue(remaining)
      setOfflineQueue(remaining)
      await loadKiosk()
    }
  }, [kioskToken, loadKiosk])

  async function openKioskDocument(item) {
    try {
      const client = getApi()
      const response = await client.get(`/hr/kiosk/my-documents/${item.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul nu a putut fi deschis.')
    }
  }

  async function acknowledgeKioskDocument(item) {
    try {
      const client = getApi()
      const response = await client.post(`/hr/kiosk/my-documents/${item.id}/ack`, { note: 'Am luat la cunostinta.' })
      const updated = response.data?.item || item
      setMyDocuments(current => current.map(doc => String(doc.id) === String(item.id) ? updated : doc))
      setError('')
    } catch (err) {
      setError(err.response?.data?.error || 'Confirmarea documentului nu a putut fi salvata.')
    }
  }

  useEffect(() => {
    if (isAuthenticated) loadKiosk()
  }, [isAuthenticated, loadKiosk])

  useEffect(() => {
    const handleOnline = () => { setOnline(true); syncOffline(); syncVerso() }
    const handleOffline = () => setOnline(false)
    const handleFocus = () => { syncOffline(); syncVerso() }
    const handleVisibility = () => { if (!document.hidden) { syncOffline(); syncVerso() } }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    const timer = window.setInterval(() => { syncOffline(); syncVerso() }, 60000)
    syncOffline()
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.clearInterval(timer)
    }
  }, [syncOffline, syncVerso])

  // ── Auth handlers ─────────────────────────────────────────────────────────

  async function handleKioskLogin(e) {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      // Încearcă mai întâi login kiosk
      const res = await axios.post('/api/hr/kiosk/login', loginForm)
      const { token, employee_id, employee_name } = res.data
      localStorage.setItem(KIOSK_TOKEN_KEY, token)
      localStorage.setItem(KIOSK_EMP_KEY, String(employee_id))
      localStorage.setItem(KIOSK_NAME_KEY, employee_name || loginForm.username)
      setKioskToken(token)
      setKioskEmpId(String(employee_id))
      setKioskEmpName(employee_name || loginForm.username)
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 429) {
        // Eroare kiosk login — încearcă login normal (utilizatori cu cont în app)
        try {
          await login(loginForm.username, loginForm.password)
        } catch {
          setLoginError(err.response?.data?.error || 'Username sau parolă incorectă.')
        }
      } else {
        // Fallback la login normal
        try {
          await login(loginForm.username, loginForm.password)
        } catch {
          setLoginError('Username sau parolă incorectă.')
        }
      }
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleActivate(e) {
    e.preventDefault()
    setActError('')
    setActSuccess('')
    if (actForm.password !== actForm.confirm) { setActError('Parolele nu coincid.'); return }
    setActLoading(true)
    try {
      const res = await axios.post('/api/hr/kiosk/activate', {
        cnp: actForm.cnp, act_tip: actForm.act_tip,
        act_serie: actForm.act_serie, act_numar: actForm.act_numar,
        functia: actForm.functia, username: actForm.username,
        password: actForm.password
      })
      setActSuccess(res.data.message || 'Cont activat! Te poți loga.')
      setActForm({ act_tip: 'CI', cnp: '', act_serie: '', act_numar: '', functia: '', username: '', password: '', confirm: '' })
      setTimeout(() => { setActSuccess(''); setAuthScreen('login') }, 3000)
    } catch (err) {
      setActError(err.response?.data?.error || 'Activarea nu a reușit. Verifică datele.')
    } finally {
      setActLoading(false)
    }
  }

  async function handleResetRequest(e) {
    e.preventDefault()
    setResetError('')
    setResetMsg('')
    setResetLoading(true)
    try {
      const res = await axios.post('/api/hr/kiosk/reset-request', resetForm)
      setResetMsg(res.data.message || 'Solicitarea a fost trimisă.')
    } catch (err) {
      setResetError(err.response?.data?.error || 'Resetarea nu a reușit.')
    } finally {
      setResetLoading(false)
    }
  }

  async function handleResetConfirm(e) {
    e.preventDefault()
    setConfirmError('')
    setConfirmMsg('')
    if (confirmForm.password_nou !== confirmForm.confirm) { setConfirmError('Parolele nu coincid.'); return }
    setConfirmLoading(true)
    try {
      const res = await axios.post('/api/hr/kiosk/reset-confirm', {
        cnp: confirmForm.cnp, cod: confirmForm.cod, password_nou: confirmForm.password_nou
      })
      setConfirmMsg(res.data.message || 'Parola schimbată!')
      setTimeout(() => { setConfirmMsg(''); setAuthScreen('login') }, 2500)
    } catch (err) {
      setConfirmError(err.response?.data?.error || 'Confirmarea nu a reușit.')
    } finally {
      setConfirmLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem(KIOSK_TOKEN_KEY)
    localStorage.removeItem(KIOSK_EMP_KEY)
    localStorage.removeItem(KIOSK_NAME_KEY)
    setKioskToken(null)
    setKioskEmpId(null)
    setKioskEmpName(null)
    setEmployee(null)
    setMyTrips([])
  }

  // ── Leave request ─────────────────────────────────────────────────────────
  async function submitLeave(event) {
    event.preventDefault()
    setLeaveSubmitting(true)
    setError('')
    if (leaveForm.tip === 'CM') {
      try {
        if (!medicalFile) throw new Error('Incarca certificatul medical in format PDF, JPG sau PNG.')
        const form = new FormData()
        Object.entries(leaveForm).forEach(([key, value]) => form.append(key, value ?? ''))
        form.append('file', medicalFile)
        const syncApi = kioskToken ? kioskApi(kioskToken) : api
        await syncApi.post('/hr/kiosk/medical-leave', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 })
        setOnline(true); setLeaveSuccess(true); setLeaveForm(emptyLeaveForm); setMedicalFile(null)
        await loadKiosk(); setTimeout(() => setLeaveSuccess(false), 3000)
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Certificatul medical nu a putut fi transmis.')
      } finally { setLeaveSubmitting(false) }
      return
    }
    const clientId = localId()
    const payload = { ...leaveForm, employee_id: employee.id, uuid: clientId }
    const operation = { id: clientId, type: 'leave_request', created_at: new Date().toISOString(), data: payload }
    try {
      const syncApi = kioskToken ? kioskApi(kioskToken) : api
      const response = await syncApi.post('/hr/kiosk/sync', { operations: [operation] })
      if (response.data?.failed?.length) throw new Error(response.data.failed[0]?.error || 'Eroare.')
      setOnline(true); setLeaveSuccess(true)
      setLeaveForm(emptyLeaveForm)
      await loadKiosk()
      setTimeout(() => setLeaveSuccess(false), 3000)
    } catch (err) {
      if (!isNetworkError(err)) { setError(err.response?.data?.error || err.message); setLeaveSubmitting(false); return }
      const nextQueue = addToQueue(operation)
      setOfflineQueue(nextQueue)
      setOnline(false)
      setLeaveSuccess(true)
      setLeaveForm(emptyLeaveForm)
      setSyncStatus('Cererea a fost salvată pe dispozitiv și se va sincroniza automat.')
      const pendingLeave = { ...payload, id: clientId, zile: businessDaysEstimate(payload.data_start, payload.data_sfarsit), status: 'în așteptare sync', created_at: operation.created_at }
      setMyLeaves(ls => [...ls, pendingLeave])
      setTimeout(() => setLeaveSuccess(false), 3000)
    } finally {
      setLeaveSubmitting(false)
    }
  }

  // ── Verso foaie ───────────────────────────────────────────────────────────
  function openVerso(trip) {
    setVersoTrip(trip)
    setVersoForm({
      activitati: trip.activitati_verso || [],
      km_sosire: trip.km_sosire || '',
      km_necont: trip.km_necont || 0,
      km_cat1: trip.km_cat1 || 0,
      km_cat2: trip.km_cat2 || 0,
      km_cat3: trip.km_cat3 || 0,
      observatii: trip.observatii || ''
    })
    setVersoSig(null)
    setVersoSigNume(trip.semnatura_responsabil_nume || '')
    setVersoSaved(false)
    setVersoActModal(false)
  }

  function addActivitate() {
    const a = { ...versoActForm, id: localId() }
    setVersoForm(f => ({ ...f, activitati: [...f.activitati, a] }))
    setVersoActModal(false)
    setVersoActForm({ locul_plecarii: '', locul_sosirii: '', ziua: '', ora: '08', minut: '00', km_incarcat: 0, km_gol: 0, tone: '', marfa: '' })
  }

  function removeActivitate(id) {
    setVersoForm(f => ({ ...f, activitati: f.activitati.filter(a => a.id !== id) }))
  }

  async function saveVerso() {
    if (!versoTrip) return
    setVersoSaving(true)
    const payload = {
      activitati: versoForm.activitati,
      km_sosire: versoForm.km_sosire,
      km_necont: versoForm.km_necont,
      km_cat1: versoForm.km_cat1,
      km_cat2: versoForm.km_cat2,
      km_cat3: versoForm.km_cat3,
      semnatura_responsabil: versoSig || undefined,
      semnatura_responsabil_nume: versoSigNume,
      observatii: versoForm.observatii
    }
    // Salvare offline
    localStorage.setItem(`infraflow_foaie_${versoTrip.id}_verso`, JSON.stringify({ foaie_id: versoTrip.id, completat_la: new Date().toISOString(), ...payload }))
    const op = { id: localId(), type: 'versoFoaie', foaie_uuid: versoTrip.uuid, data: payload, timestamp: Date.now() }

    // Încearcă online mai întâi
    try {
      const syncApi = kioskToken ? kioskApi(kioskToken) : api
      await syncApi.patch(`/fleet/trip-logs/${versoTrip.uuid}/verso-kiosk`, payload)
      setVersoSaved(true)
      await loadKiosk()
      setTimeout(() => { setVersoTrip(null); setVersoSaved(false) }, 2000)
    } catch (err) {
      if (isNetworkError(err)) {
        const q = addToQueue(op)
        setOfflineQueue(q)
        setOnline(false)
        setVersoSaved(true)
        setSyncStatus('✅ Salvat local. Se va sincroniza când ești în rețea.')
        setTimeout(() => { setVersoTrip(null); setVersoSaved(false) }, 2500)
      } else {
        setError(err.response?.data?.error || 'Verso-ul nu a putut fi salvat.')
      }
    } finally {
      setVersoSaving(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  const zile_estimate = businessDaysEstimate(leaveForm.data_start, leaveForm.data_sfarsit)
  const zile_calendaristice = calendarDaysEstimate(leaveForm.data_start, leaveForm.data_sfarsit)
  const pendingCount = offlineQueue.length

  const activeTrip = myTrips.find(t => t.status === 'deschisa')
  const completedTrips = myTrips.filter(t => t.status === 'completata')
  const closedTrips = myTrips.filter(t => ['inchisa', 'in_faz'].includes(t.status))

  // ════════════════════════════════════════════════════════════════════════════
  // NOT AUTHENTICATED → Auth screens
  // ════════════════════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🏠</div>
            <h1 style={S.title}>Kiosk Angajat</h1>
            <p style={S.sub}>InfraFlow — Self-service</p>
          </div>

          {/* ── LOGIN ── */}
          {authScreen === 'login' && (
            <>
              {loginError && <div style={S.err}>{loginError}</div>}
              <div style={{ marginBottom: '14px', borderRadius: '10px', background: '#ecfdf5', padding: '10px 12px', fontSize: '12px', color: '#065f46' }}>
                Demo șofer: <strong>sofer1</strong> / <strong>demo123</strong>
              </div>
              <form onSubmit={handleKioskLogin}>
                <KField label="Utilizator" value={loginForm.username} onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))} placeholder="username" autoFocus />
                <KField label="Parolă" type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                <button type="submit" disabled={loginLoading || !loginForm.username} style={{ ...S.btn(loginLoading || !loginForm.username), marginBottom: '12px' }}>
                  {loginLoading ? 'Se conectează...' : 'Intră în Kiosk'}
                </button>
              </form>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button style={S.link} onClick={() => { setAuthScreen('activate'); setActError(''); setActSuccess('') }}>Activează cont nou</button>
                <button style={S.link} onClick={() => { setAuthScreen('reset'); setResetError(''); setResetMsg('') }}>Am uitat parola</button>
              </div>
            </>
          )}

          {/* ── ACTIVATE ── */}
          {authScreen === 'activate' && (
            <>
              <div style={{ marginBottom: '16px', fontWeight: 600, color: '#1e293b', fontSize: '15px' }}>Activare cont angajat</div>
              {actError && <div style={S.err}>{actError}</div>}
              {actSuccess && <div style={S.ok}>{actSuccess}</div>}
              {!actSuccess && (
                <form onSubmit={handleActivate}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Tip act identitate</label>
                    <select value={actForm.act_tip} onChange={e => setActForm(f => ({ ...f, act_tip: e.target.value }))} style={S.select}>
                      <option value="CI">Carte de identitate</option>
                      <option value="BI">Buletin de identitate</option>
                      <option value="pasaport">Pașaport</option>
                    </select>
                  </div>
                  <KField label="CNP" maxLength={13} value={actForm.cnp} onChange={e => setActForm(f => ({ ...f, cnp: e.target.value }))} required autoFocus />
                  <div style={S.row2}>
                    <KField label="Serie act" placeholder="NT" maxLength={5} value={actForm.act_serie} onChange={e => setActForm(f => ({ ...f, act_serie: e.target.value }))} required />
                    <KField label="Număr act" placeholder="123456" maxLength={10} value={actForm.act_numar} onChange={e => setActForm(f => ({ ...f, act_numar: e.target.value }))} required />
                  </div>
                  <KField label="Funcția" placeholder="ex: Șofer" value={actForm.functia} onChange={e => setActForm(f => ({ ...f, functia: e.target.value }))} required />
                  <KField label="Alege username" value={actForm.username} onChange={e => setActForm(f => ({ ...f, username: e.target.value }))} required />
                  <KField label="Parolă nouă" type="password" value={actForm.password} onChange={e => setActForm(f => ({ ...f, password: e.target.value }))} required />
                  <KField label="Confirmă parola" type="password" value={actForm.confirm} onChange={e => setActForm(f => ({ ...f, confirm: e.target.value }))} required />
                  <button type="submit" disabled={actLoading} style={{ ...S.btn(actLoading), marginBottom: '12px' }}>
                    {actLoading ? 'Se activează...' : 'Activează cont'}
                  </button>
                </form>
              )}
              <button style={S.link} onClick={() => setAuthScreen('login')}>← Înapoi la login</button>
            </>
          )}

          {/* ── RESET REQUEST ── */}
          {authScreen === 'reset' && (
            <>
              <div style={{ marginBottom: '16px', fontWeight: 600, color: '#1e293b', fontSize: '15px' }}>Resetare parolă</div>
              {resetError && <div style={S.err}>{resetError}</div>}
              {resetMsg && <div style={S.ok}>{resetMsg}</div>}
              {!resetMsg && (
                <form onSubmit={handleResetRequest}>
                  <KField label="CNP" maxLength={13} value={resetForm.cnp} onChange={e => setResetForm(f => ({ ...f, cnp: e.target.value }))} required autoFocus />
                  <div style={S.row2}>
                    <KField label="Serie act" maxLength={5} value={resetForm.act_serie} onChange={e => setResetForm(f => ({ ...f, act_serie: e.target.value }))} required />
                    <KField label="Număr act" maxLength={10} value={resetForm.act_numar} onChange={e => setResetForm(f => ({ ...f, act_numar: e.target.value }))} required />
                  </div>
                  <button type="submit" disabled={resetLoading} style={{ ...S.btn(resetLoading), marginBottom: '12px' }}>
                    {resetLoading ? 'Se trimite...' : 'Solicită cod resetare'}
                  </button>
                </form>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button style={S.link} onClick={() => setAuthScreen('login')}>← Înapoi la login</button>
                <button style={S.link} onClick={() => { setAuthScreen('reset_confirm'); setConfirmError(''); setConfirmMsg('') }}>Am codul →</button>
              </div>
            </>
          )}

          {/* ── RESET CONFIRM ── */}
          {authScreen === 'reset_confirm' && (
            <>
              <div style={{ marginBottom: '16px', fontWeight: 600, color: '#1e293b', fontSize: '15px' }}>Introdu codul primit de la HR</div>
              {confirmError && <div style={S.err}>{confirmError}</div>}
              {confirmMsg && <div style={S.ok}>{confirmMsg}</div>}
              {!confirmMsg && (
                <form onSubmit={handleResetConfirm}>
                  <KField label="CNP" maxLength={13} value={confirmForm.cnp} onChange={e => setConfirmForm(f => ({ ...f, cnp: e.target.value }))} required autoFocus />
                  <KField label="Cod primit de la HR" maxLength={6} placeholder="123456" value={confirmForm.cod} onChange={e => setConfirmForm(f => ({ ...f, cod: e.target.value }))} required />
                  <KField label="Parolă nouă" type="password" value={confirmForm.password_nou} onChange={e => setConfirmForm(f => ({ ...f, password_nou: e.target.value }))} required />
                  <KField label="Confirmă parola" type="password" value={confirmForm.confirm} onChange={e => setConfirmForm(f => ({ ...f, confirm: e.target.value }))} required />
                  <button type="submit" disabled={confirmLoading} style={{ ...S.btn(confirmLoading), marginBottom: '12px' }}>
                    {confirmLoading ? 'Se schimbă...' : 'Schimbă parola'}
                  </button>
                </form>
              )}
              <button style={S.link} onClick={() => setAuthScreen('login')}>← Înapoi la login</button>
            </>
          )}

          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
            InfraFlow v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}
          </p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VERSO MODAL
  // ════════════════════════════════════════════════════════════════════════════
  if (versoTrip) {
    return (
      <div className="min-h-screen bg-slate-900 p-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">✏️ Completează verso</div>
              <div className="text-sm text-slate-300">{versoTrip.nr_foaie} · {versoTrip.asset_label || versoTrip.nr_inmatriculare}</div>
            </div>
            <button onClick={() => setVersoTrip(null)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white">✕ Închide</button>
          </div>

          {versoSaved && (
            <div className="mb-4 rounded-lg bg-green-800 px-4 py-3 text-sm font-medium text-white">
              ✅ {online ? 'Salvat și sincronizat cu serverul.' : 'Salvat local. Se va sincroniza când ești în rețea.'}
            </div>
          )}

          {error && <div className="mb-4 rounded-lg bg-red-800 px-4 py-3 text-sm text-white">{error}</div>}

          <div className="grid gap-4">
            {/* XI. Activități */}
            <div className="rounded-[var(--radius-panel)] bg-white p-4 shadow-[var(--shadow-card)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold text-slate-800">XI. Activități (stații)</div>
                <button onClick={() => setVersoActModal(true)} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white">+ Adaugă stație</button>
              </div>
              {versoForm.activitati.length === 0
                ? <p className="text-sm text-slate-400">Nu există activități adăugate.</p>
                : versoForm.activitati.map((a, i) => (
                  <div key={a.id || i} className="mb-2 flex items-start justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{a.locul_plecarii || '—'} → {a.locul_sosirii || '—'}</div>
                      <div className="text-slate-500">{a.ziua} {a.ora}:{a.minut} · {a.km_incarcat} km înc. / {a.km_gol} km gol{a.tone ? ` · ${a.tone} t` : ''}{a.marfa ? ` · ${a.marfa}` : ''}</div>
                    </div>
                    <button onClick={() => removeActivitate(a.id)} className="text-rose-500 hover:text-rose-700">✕</button>
                  </div>
                ))
              }
            </div>

            {/* XII. Index contor */}
            <div className="rounded-[var(--radius-panel)] bg-white p-4 shadow-[var(--shadow-card)]">
              <div className="mb-3 font-semibold text-slate-800">XII. Index contor</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Km la sosire *</label>
                  <input type="number" value={versoForm.km_sosire} onChange={e => setVersoForm(f => ({ ...f, km_sosire: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="ex: 12500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Km necontorizați</label>
                  <input type="number" value={versoForm.km_necont} onChange={e => setVersoForm(f => ({ ...f, km_necont: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={0} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Km categorie I</label>
                  <input type="number" value={versoForm.km_cat1} onChange={e => setVersoForm(f => ({ ...f, km_cat1: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Km categorie II</label>
                  <input type="number" value={versoForm.km_cat2} onChange={e => setVersoForm(f => ({ ...f, km_cat2: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Km categorie III</label>
                  <input type="number" value={versoForm.km_cat3} onChange={e => setVersoForm(f => ({ ...f, km_cat3: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
            </div>

            {/* Observații */}
            <div className="rounded-[var(--radius-panel)] bg-white p-4 shadow-[var(--shadow-card)]">
              <label className="mb-1 block text-sm font-medium text-slate-700">Observații generale</label>
              <textarea value={versoForm.observatii} onChange={e => setVersoForm(f => ({ ...f, observatii: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Orice detalii relevante..." />
            </div>

            {/* Semnătură responsabil */}
            <div className="rounded-[var(--radius-panel)] bg-white p-4 shadow-[var(--shadow-card)]">
              <div className="mb-3 font-semibold text-slate-800">Semnătură responsabil lucrare</div>
              {versoSig
                ? (
                  <div>
                    <img src={versoSig} alt="Semnătură" className="mb-2 rounded border border-slate-200" style={{ maxHeight: '100px' }} />
                    <div className="mb-2 text-sm text-slate-600">Responsabil: <strong>{versoSigNume || '—'}</strong></div>
                    <div className="flex gap-2">
                      <button onClick={() => { setVersoSig(null); setVersoSigModal(true) }} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm text-white">🔄 Refă semnătura</button>
                    </div>
                  </div>
                )
                : (
                  <button onClick={() => setVersoSigModal(true)}
                    className="w-full rounded-lg border-2 border-dashed border-slate-300 py-6 text-sm text-slate-500 hover:border-primary-400 hover:text-primary-600">
                    ✍️ Semnătură responsabil lucrare
                  </button>
                )
              }
            </div>

            <button onClick={saveVerso} disabled={versoSaving || !versoForm.km_sosire}
              className={`rounded-xl py-4 text-base font-semibold text-white ${versoSaving || !versoForm.km_sosire ? 'bg-slate-400' : 'bg-green-700 hover:bg-green-800'}`}>
              {versoSaving ? 'Se salvează...' : online ? '✅ Salvează și trimite' : '💾 Salvează (offline)'}
            </button>
          </div>

          {/* Adaugă activitate modal */}
          <Modal open={versoActModal} title="Adaugă stație" onClose={() => setVersoActModal(false)} size="md">
            <div className="grid gap-4">
              <div className="grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Locul plecării</label>
                    <input value={versoActForm.locul_plecarii} onChange={e => setVersoActForm(f => ({ ...f, locul_plecarii: e.target.value }))}
                      className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" placeholder="ex: Depou central" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Locul sosirii</label>
                    <input value={versoActForm.locul_sosirii} onChange={e => setVersoActForm(f => ({ ...f, locul_sosirii: e.target.value }))}
                      className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" placeholder="ex: Str. Florilor" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Ziua</label>
                      <input type="date" value={versoActForm.ziua} onChange={e => setVersoActForm(f => ({ ...f, ziua: e.target.value }))}
                        className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Ora</label>
                      <input type="number" min={0} max={23} value={versoActForm.ora} onChange={e => setVersoActForm(f => ({ ...f, ora: e.target.value }))}
                        className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Minut</label>
                      <input type="number" min={0} max={59} value={versoActForm.minut} onChange={e => setVersoActForm(f => ({ ...f, minut: e.target.value }))}
                        className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Km încărcat</label>
                      <input type="number" value={versoActForm.km_incarcat} onChange={e => setVersoActForm(f => ({ ...f, km_incarcat: Number(e.target.value) || 0 }))}
                        className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Km gol</label>
                      <input type="number" value={versoActForm.km_gol} onChange={e => setVersoActForm(f => ({ ...f, km_gol: Number(e.target.value) || 0 }))}
                        className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Tone (opțional)</label>
                      <input type="number" value={versoActForm.tone} onChange={e => setVersoActForm(f => ({ ...f, tone: e.target.value }))}
                        className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Marfă (opțional)</label>
                      <input value={versoActForm.marfa} onChange={e => setVersoActForm(f => ({ ...f, marfa: e.target.value }))}
                        className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                  </div>
                </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <Button variant="secondary" onClick={() => setVersoActModal(false)}>Anulează</Button>
                <Button onClick={addActivitate}>Adaugă</Button>
              </div>
            </div>
          </Modal>

          <Modal open={versoSigModal} title="Semnătură responsabil lucrare" onClose={() => setVersoSigModal(false)} size="lg">
            <div className="grid gap-4">
              <SignatureCanvas onConfirm={sig => { setVersoSig(sig); setVersoSigModal(false) }} />
              <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Numele responsabilului</label>
                  <input value={versoSigNume} onChange={e => setVersoSigNume(e.target.value)}
                  className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" placeholder="ex: Ion Popescu" />
              </div>
              <div className="flex justify-end border-t border-slate-200 pt-4">
                <Button variant="secondary" onClick={() => setVersoSigModal(false)}>Anulează</Button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary-50 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-2xl text-white shadow-lg">🏢</div>
          <div className="flex-1">
            <div className="text-xl font-bold text-slate-900">Bună ziua, {kioskEmpName || user?.name || user?.username || 'Utilizator'}! 👋</div>
            <div className="text-sm text-slate-500">
              {kioskEmpName || user?.name || user?.username || 'Utilizator'}
              {kioskToken && <span className="ml-2 text-xs text-slate-400">(cont Kiosk)</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={online ? 'success' : 'warning'}>{online ? 'Online local' : 'Offline'}</Badge>
            {pendingCount > 0 && <Badge tone="warning">{pendingCount} în coadă</Badge>}
            {kioskToken && (
              <button onClick={logout} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                Deconectare
              </button>
            )}
            <button
              onClick={() => {
                if (window.electronAPI) {
                  window.location.href = '/'
                } else {
                  window.history.back()
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              title="Înapoi la aplicație"
            >
              ← Înapoi
            </button>
          </div>
        </div>

        {(!online || pendingCount > 0 || syncStatus) && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{online ? 'Sincronizare Kiosk' : 'Mod offline activ'}</div>
                <div>{syncStatus || 'Cererile sunt păstrate pe dispozitiv și se trimit automat.'}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { syncOffline(); syncVerso() }}>Sincronizează</Button>
            </div>
          </div>
        )}

        {error && <div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {loading ? (
          <Card><p className="py-8 text-center text-sm text-slate-400">Se încarcă datele...</p></Card>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <div className="text-sm font-semibold text-slate-700">⏱️ Pontaj luna curentă</div>
              <div className="mt-2 text-2xl font-bold text-primary-700">{kioskSummary?.pontaj_luna?.ore_total || 0} ore</div>
              <div className="text-xs text-slate-500">{kioskSummary?.pontaj_luna?.zile_lucrate || 0} zile lucrate</div>
              </Card>
              <Card>
                <div className="text-sm font-semibold text-slate-700">📋 Cereri în așteptare</div>
                <div className="mt-2 text-2xl font-bold text-primary-700">{kioskSummary?.cereri_asteptare?.length || 0}</div>
                <div className="text-xs text-slate-500">cereri personale nesoluționate</div>
              </Card>
            </div>

            {!kioskToken && kioskSummary?.fluturasi?.length ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 font-semibold">Fluturasi de salariu</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {kioskSummary.fluturasi.map(item => <button type="button" key={`${item.run_id}-${item.id}`} onClick={async () => { const response = await api.get(item.url, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60000) }} className="rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"><strong>{item.luna}</strong><span className="float-right">{Number(item.net || 0).toFixed(2)} RON</span></button>)}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => document.getElementById('kiosk-leave-request')?.scrollIntoView({ behavior: 'smooth' })}>📝 Cerere concediu</Button>
              <Button variant="secondary" onClick={() => {
                const token = localStorage.getItem('infraflow_token')
                if (employee && token) window.open(`/api/hr/employees/${employee.id}/adeverinta?tip=salariat&token=${encodeURIComponent(token)}`, '_blank')
              }}>📄 Solicită adeverință</Button>
            </div>

            {myDocuments.length > 0 && (
              <Card>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">📁 Documentele mele HR</div>
                    <div className="text-xs text-slate-500">Documente transmise de HR pentru consultare și confirmare.</div>
                  </div>
                  {myDocuments.some(item => !item.acknowledged_at) ? <Badge tone="warning">{myDocuments.filter(item => !item.acknowledged_at).length} neconfirmate</Badge> : <Badge tone="success">toate confirmate</Badge>}
                </div>
                <div className="grid gap-2">
                  {myDocuments.map(item => (
                    <div key={item.id} className={`rounded-lg border px-3 py-2 text-sm ${item.acknowledged_at ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-800">{item.denumire || item.file_name}</div>
                          <div className="text-xs text-slate-500">{item.tip || 'document'} · {item.data_document || String(item.created_at || '').slice(0, 10) || '—'}</div>
                          {item.acknowledged_at ? <div className="mt-1 text-xs text-emerald-700">Confirmat la {String(item.acknowledged_at).replace('T', ' ').slice(0, 16)}</div> : <div className="mt-1 text-xs text-amber-700">Necesită confirmare de luare la cunoștință.</div>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openKioskDocument(item)}>Deschide</Button>
                          {!item.acknowledged_at ? <Button size="sm" onClick={() => acknowledgeKioskDocument(item)}>Am luat la cunoștință</Button> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {kioskSummary?.echipamente && (
              <Card>
                <div className="mb-2 text-sm font-semibold text-slate-700">🦺 Echipamente și inventar în răspundere</div>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between"><span>Echipamente protecție</span><strong>{Number(kioskSummary.echipamente.total_echipamente || 0).toFixed(2)} lei</strong></div>
                  <div className="flex justify-between"><span>Scule și unelte</span><strong>{Number(kioskSummary.echipamente.total_scule || 0).toFixed(2)} lei</strong></div>
                  <div className="flex justify-between"><span>Alte obiecte inventar</span><strong>{Number(kioskSummary.echipamente.total_inventar || 0).toFixed(2)} lei</strong></div>
                  <div className="mt-1 flex justify-between border-t border-amber-200 pt-2 text-amber-900"><span className="font-semibold">Total răspundere</span><strong>{Number(kioskSummary.echipamente.total_valoare || 0).toFixed(2)} lei ⚠️</strong></div>
                </div>
              </Card>
            )}

            {kioskSummary?.program?.length > 0 && (
              <Card>
                <div className="mb-2 text-sm font-semibold text-slate-700">🗓️ Program lucru / ture</div>
                <div className="grid gap-2">
                  {kioskSummary.program.slice(0, 7).map(item => (
                    <div key={`${item.data}-${item.tura_id || ''}`} className="flex justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <span>{String(item.data || '').slice(0, 10)}</span>
                      <span className="font-medium text-slate-700">{item.tura_nume || 'Program stabilit'}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {kioskSummary?.notificari?.length > 0 && (
              <Card>
                <div className="mb-2 text-sm font-semibold text-slate-700">🔔 Notificările mele</div>
                <div className="grid gap-2">
                  {kioskSummary.notificari.slice(0, 5).map((item, index) => (
                    <div key={item.id || `${item.type || item.event || 'notificare'}-${index}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      {item.message || item.mesaj || item.event || item.type || 'Notificare personală'}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Card angajat ── */}
            {employee ? (
              <Card>
                <div className="flex items-center gap-4">
                  {employee.photo_url
                    ? <img src={employee.photo_url} alt="Fotografie" className="h-16 w-16 rounded-xl object-cover ring-2 ring-primary-200" onError={e => { e.target.style.display = 'none' }} />
                    : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-3xl">👤</div>
                  }
                  <div>
                    <div className="text-lg font-bold text-slate-900">{[employee.prenume, employee.nume].filter(Boolean).join(' ')}</div>
                    <div className="text-sm text-slate-600">{employee.functia || '—'}</div>
                    <div className="text-xs text-slate-400">{employee.department_name || employee.department || '—'} · Marcă: {employee.marca || '—'}</div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="py-8 text-center">
                  <div className="text-4xl">👤</div>
                  <div className="mt-3 font-semibold text-slate-700">
                    {kioskEmpName ? `Salut, ${kioskEmpName}!` : 'Contul nu este asociat unui angajat'}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {kioskEmpName ? 'Datele HR nu sunt disponibile momentan.' : 'Contactează HR pentru asociere.'}
                  </div>
                </div>
              </Card>
            )}

            {/* ── FOI DE PARCURS PROPRII (TASK 2 + 3) ── */}
            {myTrips.length > 0 && (
              <Card>
                <div className="mb-3 text-sm font-semibold text-slate-700">🚗 Foile mele de parcurs</div>

                {/* Foaia activă → card prominent cu buton Completează */}
                {activeTrip && (
                  <div className="mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">{activeTrip.nr_foaie}</div>
                        <div className="text-sm text-slate-600">{activeTrip.asset_label || activeTrip.nr_inmatriculare || '—'}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Data: {activeTrip.data} · Km plecare: {activeTrip.km_plecare}
                        </div>
                      </div>
                      <Badge tone="warning">ÎN CURSĂ</Badge>
                    </div>
                    <button onClick={() => openVerso(activeTrip)}
                      className="mt-3 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">
                      ✏️ Completează verso (sosire + km)
                    </button>
                  </div>
                )}

                {/* Foile completate */}
                {completedTrips.map(trip => (
                  <div key={trip.uuid} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{trip.nr_foaie}</span>
                      <span className="ml-2 text-slate-500">{trip.asset_label || trip.nr_inmatriculare}</span>
                      <span className="ml-2 text-xs text-slate-400">{trip.data}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="warning">🟡 Completată</Badge>
                      <button onClick={() => openVerso(trip)} className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-300">Editează</button>
                    </div>
                  </div>
                ))}

                {/* Foile închise */}
                {closedTrips.slice(0, 10).map(trip => (
                  <div key={trip.uuid} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{trip.nr_foaie}</span>
                      <span className="ml-2 text-slate-500">{trip.asset_label || trip.nr_inmatriculare}</span>
                      <span className="ml-2 text-xs text-slate-400">{trip.data}</span>
                    </div>
                    <Badge tone="success">✅ Închisă</Badge>
                  </div>
                ))}
              </Card>
            )}

            {/* ── Sold CO ── */}
            {coBalance && (
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">🏖️ Sold concediu {coBalance.year}</div>
                    <div className="mt-1 text-3xl font-bold text-primary-700">{coBalance.zile_ramase} <span className="text-base font-normal text-slate-500">zile rămase</span></div>
                    <div className="text-xs text-slate-400">{coBalance.zile_efectuate} efectuate din {coBalance.zile_drept} totale</div>
                  </div>
                  <div className="text-5xl">🌴</div>
                </div>
                <div className="mt-3">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-3 rounded-full bg-primary-500 transition-all" style={{ width: `${Math.min(100, Math.round((coBalance.zile_efectuate / Math.max(1, coBalance.zile_drept)) * 100))}%` }} />
                  </div>
                </div>
              </Card>
            )}

            {/* ── Documente expirare ── */}
            {employee && [
              { label: 'Permis de conducere', date: employee.data_expirare_permis, icon: '🪪' },
              { label: 'Autorizație ISCIR', date: employee.data_expirare_iscir, icon: '⚙️' },
              { label: 'Adeverință medicală', date: employee.adeverinta_medicala, icon: '🏥' },
              { label: 'Contract', date: employee.data_expirare_contract, icon: '📄' },
            ].some(d => alertTone(daysUntil(d.date))) && (
              <Card>
                <div className="mb-2 text-sm font-semibold text-slate-700">⚠️ Documente care expiră în curând</div>
                <div className="grid gap-2">
                  {[
                    { label: 'Permis de conducere', date: employee.data_expirare_permis, icon: '🪪' },
                    { label: 'Autorizație ISCIR', date: employee.data_expirare_iscir, icon: '⚙️' },
                    { label: 'Adeverință medicală', date: employee.adeverinta_medicala, icon: '🏥' },
                    { label: 'Contract', date: employee.data_expirare_contract, icon: '📄' },
                  ].map(d => {
                    const days = daysUntil(d.date)
                    const tone = alertTone(days)
                    if (!tone) return null
                    return (
                      <div key={d.label} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${tone === 'danger' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                        <span className="text-xl">{d.icon}</span>
                        <div className="flex-1 text-sm">
                          <div className={`font-medium ${tone === 'danger' ? 'text-rose-800' : 'text-amber-800'}`}>{d.label}</div>
                          <div className={tone === 'danger' ? 'text-rose-600' : 'text-amber-600'}>
                            {days < 0 ? `Expirat de ${Math.abs(days)} zile` : `Expiră în ${days} zile (${d.date})`}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* ── Cerere concediu ── */}
            {employee && (
              <Card id="kiosk-leave-request">
                <div className="mb-3 text-sm font-semibold text-slate-700">📝 Cerere de concediu</div>
                {leaveSuccess ? (
                  <div className="rounded-md bg-green-50 px-3 py-3 text-sm font-medium text-green-800">
                    ✅ Cererea a fost {online ? 'transmisă către HR.' : 'salvată local și se va sincroniza.'}
                  </div>
                ) : (
                  <form className="grid gap-3" onSubmit={submitLeave}>
                    <Select label="Tip concediu" value={leaveForm.tip} onChange={e => setLeaveForm({ ...leaveForm, tip: e.target.value })} options={[
                      { value: 'CO', label: 'Concediu de odihnă (CO)' },
                      { value: 'CM', label: 'Concediu medical (CM)' },
                      { value: 'CFP', label: 'Concediu fără plată (CFP)' },
                      { value: 'fara_plata', label: 'Fără plată' },
                      { value: 'studii', label: 'Studii' },
                      { value: 'altele', label: 'Altele' },
                    ]} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input label="Data start" type="date" value={leaveForm.data_start} onChange={e => setLeaveForm({ ...leaveForm, data_start: e.target.value })} required />
                      <Input label="Data sfârșit" type="date" value={leaveForm.data_sfarsit} onChange={e => setLeaveForm({ ...leaveForm, data_sfarsit: e.target.value })} required />
                    </div>
                    {leaveForm.tip === 'CM' ? (
                      <div className="grid gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <div><div className="font-semibold text-rose-900">Certificat de concediu medical</div><div className="text-xs text-rose-700">Datele vor fi comparate de HR cu documentul incarcat.</div></div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <Input label="Serie certificat" value={leaveForm.serie} onChange={e => setLeaveForm({ ...leaveForm, serie: e.target.value })} required />
                          <Input label="Numar certificat" value={leaveForm.numar} onChange={e => setLeaveForm({ ...leaveForm, numar: e.target.value })} required />
                          <Select label="Tip certificat" value={leaveForm.tip_certificat} onChange={e => setLeaveForm({ ...leaveForm, tip_certificat: e.target.value })} options={[{ value: 'initial', label: 'Initial' }, { value: 'continuare', label: 'In continuare' }]} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <Input label="Data acordarii" type="date" value={leaveForm.data_acordarii} onChange={e => setLeaveForm({ ...leaveForm, data_acordarii: e.target.value })} required />
                          <Input label="Cod indemnizatie" value={leaveForm.cod_indemnizatie} onChange={e => setLeaveForm({ ...leaveForm, cod_indemnizatie: e.target.value })} placeholder="ex. 01" required />
                          <Input label="Cod diagnostic / boala" value={leaveForm.cod_diagnostic} onChange={e => setLeaveForm({ ...leaveForm, cod_diagnostic: e.target.value })} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <Input label="Nume medic" value={leaveForm.medic_nume} onChange={e => setLeaveForm({ ...leaveForm, medic_nume: e.target.value })} required />
                          <Input label="Cod parafa" value={leaveForm.cod_parafa} onChange={e => setLeaveForm({ ...leaveForm, cod_parafa: e.target.value })} required />
                          <Input label="Unitate medicala emitenta" value={leaveForm.unitate_emitenta} onChange={e => setLeaveForm({ ...leaveForm, unitate_emitenta: e.target.value })} required />
                        </div>
                        <div className="rounded-md bg-white px-3 py-2 text-sm text-rose-900">Perioada certificatului: <strong>{zile_calendaristice}</strong> zile calendaristice.</div>
                        <Input label="Document justificativ (PDF, JPG sau PNG, max. 10 MB)" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e => setMedicalFile(e.target.files?.[0] || null)} required />
                      </div>
                    ) : null}
                    {zile_estimate > 0 && (
                      <div className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-800">
                        Estimat: <strong>{zile_estimate}</strong> zile lucrătoare
                        {coBalance && leaveForm.tip === 'CO' ? ` · Sold după: ${Math.max(0, coBalance.zile_ramase - zile_estimate)} zile` : ''}
                      </div>
                    )}
                    <Input label="Motiv (opțional)" value={leaveForm.motiv} onChange={e => setLeaveForm({ ...leaveForm, motiv: e.target.value })} />
                    <Button type="submit" disabled={leaveSubmitting || !leaveForm.data_start || !leaveForm.data_sfarsit || (leaveForm.tip === 'CM' && (!medicalFile || !leaveForm.serie || !leaveForm.numar || !leaveForm.data_acordarii || !leaveForm.cod_indemnizatie || !leaveForm.medic_nume || !leaveForm.cod_parafa || !leaveForm.unitate_emitenta))}>
                      {leaveSubmitting ? 'Se salvează...' : leaveForm.tip === 'CM' ? '📎 Trimite certificatul catre HR' : online ? '📨 Trimite cererea' : '💾 Salvează offline'}
                    </Button>
                  </form>
                )}
              </Card>
            )}

            {/* ── Istoricul cererilor ── */}
            {myLeaves.length > 0 && (
              <Card>
                <div className="mb-2 text-sm font-semibold text-slate-700">📋 Istoricul cererilor mele</div>
                <div className="grid gap-2">
                  {myLeaves.slice().reverse().slice(0, 10).map(l => (
                    <div key={l.uuid || l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{l.tip}</span>
                        <span className="ml-2 text-slate-500">{l.data_start} — {l.data_sfarsit}</span>
                        {l.zile ? <span className="ml-1 text-xs text-slate-400">({l.zile} zile)</span> : null}
                      </div>
                      <Badge tone={leaveTone(l.status)}>{l.status || 'cerut'}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Autorizații ── */}
            {myAuth.length > 0 && (
              <Card>
                <div className="mb-2 text-sm font-semibold text-slate-700">🪪 Autorizațiile mele</div>
                <div className="grid gap-2">
                  {myAuth.map(a => {
                    const days = daysUntil(a.data_expirare)
                    const tone = alertTone(days)
                    return (
                      <div key={a.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${tone ? (tone === 'danger' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50') : 'border-slate-200'}`}>
                        <div>
                          <span className="font-medium">{a.tip || a.tip_autorizatie || 'Autorizație'}</span>
                          {a.numar || a.nr ? <span className="ml-2 text-slate-500">Nr. {a.numar || a.nr}</span> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{a.data_expirare || '—'}</span>
                          {tone ? <Badge tone={tone}>{days < 0 ? 'Expirat' : `${days} zile`}</Badge> : <Badge tone="success">Valid</Badge>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
