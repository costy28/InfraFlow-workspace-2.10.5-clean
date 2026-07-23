import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'

const tabs = [
  { id: 'assigned', label: 'Ale mele' },
  { id: 'team', label: 'Echipa mea' },
  { id: 'created', label: 'Create de mine' },
  { id: 'all', label: 'Toate vizibile' },
]

const priorities = [
  { value: 'low', label: 'Scăzută' },
  { value: 'normal', label: 'Normală' },
  { value: 'high', label: 'Ridicată' },
  { value: 'urgent', label: 'Urgentă' },
]

const statuses = [
  { value: 'open', label: 'Deschis' },
  { value: 'in_progress', label: 'În lucru' },
  { value: 'blocked', label: 'Blocat' },
  { value: 'done', label: 'Finalizat' },
  { value: 'cancelled', label: 'Anulat' },
]

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key]
  return []
}

function userId(user) {
  return String(user?.id || user?.userId || user?.username || '')
}

function label(value) {
  return String(value || '-').replaceAll('_', ' ')
}

function statusTone(status) {
  if (status === 'done') return 'success'
  if (status === 'blocked' || status === 'cancelled') return 'danger'
  if (status === 'in_progress') return 'warning'
  return 'neutral'
}

function priorityTone(priority) {
  if (priority === 'urgent') return 'danger'
  if (priority === 'high') return 'warning'
  return 'neutral'
}

function isOverdue(task) {
  return task.due_date && !['done', 'cancelled'].includes(task.status) && new Date(task.due_date) < new Date()
}

const emptyForm = {
  title: '',
  description: '',
  assigned_to: '',
  due_date: '',
  priority: 'normal',
}

