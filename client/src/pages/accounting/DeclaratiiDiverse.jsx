import { useEffect, useState } from 'react'
import api from '../../api/client'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import { AccountingShell, Table, currentMonth } from './accounting-shared'
import { formatMoney } from '../../utils/format'

export default function DeclaratiiDiverse() {
  const [tab, setTab] = useState('d205')
  const [month, setMonth] = useState(currentMonth())
  const [d205, setD205] = useState({ rows: [], totals: {}, issues: [] })
  const [intrastat, setIntrastat] = useState({ rows: [], totals: {}, issues: [] })
  const [map, setMap] = useState({ declarations: [] })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [d205Form, setD205Form] = useState({ cnp_cui: '', nume: '', tip_venit: '08', tip_plata: '2', venit_brut: '', impozit_retinut: '', dividende_distribuite: '', dividende_platite: '' })
  const emptyIntrastat = { flux: 'introduceri', tara_partenera: '', tara_origine: '', judet_destinatie: '', cod_nc: '', natura_tranzactie: '11', conditie_livrare: '', mod_transport: '', masa_neta: '', valoare_facturata: '', valoare_statistica: '' }
  const [intrastatForm, setIntrastatForm] = useState(emptyIntrastat)

  useEffect(() => { load() }, [month])
  async function load() {
    try {
      const [d205Res, intrastatRes, mapRes] = await Promise.all([
        api.get('/accounting/d205', { params: { an: month.slice(0, 4) } }),
        api.get('/accounting/intrastat', { params: { perioada: month } }),
        api.get('/accounting/fiscal/completion-map', { params: { perioada: month } })
      ])
      setD205(d205Res.data); setIntrastat(intrastatRes.data); setMap(mapRes.data); setError('')
    } catch (err) { setError(err.response?.data?.error || 'Datele fiscale nu au putut fi încărcate.') }
  }
  async function saveD205(event) {
    event.preventDefault()
    try { await api.post('/accounting/d205/entries', { ...d205Form, an: Number(month.slice(0, 4)) }); setD205Form({ cnp_cui: '', nume: '', tip_venit: '08', tip_plata: '2', venit_brut: '', impozit_retinut: '', dividende_distribuite: '', dividende_platite: '' }); setMessage('Poziția D205 a fost salvată.'); load() } catch (err) { setError(err.response?.data?.error || 'Poziția D205 nu a putut fi salvată.') }
  }
  async function saveIntrastat(event) {
    event.preventDefault()
    try { await api.post('/accounting/intrastat/entries', { ...intrastatForm, perioada: month }); setIntrastatForm(emptyIntrastat); setMessage('Poziția Intrastat a fost salvată.'); load() } catch (err) { setError(err.response?.data?.error || 'Poziția Intrastat nu a putut fi salvată.') }
  }
  async function runConfirmAction(reason) {
    if (!confirmAction?.run) return
    try {
      setConfirmLoading(true)
      setError('')
      setMessage('')
      await confirmAction.run(reason)
      setConfirmAction(null)
    } catch (err) {
      setError(err.response?.data?.error || confirmAction.errorMessage || 'Acțiunea nu a putut fi executată.')
    } finally {
      setConfirmLoading(false)
    }
  }
  function cancel(kind, id) {
    setConfirmAction({
      title: 'Anulează poziție fiscală',
      message: `Anulezi poziția ${kind.toUpperCase()} selectată?`,
      details: 'Poziția va fi scoasă din registrul de lucru fiscal, iar istoricul rămâne păstrat pentru audit.',
      confirmLabel: 'Anulează poziția',
      tone: 'danger',
      reasonLabel: 'Motiv anulare',
      reasonDefault: 'Corecție registru fiscal',
      reasonRequired: true,
      minReasonLength: 3,
      errorMessage: 'Poziția fiscală nu a putut fi anulată.',
      run: motiv => cancelRequest(kind, id, motiv)
    })
  }
  async function cancelRequest(kind, id, motiv) { await api.delete(`/accounting/${kind}/entries/${id}`, { data: { motiv } }); setMessage('Poziția fiscală a fost anulată.'); load() }
  async function download(path, filename, params) { try { const response = await api.get(path, { params, responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url) } catch (err) { setError(err.response?.data?.error || 'Fișierul nu a putut fi generat.') } }
  const field = (form, setForm, key) => event => setForm({ ...form, [key]: event.target.value })

  return <AccountingShell active="declaratii-diverse" title="Declarații și raportări" subtitle="D205, Intrastat și imaginea unică a obligațiilor fiscale." actions={<Input type="month" value={month} onChange={event => setMonth(event.target.value)} />}>
    {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message && <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
    <Card density="compact"><div className="flex flex-wrap gap-2"><Button variant={tab === 'd205' ? 'primary' : 'secondary'} onClick={() => setTab('d205')}>D205</Button><Button variant={tab === 'intrastat' ? 'primary' : 'secondary'} onClick={() => setTab('intrastat')}>Intrastat</Button><Button variant={tab === 'status' ? 'primary' : 'secondary'} onClick={() => setTab('status')}>Status fiscal</Button></div></Card>

    {tab === 'd205' && <>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Declarația 205 - registru de lucru {month.slice(0, 4)}</h3><p className="text-sm text-slate-500">Venituri cu impozit reținut la sursă. Exportul candidat se validează ulterior cu instrumentele oficiale.</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => download('/accounting/d205/export', `D205_lucru_${month.slice(0, 4)}.xlsx`, { an: month.slice(0, 4) })}>Excel</Button><Button variant="secondary" onClick={() => download('/accounting/d205/candidate', `D205_candidat_${month.slice(0, 4)}.xml`, { an: month.slice(0, 4) })}>XML candidat</Button></div></div>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={saveD205}><Input label="CNP/CUI" value={d205Form.cnp_cui} onChange={field(d205Form, setD205Form, 'cnp_cui')} required/><Input label="Beneficiar" value={d205Form.nume} onChange={field(d205Form, setD205Form, 'nume')} required/><Select label="Tip venit ANAF" value={d205Form.tip_venit} onChange={field(d205Form, setD205Form, 'tip_venit')} options={[{value:'08',label:'08 - Dividende'},{value:'09',label:'09 - Dobânzi'},{value:'04',label:'04 - Alte venituri'},{value:'11',label:'11 - Drepturi proprietate intelectuală'},{value:'16',label:'16 - Premii'}]}/><Select label="Tip plată" value={d205Form.tip_plata} onChange={field(d205Form, setD205Form, 'tip_plata')} options={[{value:'2',label:'2 - Impozit final'},{value:'0',label:'0 - Nu se completează'},{value:'3',label:'3 - Convenție evitare dublă impunere'}]}/><Input label="Venit / bază" type="number" step="1" value={d205Form.venit_brut} onChange={field(d205Form, setD205Form, 'venit_brut')}/><Input label="Impozit reținut" type="number" step="1" value={d205Form.impozit_retinut} onChange={field(d205Form, setD205Form, 'impozit_retinut')}/><Input label="Dividende distribuite" type="number" step="1" value={d205Form.dividende_distribuite} onChange={field(d205Form, setD205Form, 'dividende_distribuite')}/><div className="flex items-end gap-2"><Input label="Dividende plătite" type="number" step="1" value={d205Form.dividende_platite} onChange={field(d205Form, setD205Form, 'dividende_platite')}/><Button type="submit">Adaugă</Button></div></form>
      </Card>
      <Table headers={['CNP/CUI','Beneficiar','Tip venit','Venit brut','Impozit','Acțiuni']}>{d205.rows.map(row => <tr key={row.id}><td className="px-3 py-2">{row.cnp_cui}</td><td className="px-3 py-2 font-semibold">{row.nume}</td><td className="px-3 py-2">{row.tip_venit}</td><td className="px-3 py-2">{formatMoney(row.venit_brut)}</td><td className="px-3 py-2">{formatMoney(row.impozit_retinut)}</td><td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => cancel('d205', row.id)}>Anulează</Button></td></tr>)}</Table>
    </>}

    {tab === 'intrastat' && <>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Intrastat {month}</h3><p className="text-sm text-slate-500">Poziții lunare pentru introduceri și expedieri intracomunitare.</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => download('/accounting/intrastat/export', `Intrastat_${month}.xlsx`, { perioada: month })}>Excel</Button><Button variant="secondary" onClick={() => download('/accounting/intrastat/candidate', `Intrastat_candidat_${month}.xml`, { perioada: month })}>XML candidat</Button></div></div>
        <form className="mt-4 grid gap-3 md:grid-cols-5" onSubmit={saveIntrastat}><Select label="Flux" value={intrastatForm.flux} onChange={field(intrastatForm, setIntrastatForm, 'flux')} options={[{value:'introduceri',label:'Introduceri'},{value:'expedieri',label:'Expedieri'}]}/><Input label="Țară parteneră" maxLength="2" value={intrastatForm.tara_partenera} onChange={field(intrastatForm, setIntrastatForm, 'tara_partenera')} required/><Input label="Țară origine" maxLength="2" value={intrastatForm.tara_origine} onChange={field(intrastatForm, setIntrastatForm, 'tara_origine')}/><Input label="Județ destinație" maxLength="2" value={intrastatForm.judet_destinatie} onChange={field(intrastatForm, setIntrastatForm, 'judet_destinatie')}/><Input label="Cod NC" maxLength="8" value={intrastatForm.cod_nc} onChange={field(intrastatForm, setIntrastatForm, 'cod_nc')} required/><Input label="Natura tranzacției" value={intrastatForm.natura_tranzactie} onChange={field(intrastatForm, setIntrastatForm, 'natura_tranzactie')}/><Input label="Condiție livrare" value={intrastatForm.conditie_livrare} onChange={field(intrastatForm, setIntrastatForm, 'conditie_livrare')}/><Input label="Mod transport" value={intrastatForm.mod_transport} onChange={field(intrastatForm, setIntrastatForm, 'mod_transport')}/><Input label="Masă netă kg" type="number" step="0.001" value={intrastatForm.masa_neta} onChange={field(intrastatForm, setIntrastatForm, 'masa_neta')}/><Input label="Valoare facturată" type="number" step="0.01" value={intrastatForm.valoare_facturata} onChange={field(intrastatForm, setIntrastatForm, 'valoare_facturata')}/><Input label="Valoare statistică" type="number" step="0.01" value={intrastatForm.valoare_statistica} onChange={field(intrastatForm, setIntrastatForm, 'valoare_statistica')}/><div className="flex items-end"><Button type="submit">Adaugă</Button></div></form>
      </Card>
      <Table headers={['Flux','Țară','Cod NC','Natura','Masă netă','Valoare','Acțiuni']}>{intrastat.rows.map(row => <tr key={row.id}><td className="px-3 py-2">{row.flux}</td><td className="px-3 py-2">{row.tara_partenera}</td><td className="px-3 py-2 font-semibold">{row.cod_nc}</td><td className="px-3 py-2">{row.natura_tranzactie}</td><td className="px-3 py-2">{row.masa_neta}</td><td className="px-3 py-2">{formatMoney(row.valoare_facturata)}</td><td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => cancel('intrastat', row.id)}>Anulează</Button></td></tr>)}</Table>
    </>}

    {tab === 'status' && <Card><h3 className="mb-3 font-semibold">Situația fiscală {month}</h3><div className="grid gap-2 md:grid-cols-3">{map.declarations?.map(item => <div key={item.code} className="flex items-center justify-between rounded-md border border-slate-200 p-3"><strong>{item.code}</strong><Badge tone={item.receipt_status === 'acceptata' ? 'success' : item.status === 'nepregatit' ? 'warning' : 'info'}>{item.receipt_status || item.status}</Badge></div>)}<div className="flex items-center justify-between rounded-md border border-slate-200 p-3"><strong>D205</strong><Badge tone={map.d205?.ready ? 'success' : 'warning'}>{map.d205?.ready ? 'pregătit' : 'de completat'}</Badge></div><div className="flex items-center justify-between rounded-md border border-slate-200 p-3"><strong>Intrastat</strong><Badge tone={map.intrastat?.ready ? 'success' : 'warning'}>{map.intrastat?.ready ? 'pregătit' : 'de completat'}</Badge></div></div></Card>}
    <ConfirmDialog
      open={Boolean(confirmAction)}
      title={confirmAction?.title}
      message={confirmAction?.message}
      details={confirmAction?.details}
      confirmLabel={confirmAction?.confirmLabel}
      tone={confirmAction?.tone}
      loading={confirmLoading}
      reasonLabel={confirmAction?.reasonLabel}
      reasonDefault={confirmAction?.reasonDefault}
      reasonRequired={confirmAction?.reasonRequired}
      minReasonLength={confirmAction?.minReasonLength}
      onCancel={() => setConfirmAction(null)}
      onConfirm={runConfirmAction}
    />
  </AccountingShell>
}
