import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useAuth } from '../../hooks/useAuth'
import { exportExcel, exportPdf } from '../../utils/export'

const tabs = ['Consumuri', 'Rețete', 'Planuri', 'Raport Zilnic']
const pageSize = 10

function today() {
  return new Date().toISOString().slice(0, 10)
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function recipeName(recipe) {
  return recipe?.name || recipe?.denumire || recipe?.recipeName || 'Reteta'
}

function recipeStatus(recipe) {
  return recipe?.approved || recipe?.aprobat || recipe?.status === 'aprobat'
}

function componentRows(recipe, asphalt = 1) {
  const percentages = recipe?.percentages || recipe?.components || recipe?.componente || {}
  if (Array.isArray(percentages)) return percentages
  return Object.entries(percentages).map(([materialId, value]) => ({
    materialId,
    percent: Number(value || 0),
    amount: Number(asphalt || 0) * Number(value || 0) / 100,
  }))
}

function Pager({ page, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
      <span className="text-slate-500">Pagina {page} din {pages}</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Următor</Button>
      </div>
    </div>
  )
}

function EmptyRow({ colSpan, loading }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-slate-500">
        {loading ? 'Se incarca...' : 'Nu exista date pentru filtrele selectate.'}
      </td>
    </tr>
  )
}

export default function ProductiePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('Consumuri')
  const [consumptions, setConsumptions] = useState([])
  const [recipes, setRecipes] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [selectedConsumption, setSelectedConsumption] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  // Raport Zilnic
  const [raportLuna, setRaportLuna] = useState(() => new Date().toISOString().slice(0, 7))
  const [raportZilnic, setRaportZilnic] = useState(null)
  const [raportLoading, setRaportLoading] = useState(false)
  const [linkingId, setLinkingId] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [form, setForm] = useState({
    date: today(),
    recipeId: '',
    asphalt: '',
    jobName: '',
  })
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    recipeId: '',
    date: '',
    type: '',
    status: '',
  })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [consumptionsResponse, recipesResponse, plansResponse] = await Promise.all([
        api.get('/consumptions'),
        api.get('/recipes'),
        api.get('/plans').catch(() => ({ data: { plans: [] } })),
      ])
      const nextRecipes = arrayFrom(recipesResponse.data, ['recipes'])
      setConsumptions(arrayFrom(consumptionsResponse.data, ['consumptions']))
      setRecipes(nextRecipes)
      setPlans(arrayFrom(plansResponse.data, ['plans']))
      setForm(current => ({ ...current, recipeId: current.recipeId || nextRecipes[0]?.id || '' }))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele de productie.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => setPage(1))
  }, [activeTab, filters])

  const filteredConsumptions = useMemo(() => {
    return consumptions.filter(item => {
      const date = item.date || item.data || ''
      if (filters.from && date < filters.from) return false
      if (filters.to && date > filters.to) return false
      if (filters.date && date !== filters.date) return false
      if (filters.recipeId && item.recipeId !== filters.recipeId) return false
      return true
    })
  }, [consumptions, filters])

  const filteredPlans = useMemo(() => {
    return plans.filter(item => {
      if (filters.status && String(item.status || '') !== filters.status) return false
      if (filters.date && String(item.date || item.data || '') !== filters.date) return false
      return true
    })
  }, [plans, filters])

  const selectedRecipe = recipes.find(recipe => recipe.id === form.recipeId)
  const pagedConsumptions = filteredConsumptions.slice((page - 1) * pageSize, page * pageSize)
  const pagedPlans = filteredPlans.slice((page - 1) * pageSize, page * pageSize)

  async function loadRaportZilnic() {
    setRaportLoading(true)
    try {
      const res = await api.get('/production/raport-zilnic', { params: { luna: raportLuna } })
      setRaportZilnic(res.data || null)
    } catch { setRaportZilnic(null) }
    finally { setRaportLoading(false) }
  }

  useEffect(() => {
    if (activeTab === 'Raport Zilnic') loadRaportZilnic()
  }, [activeTab, raportLuna])

  async function linkGestiune(consumptionId) {
    setConfirmAction({
      title: 'Leagă consumul de Gestiune',
      message: 'Scazi din stocul Gestiune materiile prime consumate pentru această producție?',
      details: 'Se vor genera mișcările de stoc pentru consumul selectat. Verifică rețeta și cantitățile înainte de confirmare.',
      confirmLabel: 'Scade din stoc',
      tone: 'warning',
      run: () => linkGestiuneRequest(consumptionId),
      errorMessage: 'Eroare la legare Gestiune.',
    })
  }

  async function linkGestiuneRequest(consumptionId) {
    setLinkingId(consumptionId)
    try {
      await api.post(`/production/consumptions/link-gestiune/${consumptionId}`)
      await load()
      if (activeTab === 'Raport Zilnic') await loadRaportZilnic()
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la legare Gestiune.')
    } finally { setLinkingId(null) }
  }

  async function runConfirmAction(reason) {
    if (!confirmAction?.run) return
    try {
      setConfirmLoading(true)
      setError('')
      await confirmAction.run(reason)
      setConfirmAction(null)
    } catch (err) {
      setError(err.response?.data?.error || confirmAction.errorMessage || 'Acțiunea nu a putut fi executată.')
    } finally {
      setConfirmLoading(false)
    }
  }

  function printRaportZilnic() {
    if (!raportZilnic) return
    const rows = (raportZilnic.zile || []).map(z => `
      <tr>
        <td>${z.data}</td>
        <td style="text-align:right">${z.tone_total}</td>
        <td style="text-align:right">${z.productii}</td>
        <td>${z.retete || '—'}</td>
        <td style="font-size:9pt">${z.materiale.map(m => `${m.materialName}: ${m.qty} ${m.unit}`).join('<br>')}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Raport Zilnic Producție</title>
<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 6px}th{background:#f0f0f0;text-align:center}.total{font-weight:bold;background:#e8e8e8}@media print{body{margin:1cm}}</style></head><body>
<h2>RAPORT ZILNIC PRODUCȚIE ASFALT</h2>
<p style="text-align:center">Luna: <strong>${raportZilnic.luna}</strong> · Total: <strong>${raportZilnic.totals?.tone_total} tone</strong> în <strong>${raportZilnic.totals?.zile_productie} zile</strong></p>
<table><thead><tr><th>Data</th><th>Tone produse</th><th>Nr. producții</th><th>Rețete</th><th>Consum materii prime</th></tr></thead>
<tbody>${rows}<tr class="total"><td colspan="1">TOTAL</td><td style="text-align:right">${raportZilnic.totals?.tone_total}</td><td style="text-align:right">${raportZilnic.totals?.productii_total}</td><td colspan="2"></td></tr></tbody></table>
</body></html>`
    const win = window.open('', '_blank'); win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400)
  }

  async function submitConsumption(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/consumptions', {
        date: form.date,
        recipeId: form.recipeId,
        asphalt: Number(form.asphalt),
        jobName: form.jobName,
      })
      setModalOpen(false)
      setForm({ date: today(), recipeId: recipes[0]?.id || '', asphalt: '', jobName: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Consumul nu a putut fi salvat.')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Producție</h2>
          <p className="text-sm text-slate-500">Consumuri, rețete și planuri de producție.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Adaugă nou</Button>
      </div>

      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {tabs.map(tab => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'primary' : 'secondary'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </Button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Input label="Dată" type="date" value={filters.date} onChange={event => setFilters({ ...filters, date: event.target.value })} />
          <Input label="De la" type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} />
          <Input label="Până la" type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} />
          {activeTab === 'Consumuri' ? (
            <Select
              label="Rețetă"
              value={filters.recipeId}
              onChange={event => setFilters({ ...filters, recipeId: event.target.value })}
              options={[{ value: '', label: 'Toate rețetele' }, ...recipes.map(recipe => ({ value: recipe.id, label: recipeName(recipe) }))]}
            />
          ) : (
            <Select
              label="Status"
              value={filters.status}
              onChange={event => setFilters({ ...filters, status: event.target.value })}
              options={[
                { value: '', label: 'Toate statusurile' },
                { value: 'draft', label: 'Draft' },
                { value: 'aprobat', label: 'Aprobat' },
                { value: 'planificat', label: 'Planificat' },
              ]}
            />
          )}
        </div>
      </Card>

      {activeTab === 'Consumuri' ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Consumuri</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => exportExcel(
                filteredConsumptions.map(item => ({
                  'Dată': item.date || item.data || '',
                  'Rețetă': item.recipeName || item.reteta || '',
                  'Tone asfalt': Number(item.asphalt || item.tone || 0),
                  'Operator': item.operatorName || item.operator || '',
                  'Lucrare': item.jobName || item.lucrare || '',
                })),
                `Consumuri_Productie_${filters.from || filters.date || new Date().toISOString().slice(0,10)}`
              )}>📊 Excel</Button>
              <Button variant="secondary" onClick={() => exportPdf({
                title: 'Raport Consumuri Producție',
                subtitle: `Perioadă: ${filters.from || '-'} → ${filters.to || '-'} · ${filteredConsumptions.length} înregistrări`,
                columns: [
                  { key: 'Dată', label: 'Dată' },
                  { key: 'Rețetă', label: 'Rețetă' },
                  { key: 'Tone', label: 'Tone', align: 'right' },
                  { key: 'Operator', label: 'Operator' },
                  { key: 'Lucrare', label: 'Lucrare' },
                ],
                rows: filteredConsumptions.map(item => ({
                  'Dată': item.date || item.data || '',
                  'Rețetă': item.recipeName || item.reteta || '',
                  'Tone': Number(item.asphalt || item.tone || 0).toLocaleString('ro-RO'),
                  'Operator': item.operatorName || item.operator || '',
                  'Lucrare': item.jobName || item.lucrare || '',
                })),
              })}>🖨️ PDF</Button>
              <Button onClick={() => setModalOpen(true)}>+ Adaugă</Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Rețetă</th>
                  <th className="px-3 py-2">Tone</th>
                  <th className="px-3 py-2">Operator</th>
                  <th className="px-3 py-2">Lucrare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedConsumptions.length ? pagedConsumptions.map(item => (
                  <tr key={item.id} className="cursor-pointer hover:bg-primary-50/50" onClick={() => setSelectedConsumption(item)}>
                    <td className="px-3 py-2">{item.date || item.data}</td>
                    <td className="px-3 py-2">{item.recipeName || item.reteta || '-'}</td>
                    <td className="px-3 py-2">{Number(item.asphalt || item.tone || 0).toLocaleString('ro-RO')}</td>
                    <td className="px-3 py-2">{item.operatorName || item.operator || '-'}</td>
                    <td className="px-3 py-2">{item.jobName || item.lucrare || '-'}</td>
                  </tr>
                )) : <EmptyRow colSpan={5} loading={loading} />}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pager page={page} total={filteredConsumptions.length} onPage={setPage} />
          </div>
        </Card>
      ) : null}

      {activeTab === 'Rețete' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recipes.length ? recipes.map(recipe => (
            <Card key={recipe.id}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{recipeName(recipe)}</h3>
                  <p className="text-xs text-slate-500">Versiune {recipe.version || 1}</p>
                </div>
                <Badge tone={recipeStatus(recipe) ? 'success' : 'warning'}>
                  {recipeStatus(recipe) ? 'Aprobat laborator' : 'Draft'}
                </Badge>
              </div>
              <div className="grid gap-2">
                {componentRows(recipe).length ? componentRows(recipe).map(component => (
                  <div key={component.materialId || component.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <span>{component.materialName || component.name || component.materialId}</span>
                    <span className="font-medium">{component.percent ?? component.percentage ?? component.value}%</span>
                  </div>
                )) : <p className="text-sm text-slate-500">Fără componente configurate.</p>}
              </div>
            </Card>
          )) : <Card>{loading ? 'Se incarca...' : 'Nu exista rețete.'}</Card>}
        </div>
      ) : null}

      {activeTab === 'Planuri' ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Planuri</h3>
            <Button variant="secondary" onClick={() => exportExcel(
              filteredPlans.map(plan => ({
                'Dată': plan.date || plan.data || '',
                'Rețetă': plan.recipeName || plan.reteta || '',
                'Tone planificate': Number(plan.asphalt || plan.tone || 0),
                'Status': plan.status || 'planificat',
              })),
              `Planuri_Productie_${new Date().toISOString().slice(0,7)}`
            )}>📊 Export Excel</Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Rețetă</th>
                  <th className="px-3 py-2">Tone</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedPlans.length ? pagedPlans.map(plan => (
                  <tr key={plan.id}>
                    <td className="px-3 py-2">{plan.date || plan.data}</td>
                    <td className="px-3 py-2">{plan.recipeName || plan.reteta || '-'}</td>
                    <td className="px-3 py-2">{Number(plan.asphalt || plan.tone || 0).toLocaleString('ro-RO')}</td>
                    <td className="px-3 py-2"><Badge>{plan.status || 'planificat'}</Badge></td>
                  </tr>
                )) : <EmptyRow colSpan={4} loading={loading} />}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pager page={page} total={filteredPlans.length} onPage={setPage} />
          </div>
        </Card>
      ) : null}

      {activeTab === 'Raport Zilnic' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Luna</label>
                <input type="month" value={raportLuna} onChange={e => setRaportLuna(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" />
              </div>
              <Button onClick={loadRaportZilnic}>↺ Actualizează</Button>
              {raportZilnic ? <Button variant="secondary" onClick={printRaportZilnic}>🖨️ Print</Button> : null}
              {raportZilnic ? (
                <div className="ml-auto flex gap-4 rounded-lg bg-primary-50 px-4 py-2 text-sm">
                  <span>🏭 <strong>{raportZilnic.totals?.tone_total}</strong> t produse</span>
                  <span>📅 <strong>{raportZilnic.totals?.zile_productie}</strong> zile</span>
                  <span>🔄 <strong>{raportZilnic.totals?.productii_total}</strong> producții</span>
                </div>
              ) : null}
            </div>
          </Card>

          {raportLoading ? (
            <div className="text-center py-8 text-sm text-slate-400">Se încarcă...</div>
          ) : raportZilnic ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Tone produse</th>
                    <th className="px-3 py-2 text-right">Nr. producții</th>
                    <th className="px-3 py-2">Rețete</th>
                    <th className="px-3 py-2">Consum materii prime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(raportZilnic.zile || []).length ? (raportZilnic.zile || []).map(z => (
                    <tr key={z.data} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">{z.data}</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary-700">{z.tone_total} t</td>
                      <td className="px-3 py-2 text-right">{z.productii}</td>
                      <td className="px-3 py-2 text-slate-600 text-xs">{z.retete || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {z.materiale.map(m => (
                          <span key={m.materialName} className="mr-3">{m.materialName}: <strong>{m.qty}</strong> {m.unit}</span>
                        ))}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="5" className="px-3 py-8 text-center text-sm text-slate-400">Nicio producție înregistrată pentru {raportLuna}.</td></tr>
                  )}
                  <tr className="bg-slate-100 font-bold">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-right text-primary-700">{raportZilnic.totals?.tone_total} t</td>
                    <td className="px-3 py-2 text-right">{raportZilnic.totals?.productii_total}</td>
                    <td colSpan="2" />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-sm text-slate-400">
              Apasă Actualizează pentru a genera raportul zilnic.
            </div>
          )}

          {/* Consumuri cu buton legare Gestiune */}
          <Card>
            <div className="mb-3 text-sm font-semibold text-slate-700">🔗 Consumuri — Legare stoc Gestiune</div>
            <p className="mb-3 text-xs text-slate-400">Apasă „Leagă Gestiune" pentru a scădea automat materiile prime din stocul Gestiune/Depozit.</p>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Rețetă</th>
                    <th className="px-3 py-2 text-right">Tone</th>
                    <th className="px-3 py-2">Lucrare</th>
                    <th className="px-3 py-2">Gestiune</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consumptions.filter(c => (c.date || c.data || '').startsWith(raportLuna)).slice(0, 30).map(c => (
                    <tr key={c.id} className={c.gestiune_linked ? 'bg-green-50/30' : ''}>
                      <td className="px-3 py-2">{c.date || c.data}</td>
                      <td className="px-3 py-2">{c.recipeName || c.reteta || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{c.asphalt || c.tone}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs truncate max-w-xs">{c.jobName || c.lucrare || '—'}</td>
                      <td className="px-3 py-2">
                        {c.gestiune_linked
                          ? <Badge tone="success">Legat ✓</Badge>
                          : <Badge tone="neutral">Nelegat</Badge>}
                      </td>
                      <td className="px-3 py-2">
                        {!c.gestiune_linked ? (
                          <button
                            className="rounded bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                            disabled={linkingId === c.id}
                            onClick={() => linkGestiune(c.id)}
                          >🔗 Leagă Gestiune</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {consumptions.filter(c => (c.date || c.data || '').startsWith(raportLuna)).length === 0 ? (
                    <tr><td colSpan="6" className="px-3 py-8 text-center text-sm text-slate-400">Niciun consum pentru {raportLuna}.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      <Modal open={modalOpen} title="Adaugă consum nou" onClose={() => setModalOpen(false)}>
        <form className="grid gap-4" onSubmit={submitConsumption}>
          <Select
            label="Rețetă"
            value={form.recipeId}
            onChange={event => setForm({ ...form, recipeId: event.target.value })}
            options={recipes.map(recipe => ({ value: recipe.id, label: recipeName(recipe) }))}
            required
          />
          <Input label="Cantitate tone" type="number" min="0" step="0.01" value={form.asphalt} onChange={event => setForm({ ...form, asphalt: event.target.value })} required />
          <Input label="Lucrare/destinație" value={form.jobName} onChange={event => setForm({ ...form, jobName: event.target.value })} />
          <Input label="Operator" value={user?.name || user?.nume || user?.username || 'Utilizator curent'} readOnly />
          <div className="rounded-md bg-slate-50 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">Componente calculate</div>
            <div className="grid gap-1 text-sm text-slate-600">
              {componentRows(selectedRecipe, Number(form.asphalt || 0)).length ? componentRows(selectedRecipe, Number(form.asphalt || 0)).map(component => (
                <div key={component.materialId || component.name} className="flex justify-between">
                  <span>{component.materialName || component.name || component.materialId}</span>
                  <span>{Number(component.amount || 0).toLocaleString('ro-RO', { maximumFractionDigits: 3 })}</span>
                </div>
              )) : <span>Selectează o rețetă.</span>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selectedConsumption)} title="Detalii consum" onClose={() => setSelectedConsumption(null)}>
        {selectedConsumption ? (
          <div className="grid gap-3 text-sm text-slate-700">
            <div><b>Raport:</b> {selectedConsumption.reportNo || selectedConsumption.id}</div>
            <div><b>Rețetă:</b> {selectedConsumption.recipeName}</div>
            <div><b>Tone:</b> {selectedConsumption.asphalt}</div>
            <div><b>Lucrare:</b> {selectedConsumption.jobName || '-'}</div>
            <div className="rounded-md bg-slate-50 p-3">
              {(selectedConsumption.materials || []).map(item => (
                <div key={item.materialId} className="flex justify-between">
                  <span>{item.materialName}</span>
                  <span>{item.amount} {item.unit}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        cancelLabel="Renunță"
        tone={confirmAction?.tone || 'warning'}
        loading={confirmLoading || Boolean(linkingId)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
      />
    </div>
  )
}