export default function TasksPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('assigned')
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [templates, setTemplates] = useState([])
  const [templateAssignee, setTemplateAssignee] = useState('')
  const [assigneeScope, setAssigneeScope] = useState('self')
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState({ task: null, comments: [], attachments: [] })
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const isManager = ['superadmin', 'admin', 'manager', 'sef_departament', 'sef-departament'].includes(String(user?.role || '')) ||
    (Array.isArray(user?.permissions) && user.permissions.some(permission => ['tasks:manage', 'users:manage', 'department:manage'].includes(permission)))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tasksRes, usersRes, templatesRes] = await Promise.all([
        api.get('/tasks', { params: { scope: activeTab === 'all' ? undefined : activeTab } }),
        api.get('/tasks/assignees').catch(() => ({ data: { users: [], scope: 'self' } })),
        api.get('/tasks/templates').catch(() => ({ data: { templates: [] } })),
      ])
      setTasks(arrayFrom(tasksRes.data, ['tasks']))
      setUsers(arrayFrom(usersRes.data, ['users']))
      setTemplates(arrayFrom(templatesRes.data, ['templates']))
      setAssigneeScope(usersRes.data?.scope || 'self')
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca task-urile.')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [load])

  useEffect(() => {
    if (formOpen && !form.assigned_to) {
      setForm(current => ({ ...current, assigned_to: userId(user) }))
    }
  }, [formOpen, form.assigned_to, user])

  useEffect(() => {
    if (!templateAssignee && users.length) {
      const ownId = userId(user)
      const ownUser = users.find(item => String(item.id || item.username) === ownId)
      const fallback = ownUser || users[0]
      setTemplateAssignee(String(fallback?.id || fallback?.username || ''))
    }
  }, [templateAssignee, users, user])

  const canSeeTeamTab = isManager || ['all', 'department', 'hierarchy'].includes(assigneeScope) || users.some(item => item.direct_report)
  const visibleTabs = tabs.filter(tab => {
    if (tab.id === 'all') return isManager
    if (tab.id === 'team') return canSeeTeamTab
    return true
  })

  useEffect(() => {
    if (activeTab === 'team' && !canSeeTeamTab) setActiveTab('assigned')
  }, [activeTab, canSeeTeamTab])

  const stats = useMemo(() => {
    const open = tasks.filter(task => !['done', 'cancelled'].includes(task.status)).length
    const overdue = tasks.filter(isOverdue).length
    const done = tasks.filter(task => task.status === 'done').length
    return { open, overdue, done }
  }, [tasks])

  async function openDetails(task) {
    setSelected(task)
    setComment('')
    try {
      const response = await api.get(`/tasks/${task.id}`)
      setDetails({
        task: response.data.task || task,
        comments: arrayFrom(response.data, ['comments']),
        attachments: arrayFrom(response.data, ['attachments']),
      })
    } catch (err) {
      setMessage(err.response?.data?.error || 'Nu am putut încărca detaliile task-ului.')
      setDetails({ task, comments: [], attachments: [] })
    }
  }

  async function createTask(event) {
    event.preventDefault()
    setMessage('')
    try {
      await api.post('/tasks', form)
      setForm(emptyForm)
      setFormOpen(false)
      setMessage('Task creat.')
      await load()
    } catch (err) {
      setMessage(err.response?.data?.error || 'Task-ul nu a putut fi creat.')
    }
  }

  async function createFromTemplate(template) {
    setMessage('')
    try {
      await api.post('/tasks/from-template', {
        template_id: template.id,
        assigned_to: templateAssignee || userId(user),
      })
      setMessage(`Task creat din șablon: ${template.name || template.title}.`)
      await load()
    } catch (err) {
      setMessage(err.response?.data?.error || 'Task-ul din șablon nu a putut fi creat.')
    }
  }

  async function updateTask(task, patch) {
    setMessage('')
    try {
      const response = await api.patch(`/tasks/${task.id}`, patch)
      const updated = response.data.task
      setTasks(current => current.map(item => item.id === updated.id ? updated : item))
      if (selected?.id === updated.id) setDetails(current => ({ ...current, task: updated }))
      setMessage('Task actualizat.')
    } catch (err) {
      setMessage(err.response?.data?.error || 'Task-ul nu a putut fi actualizat.')
    }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!selected || !comment.trim()) return
    try {
      const response = await api.post(`/tasks/${selected.id}/comments`, { text: comment })
      setDetails(current => ({ ...current, comments: [...current.comments, response.data.comment] }))
      setComment('')
    } catch (err) {
      setMessage(err.response?.data?.error || 'Comentariul nu a putut fi salvat.')
    }
  }

  const userOptions = users.map(item => ({
    value: String(item.id || item.username),
    label: `${item.name || item.username || item.id}${item.department ? ` — ${item.department}` : ''}${item.direct_report ? ' · subordonat direct' : ''}`,
  }))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Task-uri</h2>
          <p className="text-sm text-slate-500">Task-uri personale și task-uri delegate în echipă.</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>+ Task nou</Button>
      </div>

      <Card className="border-primary-100 bg-primary-50/40">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
          <div>
            <strong>Delegare:</strong>{' '}
            {assigneeScope === 'all'
              ? 'poți delega către orice utilizator activ.'
              : assigneeScope === 'department'
                ? 'poți delega către tine și colegii din departamentul tău.'
                : assigneeScope === 'hierarchy'
                  ? 'poți delega către tine și subordonații tăi direcți.'
                  : 'poți crea task-uri pentru tine.'}
          </div>
          <Badge tone="info">{userOptions.length} responsabili disponibili</Badge>
        </div>
      </Card>

      {templates.length ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Șabloane rapide</h3>
              <p className="text-sm text-slate-500">Pornește task-uri repetitive fără să rescrii aceleași instrucțiuni.</p>
            </div>
            <Select label="Responsabil pentru șablon" value={templateAssignee} onChange={event => setTemplateAssignee(event.target.value)}>
              {userOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {templates.map(template => (
              <button
                key={template.id}
                type="button"
                className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary-300 hover:bg-primary-50"
                onClick={() => createFromTemplate(template)}
                disabled={!templateAssignee && !userId(user)}
              >
                <div className="text-xs font-semibold uppercase text-slate-500">{template.category || 'Task'}</div>
                <div className="mt-1 font-semibold text-slate-900">{template.name || template.title}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone={priorityTone(template.priority)} size="sm">{label(template.priority)}</Badge>
                  <Badge tone="neutral" size="sm">{Number(template.due_days || 0) === 0 ? 'azi' : `+${template.due_days} zile`}</Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {message ? <div className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-700">{message}</div> : null}
      {error ? <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Card><div className="text-xs uppercase text-slate-500">Deschise</div><div className="mt-1 text-2xl font-bold">{stats.open}</div></Card>
        <Card><div className="text-xs uppercase text-slate-500">Întârziate</div><div className="mt-1 text-2xl font-bold text-rose-700">{stats.overdue}</div></Card>
        <Card><div className="text-xs uppercase text-slate-500">Finalizate</div><div className="mt-1 text-2xl font-bold text-primary-700">{stats.done}</div></Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${activeTab === tab.id ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-8 text-sm text-slate-500">Se încarcă task-urile...</p>
        ) : tasks.length ? (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Responsabil</th>
                  <th className="px-3 py-2">Scadență</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map(task => (
                  <tr key={task.id}>
                    <td className="px-3 py-2">
                      <button className="text-left font-semibold text-slate-900 hover:text-primary-700" onClick={() => openDetails(task)}>
                        {task.title}
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone={priorityTone(task.priority)} size="sm">{label(task.priority)}</Badge>
                        {task.source_type ? <Badge tone="info" size="sm">{label(task.source_type)}</Badge> : null}
                        {isOverdue(task) ? <Badge tone="danger" size="sm">întârziat</Badge> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{task.assigned_to_name || task.assigned_to}</td>
                    <td className="px-3 py-2 text-slate-600">{task.due_date || '-'}</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(task.status)}>{label(task.status)}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => updateTask(task, { status: 'in_progress' })}>În lucru</Button>
                        <Button onClick={() => updateTask(task, { status: 'done' })}>Finalizat</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-sm text-slate-500">Nu există task-uri în această listă.</p>
        )}
      </Card>

      <Modal open={formOpen} title="Task nou" onClose={() => setFormOpen(false)} size="lg">
        <form className="grid gap-3" onSubmit={createTask}>
          <Input label="Titlu" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} required />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Descriere
            <textarea
              className="min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={form.description}
              onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="Responsabil" value={form.assigned_to} onChange={event => setForm(current => ({ ...current, assigned_to: event.target.value }))}>
              {userOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Input label="Scadență" type="date" value={form.due_date} onChange={event => setForm(current => ({ ...current, due_date: event.target.value }))} />
            <Select label="Prioritate" value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value }))}>
              {priorities.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Renunță</Button>
            <Button type="submit">Salvează task</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} title="Detalii task" onClose={() => { setSelected(null); setDetails({ task: null, comments: [], attachments: [] }) }} size="lg">
        {details.task ? (
          <div className="grid gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{details.task.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{details.task.description || 'Fără descriere.'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={statusTone(details.task.status)}>{label(details.task.status)}</Badge>
                <Badge tone={priorityTone(details.task.priority)}>{label(details.task.priority)}</Badge>
                {details.task.due_date ? <Badge tone={isOverdue(details.task) ? 'danger' : 'neutral'}>{details.task.due_date}</Badge> : null}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Select label="Status" value={details.task.status || 'open'} onChange={event => updateTask(details.task, { status: event.target.value })}>
                {statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              <Select label="Prioritate" value={details.task.priority || 'normal'} onChange={event => updateTask(details.task, { priority: event.target.value })}>
                {priorities.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Dovezi atașate</h4>
              <div className="mb-4 grid gap-2">
                {details.attachments.length ? details.attachments.map(item => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-white px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-slate-800">{item.file_name || 'Dovadă task'}</div>
                      <div className="text-xs text-slate-500">{item.created_by_name || item.created_by} · {String(item.created_at || '').slice(0, 16).replace('T', ' ')} · {Math.ceil(Number(item.file_size || 0) / 1024)} KB</div>
                      {item.note ? <div className="mt-1 text-xs text-slate-500">{item.note}</div> : null}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>Descarcă</Button>
                  </div>
                )) : <p className="text-sm text-slate-500">Nu există dovezi atașate.</p>}
              </div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Comentarii</h4>
              <div className="grid gap-2">
                {details.comments.length ? details.comments.map(item => (
                  <div key={item.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <div className="text-xs text-slate-500">{item.created_by_name || item.created_by} · {String(item.created_at || '').slice(0, 16).replace('T', ' ')}</div>
                    <div className="mt-1 whitespace-pre-wrap text-slate-700">{item.text}</div>
                  </div>
                )) : <p className="text-sm text-slate-500">Nu există comentarii.</p>}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={addComment}>
                <Input value={comment} onChange={event => setComment(event.target.value)} placeholder="Adaugă un comentariu..." />
                <Button type="submit">Trimite</Button>
              </form>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
