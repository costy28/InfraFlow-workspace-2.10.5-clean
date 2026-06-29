import { useEffect, useState } from 'react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Modal from '../../components/ui/Modal'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth, statusTone } from './accounting-shared'

const emptyCorrection = {
  salary_base: '', base_gross: '', manual_bonus: '', taxable_benefits: '',
  personal_deduction: '', other_deductions: ''
}
const emptyAdjustment = { employee_id: '', tip: 'bonus', amount: '', descriere: '', data_start: '', data_sfarsit: '', recurent: false }

export default function Salarizare() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState({ run: null, lines: [], profile: null })
  const [settings, setSettings] = useState(null)
  const [adjustments, setAdjustments] = useState([])
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [adjustment, setAdjustment] = useState(emptyAdjustment)
  const [editing, setEditing] = useState(null)
  const [correction, setCorrection] = useState(emptyCorrection)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profile, setProfile] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month])

  async function load() {
    try {
      setError('')
      const [payroll, config, adjustmentRes] = await Promise.all([
        api.get('/hr/payroll', { params: { luna: month } }),
        api.get('/hr/payroll/settings', { params: { luna: month } }),
        api.get('/hr/payroll/adjustments', { params: { luna: month } })
      ])
      setData(payroll.data)
      setSettings(config.data)
      setProfile({ ...config.data.current, effective_from: `${month}-01` })
      setAdjustments(adjustmentRes.data?.items || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Datele de salarizare nu au putut fi incarcate.')
    }
  }

  async function generate() {
    try {
      setError(''); setMessage('')
      await api.post('/hr/payroll/generate', { luna: month })
      setMessage('Statul salarial a fost generat din contracte si pontaj.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Statul salarial nu a putut fi generat.') }
  }

  async function validate() {
    try {
      setError(''); setMessage('')
      await api.post(`/hr/payroll/${data.run.id}/validate`)
      setMessage('Statul salarial a fost validat si poate alimenta pregatirea D112.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Statul salarial nu a putut fi validat.') }
  }

  async function devalidate() {
    const motiv = window.prompt('Motivul devalidarii:')
    if (!motiv) return
    try {
      setError(''); setMessage('')
      await api.post(`/hr/payroll/${data.run.id}/devalidate`, { motiv })
      setMessage('Statul salarial a fost redeschis pentru corectii.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Statul salarial nu a putut fi devalidat.') }
  }

  function editLine(line) {
    setEditing(line)
    setCorrection({
      salary_base: line.salary_base ?? '', base_gross: line.base_gross ?? '',
      manual_bonus: line.manual_bonus ?? '', taxable_benefits: line.taxable_benefits ?? '',
      personal_deduction: line.personal_deduction ?? '', other_deductions: line.other_deductions ?? ''
    })
  }

  async function saveLine(event) {
    event.preventDefault()
    try {
      const body = Object.fromEntries(Object.entries(correction).map(([key, value]) => [key, value === '' ? 0 : Number(value)]))
      await api.patch(`/hr/payroll/${data.run.id}/lines/${editing.id}`, body)
      setEditing(null)
      setMessage('Corectia salariala a fost recalculata.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Corectia nu a putut fi salvata.') }
  }

  async function saveProfile(event) {
    event.preventDefault()
    try {
      await api.post('/hr/payroll/settings', profile)
      setSettingsOpen(false)
      setMessage('Profilul fiscal a fost salvat cu data de intrare in vigoare selectata.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Profilul fiscal nu a putut fi salvat.') }
  }

  async function exportExcel() {
    try {
      const response = await api.get(`/hr/payroll/${data.run.id}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `Stat_salarial_${month.replace('-', '_')}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError(err.response?.data?.error || 'Exportul nu a putut fi generat.') }
  }

  async function downloadBank() {
    try {
      const response = await api.get(`/hr/payroll/${data.run.id}/bank-export`, { responseType: 'blob' })
      downloadBlob(response.data, `Plati_salarii_${month.replace('-', '_')}.xlsx`)
    } catch (err) { setError(err.response?.data?.error || 'Fisierul bancar nu a putut fi generat.') }
  }

  async function postAccounting() {
    try {
      await api.post(`/hr/payroll/${data.run.id}/post-accounting`)
      setMessage('Nota contabila a statului salarial a fost generata.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Nota contabila nu a putut fi generata.') }
  }

  async function openPayslip(line) {
    try {
      const response = await api.get(`/hr/payroll/${data.run.id}/lines/${line.id}/payslip`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) { setError(err.response?.data?.error || 'Fluturasul nu a putut fi deschis.') }
  }

  async function saveAdjustment(event) {
    event.preventDefault()
    try {
      await api.post('/hr/payroll/adjustments', { ...adjustment, luna: month, amount: Number(adjustment.amount), data_start: adjustment.data_start || `${month}-01` })
      setAdjustmentOpen(false)
      setAdjustment(emptyAdjustment)
      setMessage('Ajustarea a fost salvata. Regenereaza statul pentru a o aplica.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Ajustarea nu a putut fi salvata.') }
  }

  async function cancelAdjustment(item) {
    if (!window.confirm('Anulezi ajustarea salariala?')) return
    try {
      await api.delete(`/hr/payroll/adjustments/${item.id}`, { data: { motiv: 'Anulare din salarizare' } })
      setMessage('Ajustarea a fost anulata.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Ajustarea nu a putut fi anulata.') }
  }

  const run = data.run
  const actionItems = [
    { label: run ? 'Regenereaza din pontaj' : 'Genereaza din pontaj', onClick: generate, disabled: run?.status === 'validat' },
    run?.status === 'draft' ? { label: 'Valideaza statul', onClick: validate } : null,
    run?.status === 'validat' ? { label: 'Devalideaza', onClick: devalidate } : null,
    run ? { label: 'Export Excel', onClick: exportExcel } : null,
    run?.status === 'validat' ? { label: 'Export plati banca', onClick: downloadBank } : null,
    run?.status === 'validat' && !run.accounting_journal_id ? { label: 'Genereaza nota contabila', onClick: postAccounting } : null,
    { type: 'separator' },
    { label: 'Adauga spor / retinere', onClick: () => { setAdjustment({ ...emptyAdjustment, employee_id: data.lines?.[0]?.employee_id || '', data_start: `${month}-01` }); setAdjustmentOpen(true) } },
    { label: 'Profil fiscal', onClick: () => setSettingsOpen(true) },
    { label: 'Pregatire D112', to: `/contabilitate/tva-d300?tab=d112&luna=${month}` }
  ].filter(Boolean)

  return (
    <AccountingShell active="salarizare" title="Salarizare" subtitle="Calcul lunar preliminar, validare si sursa controlata pentru D112." actions={<DropdownMenu label="Actiuni salarizare" align="right" items={actionItems} />}>
      <Card>
        <div className="grid gap-3 md:grid-cols-[16rem_1fr] md:items-end">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Verifica profilul fiscal si cazurile speciale. Concediile medicale si exceptiile necesita controlul operatorului.
          </div>
        </div>
      </Card>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Info label="Status" value={run ? <Badge tone={statusTone(run.status)}>{run.status}</Badge> : 'Negenerat'} />
        <Info label="Angajati" value={run?.employee_count || 0} />
        <Info label="Brut" value={formatMoney(run?.total_gross || 0)} />
        <Info label="Net" value={formatMoney(run?.total_net || 0)} />
        <Info label="Contributii + impozit" value={formatMoney((run?.total_cas || 0) + (run?.total_cass || 0) + (run?.total_income_tax || 0) + (run?.total_cam || 0))} />
        <Info label="Cost angajator" value={formatMoney(run?.total_employer_cost || 0)} />
      </div>
      {run?.accounting_journal_id ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Nota contabila #{run.accounting_journal_id} este generata.</div> : null}
      <Table headers={['Marca', 'Angajat', 'Ore', 'Brut', 'CAS', 'CASS', 'Impozit', 'Net', 'CAM', 'Control', 'Actiuni']}>
        {(data.lines || []).map(line => (
          <tr key={line.id}>
            <td className="px-3 py-2">{line.marca || '-'}</td>
            <td className="px-3 py-2 font-semibold">{line.employee_name}</td>
            <td className="px-3 py-2 whitespace-nowrap">{line.paid_hours} / {line.norm_hours}</td>
            <td className="px-3 py-2 whitespace-nowrap">{formatMoney(line.gross)}</td>
            <td className="px-3 py-2 whitespace-nowrap">{formatMoney(line.cas)}</td>
            <td className="px-3 py-2 whitespace-nowrap">{formatMoney(line.cass)}</td>
            <td className="px-3 py-2 whitespace-nowrap">{formatMoney(line.income_tax)}</td>
            <td className="px-3 py-2 whitespace-nowrap font-semibold">{formatMoney(line.net)}</td>
            <td className="px-3 py-2 whitespace-nowrap">{formatMoney(line.cam)}</td>
            <td className="max-w-xs px-3 py-2 text-xs">
              {(line.errors || []).map(item => <div key={item} className="text-red-700">{item}</div>)}
              {(line.warnings || []).map(item => <div key={item} className="text-amber-700">{item}</div>)}
              {!line.errors?.length && !line.warnings?.length ? <span className="text-emerald-700">OK</span> : null}
            </td>
            <td className="px-3 py-2"><DropdownMenu label="Actiuni" items={[
              { label: 'Fluturas', onClick: () => openPayslip(line) },
              run?.status === 'draft' ? { label: 'Corecteaza', onClick: () => editLine(line) } : null
            ].filter(Boolean)} /></td>
          </tr>
        ))}
      </Table>
      {!run ? <Card><div className="py-8 text-center text-sm text-slate-500">Genereaza statul pentru luna selectata din meniul Actiuni salarizare.</div></Card> : null}

      <Card>
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Sporuri, indemnizatii si retineri</h3><p className="text-sm text-slate-500">Ajustarile active sunt preluate automat la regenerarea statului.</p></div><Button size="sm" onClick={() => { setAdjustment({ ...emptyAdjustment, employee_id: data.lines?.[0]?.employee_id || '', data_start: `${month}-01` }); setAdjustmentOpen(true) }}>Adauga</Button></div>
        <div className="mt-3 space-y-2">{adjustments.map(item => {
          const line = data.lines?.find(row => String(row.employee_id) === String(item.employee_id))
          return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"><div><strong>{line?.employee_name || `Angajat #${item.employee_id}`}</strong> · {item.tip.replaceAll('_', ' ')} · {formatMoney(item.amount)}<div className="text-xs text-slate-500">{item.descriere || '-'} · {item.data_start} - {item.data_sfarsit}</div></div><Button size="sm" variant="secondary" onClick={() => cancelAdjustment(item)}>Anuleaza</Button></div>
        })}{!adjustments.length ? <p className="text-sm text-slate-500">Nu exista ajustari active in luna selectata.</p> : null}</div>
      </Card>

      <Modal open={adjustmentOpen} title="Spor, indemnizatie sau retinere" onClose={() => setAdjustmentOpen(false)} size="md">
        <form className="grid gap-3" onSubmit={saveAdjustment}>
          <Select label="Angajat" value={adjustment.employee_id} onChange={event => setAdjustment(current => ({ ...current, employee_id: event.target.value }))} options={(data.lines || []).map(line => ({ value: line.employee_id, label: line.employee_name }))} required />
          <Select label="Tip" value={adjustment.tip} onChange={event => setAdjustment(current => ({ ...current, tip: event.target.value }))} options={[{ value: 'bonus', label: 'Spor / prima' }, { value: 'beneficiu_impozabil', label: 'Beneficiu impozabil' }, { value: 'indemnizatie_medicala', label: 'Indemnizatie concediu medical' }, { value: 'retinere', label: 'Retinere' }]} />
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Suma" type="number" min="0.01" step="0.01" value={adjustment.amount} onChange={event => setAdjustment(current => ({ ...current, amount: event.target.value }))} required /><Input label="Descriere" value={adjustment.descriere} onChange={event => setAdjustment(current => ({ ...current, descriere: event.target.value }))} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><Input label="De la" type="date" value={adjustment.data_start} onChange={event => setAdjustment(current => ({ ...current, data_start: event.target.value }))} required /><Input label="Pana la" type="date" value={adjustment.data_sfarsit} onChange={event => setAdjustment(current => ({ ...current, data_sfarsit: event.target.value }))} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={adjustment.recurent} onChange={event => setAdjustment(current => ({ ...current, recurent: event.target.checked }))} /> Ajustare recurenta</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAdjustmentOpen(false)}>Renunta</Button><Button type="submit">Salveaza</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} title={`Corectie salariala - ${editing?.employee_name || ''}`} onClose={() => setEditing(null)} size="md">
        <form className="grid gap-3" onSubmit={saveLine}>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries({ salary_base: 'Salariu baza', base_gross: 'Brut de baza', manual_bonus: 'Sporuri manuale', taxable_benefits: 'Avantaje impozabile', personal_deduction: 'Deducere personala', other_deductions: 'Alte retineri' }).map(([key, label]) => (
              <Input key={key} label={label} type="number" step="0.01" value={correction[key]} onChange={event => setCorrection(current => ({ ...current, [key]: event.target.value }))} />
            ))}
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Renunta</Button><Button type="submit">Recalculeaza</Button></div>
        </form>
      </Modal>

      <Modal open={settingsOpen} title="Profil fiscal salarizare" onClose={() => setSettingsOpen(false)} size="md">
        <form className="grid gap-3" onSubmit={saveProfile}>
          <Input label="Denumire profil" value={profile.name || ''} onChange={event => setProfile(current => ({ ...current, name: event.target.value }))} required />
          <Input label="Valabil de la" type="date" value={profile.effective_from || ''} onChange={event => setProfile(current => ({ ...current, effective_from: event.target.value }))} required />
          <div className="grid gap-3 sm:grid-cols-2">
            {[['cas_rate', 'CAS %'], ['cass_rate', 'CASS %'], ['income_tax_rate', 'Impozit %'], ['cam_rate', 'CAM %'], ['overtime_rate_1', 'Ore suplimentare S1 %'], ['overtime_rate_2', 'Ore suplimentare S2 %'], ['night_rate', 'Spor noapte %']].map(([key, label]) => (
              <Input key={key} label={label} type="number" step="0.01" value={profile[key] ?? ''} onChange={event => setProfile(current => ({ ...current, [key]: Number(event.target.value) }))} required />
            ))}
          </div>
          <div className="text-xs text-slate-500">Profil activ: {settings?.current?.name || '-'} · {settings?.current?.source || ''}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)}>Renunta</Button><Button type="submit">Salveaza profil</Button></div>
        </form>
      </Modal>
    </AccountingShell>
  )
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
