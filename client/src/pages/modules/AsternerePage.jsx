/**
 * InfraFlow — Modul Asternere Asfalt
 * §67 AGENTS.md
 *
 * Tabs: Dashboard | Lucrări | Rapoarte zilnice | Progres lucrări | Consum asfalt
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import api from '../../api/client'

// ─── constante ────────────────────────────────────────────────────────────────

const TABS = ['Dashboard', 'Lucrări', 'Rapoarte zilnice', 'Progres lucrări', 'Consum asfalt']

const STRATURI = [
  { value: 'fundatie', label: 'Fundație' },
  { value: 'legatura', label: 'Legătură' },
  { value: 'uzura',    label: 'Uzură' },
]

const STATUS_LUCRARE = [
  { value: 'activa',   label: 'Activă' },
  { value: 'finalizata', label: 'Finalizată' },
  { value: 'suspendata', label: 'Suspendată' },
  { value: 'anulata',  label: 'Anulată' },
]

const STRAT_LABELS = { fundatie: 'Fundație', legatura: 'Legătură', uzura: 'Uzură' }

// ─── helpers UI ───────────────────────────────────────────────────────────────

function fmtNum(v, dec = 0) {
  const n = Number(v || 0)
  return n.toLocaleString('ro-RO', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function statusBadge(status) {
  const map = {
    activa:     'bg-green-100 text-green-700',
    finalizata: 'bg-blue-100 text-blue-700',
    suspendata: 'bg-yellow-100 text-yellow-700',
    anulata:    'bg-red-100 text-red-700',
  }
  const cls = map[status] || 'bg-slate-100 text-slate-600'
  const lbl = STATUS_LUCRARE.find(s => s.value === status)?.label || status
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{lbl}</span>
}

function stratBadge(strat) {
  const map = {
    fundatie: 'bg-amber-100 text-amber-700',
    legatura: 'bg-sky-100 text-sky-700',
    uzura:    'bg-violet-100 text-violet-700',
  }
  const cls = map[strat] || 'bg-slate-100 text-slate-600'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{STRAT_LABELS[strat] || strat}</span>
}

function ProgressBar({ value, color = 'bg-primary-500' }) {
  const pct = Math.min(100, Math.max(0, Number(value || 0)))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function KpiCard({ icon, label, value, sub, color = 'text-primary-600' }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-slate-200 bg-white p-[var(--card-padding)] shadow-[var(--shadow-card)]">
      <div className="mb-1 flex items-center gap-2 text-slate-500 text-sm">{icon} {label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

// ─── Modal generic ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 pt-12">
      <div className={`relative max-h-[calc(100vh-4rem)] min-h-[18rem] min-w-[min(22rem,calc(100vw-2rem))] resize overflow-hidden rounded-[var(--radius-panel)] border border-slate-200 bg-white shadow-xl ${wide ? 'w-[min(48rem,calc(100vw-2rem))]' : 'w-[min(36rem,calc(100vw-2rem))]'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded-[var(--radius-control)] px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600">×</button>
        </div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
      {error && <p className="mt-0.5 text-xs text-red-500">{error}</p>}
    </div>
  )
}

const inputCls = 'h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-[var(--control-px)] text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100'
const selectCls = inputCls

// ─── COMPONENT PRINCIPAL ─────────────────────────────────────────────────────

export default function AsternerePage() {
  const [tab, setTab] = useState('Dashboard')
  const [lucrari, setLucrari]   = useState([])
  const [rapoarte, setRapoarte] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [costCenters, setCostCenters] = useState([])
  const [fleetAssets, setFleetAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Lucrare modal
  const [showLucrare, setShowLucrare] = useState(false)
  const [editLucrare, setEditLucrare] = useState(null)
  const [lucrareForm, setLucrareForm] = useState({})
  const [lucrareErr, setLucrareErr]   = useState({})

  // Raport modal
  const [showRaport, setShowRaport] = useState(false)
  const [editRaport, setEditRaport] = useState(null)
  const [raportForm, setRaportForm] = useState({})
  const [raportErr, setRaportErr]   = useState({})

  // Filtre rapoarte
  const [filterLucrareId, setFilterLucrareId] = useState('')
  const [filterLuna, setFilterLuna] = useState(() => new Date().toISOString().slice(0, 7))

  // Progres
  const [progresLucrareId, setProgresLucrareId] = useState('')
  const [progresData, setProgresData] = useState(null)

  // Consum
  const [consumData, setConsumData] = useState(null)
  const [consumFilter, setConsumFilter] = useState('')

  // ─── loaders ────────────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const r = await api.get('/asternere/dashboard')
      setDashboard(r.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Eroare la dashboard')
    } finally { setLoading(false) }
  }, [])

  const loadLucrari = useCallback(async () => {
    try {
      const r = await api.get('/asternere/lucrari')
      setLucrari(r.data.lucrari || [])
    } catch (e) { setError(e.response?.data?.error || 'Eroare la lucrări') }
  }, [])

  const loadRapoarte = useCallback(async () => {
    try {
      const params = {}
      if (filterLucrareId) params.lucrare_id = filterLucrareId
      if (filterLuna)      params.luna        = filterLuna
      const r = await api.get('/asternere/rapoarte-zilnice', { params })
      setRapoarte(r.data.rapoarte || [])
    } catch (e) { setError(e.response?.data?.error || 'Eroare la rapoarte') }
  }, [filterLucrareId, filterLuna])

  const loadProgres = useCallback(async (lid) => {
    if (!lid) return
    try {
      const r = await api.get(`/asternere/lucrari/${lid}/progres`)
      setProgresData(r.data)
    } catch (e) { setError(e.response?.data?.error || 'Eroare la progres') }
  }, [])

  const loadConsum = useCallback(async () => {
    try {
      const params = consumFilter ? { lucrare_id: consumFilter } : {}
      const r = await api.get('/asternere/consum-asfalt', { params })
      setConsumData(r.data)
    } catch (e) { setError(e.response?.data?.error || 'Eroare la consum') }
  }, [consumFilter])

  const loadCostCenters = useCallback(async () => {
    try {
      const r = await api.get('/controlling/cost-centers')
      setCostCenters(r.data.costCenters || r.data.cost_centers || [])
    } catch (_) {}
  }, [])

  const loadFleetAssets = useCallback(async () => {
    try {
      const r = await api.get('/fleet-assets')
      setFleetAssets(r.data.assets || r.data.utilaje || [])
    } catch (_) {}
  }, [])

  useEffect(() => { loadDashboard(); loadLucrari(); loadCostCenters(); loadFleetAssets() }, [])

  useEffect(() => {
    if (tab === 'Rapoarte zilnice') loadRapoarte()
  }, [tab, filterLucrareId, filterLuna])

  useEffect(() => {
    if (tab === 'Progres lucrări' && progresLucrareId) loadProgres(progresLucrareId)
  }, [tab, progresLucrareId])

  useEffect(() => {
    if (tab === 'Consum asfalt') loadConsum()
  }, [tab, consumFilter])

  // ─── handlers lucrare ───────────────────────────────────────────────────────

  function openLucrareCreate() {
    setEditLucrare(null)
    setLucrareForm({ data_start: new Date().toISOString().slice(0, 10) })
    setLucrareErr({})
    setShowLucrare(true)
  }

  function openLucrareEdit(l) {
    setEditLucrare(l)
    setLucrareForm({ ...l })
    setLucrareErr({})
    setShowLucrare(true)
  }

  async function saveLucrare(e) {
    e.preventDefault()
    const errs = {}
    if (!lucrareForm.denumire?.trim()) errs.denumire = 'Obligatoriu'
    if (Object.keys(errs).length) { setLucrareErr(errs); return }

    try {
      if (editLucrare) {
        await api.patch(`/asternere/lucrari/${editLucrare.id}`, lucrareForm)
      } else {
        await api.post('/asternere/lucrari', lucrareForm)
      }
      setShowLucrare(false)
      await loadLucrari()
      await loadDashboard()
    } catch (e) {
      setLucrareErr({ global: e.response?.data?.error || 'Eroare la salvare' })
    }
  }

  async function deleteLucrare(id) {
    if (!window.confirm('Anulezi această lucrare?')) return
    try {
      await api.delete(`/asternere/lucrari/${id}`)
      await loadLucrari()
      await loadDashboard()
    } catch (e) { setError(e.response?.data?.error || 'Eroare') }
  }

  // ─── handlers raport ────────────────────────────────────────────────────────

  function openRaportCreate() {
    setEditRaport(null)
    setRaportForm({
      data: new Date().toISOString().slice(0, 10),
      strat: 'uzura',
      utilaje: [],
      lucrare_id: filterLucrareId || '',
    })
    setRaportErr({})
    setShowRaport(true)
  }

  function openRaportEdit(r) {
    setEditRaport(r)
    setRaportForm({ ...r, utilaje: r.utilaje || [] })
    setRaportErr({})
    setShowRaport(true)
  }

  async function saveRaport(e) {
    e.preventDefault()
    const errs = {}
    if (!raportForm.lucrare_id) errs.lucrare_id = 'Selectați lucrarea'
    if (!raportForm.data) errs.data = 'Obligatoriu'
    if (Object.keys(errs).length) { setRaportErr(errs); return }

    try {
      if (editRaport) {
        await api.patch(`/asternere/rapoarte-zilnice/${editRaport.id}`, raportForm)
      } else {
        await api.post('/asternere/rapoarte-zilnice', raportForm)
      }
      setShowRaport(false)
      await loadRapoarte()
      await loadDashboard()
      if (progresLucrareId === raportForm.lucrare_id) loadProgres(progresLucrareId)
    } catch (e) {
      setRaportErr({ global: e.response?.data?.error || 'Eroare la salvare' })
    }
  }

  async function deleteRaport(id) {
    if (!window.confirm('Ștergi acest raport?')) return
    try {
      await api.delete(`/asternere/rapoarte-zilnice/${id}`)
      await loadRapoarte()
      await loadDashboard()
    } catch (e) { setError(e.response?.data?.error || 'Eroare') }
  }

  // ─── toggle utilaj în raport ─────────────────────────────────────────────

  function toggleUtilaj(asset_id) {
    setRaportForm(prev => {
      const list = Array.isArray(prev.utilaje) ? prev.utilaje : []
      const exists = list.find(u => u.asset_id === asset_id)
      if (exists) {
        return { ...prev, utilaje: list.filter(u => u.asset_id !== asset_id) }
      } else {
        const asset = fleetAssets.find(a => a.id === asset_id || a.uuid === asset_id)
        return {
          ...prev,
          utilaje: [...list, { asset_id, label: asset?.nrInmatriculare || asset?.cod || asset_id, ore: 0 }],
        }
      }
    })
  }

  function setUtilajOre(asset_id, ore) {
    setRaportForm(prev => ({
      ...prev,
      utilaje: (prev.utilaje || []).map(u =>
        u.asset_id === asset_id ? { ...u, ore: Number(ore) } : u
      ),
    }))
  }

  // ─── print raport de asternere ───────────────────────────────────────────

  function printProgres(data) {
    if (!data) return
    const { lucrare, total_mp_planificati, total_mp_realizati, total_tone_consumate,
            procent_finalizare, consum_per_strat, rapoarte } = data
    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(`<!DOCTYPE html><html lang="ro"><head><meta charset="utf-8">
      <title>Progres — ${lucrare?.denumire || ''}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:30px;font-size:13px}
        h2{color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:6px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th{background:#1e3a5f;color:#fff;padding:7px 10px;text-align:left;font-size:12px}
        td{padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}
        .kpi{display:inline-block;margin:8px 16px 8px 0;padding:10px 18px;background:#f1f5f9;border-radius:8px}
        .kpi-v{font-size:22px;font-weight:bold;color:#1e3a5f}
        .kpi-l{font-size:11px;color:#64748b;margin-top:2px}
        .progress-bar{height:14px;background:#e5e7eb;border-radius:7px;overflow:hidden;margin-top:4px}
        .progress-fill{height:14px;background:#1e3a5f;border-radius:7px}
        @media print{@page{size:A4;margin:18mm}}
      </style></head><body>
      <h2>Progres lucrare: ${lucrare?.denumire || 'N/A'}</h2>
      <p><strong>Contract:</strong> ${lucrare?.contract_nr || '—'} &nbsp;|&nbsp;
         <strong>Beneficiar:</strong> ${lucrare?.beneficiar || '—'} &nbsp;|&nbsp;
         <strong>Start:</strong> ${lucrare?.data_start || '—'}</p>
      <div>
        <div class="kpi"><div class="kpi-v">${procent_finalizare}%</div><div class="kpi-l">Procent finalizare</div></div>
        <div class="kpi"><div class="kpi-v">${total_mp_realizati.toLocaleString('ro-RO')} m²</div><div class="kpi-l">mp realizați / ${total_mp_planificati.toLocaleString('ro-RO')} planificați</div></div>
        <div class="kpi"><div class="kpi-v">${total_tone_consumate.toLocaleString('ro-RO')} t</div><div class="kpi-l">Tone consumate</div></div>
      </div>
      <div style="margin:14px 0">
        <div style="font-size:12px;color:#64748b">Progres mp</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${procent_finalizare}%"></div></div>
      </div>
      <h3>Consum per strat</h3>
      <table><tr><th>Strat</th><th>mp realizați</th></tr>
        <tr><td>Fundație</td><td>${consum_per_strat.fundatie.toLocaleString('ro-RO')} m²</td></tr>
        <tr><td>Legătură</td><td>${consum_per_strat.legatura.toLocaleString('ro-RO')} m²</td></tr>
        <tr><td>Uzură</td><td>${consum_per_strat.uzura.toLocaleString('ro-RO')} m²</td></tr>
      </table>
      <h3>Rapoarte zilnice (${rapoarte.length})</h3>
      <table><tr><th>Data</th><th>Sector</th><th>Strat</th><th>Grosime</th><th>mp</th><th>Tone</th><th>T mix</th></tr>
        ${rapoarte.map(r => `<tr>
          <td>${r.data || '—'}</td><td>${r.sector || '—'}</td>
          <td>${STRAT_LABELS[r.strat] || r.strat || '—'}</td>
          <td>${r.grosime_cm ? r.grosime_cm + ' cm' : '—'}</td>
          <td>${r.suprafata_mp?.toLocaleString('ro-RO') || 0}</td>
          <td>${r.cantitate_tone?.toLocaleString('ro-RO') || 0}</td>
          <td>${r.temperatura_mix ? r.temperatura_mix + ' °C' : '—'}</td>
        </tr>`).join('')}
      </table>
      <p style="margin-top:20px;font-size:11px;color:#94a3b8">
        Generat InfraFlow · ${new Date().toLocaleString('ro-RO')}
      </p>
      </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🛣️ Asternere Asfalt</h1>
          <p className="text-sm text-slate-500">Lucrări, rapoarte zilnice, progres și consum</p>
        </div>
        <div className="flex gap-2">
          {tab === 'Lucrări' && (
            <button onClick={openLucrareCreate}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
              + Lucrare nouă
            </button>
          )}
          {tab === 'Rapoarte zilnice' && (
            <button onClick={openRaportCreate}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
              + Raport zilnic
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 pb-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? 'border-b-2 border-primary-600 bg-white text-primary-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      {/* ═══════════════════════ TAB DASHBOARD ════════════════════════ */}
      {tab === 'Dashboard' && (
        <div className="space-y-6">
          {loading ? (
            <div className="py-12 text-center text-slate-400">Se încarcă...</div>
          ) : dashboard ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard icon="🏗️" label="Lucrări active"
                  value={dashboard.lucrari_active} color="text-blue-700" />
                <KpiCard icon="📐" label="mp realizați luna aceasta"
                  value={`${fmtNum(dashboard.total_mp_realizat_luna)} m²`}
                  color="text-green-700" />
                <KpiCard icon="⚖️" label="Tone puse în operă"
                  value={`${fmtNum(dashboard.total_tone_luna, 1)} t`}
                  color="text-amber-700" />
                <KpiCard icon="📊" label="Progres mediu lucrări"
                  value={`${fmtNum(dashboard.progres_mediu, 1)}%`}
                  color="text-violet-700" />
              </div>

              {/* Tabel lucrări active cu progress bar */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-700">
                  Lucrări active
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                        <th className="px-4 py-2">Lucrare</th>
                        <th className="px-4 py-2 text-right">mp plan</th>
                        <th className="px-4 py-2 text-right">mp realizat</th>
                        <th className="px-4 py-2 w-40">Progres</th>
                        <th className="px-4 py-2 text-right">%</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboard.progres_lucrari || []).length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nicio lucrare activă</td></tr>
                      )}
                      {(dashboard.progres_lucrari || []).map(p => (
                        <tr key={p.lucrare_id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium">{p.lucrare}</td>
                          <td className="px-4 py-2 text-right">{fmtNum(p.mp_plan)}</td>
                          <td className="px-4 py-2 text-right">{fmtNum(p.mp_realizat)}</td>
                          <td className="px-4 py-2">
                            <ProgressBar value={p.procent}
                              color={p.procent >= 80 ? 'bg-green-500' : p.procent >= 40 ? 'bg-amber-500' : 'bg-primary-500'} />
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">{fmtNum(p.procent, 1)}%</td>
                          <td className="px-4 py-2">{statusBadge(p.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-400">Date indisponibile</div>
          )}
        </div>
      )}

      {/* ═══════════════════════ TAB LUCRĂRI ════════════════════════ */}
      {tab === 'Lucrări' && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-2">Denumire</th>
                  <th className="px-4 py-2">Contract</th>
                  <th className="px-4 py-2">Beneficiar</th>
                  <th className="px-4 py-2 text-right">mp plan</th>
                  <th className="px-4 py-2 text-right">km</th>
                  <th className="px-4 py-2">Start</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lucrari.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Nicio lucrare. Apasă „+ Lucrare nouă".
                  </td></tr>
                )}
                {lucrari.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">{l.denumire}</td>
                    <td className="px-4 py-2 text-slate-600">{l.contract_nr || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{l.beneficiar || '—'}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(l.mp_planificati)} m²</td>
                    <td className="px-4 py-2 text-right">{l.km_planificati ? fmtNum(l.km_planificati, 1) + ' km' : '—'}</td>
                    <td className="px-4 py-2">{l.data_start || '—'}</td>
                    <td className="px-4 py-2">{statusBadge(l.status)}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => openLucrareEdit(l)}
                          className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50">Editează</button>
                        {l.status !== 'anulata' && (
                          <button onClick={() => deleteLucrare(l.id)}
                            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Anulează</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAB RAPOARTE ZILNICE ════════════════ */}
      {tab === 'Rapoarte zilnice' && (
        <div className="space-y-4">
          {/* Filtre */}
          <div className="flex flex-wrap gap-3">
            <select value={filterLucrareId} onChange={e => setFilterLucrareId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Toate lucrările</option>
              {lucrari.map(l => <option key={l.id} value={l.id}>{l.denumire}</option>)}
            </select>
            <input type="month" value={filterLuna} onChange={e => setFilterLuna(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Lucrare</th>
                    <th className="px-4 py-2">Sector</th>
                    <th className="px-4 py-2">Strat</th>
                    <th className="px-4 py-2 text-right">mp</th>
                    <th className="px-4 py-2 text-right">Tone</th>
                    <th className="px-4 py-2 text-right">T °C</th>
                    <th className="px-4 py-2">Utilaje</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rapoarte.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      Niciun raport. Apasă „+ Raport zilnic".
                    </td></tr>
                  )}
                  {rapoarte.map(r => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs">{r.data}</td>
                      <td className="px-4 py-2">{r.lucrare_denumire}</td>
                      <td className="px-4 py-2 text-slate-600 text-xs">{r.sector || '—'}</td>
                      <td className="px-4 py-2">{stratBadge(r.strat)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{fmtNum(r.suprafata_mp)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{fmtNum(r.cantitate_tone, 2)}</td>
                      <td className="px-4 py-2 text-right">{r.temperatura_mix ? r.temperatura_mix + '°C' : '—'}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {(r.utilaje || []).length > 0
                          ? (r.utilaje || []).map(u => u.label || u.asset_id).join(', ')
                          : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => openRaportEdit(r)}
                            className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50">Editează</button>
                          <button onClick={() => deleteRaport(r.id)}
                            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">Șterge</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAB PROGRES LUCRĂRI ═════════════════ */}
      {tab === 'Progres lucrări' && (
        <div className="space-y-5">
          {/* Select lucrare */}
          <div className="flex items-center gap-3">
            <select
              value={progresLucrareId}
              onChange={e => { setProgresLucrareId(e.target.value); setProgresData(null) }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-[260px]">
              <option value="">— Selectați lucrarea —</option>
              {lucrari.filter(l => l.status !== 'anulata').map(l =>
                <option key={l.id} value={l.id}>{l.denumire}</option>
              )}
            </select>
            {progresData && (
              <button onClick={() => printProgres(progresData)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">
                🖨️ Print raport
              </button>
            )}
          </div>

          {!progresLucrareId && (
            <div className="py-16 text-center text-slate-400">Selectați o lucrare pentru a vedea progresul</div>
          )}

          {progresLucrareId && !progresData && (
            <div className="py-16 text-center text-slate-400">Se încarcă...</div>
          )}

          {progresData && (
            <>
              {/* KPI progres */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard icon="📊" label="Procent finalizare"
                  value={`${progresData.procent_finalizare}%`}
                  color={progresData.procent_finalizare >= 80 ? 'text-green-700' : 'text-primary-700'} />
                <KpiCard icon="📐" label="mp realizați"
                  value={`${fmtNum(progresData.total_mp_realizati)} m²`}
                  sub={`din ${fmtNum(progresData.total_mp_planificati)} planificați`}
                  color="text-blue-700" />
                <KpiCard icon="⚖️" label="Tone consumate"
                  value={`${fmtNum(progresData.total_tone_consumate, 1)} t`}
                  color="text-amber-700" />
                <KpiCard icon="📋" label="Rapoarte zilnice"
                  value={progresData.rapoarte?.length || 0}
                  color="text-slate-700" />
              </div>

              {/* Progress bar mare */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-2 flex justify-between text-sm font-medium">
                  <span className="text-slate-600">Progres total mp</span>
                  <span className="text-primary-700 font-bold">{progresData.procent_finalizare}%</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-4 rounded-full bg-primary-500 transition-all"
                    style={{ width: `${progresData.procent_finalizare}%` }} />
                </div>

                {/* Breakdown per strat */}
                <div className="mt-5 grid grid-cols-3 gap-4">
                  {Object.entries(progresData.consum_per_strat || {}).map(([strat, mp]) => (
                    <div key={strat} className="rounded-lg bg-slate-50 p-3 text-center">
                      <div className="text-xs text-slate-500 mb-1">{STRAT_LABELS[strat] || strat}</div>
                      <div className="text-lg font-bold text-slate-800">{fmtNum(mp)} m²</div>
                      {progresData.total_mp_planificati > 0 && (
                        <div className="text-xs text-slate-400">
                          {fmtNum(mp / progresData.total_mp_planificati * 100, 1)}% din total plan
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Grafic evolutie mp pe zile */}
              {(progresData.evolutie_zile || []).length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="mb-4 font-semibold text-slate-700">Evoluție mp pe zile</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={progresData.evolutie_zile}
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`${fmtNum(v)} m²`]} />
                      <Line type="monotone" dataKey="mp" stroke="#1e40af" strokeWidth={2}
                        dot={{ r: 4 }} name="mp realizați" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabel rapoarte zilnice ale lucrării */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-700">
                  Rapoarte zilnice ({progresData.rapoarte?.length || 0})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="px-4 py-2 text-left">Data</th>
                        <th className="px-4 py-2 text-left">Sector</th>
                        <th className="px-4 py-2 text-left">Strat</th>
                        <th className="px-4 py-2 text-right">Grosime</th>
                        <th className="px-4 py-2 text-right">mp</th>
                        <th className="px-4 py-2 text-right">Tone</th>
                        <th className="px-4 py-2 text-right">T mix</th>
                        <th className="px-4 py-2">Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(progresData.rapoarte || []).map(r => (
                        <tr key={r.id} className="border-b border-slate-50">
                          <td className="px-4 py-2 font-mono text-xs">{r.data}</td>
                          <td className="px-4 py-2 text-xs">{r.sector || '—'}</td>
                          <td className="px-4 py-2">{stratBadge(r.strat)}</td>
                          <td className="px-4 py-2 text-right text-xs">{r.grosime_cm ? r.grosime_cm + ' cm' : '—'}</td>
                          <td className="px-4 py-2 text-right font-semibold">{fmtNum(r.suprafata_mp)}</td>
                          <td className="px-4 py-2 text-right">{fmtNum(r.cantitate_tone, 2)}</td>
                          <td className="px-4 py-2 text-right text-xs">{r.temperatura_mix ? r.temperatura_mix + '°C' : '—'}</td>
                          <td className="px-4 py-2 text-xs text-slate-500 truncate max-w-[120px]">{r.observatii || '—'}</td>
                        </tr>
                      ))}
                      {(progresData.rapoarte || []).length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Niciun raport</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════ TAB CONSUM ASFALT ═══════════════════ */}
      {tab === 'Consum asfalt' && (
        <div className="space-y-5">
          {/* Filtru lucrare */}
          <div className="flex items-center gap-3">
            <select value={consumFilter} onChange={e => setConsumFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-[240px]">
              <option value="">Toate lucrările</option>
              {lucrari.map(l => <option key={l.id} value={l.id}>{l.denumire}</option>)}
            </select>
          </div>

          {/* Total per lucrare */}
          {consumData && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-700">
                  Total tone per lucrare
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="px-4 py-2 text-left">Lucrare</th>
                        <th className="px-4 py-2 text-right">Tone consumate</th>
                        <th className="px-4 py-2 text-right">mp realizați</th>
                        <th className="px-4 py-2 text-right">Rapoarte</th>
                        <th className="px-4 py-2 text-right">t/m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(consumData.per_lucrare || []).length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nicio lucrare cu consum înregistrat</td></tr>
                      )}
                      {(consumData.per_lucrare || []).map(p => (
                        <tr key={p.lucrare_id} className="border-b border-slate-50">
                          <td className="px-4 py-2 font-medium">{p.lucrare_denumire}</td>
                          <td className="px-4 py-2 text-right font-bold text-amber-700">{fmtNum(p.tone_total, 2)} t</td>
                          <td className="px-4 py-2 text-right">{fmtNum(p.mp_total)} m²</td>
                          <td className="px-4 py-2 text-right">{p.nr_rapoarte}</td>
                          <td className="px-4 py-2 text-right text-slate-500">
                            {p.mp_total > 0 ? fmtNum(p.tone_total / p.mp_total * 1000, 1) + ' kg/m²' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rapoarte detaliate */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-700">
                  Detaliu consum zilnic ({(consumData.rapoarte || []).length} rapoarte)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="px-4 py-2 text-left">Data</th>
                        <th className="px-4 py-2 text-left">Lucrare</th>
                        <th className="px-4 py-2 text-left">Strat</th>
                        <th className="px-4 py-2 text-right">Tone</th>
                        <th className="px-4 py-2 text-right">mp</th>
                        <th className="px-4 py-2 text-left">Sector</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(consumData.rapoarte || []).map(r => (
                        <tr key={r.id} className="border-b border-slate-50">
                          <td className="px-4 py-2 font-mono text-xs">{r.data}</td>
                          <td className="px-4 py-2">{r.lucrare_denumire}</td>
                          <td className="px-4 py-2">{stratBadge(r.strat)}</td>
                          <td className="px-4 py-2 text-right font-semibold">{fmtNum(r.cantitate_tone, 2)} t</td>
                          <td className="px-4 py-2 text-right">{fmtNum(r.suprafata_mp)} m²</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{r.sector || '—'}</td>
                        </tr>
                      ))}
                      {(consumData.rapoarte || []).length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nicio înregistrare</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Corelație cu producția — dacă există date */}
              {(consumData.productii_livrate || []).length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-700">
                    Producții livrate (din Producție Asfalt)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs text-slate-500">
                          <th className="px-4 py-2 text-left">Data</th>
                          <th className="px-4 py-2 text-left">Rețetă</th>
                          <th className="px-4 py-2 text-right">Tone produse</th>
                          <th className="px-4 py-2 text-left">Destinație</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consumData.productii_livrate.map(p => (
                          <tr key={p.id} className="border-b border-slate-50">
                            <td className="px-4 py-2 font-mono text-xs">{p.data}</td>
                            <td className="px-4 py-2">{p.reteta || '—'}</td>
                            <td className="px-4 py-2 text-right font-semibold">{fmtNum(p.tone, 2)} t</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{p.destination || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {!consumData && (
            <div className="py-12 text-center text-slate-400">Se încarcă...</div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL LUCRARE
      ════════════════════════════════════════════════════════════════════ */}
      {showLucrare && (
        <Modal
          title={editLucrare ? 'Editare lucrare' : 'Lucrare nouă'}
          onClose={() => setShowLucrare(false)}>
          <form onSubmit={saveLucrare} className="space-y-4">
            {lucrareErr.global && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{lucrareErr.global}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Field label="Denumire lucrare *" error={lucrareErr.denumire}>
                  <input className={inputCls} value={lucrareForm.denumire || ''} required
                    onChange={e => setLucrareForm(f => ({ ...f, denumire: e.target.value }))} />
                </Field>
              </div>
              <Field label="Număr contract">
                <input className={inputCls} value={lucrareForm.contract_nr || ''}
                  onChange={e => setLucrareForm(f => ({ ...f, contract_nr: e.target.value }))} />
              </Field>
              <Field label="Beneficiar">
                <input className={inputCls} value={lucrareForm.beneficiar || ''}
                  onChange={e => setLucrareForm(f => ({ ...f, beneficiar: e.target.value }))} />
              </Field>
              <Field label="Data start">
                <input type="date" className={inputCls} value={lucrareForm.data_start || ''}
                  onChange={e => setLucrareForm(f => ({ ...f, data_start: e.target.value }))} />
              </Field>
              <Field label="Data sfârșit estimată">
                <input type="date" className={inputCls} value={lucrareForm.data_sfarsit_estimata || ''}
                  onChange={e => setLucrareForm(f => ({ ...f, data_sfarsit_estimata: e.target.value }))} />
              </Field>
              <Field label="Km planificați">
                <input type="number" step="0.1" min="0" className={inputCls}
                  value={lucrareForm.km_planificati || ''}
                  onChange={e => setLucrareForm(f => ({ ...f, km_planificati: e.target.value }))} />
              </Field>
              <Field label="mp planificați">
                <input type="number" step="1" min="0" className={inputCls}
                  value={lucrareForm.mp_planificati || ''}
                  onChange={e => setLucrareForm(f => ({ ...f, mp_planificati: e.target.value }))} />
              </Field>
              {costCenters.length > 0 && (
                <div className="col-span-2">
                  <Field label="Centru de cost">
                    <select className={selectCls} value={lucrareForm.centru_cost_id || ''}
                      onChange={e => setLucrareForm(f => ({ ...f, centru_cost_id: e.target.value }))}>
                      <option value="">— fără alocare —</option>
                      {costCenters.map(cc =>
                        <option key={cc.id || cc.uuid} value={cc.id || cc.uuid}>
                          {cc.code ? `[${cc.code}] ` : ''}{cc.name || cc.denumire}
                        </option>
                      )}
                    </select>
                  </Field>
                </div>
              )}
              {editLucrare && (
                <div className="col-span-2">
                  <Field label="Status">
                    <select className={selectCls} value={lucrareForm.status || 'activa'}
                      onChange={e => setLucrareForm(f => ({ ...f, status: e.target.value }))}>
                      {STATUS_LUCRARE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowLucrare(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">
                Anulează
              </button>
              <button type="submit"
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                {editLucrare ? 'Salvează' : 'Creează lucrarea'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL RAPORT ZILNIC
      ════════════════════════════════════════════════════════════════════ */}
      {showRaport && (
        <Modal
          title={editRaport ? 'Editare raport zilnic' : 'Raport zilnic nou'}
          onClose={() => setShowRaport(false)}
          wide>
          <form onSubmit={saveRaport} className="space-y-4">
            {raportErr.global && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{raportErr.global}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Field label="Lucrare *" error={raportErr.lucrare_id}>
                  <select className={selectCls} value={raportForm.lucrare_id || ''} required
                    onChange={e => setRaportForm(f => ({ ...f, lucrare_id: e.target.value }))}>
                    <option value="">— Selectați lucrarea —</option>
                    {lucrari.filter(l => l.status !== 'anulata').map(l =>
                      <option key={l.id} value={l.id}>{l.denumire}</option>
                    )}
                  </select>
                </Field>
              </div>

              <Field label="Data *" error={raportErr.data}>
                <input type="date" className={inputCls} value={raportForm.data || ''} required
                  onChange={e => setRaportForm(f => ({ ...f, data: e.target.value }))} />
              </Field>
              <Field label="Strat">
                <select className={selectCls} value={raportForm.strat || 'uzura'}
                  onChange={e => setRaportForm(f => ({ ...f, strat: e.target.value }))}>
                  {STRATURI.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>

              <div className="col-span-2">
                <Field label="Sector (km de — km la)">
                  <input className={inputCls} placeholder="ex: DN15 km 12+500 - 13+200"
                    value={raportForm.sector || ''}
                    onChange={e => setRaportForm(f => ({ ...f, sector: e.target.value }))} />
                </Field>
              </div>

              <Field label="Grosime strat (cm)">
                <input type="number" step="0.5" min="0" className={inputCls}
                  value={raportForm.grosime_cm || ''}
                  onChange={e => setRaportForm(f => ({ ...f, grosime_cm: e.target.value }))} />
              </Field>
              <Field label="Temperatură mix (°C)">
                <input type="number" step="1" min="0" max="250" className={inputCls}
                  value={raportForm.temperatura_mix || ''}
                  onChange={e => setRaportForm(f => ({ ...f, temperatura_mix: e.target.value }))} />
              </Field>
              <Field label="Suprafață (mp)">
                <input type="number" step="1" min="0" className={inputCls}
                  value={raportForm.suprafata_mp || ''}
                  onChange={e => setRaportForm(f => ({ ...f, suprafata_mp: e.target.value }))} />
              </Field>
              <Field label="Cantitate asfalt (tone)">
                <input type="number" step="0.01" min="0" className={inputCls}
                  value={raportForm.cantitate_tone || ''}
                  onChange={e => setRaportForm(f => ({ ...f, cantitate_tone: e.target.value }))} />
              </Field>

              <div className="col-span-2">
                <Field label="Șofer finisor">
                  <input className={inputCls} value={raportForm.sofer_finisor || ''}
                    onChange={e => setRaportForm(f => ({ ...f, sofer_finisor: e.target.value }))} />
                </Field>
              </div>

              {/* Utilaje folosite */}
              {fleetAssets.length > 0 && (
                <div className="col-span-2">
                  <label className="mb-2 block text-xs font-medium text-slate-600">
                    Utilaje folosite (ore per utilaj)
                  </label>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1">
                    {fleetAssets.map(asset => {
                      const assetId = asset.id || asset.uuid
                      const selected = (raportForm.utilaje || []).find(u => u.asset_id === assetId)
                      return (
                        <div key={assetId} className="flex items-center gap-2">
                          <input type="checkbox" id={`asset-${assetId}`}
                            checked={!!selected}
                            onChange={() => toggleUtilaj(assetId)}
                            className="rounded" />
                          <label htmlFor={`asset-${assetId}`} className="flex-1 text-sm cursor-pointer">
                            {asset.nrInmatriculare || asset.cod || assetId}
                            {asset.marca ? ` — ${asset.marca}` : ''}
                          </label>
                          {selected && (
                            <input type="number" step="0.5" min="0" max="24"
                              placeholder="ore"
                              value={selected.ore || ''}
                              onChange={e => setUtilajOre(assetId, e.target.value)}
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-xs" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="col-span-2">
                <Field label="Observații">
                  <textarea rows={2} className={inputCls} value={raportForm.observatii || ''}
                    onChange={e => setRaportForm(f => ({ ...f, observatii: e.target.value }))} />
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowRaport(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">
                Anulează
              </button>
              <button type="submit"
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                {editRaport ? 'Salvează' : 'Adaugă raport'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
