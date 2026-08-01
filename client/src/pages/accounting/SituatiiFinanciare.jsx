import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table } from './accounting-shared'

const emptyMapping = { profile_code: 'MANAGERIAL_STANDARD', statement_type: 'BILANT', code: '', label: '', calculation: 'asset', prefixes: '', order: 10, active: true }
const emptyProfile = { code: '', label: '', entity_type: 'general', valid_from: '', valid_to: '', source_url: '', active: true }

export default function SituatiiFinanciare() {
  const now = new Date()
  const [an, setAn] = useState(now.getFullYear())
  const [luna, setLuna] = useState(12)
  const [tip, setTip] = useState('BILANT')
  const [data, setData] = useState({ rows: [], control: {} })
  const [mappings, setMappings] = useState([])
  const [profiles, setProfiles] = useState([])
  const [profileCode, setProfileCode] = useState('MANAGERIAL_STANDARD')
  const [mappingOpen, setMappingOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mapping, setMapping] = useState(emptyMapping)
  const [profile, setProfile] = useState(emptyProfile)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  useEffect(() => { load() }, [an, luna, tip, profileCode])

  async function load() {
    try {
      const [report, mapResponse, profileResponse] = await Promise.all([
        api.get('/accounting/financial-statements', { params: { an, luna, tip, profile_code: profileCode } }),
        api.get('/accounting/financial-statements/mappings'),
        api.get('/accounting/financial-statements/profiles')
      ])
      setData(report.data || { rows: [], control: {} })
      setMappings(mapResponse.data?.mappings || [])
      setProfiles(profileResponse.data?.profiles || [])
      setError('')
    } catch (err) { setError(err.response?.data?.error || 'Situatia financiara nu a putut fi calculata.') }
  }

  async function saveMapping(event) {
    event.preventDefault()
    try {
      await api.post('/accounting/financial-statements/mappings', { ...mapping, profile_code: mapping.profile_code || profileCode, prefixes: String(mapping.prefixes || '').split(/[,;\s]+/).filter(Boolean), order: Number(mapping.order) })
      setMappingOpen(false); setMapping(emptyMapping); setMessage('Maparea a fost salvata.'); load()
    } catch (err) { setError(err.response?.data?.error || 'Maparea nu a putut fi salvata.') }
  }

  async function saveProfile(event) {
    event.preventDefault()
    try { const response = await api.post('/accounting/financial-statements/profiles', profile); const saved = response.data?.item; setProfileOpen(false); setProfile(emptyProfile); if (saved?.code) setProfileCode(saved.code); setMessage('Profilul financiar a fost salvat.') }
    catch (err) { setError(err.response?.data?.error || 'Profilul nu a putut fi salvat.') }
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

  function removeMapping(item) {
    setConfirmAction({
      title: 'Anulează mapare financiară',
      message: `Anulezi maparea ${item.code}?`,
      details: 'Indicatorul nu va mai fi calculat prin această mapare. Profilul și istoricul de configurare rămân disponibile pentru audit.',
      confirmLabel: 'Anulează maparea',
      tone: 'danger',
      reasonLabel: 'Motiv anulare',
      reasonDefault: 'Anulare din situatii financiare',
      reasonRequired: true,
      minReasonLength: 3,
      errorMessage: 'Maparea nu a putut fi anulata.',
      run: motiv => removeMappingRequest(item, motiv)
    })
  }

  async function removeMappingRequest(item, motiv) {
    await api.delete(`/accounting/financial-statements/mappings/${item.id}`, { data: { motiv } })
    setMessage('Maparea a fost anulata.')
    load()
  }

  function editMapping(item = null) {
    setMapping(item ? { ...item, prefixes: (item.prefixes || []).join(', ') } : { ...emptyMapping, profile_code: profileCode, statement_type: tip })
    setMappingOpen(true)
  }

  async function download(endpoint, filename, open = false) {
    try {
      const response = await api.get(endpoint, { params: { an, luna, tip }, responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      if (open) { window.open(url, '_blank', 'noopener,noreferrer'); window.setTimeout(() => URL.revokeObjectURL(url), 60000); return }
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
    } catch (err) { setError(err.response?.data?.error || 'Documentul nu a putut fi generat.') }
  }

  const activeMappings = mappings.filter(item => item.statement_type === tip && (item.profile_code || 'MANAGERIAL_STANDARD') === profileCode)
  const reportMonth = `${an}-${String(luna).padStart(2, '0')}`
  const reportRows = data.rows || []
  const selectedProfile = profiles.find(item => item.code === profileCode)
  const zeroRows = reportRows.filter(row => Number(row.current || 0) === 0 && Number(row.previous || 0) === 0)
  const reportFlow = buildFinancialStatementFlow({
    tip,
    profileCode,
    selectedProfile,
    profiles,
    activeMappings,
    rows: reportRows,
    control: data.control,
    reportMonth,
    load,
    exportExcel: () => download('/accounting/financial-statements/export', `Situatie_${tip}_${an}_${luna}.xlsx`),
    printReport: () => download('/accounting/financial-statements/print', '', true),
    addMapping: () => editMapping(),
    addProfile: () => setProfileOpen(true)
  })
  return (
    <AccountingShell
      active="situatii-financiare"
      title="Situatii financiare"
      subtitle="Pozitie financiara si profit/pierdere, comparativ cu anul precedent."
      actions={<DropdownMenu label="Actiuni" align="right" items={[
        { label: 'Recalculeaza', onClick: load },
        { label: 'Export Excel', onClick: () => download('/accounting/financial-statements/export', `Situatie_${tip}_${an}_${luna}.xlsx`) },
        { label: 'Tipareste / PDF', onClick: () => download('/accounting/financial-statements/print', '', true) },
        { type: 'separator' },
        { label: 'Adauga mapare', onClick: () => editMapping() },
        { label: 'Adauga profil', onClick: () => setProfileOpen(true) }
      ]} />}
    >
      <Card><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Input label="An" type="number" min="2000" max="2100" value={an} onChange={event => setAn(Number(event.target.value))} /><Select label="Luna de raportare" value={luna} onChange={event => setLuna(Number(event.target.value))} options={Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: String(index + 1).padStart(2, '0') }))} /><Select label="Situatie" value={tip} onChange={event => setTip(event.target.value)} options={[{ value: 'BILANT', label: 'Pozitie financiara' }, { value: 'CPP', label: 'Profit si pierdere' }]} /><Select label="Profil formular" value={profileCode} onChange={event => setProfileCode(event.target.value)} options={profiles.map(item => ({ value: item.code, label: item.label }))} /></div></Card>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Flux simplu situații financiare</div>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{reportFlow.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{reportFlow.detail}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-5">
              {reportFlow.steps.map((step, index) => (
                step.to ? (
                  <Link key={step.label} to={step.to} className={`rounded-md border px-3 py-3 text-sm transition hover:shadow-sm ${step.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <StepContent step={step} index={index} />
                  </Link>
                ) : (
                  <button key={step.label} type="button" onClick={step.onClick} className={`rounded-md border px-3 py-3 text-left text-sm transition hover:shadow-sm ${step.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <StepContent step={step} index={index} />
                  </button>
                )
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:min-w-56">
            {reportFlow.primary.to ? (
              <Link to={reportFlow.primary.to} className="rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-slate-800">{reportFlow.primary.label}</Link>
            ) : (
              <Button type="button" onClick={reportFlow.primary.onClick}>{reportFlow.primary.label}</Button>
            )}
            <span className="text-xs text-slate-500">Profil: {selectedProfile?.label || profileCode} · {activeMappings.length} mapări</span>
          </div>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3"><Info label="Perioada" value={data.period_end || '-'} /><Info label="Comparativ" value={data.previous_period_end || '-'} /><Info label="Control" value={<Badge tone={data.control?.ok ? 'success' : 'warning'}>{data.control?.message || '-'}</Badge>} /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Info label="Indicatori" value={reportRows.length} />
        <Info label="Mapări active" value={activeMappings.length} />
        <Info label="Indicatori fără valori" value={zeroRows.length} />
        <Info label="Tip raport" value={tip === 'BILANT' ? 'Poziție financiară' : 'Profit și pierdere'} />
      </div>
      <Table headers={['Cod', 'Indicator', 'Conturi', 'An curent', 'An precedent', 'Diferenta', 'Variatie', 'Actiuni']}>
        {(data.rows || []).map(row => <tr key={row.code}><td className="px-3 py-2 font-mono font-semibold">{row.code}</td><td className="px-3 py-2">{row.label}</td><td className="px-3 py-2 text-xs text-slate-500">{(row.prefixes || []).join(', ')}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(row.current)}</td><td className="px-3 py-2 text-right">{formatMoney(row.previous)}</td><td className="px-3 py-2 text-right">{formatMoney(row.difference)}</td><td className="px-3 py-2 text-right">{row.variation_percent == null ? '-' : `${row.variation_percent}%`}</td><td className="px-3 py-2"><DropdownMenu label="Actiuni" items={[{ label: 'Editeaza maparea', onClick: () => editMapping(row) }, { label: 'Anuleaza maparea', onClick: () => removeMapping(row) }]} /></td></tr>)}
      </Table>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Mapari active</h3><p className="text-sm text-slate-500">{activeMappings.length} randuri configurate pentru {tip}.</p></div><Button size="sm" onClick={() => editMapping()}>Adauga</Button></div><p className="mt-3 text-xs text-slate-500">Raport managerial configurabil. Formularul oficial depus ramane conditionat de programul de asistenta aplicabil entitatii si exercitiului.</p></Card>

      <Modal open={mappingOpen} title={mapping.id ? 'Editeaza maparea' : 'Mapare noua'} onClose={() => setMappingOpen(false)} size="md">
        <form className="grid gap-3" onSubmit={saveMapping}>
          <div className="grid gap-3 sm:grid-cols-2"><Select label="Situatie" value={mapping.statement_type} onChange={event => setMapping(current => ({ ...current, statement_type: event.target.value }))} options={[{ value: 'BILANT', label: 'Pozitie financiara' }, { value: 'CPP', label: 'Profit si pierdere' }]} /><Input label="Cod rand" value={mapping.code} onChange={event => setMapping(current => ({ ...current, code: event.target.value }))} required /></div>
          <Input label="Denumire indicator" value={mapping.label} onChange={event => setMapping(current => ({ ...current, label: event.target.value }))} required />
          <Input label="Prefixe conturi" value={mapping.prefixes} onChange={event => setMapping(current => ({ ...current, prefixes: event.target.value }))} placeholder="20, 21, 28" required />
          <div className="grid gap-3 sm:grid-cols-2"><Select label="Calcul" value={mapping.calculation} onChange={event => setMapping(current => ({ ...current, calculation: event.target.value }))} options={[{ value: 'asset', label: 'Sold debitor - creditor' }, { value: 'liability', label: 'Sold creditor - debitor' }, { value: 'revenue', label: 'Rulaj credit - debit' }, { value: 'expense', label: 'Rulaj debit - credit' }]} /><Input label="Ordine" type="number" value={mapping.order} onChange={event => setMapping(current => ({ ...current, order: event.target.value }))} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMappingOpen(false)}>Renunta</Button><Button type="submit">Salveaza</Button></div>
        </form>
      </Modal>
      <Modal open={profileOpen} title="Profil financiar nou" onClose={() => setProfileOpen(false)} size="md">
        <form className="grid gap-3" onSubmit={saveProfile}>
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Cod profil" value={profile.code} onChange={event => setProfile(current => ({ ...current, code: event.target.value }))} required /><Input label="Tip entitate" value={profile.entity_type} onChange={event => setProfile(current => ({ ...current, entity_type: event.target.value }))} /></div>
          <Input label="Denumire profil" value={profile.label} onChange={event => setProfile(current => ({ ...current, label: event.target.value }))} required />
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Valabil de la" type="date" value={profile.valid_from} onChange={event => setProfile(current => ({ ...current, valid_from: event.target.value }))} /><Input label="Valabil pana la" type="date" value={profile.valid_to} onChange={event => setProfile(current => ({ ...current, valid_to: event.target.value }))} /></div>
          <Input label="Sursa / pagina oficiala" value={profile.source_url} onChange={event => setProfile(current => ({ ...current, source_url: event.target.value }))} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setProfileOpen(false)}>Renunta</Button><Button type="submit">Salveaza profilul</Button></div>
        </form>
      </Modal>
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
  )
}

function buildFinancialStatementFlow({ tip, profileCode, selectedProfile, profiles, activeMappings, rows, control, reportMonth, load, exportExcel, printReport, addMapping, addProfile }) {
  const hasProfile = Boolean(selectedProfile) || profileCode === 'MANAGERIAL_STANDARD' || profiles.length === 0
  const hasMappings = activeMappings.length > 0
  const hasRows = rows.length > 0
  const controlOk = control?.ok !== false
  const statementLabel = tip === 'BILANT' ? 'poziția financiară' : 'profitul și pierderea'
  const steps = [
    { label: 'Profil', ok: hasProfile, detail: hasProfile ? 'Profilul raportului este selectat' : 'Lipsește profilul formularului', onClick: addProfile },
    { label: 'Mapări', ok: hasMappings, detail: hasMappings ? `${activeMappings.length} rânduri configurate` : 'Adaugă conturile care intră în raport', onClick: addMapping },
    { label: 'Balanță', ok: controlOk, detail: controlOk ? 'Controlul nu raportează blocaje' : control?.message || 'Verifică balanța', to: `/contabilitate/balanta?luna=${reportMonth}` },
    { label: 'Raport', ok: hasRows, detail: hasRows ? `${rows.length} indicatori calculați` : 'Recalculează după mapări și balanță', onClick: load },
    { label: 'Export', ok: hasRows && controlOk, detail: hasRows && controlOk ? 'Excel/PDF pregătit pentru dosar' : 'Așteaptă verificările anterioare', onClick: exportExcel }
  ]
  const firstBlocking = steps.find(step => !step.ok)
  if (firstBlocking) {
    return {
      title: `Raportul pentru ${statementLabel} mai are pași de pregătit.`,
      detail: firstBlocking.detail,
      steps,
      primary: firstBlocking.to ? { label: `Rezolvă: ${firstBlocking.label}`, to: firstBlocking.to } : { label: `Rezolvă: ${firstBlocking.label}`, onClick: firstBlocking.onClick || load }
    }
  }
  return {
    title: `Raportul pentru ${statementLabel} este pregătit pentru export.`,
    detail: 'Poți exporta Excel pentru lucru sau deschide varianta de tipărire/PDF pentru dosar.',
    steps,
    primary: { label: 'Export Excel', onClick: exportExcel },
    secondary: { label: 'Tipărește / PDF', onClick: printReport }
  }
}

function StepContent({ step, index }) {
  return (
    <>
      <span className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${step.ok ? 'bg-emerald-700 text-white' : 'bg-amber-500 text-white'}`}>{step.ok ? '✓' : index + 1}</span>
      <strong className="block text-slate-900">{step.label}</strong>
      <span className="mt-1 block text-xs text-slate-600">{step.detail}</span>
    </>
  )
}
