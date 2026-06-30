import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth, statusTone } from './accounting-shared'
export function TVADeclaratii() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'control')
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [status, setStatus] = useState('')
  const [cota, setCota] = useState('')
  const [data, setData] = useState({ decont: { randuri: [] } })
  const [journal, setJournal] = useState({ jurnal_cumparari: [], jurnal_vanzari: [], cote: [] })
  const [readiness, setReadiness] = useState({ checks: [], declarations: [] })
  const [d394, setD394] = useState({ terti: [], warnings: [], totaluri: {} })
  const [saft, setSaft] = useState({ areas: [], issues: [], coverage: 0 })
  const [d112, setD112] = useState({ checks: [], issues: [], employees: [], totals: {} })
  const [declarationHistory, setDeclarationHistory] = useState([])
  const [declarationRegister, setDeclarationRegister] = useState({ declarations: [] })
  const [receiptForm, setReceiptForm] = useState(null)
  const [archiveForm, setArchiveForm] = useState(null)
  const [schemas, setSchemas] = useState([])
  const [schemaCode, setSchemaCode] = useState('D300')
  const [schemaFile, setSchemaFile] = useState(null)
  const [d112Mapping, setD112Mapping] = useState({ rows: [], company_errors: [], ready: false })
  const [officialFile, setOfficialFile] = useState(null)
  const [officialValidation, setOfficialValidation] = useState(null)
  const [validatorConfig, setValidatorConfig] = useState({ path: '', command: '', args: '["{file}"]', schema_version: '', source_url: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [fiscalCheck, setFiscalCheck] = useState({ checks: [], ready: false })
  const [calendar, setCalendar] = useState({ obligations: [] })
  const [endToEndAudit, setEndToEndAudit] = useState({ checks: [], ready: false })

  useEffect(() => { load() }, [month, status, cota])
  useEffect(() => { loadValidator() }, [tab])

  function params() {
    return { perioada: month, status: status || undefined, cota: cota || undefined }
  }

  function load() {
    setError('')
    Promise.all([
      api.get('/accounting/d300', { params: params() }),
      api.get('/accounting/vat-journal', { params: params() }),
      api.get('/accounting/declarations/readiness', { params: params() }),
      api.get('/accounting/d394', { params: params() }),
      api.get('/accounting/saft/readiness', { params: params() }),
      api.get('/accounting/d112/readiness', { params: params() }),
      api.get('/accounting/declarations/history', { params: params() }),
      api.get('/accounting/declarations/register', { params: params() }),
      api.get('/accounting/declarations/schemas'),
      api.get('/accounting/fiscal/month-check', { params: params() }),
      api.get('/accounting/fiscal/calendar', { params: { an: month.slice(0, 4) } })
    ]).then(([d300Res, journalRes, readinessRes, d394Res, saftRes, d112Res, historyRes, registerRes, schemasRes, fiscalRes, calendarRes]) => {
      setData(d300Res.data || { decont: { randuri: [] } })
      setJournal(journalRes.data || { jurnal_cumparari: [], jurnal_vanzari: [], cote: [] })
      setReadiness(readinessRes.data || { checks: [], declarations: [] })
      setD394(d394Res.data || { terti: [], warnings: [], totaluri: {} })
      setSaft(saftRes.data || { areas: [], issues: [], coverage: 0 })
      setD112(d112Res.data || { checks: [], issues: [], employees: [], totals: {} })
      setDeclarationHistory(historyRes.data?.runs || [])
      setDeclarationRegister(registerRes.data || { declarations: [] })
      setSchemas(schemasRes.data?.schemas || [])
      setFiscalCheck(fiscalRes.data || { checks: [], ready: false })
      setCalendar(calendarRes.data || { obligations: [] })
      api.get('/accounting/d112/mapping', { params: params() }).then(response => setD112Mapping(response.data || { rows: [], company_errors: [], ready: false })).catch(() => setD112Mapping({ rows: [], company_errors: [], ready: false }))
      api.get('/accounting/audit/end-to-end', { params: { luna: month } }).then(response => setEndToEndAudit(response.data || { checks: [], ready: false })).catch(() => setEndToEndAudit({ checks: [], ready: false }))
    }).catch(err => {
      setData({ decont: { randuri: [] } })
      setJournal({ jurnal_cumparari: [], jurnal_vanzari: [], cote: [] })
      setReadiness({ checks: [], declarations: [] })
      setD394({ terti: [], warnings: [], totaluri: {} })
      setSaft({ areas: [], issues: [], coverage: 0 })
      setD112({ checks: [], issues: [], employees: [], totals: {} })
      setDeclarationHistory([])
      setDeclarationRegister({ declarations: [] })
      setSchemas([])
      setFiscalCheck({ checks: [], ready: false })
      setCalendar({ obligations: [] })
      setEndToEndAudit({ checks: [], ready: false })
      setError(err.response?.data?.error || 'Nu am putut incarca centrul fiscal.')
    })
  }

  function activeDeclarationCode() {
    return ({ d112: 'D112', d300: 'D300', d394: 'D394' })[tab] || ''
  }

  async function loadValidator() {
    const code = activeDeclarationCode()
    if (!code) return
    try {
      const response = await api.get(`/accounting/declarations/validators/${code}`)
      const item = response.data || {}
      setValidatorConfig({ ...item, args: JSON.stringify(item.args || ['{file}']) })
    } catch (_) { setValidatorConfig({ path: '', command: '', args: '["{file}"]', schema_version: '', source_url: '' }) }
  }

  async function saveValidator() {
    const code = activeDeclarationCode()
    try {
      const response = await api.put(`/accounting/declarations/validators/${code}`, validatorConfig)
      const item = response.data?.diagnostic || {}
      setValidatorConfig({ ...item, args: JSON.stringify(item.args || ['{file}']) })
      setMessage(`Validatorul ${code} a fost configurat.`)
    } catch (err) { setError(err.response?.data?.error || 'Validatorul nu a putut fi configurat.') }
  }

  async function validateOfficialFile() {
    const code = activeDeclarationCode()
    if (!officialFile) { setError(`Selectează fișierul XML ${code}.`); return }
    try {
      setError(''); setOfficialValidation(null)
      const body = new FormData(); body.append('perioada', month); body.append('file', officialFile)
      const response = await api.post(`/accounting/declarations/${code}/validate-official-file`, body)
      setOfficialValidation(response.data?.run || null)
      setMessage(response.data?.run?.accepted ? `${code} a fost acceptată de validator.` : `${code} conține erori raportate de validator.`)
    } catch (err) { setError(err.response?.data?.error || `Validarea ${code} nu a putut fi executată.`) }
  }

  function changeTab(value) {
    setTab(value)
    const next = new URLSearchParams(searchParams)
    next.set('tab', value)
    next.set('luna', month)
    setSearchParams(next, { replace: true })
  }

  async function validateDeclaration(code) {
    try {
      setError(''); setMessage('')
      await api.post(`/accounting/declarations/${code}/validate`, { perioada: month })
      setMessage(`${code} a trecut validarea internă.`)
      load()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.run?.errors?.join(' ') || `${code} are verificări nerezolvate.`)
      load()
    }
  }

  async function saveReceipt() {
    if (!receiptForm?.recipisa) { setError('Completează numărul recipisei ANAF.'); return }
    try {
      setError(''); setMessage('')
      const body = new FormData()
      body.append('perioada', month)
      body.append('recipisa', receiptForm.recipisa)
      body.append('status', receiptForm.status || 'acceptata')
      body.append('message', receiptForm.message || '')
      if (receiptForm.file) body.append('file', receiptForm.file)
      await api.post(`/accounting/declarations/${receiptForm.code}/receipt`, body)
      setMessage(`${receiptForm.code}: recipisa ${receiptForm.recipisa} a fost înregistrată.`)
      setReceiptForm(null)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Recipisa nu a putut fi înregistrată.') }
  }

  async function archiveDeclaration() {
    if (!archiveForm?.file) { setError('Selectează fișierul declarației.'); return }
    try {
      setError(''); setMessage('')
      const body = new FormData()
      body.append('perioada', month)
      body.append('file', archiveForm.file)
      await api.post(`/accounting/declarations/${archiveForm.code}/archive`, body)
      setMessage(`${archiveForm.code}: fișierul declarației a fost arhivat.`)
      setArchiveForm(null)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Fișierul declarației nu a putut fi arhivat.') }
  }

  async function download(endpoint, filename, declarationCode = '') {
    try {
      setError('')
      if (declarationCode) {
        const latest = declarationRegister.declarations?.find(item => item.code === declarationCode)?.latest
        if (!['validat_intern', 'exportat'].includes(latest?.status)) {
          setError(`Validează intern ${declarationCode} înainte de export.`)
          return
        }
      }
      const res = await api.get(endpoint, { params: params(), responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      if (declarationCode) {
        await api.post(`/accounting/declarations/${declarationCode}/exported`, { perioada: month, filename })
        setMessage(`${declarationCode} a fost exportată și înregistrată în registrul fiscal.`)
        load()
      }
    } catch (err) { setError(err.response?.data?.error || 'Fișierul nu a putut fi exportat.') }
  }

  async function markVatChecked() {
    const [an, luna] = month.split('-')
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/mark-vat-checked`)
      setMessage('TVA-ul lunii a fost marcat verificat.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'TVA-ul nu a putut fi marcat verificat.')
    }
  }

  async function uploadSchema() {
    if (!schemaFile) { setError('Selectează arhiva ZIP sau fișierul XSD oficial ANAF.'); return }
    try {
      setError(''); setMessage('')
      const body = new FormData()
      body.append('code', schemaCode)
      body.append('file', schemaFile)
      await api.post('/accounting/declarations/schemas', body)
      setSchemaFile(null)
      setMessage(`Schema oficială ${schemaCode} a fost înregistrată.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Schema nu a putut fi încărcată.') }
  }

  const d = data.decont || {}
  const warnings = [...(data.status?.warnings || []), ...(journal.warnings || [])]
  const periodStatus = data.period_status || journal.period_status || {}
  const canCheckVat = periodStatus.status !== 'inchisa' && periodStatus.status !== 'depusa'
  const fileMonth = month.replace('-', '_')

  return (
    <AccountingShell
      active="tva"
      title="Centru fiscal"
      subtitle="Control lunar, declaratii, e-Factura si legatura cu salarizarea."
      actions={(
        <DropdownMenu align="right" label="Actiuni" items={[
            { label: 'Reincarca TVA', onClick: load },
            canCheckVat ? { label: 'Marcheaza TVA verificat', onClick: markVatChecked } : null,
            { type: 'separator' },
            { label: 'Export Excel', onClick: () => download('/accounting/vat-journal/export', `Jurnal_TVA_${fileMonth}.xlsx`) },
            { label: 'XML lucru D300', onClick: () => download('/accounting/d300/export-xml', `D300_lucru_${fileMonth}.xml`, 'D300') },
            { label: 'D394 lucru Excel', onClick: () => download('/accounting/d394/export', `D394_lucru_${fileMonth}.xlsx`, 'D394') },
            { label: 'Raport control declarații', onClick: () => download('/accounting/declarations/control-export', `Control_declaratii_${fileMonth}.xlsx`) },
            { label: 'Audit contabil end-to-end', onClick: () => download('/accounting/audit/end-to-end/export', `Audit_contabil_${fileMonth}.xlsx`) },
            { label: 'Diagnostic SAF-T Excel', onClick: () => download('/accounting/saft/export-mapping', `Diagnostic_SAFT_${fileMonth}.xlsx`) },
            { label: 'Pregătire date D112 Excel', onClick: () => download('/accounting/d112/export-inputs', `Pregatire_D112_${fileMonth}.xlsx`) },
            { label: 'Sursa XML D112', onClick: () => download('/accounting/d112/export-source-xml', `D112_sursa_${fileMonth}.xml`, 'D112') },
            { type: 'separator' },
            { label: 'Facturi intrare', to: `/contabilitate/facturi-intrare?luna=${month}` },
            { label: 'Facturi iesire', to: `/contabilitate/facturi-iesire?luna=${month}` },
            { label: 'Inchidere luna', to: `/contabilitate/inchidere-luna?luna=${month}` },
          ].filter(Boolean)} />
      )}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Card density="compact">
        <div className="flex flex-wrap gap-2">
          {[
            ['control', 'Control lunar'], ['d300', 'D300 / TVA'], ['d394', 'D394'],
            ['d112', 'D112'], ['saft', 'SAF-T'], ['registru', 'Registru']
          ].map(([value, label]) => <Button key={value} size="sm" variant={tab === value ? 'primary' : 'secondary'} onClick={() => changeTab(value)}>{label}</Button>)}
          <Link className="inline-flex h-[var(--control-height)] items-center rounded-[var(--radius-control)] border border-slate-200 bg-white px-[var(--control-px)] text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50" to="/contabilitate/anaf">e-Factura</Link>
        </div>
      </Card>
      {tab === 'control' ? (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-base font-semibold text-slate-900">Checklist fiscal {month}</h3><p className="text-sm text-slate-500">Blocajele sunt legate direct de zona in care trebuie rezolvate.</p></div>
              <Badge tone={fiscalCheck.ready ? 'success' : 'warning'}>{fiscalCheck.ready ? 'pregatit' : 'necesita verificari'}</Badge>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(fiscalCheck.checks || []).map(check => (
                <Link key={check.key} to={check.to} className={`rounded-md border px-3 py-3 text-sm transition hover:shadow-sm ${check.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : check.severity === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
                  <div className="flex items-center justify-between gap-2"><strong>{check.label}</strong><span>{check.ok ? 'OK' : 'De rezolvat'}</span></div>
                  <p className="mt-1 text-xs opacity-80">{check.message}</p>
                </Link>
              ))}
            </div>
          </Card>
          <Card>
            <div><h3 className="text-base font-semibold text-slate-900">Calendar fiscal orientativ</h3><p className="text-sm text-slate-500">D300 și D112 folosesc ziua 25, iar D394 ziua 30, cu excepțiile configurate. Verifică mereu calendarul oficial ANAF.</p></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(calendar.obligations || []).filter(item => item.perioada === month).map(item => (
                <div key={item.code} className="rounded-md border border-slate-200 px-3 py-3">
                  <div className="flex items-center justify-between"><strong>{item.code}</strong><Badge tone={['depus', 'acceptat'].includes(item.status) ? 'success' : ['urgent', 'depasit'].includes(item.alert) ? 'danger' : item.alert === 'apropiat' ? 'warning' : 'gray'}>{item.status}</Badge></div>
                  <div className="mt-1 text-xs text-slate-500">Termen orientativ: {item.termen_orientativ} · {item.alert}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900">Audit contabil end-to-end</h3><p className="text-sm text-slate-500">Facturi, note, trezorerie, salarizare și declarații urmărite în același control.</p></div><Badge tone={endToEndAudit.ready ? 'success' : 'warning'}>{endToEndAudit.ready ? 'circuit complet' : 'necesită verificări'}</Badge></div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{(endToEndAudit.checks || []).map(item => <div key={item.area} className={`rounded-md border px-3 py-2 text-sm ${item.status === 'ok' || item.count === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><div className="flex justify-between gap-2"><strong>{item.area}</strong><span>{item.count || item.status}</span></div><div className="mt-1 text-xs">{item.message}</div></div>)}</div>
          </Card>
        </>
      ) : null}
      {tab !== 'control' ? <>
      {activeDeclarationCode() ? <Card>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900">Validator oficial {activeDeclarationCode()}</h3><p className="text-sm text-slate-500">Comanda locală și versiunea schemei sunt păstrate separat pentru fiecare declarație.</p></div><Badge tone={validatorConfig.execution_enabled ? 'success' : 'warning'}>{validatorConfig.execution_enabled ? 'configurat' : 'neconfigurat'}</Badge></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2"><Input label="Director / cale validator" value={validatorConfig.path || ''} onChange={event => setValidatorConfig(current => ({ ...current, path: event.target.value }))} /><Input label="Comandă executabilă" value={validatorConfig.command || ''} onChange={event => setValidatorConfig(current => ({ ...current, command: event.target.value }))} /><Input label={'Argumente JSON (include {file})'} value={validatorConfig.args || ''} onChange={event => setValidatorConfig(current => ({ ...current, args: event.target.value }))} /><Input label="Versiune schemă" value={validatorConfig.schema_version || ''} onChange={event => setValidatorConfig(current => ({ ...current, schema_version: event.target.value }))} /></div>
        <div className="mt-3 flex flex-wrap items-end gap-3"><Button variant="secondary" onClick={saveValidator}>Salvează configurarea</Button><label className="grid min-w-72 flex-1 gap-1 text-sm"><span className="font-medium text-slate-700">XML pentru verificare</span><input className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2" type="file" accept=".xml" onChange={event => setOfficialFile(event.target.files?.[0] || null)} /></label><Button onClick={validateOfficialFile}>Rulează validatorul</Button></div>
        {officialValidation ? <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${officialValidation.accepted ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}><strong>{officialValidation.accepted ? 'Acceptat' : 'Erori'} · cod {officialValidation.exit_code}</strong><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{officialValidation.stderr || officialValidation.stdout || 'Fără detalii.'}</pre></div> : null}
      </Card> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-base font-semibold text-slate-900">Scheme oficiale ANAF</h3><p className="text-sm text-slate-500">Versiunile XSD/ZIP sunt păstrate cu amprentă SHA-256. Validarea internă nu este prezentată ca validare ANAF fără schema corectă.</p></div>
          <Badge tone={schemas.some(item => item.active) ? 'success' : 'warning'}>{schemas.filter(item => item.active).length} active</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
          <Select label="Declarație" value={schemaCode} onChange={event => setSchemaCode(event.target.value)} options={['D300', 'D394', 'D112', 'SAF-T'].map(value => ({ value, label: value }))} />
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Fișier oficial</span><input className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2" type="file" accept=".xsd,.zip" onChange={event => setSchemaFile(event.target.files?.[0] || null)} /></label>
          <Button onClick={uploadSchema}>Încarcă schema</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{schemas.filter(item => item.active).map(item => <Badge key={item.uuid || item.id} tone="success">{item.code} · {item.original_name}</Badge>)}</div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-base font-semibold text-slate-900">Pregătire D112</h3><p className="text-sm text-slate-500">Controlul datelor HR înaintea calculului salarial. Nu generează încă XML-ul fiscal final.</p></div>
          <Badge tone={d112.ready ? 'success' : 'warning'}>{d112.ready ? 'date pregătite' : 'date incomplete'}</Badge>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Info label="Angajați activi" value={d112.totals?.employees || 0} />
          <Info label="Contracte active" value={d112.totals?.contracts || 0} />
          <Info label="Angajați pontați" value={d112.totals?.timesheet_employees || 0} />
          <Info label="Pontaje validate" value={d112.totals?.validated_timesheets || 0} />
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {(d112.checks || []).map(check => <div key={check.key} className={`rounded-md border px-3 py-2 text-sm ${check.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><strong>{check.label}:</strong> {check.message}</div>)}
        </div>
        <p className="mt-3 text-xs text-slate-500">{d112.note}</p>
        {tab === 'd112' ? <div className="mt-4 border-t border-slate-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>Mapare pe angajat</strong><div className="text-xs text-slate-500">{d112Mapping.rows?.filter(item => item.ready).length || 0}/{d112Mapping.rows?.length || 0} angajați fără erori de mapare</div></div><Button variant="secondary" onClick={() => download('/accounting/d112/mapping-export', `Mapare_D112_${fileMonth}.xlsx`)}>Export mapare</Button></div>{(d112Mapping.company_errors || []).map(item => <div key={item} className="mt-2 text-sm text-red-700">{item}</div>)}<div className="mt-3 max-h-56 overflow-auto">{(d112Mapping.rows || []).map(item => <div key={item.employee_id} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span><strong>{item.numeAsig} {item.prenAsig}</strong><small className="ml-2 text-slate-500">{item.cnpAsig || 'CNP lipsă'}</small></span><span className={item.ready ? 'text-emerald-700' : 'max-w-md text-right text-red-700'}>{item.ready ? 'OK' : item.errors.join('; ')}</span></div>)}</div></div> : null}
      </Card>
      <Card>
        <div className="grid gap-3 md:grid-cols-[220px_180px_180px]">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Select label="Status documente" value={status} onChange={event => setStatus(event.target.value)} options={[
            { value: '', label: 'Toate fara anulate' },
            { value: 'draft', label: 'Draft' },
            { value: 'validat', label: 'Validate' },
            { value: 'achitat', label: 'Achitate' },
            { value: 'incasat', label: 'Incasate' },
            { value: 'partial', label: 'Partial' }
          ]} />
          <Select label="Cota TVA" value={cota} onChange={event => setCota(event.target.value)} options={[
            { value: '', label: 'Toate cotele' },
            ...[21, 19, 9, 5, 0].map(value => ({ value, label: `${value}%` }))
          ]} />
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Mapare D406 / SAF-T</h3>
            <p className="text-sm text-slate-500">Acoperire tehnica a datelor necesare, fara generarea prematura a XML-ului fiscal.</p>
          </div>
          <Badge tone={saft.ready ? 'success' : 'warning'}>{saft.coverage || 0}% mapat</Badge>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(saft.areas || []).map(area => (
            <div key={area.label} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2"><strong>{area.label}</strong><Badge tone={area.ok ? 'success' : 'warning'}>{area.mapped}/{area.total}</Badge></div>
              {area.missing ? <div className="mt-1 text-xs text-amber-700">Lipsesc {area.missing} mapari</div> : null}
            </div>
          ))}
        </div>
        {(saft.issues || []).length ? (
          <div className="mt-3 max-h-48 overflow-auto rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {(saft.issues || []).slice(0, 20).map((issue, index) => <div key={`${issue.area}-${issue.id}-${index}`}><strong>{issue.area}:</strong> {issue.message} {issue.action}</div>)}
          </div>
        ) : null}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Pregatire declaratii</h3>
            <p className="text-sm text-slate-500">Control intern al datelor inainte de validarea in aplicatiile oficiale.</p>
          </div>
          <Badge tone={readiness.status === 'ready' ? 'success' : 'warning'}>{readiness.status === 'ready' ? 'pregatit' : 'necesita verificari'}</Badge>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {(readiness.declarations || []).map(item => (
            <div key={item.code} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-slate-900">{item.code}</strong>
                <Badge tone={['pregatit', 'pregatit_date', 'pregatit_mapare'].includes(item.status) ? 'success' : ['in_lucru', 'date_incomplete'].includes(item.status) ? 'warning' : 'gray'}>{item.status.replaceAll('_', ' ')}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(readiness.checks || []).map(check => (
            <div key={check.key} className={`rounded-md border px-3 py-2 text-sm ${check.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <strong>{check.label}:</strong> {check.message}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {['D300', 'D394', 'D112'].map(code => {
            const latest = declarationHistory.find(item => item.code === code)
            return <div key={code} className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => validateDeclaration(code)}>Validează {code}</Button>
              {['validat_intern', 'exportat'].includes(latest?.status) ? <Button variant="secondary" onClick={() => setArchiveForm({ code, file: null })}>Arhivează fișier</Button> : null}
              {['validat_intern', 'exportat', 'depus', 'respins'].includes(latest?.status) ? <Button onClick={() => setReceiptForm({ code, recipisa: '', status: 'acceptata', message: '', file: null })}>Recipisă</Button> : null}
              {latest ? <Badge tone={['acceptat', 'depus'].includes(latest.status) ? 'success' : ['cu_erori', 'respins'].includes(latest.status) ? 'warning' : 'gray'}>{latest.status.replaceAll('_', ' ')}</Badge> : null}
            </div>
          })}
        </div>
      </Card>
      {receiptForm ? <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-base font-semibold text-slate-900">Recipisă ANAF · {receiptForm.code}</h3><p className="text-sm text-slate-500">Înregistrează rezultatul și arhivează opțional fișierul primit.</p></div>
          <Button variant="secondary" onClick={() => setReceiptForm(null)}>Închide</Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Număr recipisă" value={receiptForm.recipisa} onChange={event => setReceiptForm({ ...receiptForm, recipisa: event.target.value })} />
          <Select label="Rezultat" value={receiptForm.status} onChange={event => setReceiptForm({ ...receiptForm, status: event.target.value })} options={[
            { value: 'acceptata', label: 'Acceptată' }, { value: 'respinsa', label: 'Respinsă' }, { value: 'in_procesare', label: 'În procesare' }
          ]} />
          <Input label="Mesaj / observații" value={receiptForm.message} onChange={event => setReceiptForm({ ...receiptForm, message: event.target.value })} />
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Fișier recipisă</span><input className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2" type="file" accept=".pdf,.xml,.zip,.txt" onChange={event => setReceiptForm({ ...receiptForm, file: event.target.files?.[0] || null })} /></label>
        </div>
        <div className="mt-3 flex justify-end"><Button onClick={saveReceipt}>Salvează recipisa</Button></div>
      </Card> : null}
      {archiveForm ? <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-base font-semibold text-slate-900">Fișier declarație · {archiveForm.code}</h3><p className="text-sm text-slate-500">Arhivează fișierul pregătit sau validat în aplicația oficială.</p></div>
          <Button variant="secondary" onClick={() => setArchiveForm(null)}>Închide</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid min-w-72 flex-1 gap-1 text-sm"><span className="font-medium text-slate-700">PDF, XML, ZIP sau TXT</span><input className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2" type="file" accept=".pdf,.xml,.zip,.txt" onChange={event => setArchiveForm({ ...archiveForm, file: event.target.files?.[0] || null })} /></label>
          <Button onClick={archiveDeclaration}>Arhivează</Button>
        </div>
      </Card> : null}
      <Card>
        <div><h3 className="text-base font-semibold text-slate-900">Registru declarații</h3><p className="text-sm text-slate-500">Validare internă, export, depunere și recipisă pentru perioada selectată.</p></div>
        <div className="mt-3"><Table headers={['Declarație', 'Status', 'Validată', 'Exportată', 'Recipisă', 'Rezultat', 'Declarație', 'Recipisă']}>
          {(declarationRegister.declarations || []).map(item => {
            const run = item.latest
            return <tr key={item.code}>
              <td className="px-3 py-2 font-semibold">{item.code}</td>
              <td className="px-3 py-2"><Badge tone={['acceptat', 'depus'].includes(run?.status) ? 'success' : ['cu_erori', 'respins'].includes(run?.status) ? 'warning' : 'gray'}>{run?.status?.replaceAll('_', ' ') || 'neînceput'}</Badge></td>
              <td className="px-3 py-2">{run?.validated_at?.slice(0, 16).replace('T', ' ') || '-'}</td>
              <td className="px-3 py-2">{run?.exported_at?.slice(0, 16).replace('T', ' ') || '-'}</td>
              <td className="px-3 py-2">{run?.recipisa || '-'}</td>
              <td className="px-3 py-2">{run?.receipt_status?.replaceAll('_', ' ') || '-'}</td>
              <td className="px-3 py-2">{run?.declaration_file ? <Button variant="secondary" onClick={() => download(`/accounting/declarations/runs/${run.id}/file`, run.declaration_original_name || `Declaratie_${item.code}`)}>Descarcă</Button> : '-'}</td>
              <td className="px-3 py-2">{run?.receipt_file ? <Button variant="secondary" onClick={() => download(`/accounting/declarations/runs/${run.id}/receipt`, run.receipt_original_name || `Recipisa_${item.code}`)}>Descarcă</Button> : '-'}</td>
            </tr>
          })}
        </Table></div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-slate-500">Status TVA luna</div>
            <div className="mt-1 text-sm text-slate-700">
              {periodStatus.tva_verificat_la ? `Verificat la ${periodStatus.tva_verificat_la.slice(0, 16).replace('T', ' ')} de ${periodStatus.tva_verificat_de_name || '-'}` : 'Neverificat pentru inchidere luna.'}
            </div>
          </div>
          <Badge tone={periodStatus.tva_verificat_la ? 'success' : 'warning'}>{periodStatus.tva_verificat_la ? 'verificat' : 'neverificat'}</Badge>
        </div>
      </Card>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Pregatire interna pentru verificare TVA. XML-ul de lucru nu este declaratie ANAF finala si trebuie validat in fluxul oficial inainte de depunere.
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Info label="TVA colectata" value={formatMoney(d.total_tva_colectata || 0)} />
        <Info label="TVA deductibila" value={formatMoney(d.total_tva_deductibila || 0)} />
        <Info label="TVA de plata" value={formatMoney(d.tva_de_plata || 0)} />
        <Info label="TVA de recuperat" value={formatMoney(d.tva_de_recuperat || 0)} />
      </div>
      {warnings.length ? <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{warnings.join(' ')}</div> : null}
      {d394.warnings?.length ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{d394.warnings.join(' ')}</div> : null}
      <Table headers={['CUI', 'Tert', 'Tip', 'Documente', 'Baza', 'TVA', 'Total']}>
        {(d394.terti || []).map(row => (
          <tr key={`${row.tip}-${row.cui}`}>
            <td className="px-3 py-2 font-mono">{row.cui}</td>
            <td className="px-3 py-2">{row.denumire}</td>
            <td className="px-3 py-2">{row.tip}</td>
            <td className="px-3 py-2 text-right">{row.documente}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.baza)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.tva)}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.total)}</td>
          </tr>
        ))}
      </Table>
      {journal.status_summary?.length ? (
        <Table headers={['Status', 'Intrari', 'TVA intrari', 'Iesiri', 'TVA iesiri']}>
          {journal.status_summary.map(row => (
            <tr key={row.status}>
              <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
              <td className="px-3 py-2 text-right">{row.intrari || 0}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.tva_intrari || 0)}</td>
              <td className="px-3 py-2 text-right">{row.iesiri || 0}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.tva_iesiri || 0)}</td>
            </tr>
          ))}
        </Table>
      ) : null}
      <Table headers={['Cod intern', 'Rand decont', 'Baza', 'TVA']}>
        {(d.randuri || []).map(row => (
          <tr key={row.cod}>
            <td className="px-3 py-2 font-mono text-sm">{row.cod}</td>
            <td className="px-3 py-2">{row.descriere}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.baza || 0)}</td>
            <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.tva || 0)}</td>
          </tr>
        ))}
      </Table>
      <Table headers={['Cota', 'Baza cumparari', 'TVA deductibila', 'Baza vanzari', 'TVA colectata']}>
        {(journal.cote || []).map(row => (
          <tr key={row.cota}>
            <td className="px-3 py-2">{row.cota}%</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.cumparari_baza || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.cumparari_tva || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.vanzari_baza || 0)}</td>
            <td className="px-3 py-2 text-right">{formatMoney(row.vanzari_tva || 0)}</td>
          </tr>
        ))}
      </Table>
      <div className="grid gap-4 xl:grid-cols-2">
        <Table headers={['Data', 'Document', 'Furnizor', 'Baza', 'TVA', 'Total', 'Status', 'Actiuni']}>
          {(journal.jurnal_cumparari || []).map(row => (
            <tr key={row.uuid || row.id}>
              <td className="px-3 py-2">{row.data}</td>
              <td className="px-3 py-2">{row.nr_document || row.numar || '-'}</td>
              <td className="px-3 py-2">{row.tert || '-'}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.valoare || 0)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.tva || 0)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.total || 0)}</td>
              <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
              <td className="px-3 py-2">
                <DropdownMenu align="right" label="Actiuni" items={[
                  { label: 'Deschide factura', to: `/contabilitate/facturi-intrare?luna=${month}&q=${encodeURIComponent(row.nr_document || row.numar || row.uuid || row.id || '')}` },
                  { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` },
                  { label: 'Jurnale contabile', to: `/contabilitate/jurnale?luna=${month}` }
                ]} />
              </td>
            </tr>
          ))}
        </Table>
        <Table headers={['Data', 'Document', 'Client', 'Baza', 'TVA', 'Total', 'Status', 'Actiuni']}>
          {(journal.jurnal_vanzari || []).map(row => (
            <tr key={row.uuid || row.id}>
              <td className="px-3 py-2">{row.data}</td>
              <td className="px-3 py-2">{row.nr_document || row.numar || '-'}</td>
              <td className="px-3 py-2">{row.tert || '-'}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.valoare || 0)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.tva || 0)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.total || 0)}</td>
              <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
              <td className="px-3 py-2">
                <DropdownMenu align="right" label="Actiuni" items={[
                  { label: 'Deschide factura', to: `/contabilitate/facturi-iesire?luna=${month}&q=${encodeURIComponent(row.nr_document || row.numar || row.uuid || row.id || '')}` },
                  { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` },
                  { label: 'Jurnale contabile', to: `/contabilitate/jurnale?luna=${month}` }
                ]} />
              </td>
            </tr>
          ))}
        </Table>
      </div>
      </> : null}
    </AccountingShell>
  )
}

export default TVADeclaratii
