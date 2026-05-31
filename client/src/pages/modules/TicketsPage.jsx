import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Plus } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import Table from '../../components/ui/Table'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatDate } from '../../utils/format'

const tabs = ['Ale mele', 'Departament', 'Toate']

const ticketTypes = [
  { value: 'sesizare', label: 'Sesizare' },
  { value: 'idee', label: 'Idee' },
  { value: 'tehnic', label: 'Tehnic' },
  { value: 'admin', label: 'Admin' },
]

const priorities = [
  { value: 'scazuta', label: 'Scăzută' },
  { value: 'normala', label: 'Normală' },
  { value: 'ridicata', label: 'Ridicată' },
  { value: 'urgenta', label: 'Urgentă' },
  { value: 'critica', label: 'Critică' },
]

const statuses = [
  { value: 'deschis', label: 'Deschis' },
  { value: 'in_lucru', label: 'În lucru' },
  { value: 'in_asteptare', label: 'În așteptare' },
  { value: 'rezolvat', label: 'Rezolvat' },
  { value: 'inchis', label: 'Închis' },
  { value: 'respins', label: 'Respins' },
]

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key]
  return []
}

function userId(user) {
  return user?.id || user?.userId || user?.username
}

function departmentId(user) {
  return user?.departmentId || user?.department_id
}

function label(value) {
  return String(value || '-').replaceAll('_', ' ')
}

function typeBadge(ticket) {
  const map = {
    sesizare: ['🔴 Sesizare', 'danger'],
    idee: ['💡 Idee', 'warning'],
    tehnic: ['🔧 Tehnic', 'neutral'],
    admin: ['Admin', 'neutral'],
  }
  const [text, tone] = map[ticket.tip] || [label(ticket.tip), 'neutral']
  return <Badge tone={tone}>{text}</Badge>
}

function priorityTone(priority) {
  if (['critica', 'urgenta'].includes(priority)) return 'danger'
  if (priority === 'ridicata') return 'warning'
  return 'neutral'
}

function statusTone(status) {
  if (['rezolvat', 'inchis'].includes(status)) return 'success'
  if (['in_lucru', 'in_asteptare'].includes(status)) return 'warning'
  if (status === 'respins') return 'danger'
  return 'neutral'
}

