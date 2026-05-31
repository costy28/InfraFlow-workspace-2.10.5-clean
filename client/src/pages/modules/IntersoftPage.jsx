import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, FileSpreadsheet, Plus, Upload } from 'lucide-react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import Table from '../../components/ui/Table'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatDate, formatMoney, formatPercent } from '../../utils/format'

const tabs = ['Proiecte', 'Import deviz', 'Export cantități', 'Import situații', 'Progres']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function monthStart() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function formData(file) {
  const data = new FormData()
  data.append('file', file)
  return data
}

function ProjectSelect({ projects, value, onChange, label = 'Proiect Intersoft' }) {
  return (
    <Select label={label} value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Selectează proiect</option>
      {projects.map(project => (
        <option key={project.id} value={project.id}>
          {project.denumire_intersoft}
        </option>
      ))}
    </Select>
  )
}

export default function IntersoftPage() {
  const [activeTab, setActiveTab] = useState('Proiecte')
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [projectForm, setProjectForm] = useState({ santier_id: '', denumire_intersoft: '', versiune_deviz: '' })
  const [selectedProjectId, setSelectedProjectId] = useState('')

  const [devizFile, setDevizFile] = useState(null)
  const [devizPreview, setDevizPreview] = useState(null)
  const [devizResult, setDevizResult] = useState(null)
  const [devizLoading, setDevizLoading] = useState(false)

  const [exportRange, setExportRange] = useState({ de_la: monthStart(), pana_la: today() })
  const [exportProgress, setExportProgress] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)

  const [situatieFile, setSituatieFile] = useState(null)
  const [situatiePreview, setSituatiePreview] = useState(null)
  const [situatieResult, setSituatieResult] = useState(null)
  const [situatieLoading, setSituatieLoading] = useState(false)

  const [progressProjectId, setProgressProjectId] = useState('')
  const [progress, setProgress] = useState(null)
  const [progressLoading, setProgressLoading] = useState(false)

  const selectedProject = useMemo(
    () => projects.find(project => String(project.id) === String(selectedProjectId)),
    [projects, selectedProjectId]
  )

  const projectOptionsId = selectedProjectId || projects[0]?.id || ''

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/integration/intersoft/projects')
      const rows = Array.isArray(response.data) ? response.data : response.data.projects || []
      setProjects(rows)
      if (!selectedProjectId && rows[0]) {
        setSelectedProjectId(String(rows[0].id))
        setProgressProjectId(String(rows[0].id))
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca proiectele Intersoft.')
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createProject = async event => {
    event.preventDefault()
    setError('')
    try {
      await api.post('/integration/intersoft/projects', projectForm)
      setProjectModalOpen(false)
      setProjectForm({ santier_id: '', denumire_intersoft: '', versiune_deviz: '' })
      await loadProjects()
    } catch (err) {
      setError(err.response?.data?.error || 'Proiectul nu a putut fi creat.')
    }
  }

  const previewDeviz = async file => {
    setDevizFile(file)
    setDevizPreview(null)
    setDevizResult(null)
    if (!file || !projectOptionsId) return
    setDevizLoading(true)
    try {
      const response = await api.post(`/integration/intersoft/projects/${projectOptionsId}/preview-deviz`, formData(file), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setDevizPreview(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut analiza devizul.')
    } finally {
      setDevizLoading(false)
    }
  }

  const importDeviz = async () => {
    if (!devizFile || !projectOptionsId) return
    setDevizLoading(true)
    setError('')
    try {
      const response = await api.post(`/integration/intersoft/projects/${projectOptionsId}/import-deviz`, formData(devizFile), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setDevizResult(response.data)
      await loadProjects()
    } catch (err) {
      setError(err.response?.data?.error || 'Devizul nu a putut fi importat.')
    } finally {
      setDevizLoading(false)
    }
  }

  const loadExportPreview = async () => {
    if (!projectOptionsId) return
    setExportLoading(true)
    setError('')
    try {
      const response = await api.get(`/integration/intersoft/projects/${projectOptionsId}/progress`)
      setExportProgress(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut calcula cantitățile realizate.')
    } finally {
      setExportLoading(false)
    }
  }

  const downloadQuantities = async () => {
    if (!projectOptionsId) return
    setExportLoading(true)
    setError('')
    try {
      const response = await api.get(`/integration/intersoft/projects/${projectOptionsId}/export-cantitati`, {
        params: exportRange,
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'cantitati_realizate.xlsx'
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Exportul nu a putut fi generat.')
    } finally {
      setExportLoading(false)
    }
  }

  const previewSituatie = async file => {
    setSituatieFile(file)
    setSituatiePreview(null)
    setSituatieResult(null)
    if (!file || !projectOptionsId) return
    setSituatieLoading(true)
    try {
      const response = await api.post(`/integration/intersoft/projects/${projectOptionsId}/preview-situatie`, formData(file), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setSituatiePreview(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut analiza situația.')
    } finally {
      setSituatieLoading(false)
    }
  }

  const importSituatie = async () => {
    if (!situatieFile || !projectOptionsId) return
    setSituatieLoading(true)
    setError('')
    try {
      const response = await api.post(`/integration/intersoft/projects/${projectOptionsId}/import-situatie`, formData(situatieFile), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setSituatieResult(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Situația nu a putut fi importată.')
    } finally {
      setSituatieLoading(false)
    }
  }

  const loadProgress = useCallback(async (projectId = progressProjectId) => {
    if (!projectId) return
    setProgressLoading(true)
    setError('')
    try {
      const response = await api.get(`/integration/intersoft/projects/${projectId}/progress`)
      setProgress(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca progresul.')
    } finally {
      setProgressLoading(false)
    }
  }, [progressProjectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === 'Progres' && progressProjectId) loadProgress(progressProjectId)
  }, [activeTab, progressProjectId, loadProgress])

  const progressRows = progress?.pe_articol || []
  const chartRows = progressRows.slice(0, 20).map(row => ({
    name: row.cod_articol || row.denumire,
    deviz: Number(row.cantitate_deviz || 0),
    realizat: Number(row.cant_realizata || 0)
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-primary-600">Integrare</p>
          <h1 className="text-2xl font-semibold text-slate-900">Intersoft</h1>
          <p className="mt-1 text-sm text-slate-500">
            Devize F3, cantități realizate din teren și situații de plată în circuit digital.
          </p>
        </div>
        <Button icon={<Plus size={18} />} onClick={() => setProjectModalOpen(true)}>Proiect nou</Button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === tab ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Proiecte' && (
        <Card title="Proiecte Intersoft" subtitle="Legătura dintre șantierele InfraFlow și devizele Intersoft.">
          <Table
            loading={loading}
            columns={[
              { key: 'denumire_intersoft', label: 'Denumire Intersoft' },
              { key: 'santier_id', label: 'Șantier legat' },
              { key: 'nr_articole', label: 'Nr articole' },
              { key: 'data_import', label: 'Data import', render: row => formatDate(row.data_import) },
              { key: 'versiune_deviz', label: 'Versiune deviz' },
              { key: 'activ', label: 'Status', render: row => <Badge variant={row.activ ? 'green' : 'gray'}>{row.activ ? 'Activ' : 'Inactiv'}</Badge> },
            ]}
            data={projects}
            onRowClick={row => {
              setSelectedProjectId(String(row.id))
              setProgressProjectId(String(row.id))
              setActiveTab('Progres')
            }}
          />
        </Card>
      )}

      {activeTab === 'Import deviz' && (
        <Card title="Import deviz F3" subtitle="Excel exportat din Intersoft C5/F3.">
          <div className="grid gap-4 lg:grid-cols-3">
            <ProjectSelect projects={projects} value={projectOptionsId} onChange={setSelectedProjectId} />
            <Input type="file" label="Fișier Excel" accept=".xlsx,.xls" onChange={event => previewDeviz(event.target.files?.[0])} />
            <div className="flex items-end">
              <Button loading={devizLoading} disabled={!devizFile || !projectOptionsId} icon={<Upload size={18} />} onClick={importDeviz}>
                Importă devizul
              </Button>
            </div>
          </div>

          {devizPreview && (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="blue">{devizPreview.articole} articole detectate</Badge>
                <Badge variant={devizPreview.erori?.length ? 'yellow' : 'green'}>{devizPreview.erori?.length || 0} erori</Badge>
              </div>
              <Table
                columns={[
                  { key: 'cod_articol', label: 'Simbol' },
                  { key: 'denumire', label: 'Denumire' },
                  { key: 'um', label: 'UM' },
                  { key: 'cantitate_deviz', label: 'Cantitate' },
                  { key: 'valoare_totala', label: 'Valoare', render: row => formatMoney(row.valoare_totala || 0) },
                ]}
                data={devizPreview.primele_articole || []}
                empty="Nu s-au detectat articole."
              />
            </div>
          )}

          {devizResult && (
            <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">
              {devizResult.articole} articole importate, {devizResult.erori?.length || 0} erori.
            </div>
          )}
        </Card>
      )}

      {activeTab === 'Export cantități' && (
        <Card title="Export cantități realizate" subtitle="Cantități din jurnalele de teren, generate în Excel pentru Intersoft.">
          <div className="grid gap-4 lg:grid-cols-4">
            <ProjectSelect projects={projects} value={projectOptionsId} onChange={setSelectedProjectId} />
            <Input type="date" label="De la" value={exportRange.de_la} onChange={event => setExportRange({ ...exportRange, de_la: event.target.value })} />
            <Input type="date" label="Până la" value={exportRange.pana_la} onChange={event => setExportRange({ ...exportRange, pana_la: event.target.value })} />
            <div className="flex items-end gap-2">
              <Button variant="secondary" loading={exportLoading} onClick={loadExportPreview}>Preview</Button>
              <Button loading={exportLoading} icon={<Download size={18} />} onClick={downloadQuantities}>Excel</Button>
            </div>
          </div>

          <Table
            loading={exportLoading}
            columns={[
              { key: 'cod_articol', label: 'Articol' },
              { key: 'denumire', label: 'Denumire' },
              { key: 'cantitate_deviz', label: 'Cantitate deviz' },
              { key: 'cant_realizata', label: 'Cantitate realizată' },
              { key: 'procent', label: 'Procent', render: row => formatPercent(row.procent || 0) },
            ]}
            data={exportProgress?.pe_articol || []}
            empty="Apasă Preview pentru a vedea cantitățile."
          />
        </Card>
      )}

      {activeTab === 'Import situații' && (
        <Card title="Import situație de plată" subtitle="Excel situație de plată din Intersoft, cu document SITLUC creat automat.">
          <div className="grid gap-4 lg:grid-cols-3">
            <ProjectSelect projects={projects} value={projectOptionsId} onChange={setSelectedProjectId} />
            <Input type="file" label="Fișier Excel situație" accept=".xlsx,.xls" onChange={event => previewSituatie(event.target.files?.[0])} />
            <div className="flex items-end">
              <Button loading={situatieLoading} disabled={!situatieFile || !projectOptionsId} icon={<FileSpreadsheet size={18} />} onClick={importSituatie}>
                Importă și lansează în circuit aprobare
              </Button>
            </div>
          </div>

          {situatiePreview && (
            <div className="mt-5 grid gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase text-slate-500">Nr situație</div>
                <div className="font-semibold">{situatiePreview.situatie?.nr_situatie || '-'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase text-slate-500">Data</div>
                <div className="font-semibold">{formatDate(situatiePreview.situatie?.data_situatie)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase text-slate-500">Total fără TVA</div>
                <div className="font-semibold">{formatMoney(situatiePreview.situatie?.total_fara_tva || 0)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs uppercase text-slate-500">TVA / Total</div>
                <div className="font-semibold">{formatMoney(situatiePreview.situatie?.tva || 0)} / {formatMoney(situatiePreview.situatie?.total_cu_tva || 0)}</div>
              </div>
            </div>
          )}

          {situatieResult && (
            <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">
              Situația {situatieResult.nr_situatie} a fost importată. Document ID: {situatieResult.document_uuid || situatieResult.document_id || '-'}.
            </div>
          )}
        </Card>
      )}

      {activeTab === 'Progres' && (
        <Card title="Progres fizic Intersoft" subtitle={selectedProject?.denumire_intersoft || 'Cantitate deviz vs. realizată per articol.'}>
          <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_auto]">
            <ProjectSelect projects={projects} value={progressProjectId} onChange={setProgressProjectId} />
            <div className="flex items-end">
              <Button variant="secondary" loading={progressLoading} onClick={() => loadProgress(progressProjectId)}>Actualizează</Button>
            </div>
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-500">Progres fizic total</div>
              <div className="text-2xl font-semibold text-primary-700">{formatPercent(progress?.progres_fizic_procent || 0)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-500">Total articole</div>
              <div className="text-2xl font-semibold text-slate-900">{progress?.total_articole || 0}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-500">Articole cu realizări</div>
              <div className="text-2xl font-semibold text-slate-900">{progress?.articole_cu_realizari || 0}</div>
            </div>
          </div>

          <div className="mb-5 h-80 rounded-lg border border-slate-200 bg-white p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="deviz" fill="#0F6E56" name="Cantitate deviz" />
                <Bar dataKey="realizat" fill="#1a56db" name="Cantitate realizată" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Table
            loading={progressLoading}
            columns={[
              { key: 'cod_articol', label: 'Cod articol' },
              { key: 'denumire', label: 'Denumire' },
              { key: 'um', label: 'UM' },
              { key: 'cantitate_deviz', label: 'Deviz' },
              { key: 'cant_realizata', label: 'Realizat' },
              { key: 'procent', label: 'Procent', render: row => formatPercent(row.procent || 0) },
            ]}
            data={progressRows}
          />
        </Card>
      )}

      <Modal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} title="Proiect Intersoft nou">
        <form className="grid gap-4" onSubmit={createProject}>
          <Input label="ID șantier InfraFlow" value={projectForm.santier_id} onChange={event => setProjectForm({ ...projectForm, santier_id: event.target.value })} required />
          <Input label="Denumire Intersoft" value={projectForm.denumire_intersoft} onChange={event => setProjectForm({ ...projectForm, denumire_intersoft: event.target.value })} required />
          <Input label="Versiune deviz" value={projectForm.versiune_deviz} onChange={event => setProjectForm({ ...projectForm, versiune_deviz: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setProjectModalOpen(false)}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
