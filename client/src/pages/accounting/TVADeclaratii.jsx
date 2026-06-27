import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth, statusTone } from './accounting-shared'
export function TVADeclaratii() {
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [status, setStatus] = useState('')
  const [cota, setCota] = useState('')
  const [data, setData] = useState({ decont: { randuri: [] } })
  const [journal, setJournal] = useState({ jurnal_cumparari: [], jurnal_vanzari: [], cote: [] })
  const [readiness, setReadiness] = useState({ checks: [], declarations: [] })
  const [d394, setD394] = useState({ terti: [], warnings: [], totaluri: {} })
  const [saft, setSaft] = useState({ areas: [], issues: [], coverage: 0 })
  const [declarationHistory, setDeclarationHistory] = useState([])
  const [schemas, setSchemas] = useState([])
  const [schemaCode, setSchemaCode] = useState('D300')
  const [schemaFile, setSchemaFile] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { load() }, [month, status, cota])

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
      api.get('/accounting/declarations/history', { params: params() }),
      api.get('/accounting/declarations/schemas')
    ]).then(([d300Res, journalRes, readinessRes, d394Res, saftRes, historyRes, schemasRes]) => {
      setData(d300Res.data || { decont: { randuri: [] } })
      setJournal(journalRes.data || { jurnal_cumparari: [], jurnal_vanzari: [], cote: [] })
      setReadiness(readinessRes.data || { checks: [], declarations: [] })
      setD394(d394Res.data || { terti: [], warnings: [], totaluri: {} })
      setSaft(saftRes.data || { areas: [], issues: [], coverage: 0 })
      setDeclarationHistory(historyRes.data?.runs || [])
      setSchemas(schemasRes.data?.schemas || [])
    }).catch(err => {
      setData({ decont: { randuri: [] } })
      setJournal({ jurnal_cumparari: [], jurnal_vanzari: [], cote: [] })
      setReadiness({ checks: [], declarations: [] })
      setD394({ terti: [], warnings: [], totaluri: {} })
      setSaft({ areas: [], issues: [], coverage: 0 })
      setDeclarationHistory([])
      setSchemas([])
      setError(err.response?.data?.error || 'Nu am putut incarca TVA / D300.')
    })
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

  async function markDeclarationSubmitted(code) {
    const recipisa = window.prompt(`Numărul recipisei ANAF pentru ${code}:`, '')
    if (!recipisa) return
    try {
      setError(''); setMessage('')
      await api.post(`/accounting/declarations/${code}/submit`, { perioada: month, recipisa })
      setMessage(`${code} a fost marcată depusă cu recipisa ${recipisa}.`)
      load()
    } catch (err) { setError(err.response?.data?.error || `${code} nu a putut fi marcată depusă.`) }
  }

  async function download(endpoint, filename) {
    const res = await api.get(endpoint, { params: params(), responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
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
      title="TVA / D300"
      subtitle="Jurnal TVA cumparari si vanzari, sumar de lucru pentru decont."
      actions={(
        <DropdownMenu align="right" label="Actiuni" items={[
            { label: 'Reincarca TVA', onClick: load },
            canCheckVat ? { label: 'Marcheaza TVA verificat', onClick: markVatChecked } : null,
            { type: 'separator' },
            { label: 'Export Excel', onClick: () => download('/accounting/vat-journal/export', `Jurnal_TVA_${fileMonth}.xlsx`) },
            { label: 'XML lucru', onClick: () => download('/accounting/d300/export-xml', `D300_lucru_${fileMonth}.xml`) },
            { label: 'D394 lucru Excel', onClick: () => download('/accounting/d394/export', `D394_lucru_${fileMonth}.xlsx`) },
            { label: 'Raport control declarații', onClick: () => download('/accounting/declarations/control-export', `Control_declaratii_${fileMonth}.xlsx`) },
            { label: 'Diagnostic SAF-T Excel', onClick: () => download('/accounting/saft/export-mapping', `Diagnostic_SAFT_${fileMonth}.xlsx`) },
            { type: 'separator' },
            { label: 'Facturi intrare', to: `/contabilitate/facturi-intrare?luna=${month}` },
            { label: 'Facturi iesire', to: `/contabilitate/facturi-iesire?luna=${month}` },
            { label: 'Inchidere luna', to: `/contabilitate/inchidere-luna?luna=${month}` },
          ].filter(Boolean)} />
      )}
    >
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
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
                <Badge tone={item.status === 'pregatit' ? 'success' : item.status === 'in_lucru' ? 'warning' : 'gray'}>{item.status.replace('_', ' ')}</Badge>
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
          {['D300', 'D394'].map(code => {
            const latest = declarationHistory.find(item => item.code === code)
            return <div key={code} className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => validateDeclaration(code)}>Validează {code}</Button>
              {latest?.status === 'validat_intern' ? <Button onClick={() => markDeclarationSubmitted(code)}>Înregistrează recipisa</Button> : null}
              {latest ? <Badge tone={latest.status === 'depus' ? 'success' : latest.status === 'cu_erori' ? 'warning' : 'gray'}>{latest.status.replaceAll('_', ' ')}</Badge> : null}
            </div>
          })}
        </div>
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
    </AccountingShell>
  )
}

export default TVADeclaratii
