import { useEffect, useState } from 'react'
import api from '../../../api/client'
import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const fileTypes = [
  {value:'contract',label:'Contract'},
  {value:'act_aditional',label:'Act aditional'},
  {value:'identitate',label:'Act identitate'},
  {value:'fisa_post',label:'Fisa postului'},
  {value:'ssm',label:'SSM / PSI'},
  {value:'medical',label:'Medical'},
  {value:'diploma',label:'Diploma'},
  {value:'gdpr',label:'GDPR'},
  {value:'altul',label:'Altul'}
]

export default function HREmployeeFilesTab({ employeeId, canManage, onError, suggestedUpload = null, onSuggestionUsed = () => {} }) {
  const [items, setItems] = useState([])
  const [file, setFile] = useState(null)
  const [type, setType] = useState('contract')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)

  async function loadFiles() {
    try { const response = await api.get(`/hr/employees/${employeeId}/files`); setItems(response.data?.items || []) } catch (error) { onError(error.response?.data?.error || 'Dosarul electronic nu a putut fi incarcat.') }
  }

  useEffect(() => { if (employeeId) loadFiles() }, [employeeId])

  useEffect(() => {
    if (!suggestedUpload?.type) return
    setType(suggestedUpload.type)
  }, [suggestedUpload?.type])

  useEffect(() => {
    function onGeneratedFile(event) {
      if (!employeeId || String(event.detail?.employeeId) !== String(employeeId)) return
      loadFiles()
    }
    window.addEventListener('hr-files-refresh', onGeneratedFile)
    return () => window.removeEventListener('hr-files-refresh', onGeneratedFile)
  }, [employeeId])

  async function uploadFile() {
    if (!file) return
    try {
      setBusy(true)
      const form = new FormData(); form.append('file', file); form.append('tip', type); form.append('denumire', file.name)
      await api.post(`/hr/employees/${employeeId}/files`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setFile(null); await loadFiles()
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi incarcat.') } finally { setBusy(false) }
  }

  async function downloadFile(item) {
    try {
      const response = await api.get(`/hr/employees/${employeeId}/files/${item.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = item.file_name; anchor.click(); URL.revokeObjectURL(url)
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi descarcat.') }
  }

  async function previewFile(item) {
    try {
      const response = await api.get(`/hr/employees/${employeeId}/files/${item.id}/download`, { responseType: 'blob' })
      const mimeType = item.mime_type || response.data?.type || 'text/html'
      const blob = response.data?.type ? response.data : new Blob([response.data], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.target = '_blank'
        anchor.rel = 'noopener noreferrer'
        anchor.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi previzualizat.') }
  }

  async function saveFileMeta(event) {
    event.preventDefault()
    try {
      await api.patch(`/hr/employees/${employeeId}/files/${editing.id}`, editing)
      setEditing(null)
      await loadFiles()
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi actualizat.') }
  }

  async function cancelFile(item) {
    const motiv = window.prompt('Motiv anulare document:', 'Inlocuit / incarcat gresit')
    if (!motiv) return
    try {
      await api.delete(`/hr/employees/${employeeId}/files/${item.id}`, { data: { motiv } })
      await loadFiles()
    } catch (error) { onError(error.response?.data?.error || 'Documentul nu a putut fi anulat.') }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Dosar electronic</div>
          <div className="text-xs text-slate-500">Fișierele reale: CIM scanat/PDF, acte adiționale, diplome, medicale.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={loadFiles}>Reincarca</Button>
      </div>
      {canManage ? (
        <>
          {suggestedUpload ? (
            <div className="mb-3 rounded border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800">
              <div className="font-semibold">Rezolvare ghidată din Inbox HR</div>
              <div className="text-xs">{suggestedUpload.title || 'Încarcă documentul cerut'}{suggestedUpload.detail ? ` · ${suggestedUpload.detail}` : ''}</div>
            </div>
          ) : null}
          <div className="mb-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
            <Select value={type} onChange={event => setType(event.target.value)} options={fileTypes} />
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)} />
            <Button onClick={async () => { await uploadFile(); onSuggestionUsed() }} disabled={!file || busy}>{busy ? 'Se incarca...' : 'Incarca'}</Button>
          </div>
        </>
      ) : null}
      <div className="grid gap-2">
        {items.map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2 text-sm">
            <div>
              <strong>{item.denumire}</strong>
              <div className="text-xs text-slate-500">{item.tip}{item.generated ? ' · generat electronic' : ' · incarcat'}{item.requires_ack ? ' · cere confirmare Kiosk' : ''}{item.acknowledged_at ? ` · confirmat ${String(item.acknowledged_at).slice(0, 10)}` : ''} · {Math.ceil(Number(item.file_size || 0) / 1024)} KB · {item.data_document || item.created_at?.slice?.(0, 10) || '-'}</div>
            </div>
            <div className="flex gap-2">
              {canManage ? <Button size="sm" variant="secondary" onClick={() => setEditing({ ...item })}>Editeaza</Button> : null}
              {item.generated || item.mime_type === 'text/html' ? <Button size="sm" variant="secondary" onClick={() => previewFile(item)}>Deschide</Button> : null}
              <Button size="sm" variant="secondary" onClick={() => downloadFile(item)}>Descarca</Button>
              {canManage ? <Button size="sm" variant="secondary" onClick={() => cancelFile(item)}>Anuleaza</Button> : null}
            </div>
          </div>
        ))}
        {!items.length ? <div className="text-sm text-slate-500">Nu exista documente incarcate.</div> : null}
      </div>
      <Modal open={Boolean(editing)} title="Editeaza document dosar" onClose={() => setEditing(null)} size="md">
        <form className="grid gap-3" onSubmit={saveFileMeta}>
          <Input label="Denumire" value={editing?.denumire || ''} onChange={event => setEditing(current => ({ ...current, denumire: event.target.value }))} required />
          <Select label="Tip document" value={editing?.tip || 'altul'} onChange={event => setEditing(current => ({ ...current, tip: event.target.value }))} options={fileTypes} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Data document" type="date" value={editing?.data_document || ''} onChange={event => setEditing(current => ({ ...current, data_document: event.target.value }))} />
            <Input label="Expira la" type="date" value={editing?.data_expirare || ''} onChange={event => setEditing(current => ({ ...current, data_expirare: event.target.value }))} />
          </div>
          <label className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <input type="checkbox" checked={Boolean(editing?.requires_ack)} onChange={event => setEditing(current => ({ ...current, requires_ack: event.target.checked, kiosk_visible: event.target.checked || current.kiosk_visible }))} />
            Necesită confirmare în Kiosk / luare la cunoștință
          </label>
          {editing?.acknowledged_at ? <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Confirmat de {editing.acknowledged_by_name || 'angajat'} la {String(editing.acknowledged_at).replace('T', ' ').slice(0, 16)}.</div> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Renunta</Button><Button type="submit">Salveaza</Button></div>
        </form>
      </Modal>
    </div>
  )
}
