import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountSelect, AccountingShell, DropdownMenu, Info, Table, currentMonth, money, statusTone, today } from './accounting-shared'
export function RegistruJurnal() {
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [selectedUuid, setSelectedUuid] = useState(searchParams.get('note') || '')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [noteModal, setNoteModal] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [noteForm, setNoteForm] = useState({ data: today(), nr_document: '', tip_document: 'nota_manuala', explicatie: '', lines: [] })
  const [importModal, setImportModal] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef(null)
  const selected = rows.find(row => row.uuid === selectedUuid) || rows[0] || null
  const difference = selected ? Math.abs(money(selected.total_debit) - money(selected.total_credit)) : 0
  const totals = useMemo(() => rows.reduce((acc, row) => {
    acc.debit += money(row.total_debit)
    acc.credit += money(row.total_credit)
    acc.drafts += row.status === 'draft' ? 1 : 0
    acc.active += row.status === 'activ' ? 1 : 0
    return acc
  }, { debit: 0, credit: 0, drafts: 0, active: 0 }), [rows])

  useEffect(() => {
    setMonth(searchParams.get('luna') || currentMonth())
    setStatus(searchParams.get('status') || '')
    setSelectedUuid(searchParams.get('note') || '')
  }, [searchParams])

  useEffect(() => { load() }, [month, status])
  useEffect(() => {
    if (rows.length && !rows.some(row => row.uuid === selectedUuid)) setSelectedUuid(rows[0].uuid)
    if (!rows.length) setSelectedUuid('')
  }, [rows, selectedUuid])

  function load() {
    const [an, luna] = month.split('-')
    Promise.all([
      api.get('/accounting/journals', { params: { an, luna: Number(luna), status: status || undefined } }),
      api.get('/accounting/chart')
    ])
      .then(([journalRes, chartRes]) => {
        setRows(journalRes.data.journals || [])
        setAccounts(chartRes.data.accounts || [])
      })
      .catch(err => {
        setRows([])
        setError(err.response?.data?.error || 'Nu am putut incarca registrul jurnal.')
      })
  }

  function emptyNoteLine(side = 'debit') {
    return { cont: '', debit: side === 'debit' ? '' : 0, credit: side === 'credit' ? '' : 0, explicatie: '' }
  }

  function openManualNote() {
    setError('')
    setMessage('')
    setEditingNote(null)
    setNoteForm({
      data: today(),
      nr_document: '',
      tip_document: 'nota_manuala',
      explicatie: '',
      lines: [emptyNoteLine('debit'), emptyNoteLine('credit')]
    })
    setNoteModal(true)
  }

  function openEditNote(row = selected) {
    if (!row) return
    setError('')
    setMessage('')
    setEditingNote(row)
    setNoteForm({
      data: row.data || today(),
      nr_document: row.nr_document || '',
      tip_document: row.tip_document || 'nota_manuala',
      explicatie: row.explicatie || '',
      lines: (row.lines || []).map(line => ({
        cont: line.cont_simbol || line.cont || '',
        debit: line.debit || '',
        credit: line.credit || '',
        explicatie: line.explicatie || ''
      }))
    })
    setNoteModal(true)
  }

  function updateNoteLine(index, patch) {
    const lines = [...(noteForm.lines || [])]
    lines[index] = { ...lines[index], ...patch }
    setNoteForm({ ...noteForm, lines })
  }

  function addNoteLine(side = 'debit') {
    setNoteForm({ ...noteForm, lines: [...(noteForm.lines || []), emptyNoteLine(side)] })
  }

  function removeNoteLine(index) {
    const lines = (noteForm.lines || []).filter((_, lineIndex) => lineIndex !== index)
    setNoteForm({ ...noteForm, lines: lines.length ? lines : [emptyNoteLine('debit'), emptyNoteLine('credit')] })
  }

  async function submitManualNote(event) {
    event.preventDefault()
    const lines = (noteForm.lines || []).map(line => ({
      cont: line.cont,
      debit: money(line.debit),
      credit: money(line.credit),
      explicatie: line.explicatie || noteForm.explicatie
    })).filter(line => line.cont && (line.debit > 0 || line.credit > 0))
    try {
      setError('')
      if (editingNote?.uuid) {
        await api.patch(`/accounting/journals/${editingNote.uuid}`, { ...noteForm, lines })
        setMessage('Nota contabila a fost actualizata.')
      } else {
        await api.post('/accounting/journals', { ...noteForm, lines })
        setMessage('Nota contabila a fost salvata ca draft. Valideaz-o cand este verificata.')
      }
      setNoteModal(false)
      setEditingNote(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Nota contabila nu a putut fi salvata.')
    }
  }

  async function validateNote(row) {
    try {
      setError('')
      setMessage('')
      await api.post(`/accounting/journals/${row.uuid}/validate`)
      setMessage('Nota a fost validata si intra in registru, balanta si fisa cont.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Nota nu a putut fi validata. Verifica perioada, conturile si egalitatea debit-credit.')
    }
  }

  async function devalidateNote(row) {
    const motiv = window.prompt('Motiv devalidare nota:', 'Corectie nota manuala')
    if (motiv === null) return
    try {
      setError('')
      setMessage('')
      await api.post(`/accounting/journals/${row.uuid}/devalidate`, { motiv })
      setMessage('Nota a fost devalidata si nu mai intra in balanta pana la revalidare.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Nota nu a putut fi devalidata. Verifica daca luna este deschisa.')
    }
  }

  async function cancelDraftNote(row) {
    if (!window.confirm('Anulezi nota draft selectata?')) return
    try {
      setError('')
      setMessage('')
      await api.delete(`/accounting/journals/${row.uuid}`, { data: { motiv: 'Anulare nota draft' } })
      setMessage('Nota draft a fost anulata.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Nota draft nu a putut fi anulata.')
    }
  }

  async function storno(row) {
    if (!window.confirm('Creezi nota storno pentru nota selectata?')) return
    try {
      setError('')
      await api.post(`/accounting/journals/${row.uuid}/storno`)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Nota storno nu a putut fi creata.')
    }
  }

  function importFormData(file) {
    const data = new FormData()
    data.append('file', file)
    return data
  }

  async function chooseImportFile(file) {
    setError('')
    setImportPreview(null)
    setImportFile(file || null)
    if (!file) return
    if (!file.name.toLowerCase().match(/\.xlsx?$/)) {
      setError('Selecteaza un fisier .xls sau .xlsx.')
      return
    }
    try {
      const res = await api.post('/accounting/journals/import-xls/preview', importFormData(file), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setImportPreview(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut citi fisierul XLS.')
    }
  }

  async function importJournals() {
    if (!importFile || !importPreview) return
    setImporting(true)
    setError('')
    try {
      const res = await api.post('/accounting/journals/import-xls', importFormData(importFile), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setImportModal(false)
      setImportFile(null)
      setImportPreview(null)
      await load()
      setError('')
    } catch (err) {
      setError(err.response?.data?.error || 'Importul nu a putut fi finalizat.')
    } finally {
      setImporting(false)
    }
  }

  async function exportExcel() {
    const [an, luna] = month.split('-')
    const res = await api.get('/accounting/journals/export', {
      params: { an, luna: Number(luna), status: status || undefined },
      responseType: 'blob'
    })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Registru_jurnal_${an}_${luna}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function selectedActionMenu(row) {
    if (!row) return []
    return [
      ['draft', 'devalidat'].includes(row.status) ? { label: 'Editeaza nota', onClick: () => openEditNote(row) } : null,
      ['draft', 'devalidat'].includes(row.status) ? { label: 'Valideaza nota', onClick: () => validateNote(row) } : null,
      row.status === 'draft' ? { label: 'Anuleaza draft', onClick: () => cancelDraftNote(row) } : null,
      row.status === 'activ' ? { label: 'Devalideaza nota', onClick: () => devalidateNote(row) } : null,
      row.status === 'activ' ? { label: 'Storno nota', onClick: () => storno(row) } : null,
      { type: 'separator' },
      { label: 'Fisa primul cont', to: row.lines?.[0]?.cont_simbol ? `/contabilitate/fisa-cont/${row.lines[0].cont_simbol}?de_la=${month}-01&pana_la=${month}-31` : '/contabilitate/plan-conturi' },
      { label: 'Balanta lunii', to: `/contabilitate/balanta?luna=${month}` },
    ].filter(Boolean)
  }

  const noteTotals = (noteForm.lines || []).reduce((acc, line) => {
    acc.debit += money(line.debit)
    acc.credit += money(line.credit)
    return acc
  }, { debit: 0, credit: 0 })
  const noteBalanced = Math.abs(noteTotals.debit - noteTotals.credit) <= 0.01 && noteTotals.debit > 0

  return (
    <AccountingShell
      active="jurnal"
      title="Registru jurnal"
      subtitle="Note contabile active si storno, cu linii debit/credit."
      actions={<DropdownMenu align="right" label="Actiuni" items={[
        { label: 'Nota manuala noua', onClick: openManualNote },
        { label: 'Import note XLS', onClick: () => setImportModal(true) },
        { label: 'Export Excel', onClick: exportExcel },
        { label: 'Reincarca registru', onClick: load },
        { type: 'separator' },
        { label: 'Balanta lunii', to: `/contabilitate/balanta?luna=${month}` },
        { label: 'Cartea Mare', to: `/contabilitate/cartea-mare?de_la=${month}-01&pana_la=${month}-31` }
      ]} />}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[220px_220px]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Status" value={status} onChange={event => setStatus(event.target.value)} options={[
            { value: '', label: 'Toate fara anulate' },
            { value: 'draft', label: 'Draft' },
            { value: 'activ', label: 'Active' },
            { value: 'stornat', label: 'Stornate' },
            { value: 'devalidat', label: 'Devalidate' }
          ]} />
        </div>
      </Card>
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="Note filtrate" value={rows.length} />
        <Info label="Note active" value={totals.active} />
        <Info label="Drafturi" value={totals.drafts} />
        <Info label="Diferenta debit-credit" value={formatMoney(Math.abs(totals.debit - totals.credit))} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Table headers={['Data', 'Document', 'Tip', 'Explicatie', 'Debit', 'Credit', 'Status']}>
          {rows.map(row => (
            <tr key={row.uuid} className={`cursor-pointer hover:bg-primary-50 ${selected?.uuid === row.uuid ? 'bg-primary-50' : ''}`} onClick={() => setSelectedUuid(row.uuid)}>
              <td className="px-3 py-2">{row.data}</td>
              <td className="px-3 py-2">{row.nr_document || '-'}</td>
              <td className="px-3 py-2">{row.tip_document}</td>
              <td className="px-3 py-2">{row.explicatie}</td>
              <td className="px-3 py-2">{formatMoney(row.total_debit)}</td>
              <td className="px-3 py-2">{formatMoney(row.total_credit)}</td>
              <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
            </tr>
          ))}
        </Table>
        <Card>
          {selected ? (
            <div className="grid gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase text-slate-500">Nota contabila</div>
                  <div className="mt-1 text-xl font-semibold text-slate-950">{selected.nr_document || `NC ${selected.id}`}</div>
                  <div className="text-sm text-slate-500">{selected.data} · {selected.tip_document}</div>
                </div>
                <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{selected.explicatie || 'Fara explicatie.'}</div>
              <div className="grid grid-cols-3 gap-2">
                <Info label="Debit" value={formatMoney(selected.total_debit)} />
                <Info label="Credit" value={formatMoney(selected.total_credit)} />
                <Info label="Diferenta" value={formatMoney(difference)} />
              </div>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Cont</th>
                      <th className="px-3 py-2">Explicatie</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selected.lines || []).map(line => (
                      <tr key={line.id}>
                        <td className="px-3 py-2">
                          <Link className="font-mono font-semibold text-primary-700 hover:underline" to={`/contabilitate/fisa-cont/${line.cont_simbol}?de_la=${month}-01&pana_la=${month}-31`}>{line.cont_simbol}</Link>
                          <div className="text-xs text-slate-500">{line.denumire_cont}</div>
                        </td>
                        <td className="px-3 py-2">{line.explicatie || '-'}</td>
                        <td className="px-3 py-2 text-right">{line.debit ? formatMoney(line.debit) : '-'}</td>
                        <td className="px-3 py-2 text-right">{line.credit ? formatMoney(line.credit) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <DropdownMenu align="right" label="Actiuni nota" items={selectedActionMenu(selected)} />
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">Nu exista note contabile pentru filtrele selectate.</div>
          )}
        </Card>
      </div>
      <Modal open={importModal} title="Import note contabile XLS" onClose={() => setImportModal(false)}>
        <div className="grid gap-4">
          <input
            ref={importInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={event => chooseImportFile(event.target.files?.[0])}
          />
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">{importFile?.name || 'Niciun fisier selectat'}</div>
            <div className="mt-1 text-sm text-slate-500">Fisierul trebuie sa contina coloane de tip: data, document, cont debit, cont credit, suma, explicatie.</div>
            <div className="mt-3"><Button type="button" variant="secondary" onClick={() => importInputRef.current?.click()}>Alege fisier</Button></div>
          </div>
          {importPreview ? (
            <div className="grid gap-3">
              <div className="grid gap-2 md:grid-cols-4">
                <Info label="Note" value={importPreview.total_notes || 0} />
                <Info label="Linii" value={importPreview.total_lines || 0} />
                <Info label="Debit" value={formatMoney(importPreview.total_debit || 0)} />
                <Info label="Credit" value={formatMoney(importPreview.total_credit || 0)} />
              </div>
              <div className={`rounded-md px-3 py-2 text-sm ${importPreview.balanced && !importPreview.errors?.length ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {importPreview.balanced ? 'Fisier echilibrat debit-credit.' : 'Fisierul nu este echilibrat.'}
                {importPreview.duplicate_notes ? ` ${importPreview.duplicate_notes} note par deja importate si vor fi sarite.` : ''}
              </div>
              {importPreview.missing_accounts?.length ? <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Conturi lipsa in plan: {importPreview.missing_accounts.slice(0, 8).join(', ')}{importPreview.missing_accounts.length > 8 ? '...' : ''}</div> : null}
              {importPreview.errors?.length ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{importPreview.errors.slice(0, 3).join(' ')}</div> : null}
              <Table headers={['Data', 'Document', 'Tip', 'Explicatie', 'Debit', 'Credit', 'Status']}>
                {(importPreview.notes || []).slice(0, 8).map(note => (
                  <tr key={note.import_key}>
                    <td className="px-3 py-2">{note.data}</td>
                    <td className="px-3 py-2">{note.nr_document || '-'}</td>
                    <td className="px-3 py-2">{note.tip_document}</td>
                    <td className="px-3 py-2">{note.explicatie}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(note.total_debit)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(note.total_credit)}</td>
                    <td className="px-3 py-2"><Badge tone={note.duplicate ? 'warning' : note.balanced ? 'success' : 'danger'}>{note.duplicate ? 'duplicat' : note.balanced ? 'ok' : 'eroare'}</Badge></td>
                  </tr>
                ))}
              </Table>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setImportModal(false)}>Renunta</Button>
            <Button type="button" disabled={!importPreview || importPreview.errors?.length || importPreview.unbalanced_notes || importPreview.missing_accounts?.length || importing} onClick={importJournals}>{importing ? 'Import...' : 'Importa note'}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={noteModal} title={editingNote ? 'Editare nota contabila' : 'Nota contabila manuala'} onClose={() => setNoteModal(false)}>
        <form className="grid gap-3" onSubmit={submitManualNote}>
          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Data" type="date" value={noteForm.data || today()} onChange={event => setNoteForm({ ...noteForm, data: event.target.value })} required />
            <Input label="Nr. document" value={noteForm.nr_document || ''} onChange={event => setNoteForm({ ...noteForm, nr_document: event.target.value })} />
            <Input label="Tip document" value={noteForm.tip_document || 'nota_manuala'} onChange={event => setNoteForm({ ...noteForm, tip_document: event.target.value })} />
          </div>
          <Input label="Explicatie" value={noteForm.explicatie || ''} onChange={event => setNoteForm({ ...noteForm, explicatie: event.target.value })} />
          <div className="rounded-md border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-sm font-semibold text-slate-800">Linii debit / credit</div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => addNoteLine('debit')}>+ Debit</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => addNoteLine('credit')}>+ Credit</Button>
              </div>
            </div>
            <div className="grid gap-2 p-3">
              {(noteForm.lines || []).map((line, index) => (
                <div key={index} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[minmax(180px,1.4fr)_120px_120px_minmax(160px,1fr)_44px]">
                  <AccountSelect label="Cont" value={line.cont || ''} accounts={accounts} onChange={event => updateNoteLine(index, { cont: event.target.value })} required />
                  <Input label="Debit" type="number" step="0.01" value={line.debit || ''} onChange={event => updateNoteLine(index, { debit: event.target.value, credit: event.target.value ? 0 : line.credit })} />
                  <Input label="Credit" type="number" step="0.01" value={line.credit || ''} onChange={event => updateNoteLine(index, { credit: event.target.value, debit: event.target.value ? 0 : line.debit })} />
                  <Input label="Explicatie linie" value={line.explicatie || ''} onChange={event => updateNoteLine(index, { explicatie: event.target.value })} />
                  <div className="flex items-end"><Button type="button" size="sm" variant="secondary" onClick={() => removeNoteLine(index)}>x</Button></div>
                </div>
              ))}
            </div>
          </div>
          <div className={`rounded-md px-3 py-2 text-sm ${noteBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            Debit {formatMoney(noteTotals.debit)} · Credit {formatMoney(noteTotals.credit)} · {noteBalanced ? 'nota este echilibrata' : 'nota trebuie echilibrata debit = credit'}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNoteModal(false)}>Renunta</Button>
            <Button type="submit" disabled={!noteBalanced}>{editingNote ? 'Salveaza modificarile' : 'Salveaza draft'}</Button>
          </div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

export default RegistruJurnal
