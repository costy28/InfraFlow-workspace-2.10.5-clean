import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'

const tabs = ['Documente', 'Împrumuturi', 'Casare']
const pageSize = 10

function today() {
  return new Date().toISOString().slice(0, 10)
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

function isOverdue(date) {
  const value = dateValue(date)
  return value ? value < today() : false
}

function statusBadge(item) {
  if (isOverdue(item.data_returnare_planificata) && item.status !== 'returnata') {
    return { label: 'Termen depășit', variant: 'red' }
  }
  const raw = String(item.status || '').toLowerCase()
  if (['returnata', 'disponibil', 'aprobat'].includes(raw)) return { label: item.status || 'Disponibil', variant: 'green' }
  if (['solicitata', 'imprumutata', 'împrumutată'].includes(raw)) return { label: item.status || 'Solicitată', variant: 'yellow' }
  return { label: item.status || '-', variant: 'gray' }
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
        {loading ? 'Se încarcă...' : 'Nu există date pentru tabul selectat.'}
      </td>
    </tr>
  )
}

export default function ArhivaPage() {
  const [activeTab, setActiveTab] = useState('Documente')
  const [documents, setDocuments] = useState([])
  const [requests, setRequests] = useState([])
  const [casare, setCasare] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState('')
  const [query, setQuery] = useState('')
  const [documentForm, setDocumentForm] = useState({
    denumire: '',
    tip: '',
    an: new Date().getFullYear(),
    locatie_fizica: '',
    emitent: '',
    destinatar: '',
    termen_pastrare: '',
    observatii: '',
  })
  const [requestForm, setRequestForm] = useState({
    document_id: '',
    scop: '',
    data_returnare_planificata: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const documentCall = query.trim().length >= 3
        ? api.get('/archive/documents/search', { params: { q: query.trim() } })
        : api.get('/archive/documents')
      const [documentsRes, requestsRes, casareRes] = await Promise.all([
        documentCall,
        api.get('/archive/requests'),
        api.get('/archive/casare'),
      ])
      setDocuments(arrayFrom(documentsRes.data, ['documents', 'items', 'data']))
      setRequests(arrayFrom(requestsRes.data, ['requests', 'items', 'data']))
      setCasare(arrayFrom(casareRes.data, ['documents', 'items', 'data']))
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut încărca datele din arhivă.')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 250)
    return () => clearTimeout(timer)
  }, [load])

  const pagedDocuments = useMemo(() => documents.slice((page - 1) * pageSize, page * pageSize), [documents, page])
  const pagedRequests = useMemo(() => requests.slice((page - 1) * pageSize, page * pageSize), [requests, page])
  const pagedCasare = useMemo(() => casare.slice((page - 1) * pageSize, page * pageSize), [casare, page])

  function selectTab(tab) {
    setActiveTab(tab)
    setPage(1)
    setMessage('')
    setError('')
  }

  async function save(endpoint, payload, reset, successMessage) {
    setError('')
    setMessage('')
    try {
      await api.post(endpoint, payload)
      setMessage(successMessage)
      setModal('')
      reset()
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Înregistrarea nu a putut fi salvată.')
    }
  }

  async function returnRequest(uuid) {
    setError('')
    try {
      await api.post(`/archive/requests/${uuid}/return`)
      setMessage('Împrumutul a fost marcat ca returnat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Împrumutul nu a putut fi returnat.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Arhivă</h1>
          <p className="text-sm text-slate-500">Evidență documente fizice, împrumuturi și casare.</p>
        </div>
        <Button onClick={() => setModal(activeTab === 'Împrumuturi' ? 'request' : 'document')}>
          {activeTab === 'Împrumuturi' ? 'Solicită împrumut' : 'Document nou'}
        </Button>
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

      {activeTab === 'Documente' && (
        <Card title="Documente arhivate" subtitle="Căutare full-text și evidență locație fizică." loading={loading} actions={<Button size="sm" onClick={() => setModal('document')}>Document nou</Button>}>
          <div className="mb-4">
            <Input
              label="Căutare full-text"
              placeholder="Minim 3 caractere"
              value={query}
              onChange={event => {
                setQuery(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr inventar</th>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">An</th>
                  <th className="px-3 py-2">Locație fizică</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedDocuments.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedDocuments.map(item => (
                  <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium text-slate-800">{item.nr_inventar || '-'}</td>
                    <td className="px-3 py-3">{item.denumire || item.titlu || '-'}</td>
                    <td className="px-3 py-3">{item.tip || '-'}</td>
                    <td className="px-3 py-3">{item.an || '-'}</td>
                    <td className="px-3 py-3">{item.locatie_fizica || item.locatie || item.raft || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={documents.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Împrumuturi' && (
        <Card title="Împrumuturi" subtitle="Solicitări și documente împrumutate." loading={loading} actions={<Button size="sm" onClick={() => setModal('request')}>Solicită împrumut</Button>}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Document</th>
                  <th className="px-3 py-2">Solicitant</th>
                  <th className="px-3 py-2">Scop</th>
                  <th className="px-3 py-2">Termen returnare</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRequests.length === 0 ? <EmptyRow colSpan={6} loading={loading} /> : pagedRequests.map(item => {
                  const badge = statusBadge(item)
                  const doc = documents.find(document => String(document.id) === String(item.document_id))
                  return (
                    <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-800">{item.document || item.document_denumire || doc?.denumire || doc?.nr_inventar || item.document_id || '-'}</td>
                      <td className="px-3 py-3">{item.solicitant || item.solicitant_nume || item.solicitat_de || '-'}</td>
                      <td className="px-3 py-3">{item.scop || '-'}</td>
                      <td className="px-3 py-3">{dateValue(item.data_returnare_planificata) || '-'}</td>
                      <td className="px-3 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td className="px-3 py-3 text-right">
                        {item.status !== 'returnata' ? (
                          <Button size="sm" variant="secondary" onClick={() => returnRequest(item.uuid)}>Returnează</Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={requests.length} onPage={setPage} />
        </Card>
      )}

      {activeTab === 'Casare' && (
        <Card title="Casare" subtitle="Documente cu termen de păstrare depășit." loading={loading}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr inventar</th>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">Tip</th>
                  <th className="px-3 py-2">An</th>
                  <th className="px-3 py-2">Data casare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedCasare.length === 0 ? <EmptyRow colSpan={5} loading={loading} /> : pagedCasare.map(item => (
                  <tr key={item.id || item.uuid} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium text-slate-800">{item.nr_inventar || '-'}</td>
                    <td className="px-3 py-3">{item.denumire || item.titlu || '-'}</td>
                    <td className="px-3 py-3">{item.tip || '-'}</td>
                    <td className="px-3 py-3">{item.an || '-'}</td>
                    <td className="px-3 py-3"><Badge variant="red">{dateValue(item.data_casare) || '-'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={casare.length} onPage={setPage} />
        </Card>
      )}

      <Modal open={modal === 'document'} title="Document nou în arhivă" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/archive/documents', documentForm, () => setDocumentForm({
            denumire: '',
            tip: '',
            an: new Date().getFullYear(),
            locatie_fizica: '',
            emitent: '',
            destinatar: '',
            termen_pastrare: '',
            observatii: '',
          }), 'Documentul a fost salvat în arhivă.')
        }}>
          <Input label="Denumire" value={documentForm.denumire} onChange={event => setDocumentForm({ ...documentForm, denumire: event.target.value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Tip" value={documentForm.tip} onChange={event => setDocumentForm({ ...documentForm, tip: event.target.value })} />
            <Input label="An" type="number" value={documentForm.an} onChange={event => setDocumentForm({ ...documentForm, an: event.target.value })} />
          </div>
          <Input label="Locație fizică" value={documentForm.locatie_fizica} onChange={event => setDocumentForm({ ...documentForm, locatie_fizica: event.target.value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Emitent" value={documentForm.emitent} onChange={event => setDocumentForm({ ...documentForm, emitent: event.target.value })} />
            <Input label="Destinatar" value={documentForm.destinatar} onChange={event => setDocumentForm({ ...documentForm, destinatar: event.target.value })} />
          </div>
          <Input label="Termen păstrare (ani)" type="number" value={documentForm.termen_pastrare} onChange={event => setDocumentForm({ ...documentForm, termen_pastrare: event.target.value })} />
          <Input label="Observații" value={documentForm.observatii} onChange={event => setDocumentForm({ ...documentForm, observatii: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Salvează</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'request'} title="Solicită împrumut" onClose={() => setModal('')}>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault()
          save('/archive/requests', requestForm, () => setRequestForm({
            document_id: '',
            scop: '',
            data_returnare_planificata: '',
          }), 'Solicitarea de împrumut a fost trimisă.')
        }}>
          <Select label="Document" value={requestForm.document_id} onChange={event => setRequestForm({ ...requestForm, document_id: event.target.value })}>
            <option value="">Selectează documentul</option>
            {documents.map(item => (
              <option key={item.id || item.uuid} value={item.id}>
                {item.nr_inventar || item.denumire || item.titlu}
              </option>
            ))}
          </Select>
          <Input label="Scop" value={requestForm.scop} onChange={event => setRequestForm({ ...requestForm, scop: event.target.value })} />
          <Input label="Termen returnare" type="date" value={requestForm.data_returnare_planificata} onChange={event => setRequestForm({ ...requestForm, data_returnare_planificata: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal('')}>Renunță</Button>
            <Button type="submit">Trimite</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