function age(value) {
  if (!value) return '-'
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000))
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)} zile`
}

export default function TicketsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('Ale mele')
  const [tickets, setTickets] = useState([])
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState({ ticket: null, comments: [], attachments: [], escalations: [] })
  const [newOpen, setNewOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [newFiles, setNewFiles] = useState([])
  const [commentFiles, setCommentFiles] = useState([])
  const [statusForm, setStatusForm] = useState({ status: 'in_lucru', comentariu: '' })
  const [form, setForm] = useState({
    tip: 'sesizare',
    prioritate: 'normala',
    titlu: '',
    descriere: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/tickets')
      setTickets(arrayFrom(response.data, ['tickets']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca sesizările.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [load])

  const visibleTickets = useMemo(() => {
    const uid = String(userId(user))
    const dept = String(departmentId(user))
    if (activeTab === 'Ale mele') return tickets.filter(ticket => String(ticket.creat_de) === uid || String(ticket.asignat_la) === uid)
    if (activeTab === 'Departament') return tickets.filter(ticket => String(ticket.dept_sursa_id) === dept || String(ticket.dept_responsabil_id) === dept)
    return tickets
  }, [activeTab, tickets, user])

  async function openDetails(ticket) {
    setSelected(ticket)
    setError('')
    try {
      const response = await api.get(`/tickets/${ticket.uuid}`)
      setDetails({
        ticket: response.data.ticket || ticket,
        comments: arrayFrom(response.data, ['comments']),
        attachments: arrayFrom(response.data, ['attachments']),
        escalations: arrayFrom(response.data, ['escalations']),
      })
    } catch (err) {
      setDetails({ ticket, comments: [], attachments: [], escalations: [] })
      setError(err.response?.data?.error || 'Nu am putut încărca detaliile ticketului.')
    }
  }

  async function createTicket(event) {
    event.preventDefault()
    setError('')
    try {
      const body = new FormData()
      Object.entries(form).forEach(([key, value]) => body.append(key, value))
      newFiles.forEach(file => body.append('attachments', file))
      const response = await api.post('/tickets', body)
      setNewOpen(false)
      setForm({ tip: 'sesizare', prioritate: 'normala', titlu: '', descriere: '' })
      setNewFiles([])
      await load()
      if (response.data.ticket) await openDetails(response.data.ticket)
    } catch (err) {
      setError(err.response?.data?.error || 'Ticketul nu a putut fi creat.')
    }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!selected || !comment.trim()) return
    setError('')
    try {
      const body = new FormData()
      body.append('tip', 'comentariu')
      body.append('continut', comment.trim())
      commentFiles.forEach(file => body.append('attachments', file))
      await api.post(`/tickets/${selected.uuid}/comments`, body)
      setComment('')
      setCommentFiles([])
      await openDetails(selected)
    } catch (err) {
      setError(err.response?.data?.error || 'Comentariul nu a putut fi adăugat.')
    }
  }

  async function downloadAttachment(file) {
    if (!selected) return
    const response = await api.get(`/tickets/${selected.uuid}/attachments/${encodeURIComponent(file.fisier_nume)}`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = file.fisier_nume || 'atasament'
    link.click()
    URL.revokeObjectURL(url)
  }

  function renderFilePreview(file) {
    const isImage = /^image\//.test(file.type)
    return (
      <div key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        {isImage ? <img src={URL.createObjectURL(file)} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded bg-white">DOC</span>}
        <span className="truncate">{file.name}</span>
      </div>
    )
  }

  async function changeStatus(event) {
    event.preventDefault()
    if (!selected || !statusForm.comentariu.trim()) return
    setError('')
    try {
      await api.patch(`/tickets/${selected.uuid}/status`, statusForm)
      setStatusOpen(false)
      setStatusForm({ status: 'in_lucru', comentariu: '' })
      await load()
      await openDetails(selected)
    } catch (err) {
      setError(err.response?.data?.error || 'Statusul nu a putut fi schimbat.')
    }
  }

  const timeline = [
    ...(details.ticket ? [{ id: 'created', tip: 'actiune', continut: 'Ticket creat', created_at: details.ticket.created_at, user_id: details.ticket.creat_de }] : []),
    ...details.comments,
  ].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sesizări și idei</h1>
          <p className="text-sm text-slate-600">Ticketing intern pentru probleme operaționale, idei și suport tehnic.</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus size={16} /> Ticket nou</Button>
      </div>

      {error && <Card className="border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</Card>}

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <Card>
          <Table
            columns={[
              { key: 'tip', label: 'Tip', render: row => typeBadge(row) },
              { key: 'prioritate', label: 'Prioritate', render: row => <Badge tone={priorityTone(row.prioritate)}>{label(row.prioritate)}</Badge> },
              { key: 'titlu', label: 'Titlu' },
              { key: 'status', label: 'Status', render: row => <Badge tone={statusTone(row.status)}>{label(row.status)}</Badge> },
              { key: 'created_at', label: 'Timp scurs', render: row => <span className="inline-flex items-center gap-1"><Clock size={13} /> {age(row.created_at)}</span> },
              { key: 'actions', label: '', render: row => <Button variant="ghost" onClick={() => openDetails(row)}>Detalii</Button> },
            ]}
            rows={visibleTickets}
            empty={loading ? 'Se încarcă...' : 'Nu există tickets.'}
          />
        </Card>

        <Card className="grid gap-4">
          {details.ticket ? (
            <>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    {typeBadge(details.ticket)}
                    <Badge tone={priorityTone(details.ticket.prioritate)}>{label(details.ticket.prioritate)}</Badge>
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">{details.ticket.titlu}</h2>
                  <p className="mt-1 text-sm text-slate-600">{details.ticket.descriere || 'Fără descriere.'}</p>
                </div>
                <Badge tone={statusTone(details.ticket.status)}>{label(details.ticket.status)}</Badge>
              </div>

              <div className="grid gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Timeline activitate</h3>
                {timeline.length === 0 ? (
                  <p className="text-sm text-slate-500">Nu există activitate.</p>
                ) : timeline.map(item => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone={item.tip === 'statuschange' ? 'warning' : 'neutral'}>{label(item.tip)}</Badge>
                      <span>{formatDate(item.created_at)}</span>
                      <span>de {item.user_id || '-'}</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-800">{item.continut}</div>
                  </div>
                ))}
              </div>

              {details.attachments.length ? (
                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Atașamente</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {details.attachments.map(file => (
                      <button
                        type="button"
                        key={file.id || file.fisier_path}
                        className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:border-primary-300"
                        onClick={() => downloadAttachment(file)}
                      >
                        <span className="block truncate font-medium">{file.fisier_nume}</span>
                        <span className="text-xs text-slate-500">{Math.round((file.fisier_marime || 0) / 1024)} KB</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <form className="grid gap-2" onSubmit={addComment}>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Comentariu
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    value={comment}
                    onChange={event => setComment(event.target.value)}
                  />
                </label>
                <label className="grid gap-2 rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Atașează documente/poze</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.docx"
                    multiple
                    onChange={event => setCommentFiles(Array.from(event.target.files || []))}
                  />
                  {commentFiles.length ? <div className="grid gap-2 sm:grid-cols-2">{commentFiles.map(renderFilePreview)}</div> : null}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!comment.trim()}>Adaugă comentariu</Button>
                  <Button type="button" variant="secondary" onClick={() => setStatusOpen(true)}>Schimbă status</Button>
                </div>
              </form>
            </>
          ) : (
            <p className="text-sm text-slate-500">Selectează un ticket pentru detalii.</p>
          )}
        </Card>
      </div>

      <Modal open={newOpen} title="Ticket nou" onClose={() => setNewOpen(false)}>
        <form className="grid gap-3" onSubmit={createTicket}>
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Tip" value={form.tip} onChange={event => setForm(current => ({ ...current, tip: event.target.value }))} options={ticketTypes} />
            <Select label="Prioritate" value={form.prioritate} onChange={event => setForm(current => ({ ...current, prioritate: event.target.value }))} options={priorities} />
          </div>
          <Input label="Titlu" value={form.titlu} onChange={event => setForm(current => ({ ...current, titlu: event.target.value }))} required />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Descriere
            <textarea
              className="min-h-28 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={form.descriere}
              onChange={event => setForm(current => ({ ...current, descriere: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Atașează documente/poze</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              multiple
              onChange={event => setNewFiles(Array.from(event.target.files || []))}
            />
            {newFiles.length ? <div className="grid gap-2 sm:grid-cols-2">{newFiles.map(renderFilePreview)}</div> : null}
          </label>
          <Button type="submit" disabled={!form.titlu.trim()}>Creează ticket</Button>
        </form>
      </Modal>

      <Modal open={statusOpen} title="Schimbă status" onClose={() => setStatusOpen(false)}>
        <form className="grid gap-3" onSubmit={changeStatus}>
          <Select label="Status nou" value={statusForm.status} onChange={event => setStatusForm(current => ({ ...current, status: event.target.value }))} options={statuses} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Comentariu obligatoriu
            <textarea
              className="min-h-28 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              value={statusForm.comentariu}
              onChange={event => setStatusForm(current => ({ ...current, comentariu: event.target.value }))}
            />
          </label>
          <Button type="submit" disabled={!statusForm.comentariu.trim()}>Aplică status</Button>
        </form>
      </Modal>
    </div>
  )
}
