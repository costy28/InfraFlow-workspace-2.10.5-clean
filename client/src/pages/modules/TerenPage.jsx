import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const pageSize = 10

function today() {
  return new Date().toISOString().slice(0, 10)
}

function isSnowSeason() {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  return (month === 11 && day >= 15) || month === 12 || month === 1 || month === 2 || month === 3 || (month === 4 && day <= 15)
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return Array.isArray(data) ? data : []
}

function dateValue(value) {
  return String(value || '').slice(0, 10)
}

function percent(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0
}

function progressColor(value) {
  if (value >= 80) return 'bg-primary-600'
  if (value >= 45) return 'bg-blue-500'
  if (value >= 20) return 'bg-amber-500'
  return 'bg-rose-500'
}

function statusInfo(status) {
  const raw = String(status || '').toLowerCase()
  if (['aprobat', 'approved', 'finalizat'].includes(raw)) return { label: 'Aprobat', variant: 'green' }
  if (['trimis', 'submitted', 'in_review'].includes(raw)) return { label: 'Trimis', variant: 'blue' }
  if (['draft', 'nou'].includes(raw)) return { label: 'Draft', variant: 'gray' }
  if (['respins', 'blocat', 'anulat'].includes(raw)) return { label: status || 'Problemă', variant: 'red' }
  return { label: status || '-', variant: 'yellow' }
}

function severityInfo(value) {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('bloc')) return { label: 'Blocantă', variant: 'red' }
  if (raw.includes('major')) return { label: 'Majoră', variant: 'yellow' }
  return { label: value || 'Minoră', variant: 'gray' }
}

function projectName(projects, id) {
  const project = projects.find(item => String(item.id) === String(id) || String(item.uuid) === String(id))
  return project?.denumire || project?.name || project?.title || id || '-'
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
        {loading ? 'Se incarca...' : 'Nu exista date pentru tabul selectat.'}
      </td>
    </tr>
  )
}

