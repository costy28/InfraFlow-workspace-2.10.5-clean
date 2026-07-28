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

function urlSourceFilters() {
  if (typeof window === 'undefined') return { source_type: '', source_id: '' }
  const params = new URLSearchParams(window.location.search)
  return {
    source_type: params.get('source_type') || '',
    source_id: params.get('source_id') || '',
  }
}

function urlTaskParam() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('task') || ''
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
  source_type: '',
  source_id: '',
  source_label: '',
  source_url: '',
}

const emptyTemplateForm = {
  name: '',
  title: '',
  description: '',
  category: 'Personalizat',
  due_days: 1,
  priority: 'normal',
}

export default function TasksPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('assigned')
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [templates, setTemplates] = useState([])
  const [sourceTypes, setSourceTypes] = useState([])
  const [sourceFilters, setSourceFilters] = useState(urlSourceFilters)
  const [templateAssignee, setTemplateAssignee] = useState('')
  const [canManageTemplates, setCanManageTemplates] = useState(false)
  const [assigneeScope, setAssigneeScope] = useState('self')
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState({ task: null, comments: [], attachments: [] })
  const [relatedEmails, setRelatedEmails] = useState([])
  const [relatedEmailsLoading, setRelatedEmailsLoading] = useState(false)
  const [pendingTaskParam, setPendingTaskParam] = useState(urlTaskParam)
  const [formOpen, setFormOpen] = useState(false)
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm)
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
      const [tasksRes, usersRes, templatesRes, sourceTypesRes] = await Promise.all([
        api.get('/tasks', {
          params: {
            scope: activeTab === 'all' ? undefined : activeTab,
            source_type: sourceFilters.source_type || undefined,
            source_id: sourceFilters.source_id || undefined,
          },
        }),
        api.get('/tasks/assignees').catch(() => ({ data: { users: [], scope: 'self' } })),
        api.get('/tasks/templates').catch(() => ({ data: { templates: [] } })),
        api.get('/tasks/source-types').catch(() => ({ data: { source_types: [] } })),
      ])
      setTasks(arrayFrom(tasksRes.data, ['tasks']))
      setUsers(arrayFrom(usersRes.data, ['users']))
      setTemplates(arrayFrom(templatesRes.data, ['templates']))
      setSourceTypes(arrayFrom(sourceTypesRes.data, ['source_types']))
      setCanManageTemplates(Boolean(templatesRes.data?.can_manage_templates))
      setAssigneeScope(usersRes.data?.scope || 'self')
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca task-urile.')
    } finally {
      setLoading(false)
    }
  }, [activeTab, sourceFilters.source_id, sourceFilters.source_type])

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

  useEffect(() => {
    if (!pendingTaskParam || loading) return
    const target = tasks.find(task => String(task.id) === String(pendingTaskParam))
    if (!target) {
      if (activeTab !== 'all' && isManager) setActiveTab('all')
      return
    }
    setPendingTaskParam('')
    Promise.resolve().then(() => openDetails(target))
  }, [activeTab, isManager, loading, pendingTaskParam, tasks])

  async function openDetails(task) {
    setSelected(task)
    setComment('')
    setRelatedEmails([])
    setRelatedEmailsLoading(true)
    try {
      const [response, emailsResponse] = await Promise.all([
        api.get(`/tasks/${task.id}`),
        api.get('/messaging/email/links', { params: { target_type: 'task', target_id: String(task.id) } }).catch(() => ({ data: { emails: [] } })),
      ])
      setDetails({
        task: response.data.task || task,
        comments: arrayFrom(response.data, ['comments']),
        attachments: arrayFrom(response.data, ['attachments']),
      })
      setRelatedEmails(arrayFrom(emailsResponse.data, ['emails']))
    } catch (err) {
      setMessage(err.response?.data?.error || 'Nu am putut încărca detaliile task-ului.')
      setDetails({ task, comments: [], attachments: [] })
    } finally {
      setRelatedEmailsLoading(false)
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

  async function createTemplate(event) {
    event.preventDefault()
    setMessage('')
    try {
      await api.post('/tasks/templates', templateForm)
      setTemplateForm(emptyTemplateForm)
      setTemplateFormOpen(false)
      setMessage('Șablon de task creat.')
      await load()
    } catch (err) {
      setMessage(err.response?.data?.error || 'Șablonul nu a putut fi creat.')
    }
  }

  async function cancelTemplate(template) {
    if (template.system) return
    setMessage('')
    try {
      await api.patch(`/tasks/templates/${template.id}`, { cancelled: true, reason: 'Dezactivat din pagina Task-uri.' })
      setMessage(`Șablon dezactivat: ${template.name || template.title}.`)
      await load()
    } catch (err) {
      setMessage(err.response?.data?.error || 'Șablonul nu a putut fi dezactivat.')
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

  const sourceTypeOptions = sourceTypes.map(item => ({ value: item.value, label: item.label }))
  const activeSourceType = sourceTypeOptions.find(item => item.value === sourceFilters.source_type)
  const hasSourceFilter = Boolean(sourceFilters.source_type || sourceFilters.source_id)

  function clearSourceFilters() {
    setSourceFilters({ source_type: '', source_id: '' })
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

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
            <div className="flex flex-wrap items-end gap-2">
              <Select label="Responsabil pentru șablon" value={templateAssignee} onChange={event => setTemplateAssignee(event.target.value)}>
                {userOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              {canManageTemplates ? <Button variant="secondary" onClick={() => setTemplateFormOpen(true)}>+ Șablon</Button> : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {templates.map(template => (
              <div
                key={template.id}
                className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary-300 hover:bg-primary-50"
              >
                <div className="text-xs font-semibold uppercase text-slate-500">{template.category || 'Task'}</div>
                <div className="mt-1 font-semibold text-slate-900">{template.name || template.title}</div>
                {template.description ? <div className="mt-1 line-clamp-2 text-xs text-slate-500">{template.description}</div> : null}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone={priorityTone(template.priority)} size="sm">{label(template.priority)}</Badge>
                  <Badge tone="neutral" size="sm">{Number(template.due_days || 0) === 0 ? 'azi' : `+${template.due_days} zile`}</Badge>
                  {!template.system ? <Badge tone="info" size="sm">custom</Badge> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => createFromTemplate(template)} disabled={!templateAssignee && !userId(user)}>Creează</Button>
                  {canManageTemplates && !template.system ? <Button size="sm" variant="secondary" onClick={() => cancelTemplate(template)}>Dezactivează</Button> : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {message ? <div className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-700">{message}</div> : null}
      {error ? <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      {hasSourceFilter ? (
        <Card className="border-blue-100 bg-blue-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="text-blue-900">
              <div className="font-semibold">Lista este filtrată după sursa ERP</div>
              <div className="mt-1 text-blue-700">
                {activeSourceType?.label || label(sourceFilters.source_type || 'sursă')}
                {sourceFilters.source_id ? <span> · ID: {sourceFilters.source_id}</span> : null}
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={clearSourceFilters}>Arată toate task-urile</Button>
          </div>
        </Card>
      ) : null}

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
                        {task.source_type ? <Badge tone="info" size="sm">{task.source_type_label || label(task.source_type)}</Badge> : null}
                        {isOverdue(task) ? <Badge tone="danger" size="sm">întârziat</Badge> : null}
                      </div>
                      {task.source_label ? <div className="mt-1 text-xs text-slate-500">Legat de: {task.source_label}</div> : null}
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
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-800">Legare opțională la o sursă ERP</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Select label="Tip sursă" value={form.source_type} onChange={event => setForm(current => ({ ...current, source_type: event.target.value }))}>
                <option value="">Fără legare</option>
                {sourceTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              <Input label="ID sursă" value={form.source_id} onChange={event => setForm(current => ({ ...current, source_id: event.target.value }))} placeholder="ex: contract-123" />
              <Input label="Etichetă afișată" value={form.source_label} onChange={event => setForm(current => ({ ...current, source_label: event.target.value }))} placeholder="ex: Contract furnizare motorină" />
              <Input label="Link intern" value={form.source_url} onChange={event => setForm(current => ({ ...current, source_url: event.target.value }))} placeholder="/contracte?contract=..." />
            </div>
            <p className="mt-2 text-xs text-slate-500">Linkul trebuie să fie intern și să înceapă cu `/`. Dacă lipsește, aplicația îl construiește din tip și ID când poate.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Renunță</Button>
            <Button type="submit">Salvează task</Button>
          </div>
        </form>
      </Modal>

      <Modal open={templateFormOpen} title="Șablon task nou" onClose={() => setTemplateFormOpen(false)} size="lg">
        <form className="grid gap-3" onSubmit={createTemplate}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Nume scurt" value={templateForm.name} onChange={event => setTemplateForm(current => ({ ...current, name: event.target.value }))} required />
            <Input label="Categorie" value={templateForm.category} onChange={event => setTemplateForm(current => ({ ...current, category: event.target.value }))} />
          </div>
          <Input label="Titlu task generat" value={templateForm.title} onChange={event => setTemplateForm(current => ({ ...current, title: event.target.value }))} required />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Instrucțiuni implicite
            <textarea
              className="min-h-28 rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={templateForm.description}
              onChange={event => setTemplateForm(current => ({ ...current, description: event.target.value }))}
              placeholder="Ce trebuie să facă responsabilul, ce dovadă trebuie atașată, cum se marchează finalizarea..."
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Termen implicit, zile" type="number" min="0" max="365" value={templateForm.due_days} onChange={event => setTemplateForm(current => ({ ...current, due_days: event.target.value }))} />
            <Select label="Prioritate implicită" value={templateForm.priority} onChange={event => setTemplateForm(current => ({ ...current, priority: event.target.value }))}>
              {priorities.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
          <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Șablonul va fi disponibil în lista rapidă pentru coordonatori. Nu creează task-uri singur; doar standardizează task-urile repetitive.
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTemplateFormOpen(false)}>Renunță</Button>
            <Button type="submit">Salvează șablon</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} title="Detalii task" onClose={() => { setSelected(null); setDetails({ task: null, comments: [], attachments: [] }); setRelatedEmails([]) }} size="lg">
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
              {details.task.source_label || details.task.source_type ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <div className="text-xs font-semibold uppercase text-slate-500">Legat de</div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900">{details.task.source_label || details.task.source_type_label || label(details.task.source_type)}</span>
                      {details.task.source_id ? <span className="ml-2 text-xs text-slate-500">ID: {details.task.source_id}</span> : null}
                    </div>
                    {details.task.source_url ? (
                      <Button size="sm" variant="secondary" onClick={() => window.location.assign(details.task.source_url)}>Deschide sursa</Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Emailuri legate</div>
                  <div className="text-xs text-slate-500">Context primit din Inbox ERP pentru acest task.</div>
                </div>
                <Badge tone={relatedEmails.length ? 'info' : 'neutral'}>{relatedEmails.length} emailuri</Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {relatedEmailsLoading ? (
                  <p className="text-sm text-slate-500">Se încarcă emailurile legate...</p>
                ) : relatedEmails.length === 0 ? (
                  <p className="text-sm text-slate-500">Nu există emailuri legate manual de acest task.</p>
                ) : relatedEmails.slice(0, 4).map(email => (
                  <div key={email.id} className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-blue-950">📧 {email.subject || email.from || `Email ${email.id}`}</div>
                        <div className="mt-1 text-xs text-slate-600">{email.from || '-'} · {String(email.received_at || email.created_at || '').slice(0, 16).replace('T', ' ')}</div>
                        {email.preview ? <div className="mt-1 line-clamp-2 text-xs text-slate-500">{email.preview}</div> : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Badge tone={priorityTone(email.importance === 'urgent' ? 'urgent' : email.importance === 'high' ? 'high' : 'normal')} size="sm">{label(email.importance || 'normal')}</Badge>
                        {email.has_attachments ? <Badge tone="info" size="sm">{email.attachments_count || 1} ataș.</Badge> : null}
                        <Button size="sm" variant="secondary" onClick={() => { window.location.href = `/mesaje?email=${encodeURIComponent(String(email.id))}` }}>Deschide</Button>
                      </div>
                    </div>
                  </div>
                ))}
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
