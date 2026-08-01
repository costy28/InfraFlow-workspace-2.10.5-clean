import { useEffect, useMemo, useState } from 'react'
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
import { AccountingShell, DropdownMenu, Info, Table, currentMonth, statusTone } from './accounting-shared'

const emptyCorrection = {
  salary_base: '', base_gross: '', manual_bonus: '', taxable_benefits: '',
  personal_deduction: '', other_deductions: ''
}
const emptyAdjustment = { employee_id: '', tip: 'bonus', amount: '', descriere: '', data_start: '', data_sfarsit: '', recurent: false, quantity: '', unit_value: '', certificate_code: '', medical_diagnostic_code: '', medical_employer_amount: '', medical_fund_amount: '', operator_confirmed: false }
const emptyBankProfile = { name: '', bank_name: '', format: 'xlsx', treasury_account: '5121', active: true }

export default function Salarizare() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState({ run: null, lines: [], payments: [], paymentOrders: [], profile: null })
  const [settings, setSettings] = useState(null)
  const [adjustments, setAdjustments] = useState([])
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [adjustment, setAdjustment] = useState(emptyAdjustment)
  const [editing, setEditing] = useState(null)
  const [correction, setCorrection] = useState(emptyCorrection)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profile, setProfile] = useState({})
  const [bankProfiles, setBankProfiles] = useState([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [bankOpen, setBankOpen] = useState(false)
  const [bankProfile, setBankProfile] = useState(emptyBankProfile)
  const [sourceDetails, setSourceDetails] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  useEffect(() => { load() }, [month])

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

  async function load() {
    try {
      setError('')
      const [payroll, config, adjustmentRes, bankRes] = await Promise.all([
        api.get('/hr/payroll', { params: { luna: month } }),
        api.get('/hr/payroll/settings', { params: { luna: month } }),
        api.get('/hr/payroll/adjustments', { params: { luna: month } }),
        api.get('/hr/payroll/bank-profiles')
      ])
      setData(payroll.data)
      setSettings(config.data)
      setProfile({ ...config.data.current, effective_from: `${month}-01` })
      setAdjustments(adjustmentRes.data?.items || [])
      setBankProfiles(bankRes.data?.items || [])
      setSelectedBankId(current => current || bankRes.data?.items?.[0]?.id || '')
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
    setConfirmAction({
      title: 'Devalidează stat salarial',
      message: `Redeschizi statul salarial pentru ${month}?`,
      details: 'Statul validat va reveni la stadiu editabil. Motivul este necesar pentru audit.',
      confirmLabel: 'Devalidează',
      tone: 'danger',
      reasonLabel: 'Motiv devalidare',
      reasonPlaceholder: 'Ex.: corecție pontaj, contract actualizat...',
      reasonRequired: true,
      minReasonLength: 3,
      errorMessage: 'Statul salarial nu a putut fi devalidat.',
      run: motiv => devalidateRequest(motiv),
    })
  }

  async function devalidateRequest(motiv) {
    try {
      setError(''); setMessage('')
      await api.post(`/hr/payroll/${data.run.id}/devalidate`, { motiv })
      setMessage('Statul salarial a fost redeschis pentru corectii.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Statul salarial nu a putut fi devalidat.') }
  }

  async function createCorrective() {
    setConfirmAction({
      title: 'Creează stat rectificativ',
      message: `Creezi stat rectificativ pentru ${month}?`,
      details: 'Originalul rămâne în istoric, iar noul stat pornește ca draft.',
      confirmLabel: 'Creează rectificativ',
      tone: 'warning',
      reasonLabel: 'Motiv rectificare',
      reasonPlaceholder: 'Ex.: diferențe identificate după validare...',
      reasonRequired: true,
      minReasonLength: 3,
      errorMessage: 'Statul rectificativ nu a putut fi creat.',
      run: motiv => createCorrectiveRequest(motiv),
    })
  }

  async function createCorrectiveRequest(motiv) {
    try {
      await api.post(`/hr/payroll/${data.run.id}/corrective`, { motiv })
      setMessage('Statul rectificativ a fost creat ca draft. Originalul ramane in istoric.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Statul rectificativ nu a putut fi creat.') }
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
      const selected = bankProfiles.find(item => String(item.id) === String(selectedBankId))
      const response = await api.get(`/hr/payroll/${data.run.id}/bank-export`, { params: { profile_id: selectedBankId }, responseType: 'blob' })
      downloadBlob(response.data, `Plati_salarii_${month.replace('-', '_')}.${selected?.format === 'csv_semicolon' ? 'csv' : 'xlsx'}`)
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

  async function openPayrollDocument(endpoint, filename = '') {
    try {
      const response = await api.get(endpoint, { responseType: 'blob' })
      if (filename) return downloadBlob(response.data, filename)
      const url = URL.createObjectURL(response.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) { setError(err.response?.data?.error || 'Documentul nu a putut fi generat.') }
  }

  async function payPayroll() {
    setConfirmAction({
      title: 'Înregistrează plata salariilor',
      message: `Înregistrezi plata netă de ${formatMoney(data.run.total_net)} în trezorerie?`,
      details: 'Operațiunea va marca plata în trezorerie și în contul 421.',
      confirmLabel: 'Înregistrează plata',
      tone: 'success',
      errorMessage: 'Plata salariilor nu a putut fi înregistrată.',
      run: payPayrollRequest,
    })
  }

  async function payPayrollRequest() {
    try {
      await api.post(`/hr/payroll/${data.run.id}/pay`, { profile_id: selectedBankId, data: new Date().toISOString().slice(0, 10) })
      setMessage('Plata salariilor a fost înregistrată în trezorerie și în contul 421.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Plata salariilor nu a putut fi înregistrată.') }
  }

  async function reversePayment() {
    setConfirmAction({
      title: 'Stornează plata salarială',
      message: 'Stornezi plata salarială înregistrată?',
      details: 'Operațiunea creează inversarea controlată a plății. Motivul rămâne în audit.',
      confirmLabel: 'Stornează plata',
      tone: 'danger',
      reasonLabel: 'Motiv stornare',
      reasonPlaceholder: 'Ex.: plată introdusă greșit...',
      reasonRequired: true,
      minReasonLength: 3,
      errorMessage: 'Plata nu a putut fi stornată.',
      run: motiv => reversePaymentRequest(motiv),
    })
  }

  async function reversePaymentRequest(motiv) {
    try {
      await api.post(`/hr/payroll/${data.run.id}/reverse-payment`, { motiv })
      setMessage('Plata salarială a fost stornată controlat.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Plata nu a putut fi stornată.') }
  }

  async function reverseAccounting() {
    setConfirmAction({
      title: 'Stornează nota contabilă',
      message: 'Stornezi nota contabilă salarială?',
      details: 'Nota storno va păstra legătura cu statul salarial și cu nota inițială.',
      confirmLabel: 'Stornează nota',
      tone: 'danger',
      reasonLabel: 'Motiv stornare',
      reasonPlaceholder: 'Ex.: stat salarial rectificat...',
      reasonRequired: true,
      minReasonLength: 3,
      errorMessage: 'Nota contabilă nu a putut fi stornată.',
      run: motiv => reverseAccountingRequest(motiv),
    })
  }

  async function reverseAccountingRequest(motiv) {
    try {
      await api.post(`/hr/payroll/${data.run.id}/reverse-accounting`, { motiv })
      setMessage('Nota contabilă salarială a fost stornată.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Nota contabilă nu a putut fi stornată.') }
  }

  async function saveBankProfile(event) {
    event.preventDefault()
    try {
      const response = await api.post('/hr/payroll/bank-profiles', bankProfile)
      setSelectedBankId(response.data?.item?.id || '')
      setBankOpen(false); setBankProfile(emptyBankProfile)
      setMessage('Profilul bancar a fost salvat.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Profilul bancar nu a putut fi salvat.') }
  }

  async function generateObligations() {
    try {
      await api.post(`/hr/payroll/${data.run.id}/obligations/generate`)
      setMessage('Ordinele pentru contribuții și impozit au fost pregătite.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Ordinele de plată nu au putut fi generate.') }
  }

  async function payObligation(order) {
    setConfirmAction({
      title: 'Înregistrează obligație salarială',
      message: `Înregistrezi plata ${order.code} de ${formatMoney(order.amount)}?`,
      details: 'Plata va fi marcată în trezorerie pentru ordinul selectat.',
      confirmLabel: 'Înregistrează plata',
      tone: 'success',
      errorMessage: 'Ordinul nu a putut fi înregistrat.',
      run: () => payObligationRequest(order),
    })
  }

  async function payObligationRequest(order) {
    try {
      await api.post(`/hr/payroll/${data.run.id}/obligations/${order.id}/pay`, { profile_id: selectedBankId, data: new Date().toISOString().slice(0, 10) })
      setMessage(`${order.code} a fost înregistrat în trezorerie.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Ordinul nu a putut fi înregistrat.') }
  }

  async function reverseObligation(order) {
    setConfirmAction({
      title: 'Stornează obligație salarială',
      message: `Stornezi plata ${order.code}?`,
      details: `Suma: ${formatMoney(order.amount)}. Motivul stornării va fi salvat pentru audit.`,
      confirmLabel: 'Stornează',
      tone: 'danger',
      reasonLabel: `Motiv stornare ${order.code}`,
      reasonPlaceholder: 'Ex.: ordin plătit eronat...',
      reasonRequired: true,
      minReasonLength: 3,
      errorMessage: 'Ordinul nu a putut fi stornat.',
      run: motiv => reverseObligationRequest(order, motiv),
    })
  }

  async function reverseObligationRequest(order, motiv) {
    try {
      await api.post(`/hr/payroll/${data.run.id}/obligations/${order.id}/reverse`, { motiv })
      setMessage(`${order.code} a fost stornat.`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Ordinul nu a putut fi stornat.') }
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
    setConfirmAction({
      title: 'Anulează ajustare salarială',
      message: 'Anulezi ajustarea salarială selectată?',
      details: `${item.tip?.replaceAll('_', ' ') || 'ajustare'} · ${formatMoney(item.amount || 0)}`,
      confirmLabel: 'Anulează ajustarea',
      tone: 'danger',
      reasonLabel: 'Motiv anulare',
      reasonDefault: 'Anulare din salarizare',
      reasonRequired: true,
      minReasonLength: 3,
      errorMessage: 'Ajustarea nu a putut fi anulata.',
      run: motiv => cancelAdjustmentRequest(item, motiv),
    })
  }

  async function cancelAdjustmentRequest(item, motiv) {
    try {
      await api.delete(`/hr/payroll/adjustments/${item.id}`, { data: { motiv } })
      setMessage('Ajustarea a fost anulata.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Ajustarea nu a putut fi anulata.') }
  }

  const run = data.run
  const activePayment = data.payments?.find(item => item.status === 'platit')
  const actionItems = [
    { label: run ? 'Regenereaza din pontaj' : 'Genereaza din pontaj', onClick: generate, disabled: run?.status === 'validat' },
    run?.status === 'draft' ? { label: 'Valideaza statul', onClick: validate } : null,
    run?.status === 'validat' ? { label: 'Devalideaza', onClick: devalidate } : null,
    run?.status === 'validat' ? { label: 'Creeaza stat rectificativ', onClick: createCorrective } : null,
    run ? { label: 'Export Excel', onClick: exportExcel } : null,
    run?.status === 'validat' ? { label: 'Export plati banca', onClick: downloadBank } : null,
    run ? { label: 'Toți fluturașii', onClick: () => openPayrollDocument(`/hr/payroll/${run.id}/payslips`) } : null,
    run ? { label: 'Registru plată Excel', onClick: () => openPayrollDocument(`/hr/payroll/${run.id}/payment-register`, `Registru_plata_${month.replace('-', '_')}.xlsx`) } : null,
    run?.status === 'validat' && run.accounting_journal_id && !run.accounting_reversed_at && !data.paymentOrders?.length ? { label: 'Generează obligații bugetare', onClick: generateObligations } : null,
    data.paymentOrders?.length ? { label: 'Export obligații bugetare', onClick: () => openPayrollDocument(`/hr/payroll/${run.id}/obligations/export`, `Obligatii_salariale_${month.replace('-', '_')}.xlsx`) } : null,
    run?.status === 'validat' && (!run.accounting_journal_id || run.accounting_reversed_at) ? { label: 'Genereaza nota contabila', onClick: postAccounting } : null,
    run?.status === 'validat' && run.accounting_journal_id && !run.accounting_reversed_at && !activePayment ? { label: 'Înregistrează plata', onClick: payPayroll } : null,
    activePayment ? { label: 'Stornează plata', onClick: reversePayment } : null,
    run?.accounting_journal_id && !run.accounting_reversed_at && !activePayment ? { label: 'Stornează nota contabilă', onClick: reverseAccounting } : null,
    { type: 'separator' },
    { label: 'Adauga spor / retinere', onClick: () => { setAdjustment({ ...emptyAdjustment, employee_id: data.lines?.[0]?.employee_id || '', data_start: `${month}-01` }); setAdjustmentOpen(true) } },
    { label: 'Profil fiscal', onClick: () => setSettingsOpen(true) },
    { label: 'Profil bancar nou', onClick: () => setBankOpen(true) },
    { label: 'Pregatire D112', to: `/contabilitate/tva-d300?tab=d112&luna=${month}` }
  ].filter(Boolean)

  const payrollFlow = useMemo(() => {
    const lines = data.lines || []
    const blockingLines = lines.filter(line => (line.errors || []).length)
    const warningLines = lines.filter(line => (line.warnings || []).length || line.source_diagnostics?.source_changed_after_run)
    const orders = data.paymentOrders || []
    const unpaidOrder = orders.find(order => order.status !== 'platit')
    const allOrdersPaid = orders.length > 0 && !unpaidOrder
    const accountingActive = Boolean(run?.accounting_journal_id && !run?.accounting_reversed_at)
    const sourcesChanged = Boolean(run?.source_status?.changed_after_run)
    const canGenerateObligations = run?.status === 'validat' && accountingActive && !orders.length

    let next = {
      title: 'Generează statul salarial',
      text: 'Alege luna și pornește calculul din contracte, pontaj, concedii și ajustări.',
      label: 'Generează din pontaj',
      onClick: generate,
      tone: 'info'
    }

    if (run && sourcesChanged) {
      next = {
        title: 'Sursele HR s-au schimbat',
        text: 'Pontajul, contractele sau concediile au fost modificate după calcul. Regenerează statul înainte de validare.',
        label: 'Regenerează din pontaj',
        onClick: generate,
        tone: 'warning'
      }
    } else if (blockingLines.length) {
      next = {
        title: `${blockingLines.length} angajat${blockingLines.length === 1 ? '' : 'i'} cu erori`,
        text: 'Corectează contractul, pontajul sau regulile fiscale înainte de validarea statului.',
        label: 'Vezi primul blocaj',
        onClick: () => setSourceDetails(blockingLines[0]),
        tone: 'danger'
      }
    } else if (warningLines.length && run?.status === 'draft') {
      next = {
        title: `${warningLines.length} avertizări de verificat`,
        text: 'Nu blochează neapărat calculul, dar sunt cazuri speciale care trebuie văzute de operator.',
        label: 'Vezi prima avertizare',
        onClick: () => setSourceDetails(warningLines[0]),
        tone: 'warning'
      }
    } else if (run?.status === 'draft') {
      next = {
        title: 'Statul este gata de validare',
        text: 'Dacă totalurile sunt corecte, validează statul ca să poată alimenta contabilitatea și D112.',
        label: 'Validează statul',
        onClick: validate,
        tone: 'success'
      }
    } else if (run?.status === 'validat' && !accountingActive) {
      next = {
        title: 'Generează nota contabilă',
        text: 'Statul validat trebuie trimis în contabilitate înainte de plăți și obligații.',
        label: 'Generează nota contabilă',
        onClick: postAccounting,
        tone: 'info'
      }
    } else if (run?.status === 'validat' && accountingActive && !activePayment) {
      next = {
        title: 'Înregistrează plata salariilor',
        text: 'Nota contabilă există. Următorul pas este plata netului către angajați.',
        label: 'Înregistrează plata',
        onClick: payPayroll,
        tone: 'info'
      }
    } else if (canGenerateObligations) {
      next = {
        title: 'Pregătește obligațiile bugetare',
        text: 'Generează ordinele pentru CAS, CASS, impozit și CAM din statul validat.',
        label: 'Generează obligații',
        onClick: generateObligations,
        tone: 'info'
      }
    } else if (unpaidOrder) {
      next = {
        title: `Plătește ${unpaidOrder.code}`,
        text: `Mai există obligații bugetare pregătite, dar neînregistrate. Suma: ${formatMoney(unpaidOrder.amount)}.`,
        label: `Înregistrează ${unpaidOrder.code}`,
        onClick: () => payObligation(unpaidOrder),
        tone: 'warning'
      }
    } else if (run?.status === 'validat' && accountingActive && activePayment && allOrdersPaid) {
      next = {
        title: 'Luna salarială este pregătită pentru D112',
        text: 'Statul, nota contabilă, plata salariilor și obligațiile bugetare sunt închise operațional.',
        label: 'Deschide D112',
        to: `/contabilitate/tva-d300?tab=d112&luna=${month}`,
        tone: 'success'
      }
    }

    const steps = [
      {
        label: 'Surse HR',
        done: Boolean(run && !sourcesChanged && !blockingLines.length),
        detail: !run ? 'necalculat' : sourcesChanged ? 'modificate' : blockingLines.length ? `${blockingLines.length} erori` : 'curat'
      },
      {
        label: 'Stat',
        done: run?.status === 'validat',
        detail: run?.status || 'negenerat'
      },
      {
        label: 'Notă contabilă',
        done: accountingActive,
        detail: accountingActive ? `#${run.accounting_journal_id}` : run?.accounting_reversed_at ? 'stornată' : 'lipsește'
      },
      {
        label: 'Plată net',
        done: Boolean(activePayment),
        detail: activePayment ? 'înregistrată' : 'neînregistrată'
      },
      {
        label: 'Obligații',
        done: allOrdersPaid,
        detail: orders.length ? `${orders.filter(order => order.status === 'platit').length}/${orders.length} plătite` : 'negenerate'
      },
      {
        label: 'D112',
        done: Boolean(run?.status === 'validat' && accountingActive),
        detail: run?.status === 'validat' && accountingActive ? 'pregătibilă' : 'după validare'
      }
    ]

    return { next, steps, blockingLines, warningLines }
  }, [activePayment, data.lines, data.paymentOrders, month, run])

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
      {run?.source_status?.changed_after_run ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Sursele HR s-au modificat după calculul acestui stat. Regenerează din pontaj pentru valori actualizate.</div> : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Flux simplu salarizare</div>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{payrollFlow.next.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{payrollFlow.next.text}</p>
          </div>
          {payrollFlow.next.to ? (
            <Link className="inline-flex h-[var(--control-height)] items-center rounded-[var(--radius-control)] bg-primary-700 px-[var(--control-px)] text-sm font-semibold text-white shadow-sm transition hover:bg-primary-800" to={payrollFlow.next.to}>
              {payrollFlow.next.label}
            </Link>
          ) : (
            <Button type="button" onClick={payrollFlow.next.onClick}>{payrollFlow.next.label}</Button>
          )}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {payrollFlow.steps.map(step => (
            <div key={step.label} className={`rounded-md border px-3 py-2 ${step.done ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{step.label}</div>
                <Badge tone={step.done ? 'success' : 'warning'}>{step.done ? 'OK' : 'Pas'}</Badge>
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{step.detail}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Ideea este simplă: operatorul nu trebuie să știe meniul pe de rost; urmează butonul recomandat până când luna salarială devine pregătită pentru D112.
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Info label="Status" value={run ? <Badge tone={statusTone(run.status)}>{run.status}</Badge> : 'Negenerat'} />
        <Info label="Angajati" value={run?.employee_count || 0} />
        <Info label="Brut" value={formatMoney(run?.total_gross || 0)} />
        <Info label="Net" value={formatMoney(run?.total_net || 0)} />
        <Info label="Contributii + impozit" value={formatMoney((run?.total_cas || 0) + (run?.total_cass || 0) + (run?.total_income_tax || 0) + (run?.total_cam || 0))} />
        <Info label="Cost angajator" value={formatMoney(run?.total_employer_cost || 0)} />
      </div>
      <Card><div className="grid gap-3 md:grid-cols-[minmax(220px,360px)_1fr] md:items-end"><Select label="Profil bancar" value={selectedBankId} onChange={event => setSelectedBankId(event.target.value)} options={bankProfiles.filter(item => item.active !== false).map(item => ({ value: item.id, label: `${item.name} · ${item.format}` }))} /><div className="text-sm text-slate-600">Plată: <strong>{activePayment ? `înregistrată la ${activePayment.payment_date || '-'}` : run?.payment_status === 'stornat' ? 'stornată' : 'neînregistrată'}</strong></div></div></Card>
      {data.paymentOrders?.length ? <Card><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Obligații salariale</h3><p className="text-sm text-slate-500">CAS, CASS, impozit și CAM generate din statul validat.</p></div><Badge tone={data.paymentOrders.every(item => item.status === 'platit') ? 'success' : 'warning'}>{data.paymentOrders.filter(item => item.status === 'platit').length}/{data.paymentOrders.length} plătite</Badge></div><div className="mt-3 grid gap-2 md:grid-cols-2">{data.paymentOrders.map(order => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"><div><strong>{order.code}</strong> · {formatMoney(order.amount)}<div className="text-xs text-slate-500">Scadență {order.due_date} · {order.status}</div></div><DropdownMenu label="Acțiuni" items={[order.status === 'pregatit' ? { label: 'Înregistrează plata', onClick: () => payObligation(order) } : null, order.status === 'platit' ? { label: 'Stornează plata', onClick: () => reverseObligation(order) } : null].filter(Boolean)} /></div>)}</div></Card> : null}
      {run?.accounting_journal_id ? <div className={`rounded-md border px-3 py-2 text-sm ${run.accounting_reversed_at ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>Nota contabilă #{run.accounting_journal_id} este {run.accounting_reversed_at ? `stornată prin nota #${run.accounting_storno_journal_id || '-'}` : 'activă'}.</div> : null}
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
              {line.source_diagnostics?.source_changed_after_run ? <div className="text-amber-700">Surse HR modificate după calcul</div> : null}
              {!line.errors?.length && !line.warnings?.length ? <span className="text-emerald-700">OK</span> : null}
            </td>
            <td className="px-3 py-2"><DropdownMenu label="Actiuni" items={[
              { label: 'Detalii surse', onClick: () => setSourceDetails(line) },
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
          <Select label="Tip" value={adjustment.tip} onChange={event => setAdjustment(current => ({ ...current, tip: event.target.value }))} options={[{ value: 'bonus', label: 'Spor / primă' }, { value: 'beneficiu_impozabil', label: 'Beneficiu impozabil' }, { value: 'indemnizatie_medicala', label: 'Indemnizație concediu medical' }, { value: 'concediu_fara_plata', label: 'Concediu fără plată' }, { value: 'tichete_masa', label: 'Tichete de masă' }, { value: 'avans', label: 'Avans salarial' }, { value: 'poprire', label: 'Poprire' }, { value: 'retinere', label: 'Altă reținere' }]} />
          <div className="grid gap-3 sm:grid-cols-2">{adjustment.tip === 'concediu_fara_plata' ? <Input label="Numar zile" type="number" min="0.5" step="0.5" value={adjustment.quantity} onChange={event => setAdjustment(current => ({ ...current, quantity: event.target.value, amount: 0 }))} required /> : <Input label="Suma" type="number" min="0.01" step="0.01" value={adjustment.amount} onChange={event => setAdjustment(current => ({ ...current, amount: event.target.value }))} required />}<Input label="Descriere" value={adjustment.descriere} onChange={event => setAdjustment(current => ({ ...current, descriere: event.target.value }))} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><Input label="De la" type="date" value={adjustment.data_start} onChange={event => setAdjustment(current => ({ ...current, data_start: event.target.value }))} required /><Input label="Pana la" type="date" value={adjustment.data_sfarsit} onChange={event => setAdjustment(current => ({ ...current, data_sfarsit: event.target.value }))} /></div>
          {adjustment.tip === 'tichete_masa' ? <div className="grid gap-3 sm:grid-cols-2"><Input label="Număr tichete" type="number" step="1" value={adjustment.quantity} onChange={event => setAdjustment(current => ({ ...current, quantity: event.target.value }))} /><Input label="Valoare unitară" type="number" step="0.01" value={adjustment.unit_value} onChange={event => setAdjustment(current => ({ ...current, unit_value: event.target.value }))} /></div> : null}
          {adjustment.tip === 'indemnizatie_medicala' ? <><div className="grid gap-3 sm:grid-cols-2"><Input label="Cod certificat medical" value={adjustment.certificate_code} onChange={event => setAdjustment(current => ({ ...current, certificate_code: event.target.value }))} /><Input label="Cod diagnostic" value={adjustment.medical_diagnostic_code} onChange={event => setAdjustment(current => ({ ...current, medical_diagnostic_code: event.target.value }))} /><Input label="Suportat angajator" type="number" step="0.01" value={adjustment.medical_employer_amount} onChange={event => setAdjustment(current => ({ ...current, medical_employer_amount: event.target.value }))} /><Input label="Suportat fond" type="number" step="0.01" value={adjustment.medical_fund_amount} onChange={event => setAdjustment(current => ({ ...current, medical_fund_amount: event.target.value }))} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={adjustment.operator_confirmed} onChange={event => setAdjustment(current => ({ ...current, operator_confirmed: event.target.checked }))} /> Certificatul și suma au fost verificate de operator</label></> : null}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={adjustment.recurent} onChange={event => setAdjustment(current => ({ ...current, recurent: event.target.checked }))} /> Ajustare recurenta</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAdjustmentOpen(false)}>Renunta</Button><Button type="submit">Salveaza</Button></div>
        </form>
      </Modal>

      <Modal open={bankOpen} title="Profil bancar salarizare" onClose={() => setBankOpen(false)} size="md">
        <form className="grid gap-3" onSubmit={saveBankProfile}>
          <Input label="Denumire profil" value={bankProfile.name} onChange={event => setBankProfile(current => ({ ...current, name: event.target.value }))} required />
          <Input label="Bancă" value={bankProfile.bank_name} onChange={event => setBankProfile(current => ({ ...current, bank_name: event.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-2"><Select label="Format" value={bankProfile.format} onChange={event => setBankProfile(current => ({ ...current, format: event.target.value }))} options={[{ value: 'xlsx', label: 'Excel XLSX' }, { value: 'csv_semicolon', label: 'CSV delimitat cu ;' }]} /><Input label="Cont bancar contabil" value={bankProfile.treasury_account} onChange={event => setBankProfile(current => ({ ...current, treasury_account: event.target.value }))} required /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setBankOpen(false)}>Renunță</Button><Button type="submit">Salvează</Button></div>
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

      <Modal open={Boolean(sourceDetails)} title={`Detalii surse HR - ${sourceDetails?.employee_name || ''}`} onClose={() => setSourceDetails(null)} size="lg">
        <SourceDiagnostics line={sourceDetails} month={month} onRegenerate={generate} />
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

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        cancelLabel={confirmAction?.cancelLabel}
        tone={confirmAction?.tone}
        loading={confirmLoading}
        reasonLabel={confirmAction?.reasonLabel}
        reasonDefault={confirmAction?.reasonDefault}
        reasonPlaceholder={confirmAction?.reasonPlaceholder}
        reasonRequired={confirmAction?.reasonRequired}
        minReasonLength={confirmAction?.minReasonLength}
        onConfirm={runConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    </AccountingShell>
  )
}

function SourceDiagnostics({ line, month, onRegenerate }) {
  const details = line?.source_diagnostics || {}
  const contract = details.contract || {}
  const timesheet = details.timesheet || {}
  const sources = details.payroll_sources || {}
  const links = details.links || {}
  if (!line) return null
  return (
    <div className="grid gap-4 text-sm">
      {details.source_changed_after_run ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">Date HR actualizate după calculul statului. Pentru recalcul, folosește „Regenerează din pontaj”.</div> : null}
      {details.warnings?.length ? <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">{details.warnings.map(item => <div key={item}>⚠️ {item}</div>)}</div> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <DiagnosticBox title="Angajat" rows={[
          ['Marca', details.employee?.marca || line.marca || '-'],
          ['Departament', details.employee?.department || '-'],
          ['Salariu HR', formatMoney(details.employee?.salary_base || 0)]
        ]} />
        <DiagnosticBox title="Contract" rows={contract.found ? [
          ['Status', contract.status || 'activ'],
          ['Perioada', `${contract.start || '-'} — ${contract.end || 'prezent'}`],
          ['Norma/zi', `${contract.norm_hours_per_day || 8} ore`],
          ['Baza contract', formatMoney(contract.salary_base || 0)]
        ] : [
          ['Status', 'Lipsă pentru lună'],
          ['Contracte găsite', contract.candidates?.length || 0],
          ['Motiv probabil', contract.candidates?.length ? 'status / dată început' : 'nu există contract']
        ]} tone={contract.found ? 'success' : 'danger'} />
        <DiagnosticBox title="Pontaj" rows={[
          ['Zile pontate', `${timesheet.entries || 0} / ${timesheet.expected_workdays || 0}`],
          ['Validate', `${timesheet.validated_entries || 0}`],
          ['Ore lucrate', timesheet.worked_hours || 0],
          ['Ore platite/norma', `${timesheet.paid_hours || line.paid_hours || 0} / ${timesheet.norm_hours || line.norm_hours || 0}`]
        ]} tone={timesheet.found && !timesheet.invalid_entries ? 'success' : 'warning'} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <DiagnosticBox title="Concedii și CM" rows={[
          ['CO zile', sources.leave_days || 0],
          ['CM zile', sources.medical_days || 0],
          ['Indemnizație CM', formatMoney(sources.medical_indemnity || 0)],
          ['Angajator / FNUASS', `${formatMoney(sources.medical_employer_amount || 0)} / ${formatMoney(sources.medical_fund_amount || 0)}`]
        ]} />
        <DiagnosticBox title="Ajustări salariale" rows={[
          ['Ajustări active', sources.adjustments || 0],
          ['Indemnizații medicale active', sources.medical_adjustments || 0],
          ['CFP zile', sources.unpaid_leave_days || 0],
          ['Profil fiscal', details.profile?.name || '-']
        ]} />
      </div>
      {contract.candidates?.length ? <div className="rounded-md border border-slate-200 p-3"><div className="mb-2 font-semibold">Contracte existente, dar neeligibile</div>{contract.candidates.map(item => <div key={item.id} className="text-xs text-slate-600">#{item.id} · {item.number || '-'} · {item.status || 'nesetat'} · {item.start || '-'} — {item.end || 'prezent'}</div>)}</div> : null}
      {timesheet.types ? <div className="rounded-md border border-slate-200 p-3"><div className="mb-2 font-semibold">Tipuri pontaj {month}</div><div className="flex flex-wrap gap-2">{Object.entries(timesheet.types).map(([key, value]) => <Badge key={key} tone="neutral">{key}: {value}</Badge>)}</div></div> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => window.location.assign(links.hr || '/hr')}>Deschide HR</Button>
        <Button type="button" variant="secondary" onClick={() => window.location.assign(links.timesheet || '/hr')}>Deschide pontaj</Button>
        <Button type="button" onClick={onRegenerate}>Regenerează statul</Button>
      </div>
    </div>
  )
}

function DiagnosticBox({ title, rows, tone = 'neutral' }) {
  const classes = {
    success: 'border-emerald-200 bg-emerald-50',
    warning: 'border-amber-200 bg-amber-50',
    danger: 'border-red-200 bg-red-50',
    neutral: 'border-slate-200 bg-white'
  }
  return <div className={`rounded-md border p-3 ${classes[tone] || classes.neutral}`}><div className="mb-2 font-semibold">{title}</div><div className="space-y-1">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3"><span className="text-slate-500">{label}</span><strong className="text-right">{value}</strong></div>)}</div></div>
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