export default function TerenPage() {
  const snowSeason = isSnowSeason()
  const tabs = snowSeason ? ['Proiecte', 'Jurnale', 'Probleme', 'Meteo'] : ['Proiecte', 'Jurnale', 'Probleme']
  const [activeTab, setActiveTab] = useState('Proiecte')
  const [projects, setProjects] = useState([])
  const [journals, setJournals] = useState([])
  const [issues, setIssues] = useState([])
  const [weather, setWeather] = useState(null)
  const [gallery, setGallery] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedJournal, setSelectedJournal] = useState(null)
  const [journalDetails, setJournalDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [journalModal, setJournalModal] = useState(false)
  const [issueModal, setIssueModal] = useState(false)
  const [filters, setFilters] = useState({ projectId: '', date: '', status: '' })
  const [journalForm, setJournalForm] = useState({ santier_id: '', data: today(), tip_interventie: '', observatii: '' })
  const [issueForm, setIssueForm] = useState({ santier_id: '', titlu: '', descriere: '', gravitate: 'minoră' })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [projectsRes, journalsRes, issuesRes] = await Promise.all([
        api.get('/field/projects'),
        api.get('/field/journals'),
        api.get('/field/issues'),
      ])
      setProjects(arrayFrom(projectsRes.data, ['projects', 'items', 'data']))
      setJournals(arrayFrom(journalsRes.data, ['journals', 'items', 'data']))
      setIssues(arrayFrom(issuesRes.data, ['issues', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut incarca datele din teren.')
    } finally {
      setLoading(false)
    }
  }

  async function loadWeather() {
    if (!snowSeason) return
    setWeatherLoading(true)
    try {
      const res = await api.get('/snow-removal/weather')
      setWeather(res.data)
    } catch {
      setWeather({ disponibil: false })
    } finally {
      setWeatherLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    loadWeather()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredJournals = useMemo(() => journals.filter(journal => {
    const projectId = journal.santier_id || journal.project_id || journal.projectId
    const status = String(journal.status || '').toLowerCase()
    if (filters.projectId && String(projectId) !== String(filters.projectId)) return false
    if (filters.date && dateValue(journal.data || journal.date) !== filters.date) return false
    if (filters.status && status !== filters.status.toLowerCase()) return false
    return true
  }), [journals, filters])

  const pagedProjects = useMemo(() => projects.slice((page - 1) * pageSize, page * pageSize), [projects, page])
  const pagedJournals = useMemo(() => filteredJournals.slice((page - 1) * pageSize, page * pageSize), [filteredJournals, page])
  const pagedIssues = useMemo(() => issues.slice((page - 1) * pageSize, page * pageSize), [issues, page])

  function selectTab(tab) {
    setActiveTab(tab)
    setPage(1)
  }

  async function openProject(project) {
    setSelectedProject(project)
    setGallery([])
    const id = project.id || project.uuid
    if (!id) return
    try {
      const res = await api.get(`/field/projects/${id}/gallery`)
      setGallery(arrayFrom(res.data, ['photos', 'gallery', 'items', 'data']))
    } catch {
      setGallery([])
    }
  }

  async function openJournal(journal) {
    setSelectedJournal(journal)
    setJournalDetails(null)
    const id = journal.uuid || journal.id
    if (!id) return
    try {
      const res = await api.get(`/field/journals/${id}`)
      setJournalDetails(res.data?.journal || res.data)
    } catch {
      setJournalDetails(journal)
    }
  }

  async function saveJournal(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/field/journals', journalForm)
      setMessage('Jurnalul a fost creat.')
      setJournalModal(false)
      setJournalForm({ santier_id: '', data: today(), tip_interventie: '', observatii: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Jurnalul nu a putut fi salvat.')
    }
  }

  async function saveIssue(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/field/issues', issueForm)
      setMessage('Problema a fost raportată.')
      setIssueModal(false)
      setIssueForm({ santier_id: '', titlu: '', descriere: '', gravitate: 'minoră' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Problema nu a putut fi raportată.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Teren</h1>
          <p className="text-sm text-slate-500">Proiecte, jurnale de șantier, probleme și date utile pentru echipe.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setIssueModal(true)}>Raportează problemă</Button>
          <Button onClick={() => setJournalModal(true)}>Jurnal nou</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => selectTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">{message}</div> : null}

      {activeTab === 'Proiecte' && (
        <Card title="Proiecte" subtitle="Statusul proiectelor active și progresul fizic." loading={loading}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cod</th>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Progres</th>
                  <th className="px-3 py-2">Ultima activitate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedProjects.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedProjects.map(project => {
                  const value = percent(project.progres_fizic_procent || project.progress || project.progres)
                  const status = statusInfo(project.status)
                  return (
                    <tr key={project.id || project.uuid || project.cod} className="cursor-pointer hover:bg-slate-50" onClick={() => openProject(project)}>
                      <td className="px-3 py-3 font-medium text-slate-800">{project.cod || project.code || '-'}</td>
                      <td className="px-3 py-3">{project.denumire || project.name || project.title || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-40 items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full ${progressColor(value)}`} style={{ width: `${value}%` }} />
                          </div>
                          <span className="w-12 text-right font-medium">{value.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">{dateValue(project.ultima_activitate || project.lastActivityAt || project.updated_at) || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={projects.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Jurnale' && (
        <Card
          title="Jurnale"
          subtitle="Jurnale zilnice din teren."
          loading={loading}
          actions={<Button size="sm" onClick={() => setJournalModal(true)}>Jurnal nou</Button>}
        >
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Select label="Proiect" value={filters.projectId} onChange={event => setFilters({ ...filters, projectId: event.target.value })}>
              <option value="">Toate proiectele</option>
              {projects.map(project => (
                <option key={project.id || project.uuid} value={project.id || project.uuid}>{project.denumire || project.name || project.cod}</option>
              ))}
            </Select>
            <Input label="Dată" type="date" value={filters.date} onChange={event => setFilters({ ...filters, date: event.target.value })} />
            <Select label="Status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Toate</option>
              <option value="draft">Draft</option>
              <option value="trimis">Trimis</option>
              <option value="aprobat">Aprobat</option>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dată</th>
                  <th className="px-3 py-2">Șantier</th>
                  <th className="px-3 py-2">Ofițer</th>
                  <th className="px-3 py-2">Tip intervenție</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedJournals.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedJournals.map(journal => {
                  const status = statusInfo(journal.status)
                  const projectId = journal.santier_id || journal.project_id || journal.projectId
                  return (
                    <tr key={journal.uuid || journal.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openJournal(journal)}>
                      <td className="px-3 py-3">{dateValue(journal.data || journal.date)}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">{journal.santier || journal.projectName || projectName(projects, projectId)}</td>
                      <td className="px-3 py-3">{journal.ofiter || journal.officerName || journal.sef_santier || '-'}</td>
                      <td className="px-3 py-3">{journal.tip_interventie || journal.tip || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={filteredJournals.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Probleme' && (
        <Card
          title="Probleme"
          subtitle="Blocaje și observații raportate din teren."
          loading={loading}
          actions={<Button size="sm" onClick={() => setIssueModal(true)}>Raportează problemă nouă</Button>}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Titlu</th>
                  <th className="px-3 py-2">Șantier</th>
                  <th className="px-3 py-2">Gravitate</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Raportat de</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedIssues.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedIssues.map(issue => {
                  const severity = severityInfo(issue.gravitate || issue.severity)
                  const status = statusInfo(issue.status)
                  const projectId = issue.santier_id || issue.project_id || issue.projectId
                  return (
                    <tr key={issue.uuid || issue.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{issue.titlu || issue.title || '-'}</td>
                      <td className="px-3 py-3">{issue.santier || issue.projectName || projectName(projects, projectId)}</td>
                      <td className="px-3 py-3"><Badge variant={severity.variant}>{severity.label}</Badge></td>
                      <td className="px-3 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-3 py-3">{issue.raportat_de || issue.reportedBy || issue.userName || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={issues.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Meteo' && snowSeason && (
        <Card
          title="Meteo teren"
          subtitle="Date din modulul de deszăpezire."
          loading={weatherLoading}
          actions={<Button size="sm" variant="secondary" onClick={loadWeather}>Actualizează</Button>}
        >
          {!weather?.disponibil ? (
            <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">Datele meteo nu sunt disponibile momentan.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-sm text-slate-500">Temperatura</div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">{weather.temperature_2m ?? weather.temperatura ?? '-'}°C</div>
                <div className="text-sm text-slate-500">Resimțită: {weather.apparent_temperature ?? weather.resimtita ?? '-'}°C</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-sm text-slate-500">Condiții</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{weather.conditii || weather.weather_label || weather.label || '-'}</div>
                <div className="text-sm text-slate-500">Actualizat la: {weather.updated_at || weather.timestamp || '-'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-sm text-slate-500">Recomandare intervenție</div>
                <Badge className="mt-2" variant={weather.recomandare?.culoare === 'rosu' ? 'red' : weather.recomandare?.culoare === 'galben' ? 'yellow' : 'green'}>
                  {weather.recomandare?.tip || 'Monitorizare'}
                </Badge>
                <div className="mt-3 text-sm text-slate-600">{weather.recomandare?.motiv || '-'}</div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Modal open={!!selectedProject} title="Detalii proiect" size="xl" onClose={() => setSelectedProject(null)}>
        {selectedProject ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selectedProject.denumire || selectedProject.name || selectedProject.title}</h2>
              <p className="text-sm text-slate-500">{selectedProject.cod || selectedProject.code || ''}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Status</div>
                <div className="mt-1 font-semibold">{selectedProject.status || '-'}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Progres</div>
                <div className="mt-1 font-semibold">{percent(selectedProject.progres_fizic_procent || selectedProject.progress || selectedProject.progres).toFixed(0)}%</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Ultima activitate</div>
                <div className="mt-1 font-semibold">{dateValue(selectedProject.ultima_activitate || selectedProject.lastActivityAt || selectedProject.updated_at) || '-'}</div>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Galerie foto</h3>
              {gallery.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nu există fotografii încărcate pentru proiect.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {gallery.map(photo => (
                    <img
                      key={photo.id || photo.path || photo.url}
                      src={photo.thumb_url || photo.thumbnail || photo.url || photo.path}
                      alt={photo.caption || 'Fotografie proiect'}
                      className="aspect-video w-full rounded-md object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!selectedJournal} title="Detalii jurnal" size="xl" onClose={() => setSelectedJournal(null)}>
        {selectedJournal ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Dată</div>
                <div className="mt-1 font-semibold">{dateValue(selectedJournal.data || selectedJournal.date)}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Status</div>
                <div className="mt-1 font-semibold">{selectedJournal.status || '-'}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-slate-500">Tip intervenție</div>
                <div className="mt-1 font-semibold">{selectedJournal.tip_interventie || selectedJournal.tip || '-'}</div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Activități</h3>
                <div className="rounded-md border border-slate-200">
                  {arrayFrom(journalDetails, ['activities', 'activitati']).length === 0 ? (
                    <div className="p-4 text-sm text-slate-500">Nu există activități în jurnal.</div>
                  ) : arrayFrom(journalDetails, ['activities', 'activitati']).map(activity => (
                    <div key={activity.id || activity.uuid} className="border-b border-slate-100 p-3 text-sm last:border-b-0">
                      <div className="font-medium text-slate-800">{activity.descriere || activity.description || activity.activitate || 'Activitate'}</div>
                      <div className="text-slate-500">{activity.cantitate_executata || activity.quantity || ''} {activity.um || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Fotografii</h3>
                <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-500">
                  {arrayFrom(journalDetails, ['photos', 'fotografii']).length === 0 ? 'Nu există fotografii în jurnal.' : `${arrayFrom(journalDetails, ['photos', 'fotografii']).length} fotografii atașate.`}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={journalModal} title="Jurnal nou" onClose={() => setJournalModal(false)}>
        <form className="grid gap-4" onSubmit={saveJournal}>
          <Select label="Proiect" value={journalForm.santier_id} onChange={event => setJournalForm({ ...journalForm, santier_id: event.target.value })}>
            <option value="">Alege proiectul</option>
            {projects.map(project => (
              <option key={project.id || project.uuid} value={project.id || project.uuid}>{project.denumire || project.name || project.cod}</option>
            ))}
          </Select>
          <Input label="Dată" type="date" value={journalForm.data} onChange={event => setJournalForm({ ...journalForm, data: event.target.value })} />
          <Input label="Tip intervenție" value={journalForm.tip_interventie} onChange={event => setJournalForm({ ...journalForm, tip_interventie: event.target.value })} />
          <Input label="Observații" value={journalForm.observatii} onChange={event => setJournalForm({ ...journalForm, observatii: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setJournalModal(false)}>Renunță</Button>
            <Button type="submit">Salvează jurnal</Button>
          </div>
        </form>
      </Modal>

      <Modal open={issueModal} title="Raportează problemă" onClose={() => setIssueModal(false)}>
        <form className="grid gap-4" onSubmit={saveIssue}>
          <Select label="Proiect" value={issueForm.santier_id} onChange={event => setIssueForm({ ...issueForm, santier_id: event.target.value })}>
            <option value="">Alege proiectul</option>
            {projects.map(project => (
              <option key={project.id || project.uuid} value={project.id || project.uuid}>{project.denumire || project.name || project.cod}</option>
            ))}
          </Select>
          <Input label="Titlu" value={issueForm.titlu} onChange={event => setIssueForm({ ...issueForm, titlu: event.target.value })} />
          <Select label="Gravitate" value={issueForm.gravitate} onChange={event => setIssueForm({ ...issueForm, gravitate: event.target.value })}>
            <option value="minoră">Minoră</option>
            <option value="majoră">Majoră</option>
            <option value="blocantă">Blocantă</option>
          </Select>
          <Input label="Descriere" value={issueForm.descriere} onChange={event => setIssueForm({ ...issueForm, descriere: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIssueModal(false)}>Renunță</Button>
            <Button type="submit">Trimite problema</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
