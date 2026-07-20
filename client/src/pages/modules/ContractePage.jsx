import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import { formatDate, formatMoney, formatPercent } from '../../utils/format'

const emptyContractForm = {
  numar: '',
  titlu: '',
  tip: 'achizitie',
  partener: '',
  valoare_contract: '',
  moneda: 'RON',
  data_semnare: '',
  data_start: '',
  data_sfarsit: '',
  responsabil_nume: '',
  cpv_cod: '',
  cpv_denumire: '',
  centru_cost_id: '',
  paap_id: '',
  observatii: '',
}

const emptyConsumptionForm = {
  data: new Date().toISOString().slice(0, 10),
  sursa: 'manual',
  document_nr: '',
  descriere: '',
  valoare: '',
  moneda: 'RON',
  cpv_cod: '',
}

const emptySourceForm = {
  source_key: '',
}

const emptyAttachmentForm = {
  categorie: 'contract semnat',
  descriere: '',
  file: null,
}

const emptyAddendumForm = {
  numar: '',
  tip: 'prelungire',
  data_semnare: new Date().toISOString().slice(0, 10),
  valoare_delta: '',
  data_sfarsit_noua: '',
  responsabil_nume_nou: '',
  descriere: '',
  file: null,
}

const emptyPortfolioFilters = {
  status: 'toate',
  q: '',
  risk: 'toate',
  consum: 'toate',
  termen: 'toate',
  lifecycle: 'toate',
}

function arrayFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return Array.isArray(data) ? data : []
}

function statusTone(status) {
  if (status === 'activ') return 'success'
  if (status === 'draft') return 'warning'
  if (status === 'inchis') return 'gray'
  if (status === 'anulat') return 'danger'
  return 'gray'
}

function alertTone(level) {
  if (level === 'danger') return 'danger'
  if (level === 'warning') return 'warning'
  return 'info'
}

function progressClass(percent) {
  if (percent >= 100) return 'bg-rose-600'
  if (percent >= 90) return 'bg-amber-500'
  if (percent >= 80) return 'bg-sky-500'
  return 'bg-emerald-600'
}

function percentWidth(percent) {
  return `${Math.max(0, Math.min(100, Number(percent || 0)))}%`
}

function sourceTone(type) {
  if (type === 'factura') return 'success'
  if (type === 'nir') return 'info'
  if (type === 'comanda') return 'warning'
  if (type === 'referat') return 'gray'
  return 'gray'
}

function timelineTone(item) {
  if (['danger', 'warning', 'success', 'info', 'gray'].includes(item?.tone)) return item.tone
  if (item?.type === 'alert') return alertTone(item.status)
  if (item?.type?.startsWith('source_')) return sourceTone(item.type.replace('source_', ''))
  if (item?.type === 'addendum' || item?.type === 'attachment') return 'info'
  return 'gray'
}

function completenessTone(status) {
  if (status === 'ok' || status === 'complet') return 'success'
  if (status === 'missing' || status === 'incomplet') return 'danger'
  return 'warning'
}

function actionTone(action) {
  if (action?.tone) return action.tone
  if (Number(action?.priority) === 1) return 'danger'
  if (Number(action?.priority) === 2) return 'warning'
  return 'info'
}

function contractLifecycleActions(contract) {
  return new Set([
    ...(contract.closure_history || []),
    ...(contract.lifecycle_history || []),
  ].map(item => String(item.action || '').toLowerCase()).filter(Boolean))
}

export default function ContractePage() {
  const [contracts, setContracts] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [consumptionModalOpen, setConsumptionModalOpen] = useState(false)
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedContract, setSelectedContract] = useState(null)
  const [contractDetails, setContractDetails] = useState(null)
  const [contractForm, setContractForm] = useState(emptyContractForm)
  const [consumptionForm, setConsumptionForm] = useState(emptyConsumptionForm)
  const [sourceForm, setSourceForm] = useState(emptySourceForm)
  const [attachmentForm, setAttachmentForm] = useState(emptyAttachmentForm)
  const [addendumForm, setAddendumForm] = useState(emptyAddendumForm)
  const [linkableSources, setLinkableSources] = useState([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [portfolioFilters, setPortfolioFilters] = useState(emptyPortfolioFilters)

  const riskByContractId = useMemo(() => {
    const map = new Map()
    for (const item of dashboard?.risk_contracts || []) {
      map.set(String(item.contract_id), item)
    }
    return map
  }, [dashboard?.risk_contracts])

  const filteredContracts = useMemo(() => {
    const q = portfolioFilters.q.trim().toLowerCase()
    return contracts.filter(contract => {
      const status = String(contract.status || 'activ')
      const risk = riskByContractId.get(String(contract.id))
      const riskCodes = new Set((risk?.reasons || []).map(item => String(item.code || '').toLowerCase()))
      const percent = Number(contract.procent_consum || 0)
      const daysLeft = contract.summary?.zile_ramase
      const lifecycleActions = contractLifecycleActions(contract)
      const haystack = [
        contract.numar,
        contract.titlu,
        contract.partener,
        contract.responsabil_nume,
        contract.cpv_cod,
        contract.cpv_denumire,
        contract.tip,
      ].join(' ').toLowerCase()

      if (portfolioFilters.status !== 'toate' && status !== portfolioFilters.status) return false
      if (q && !haystack.includes(q)) return false
      if (portfolioFilters.risk === 'alerte' && !(contract.alerte || []).length) return false
      if (portfolioFilters.risk === 'risc' && !risk) return false
      if (portfolioFilters.risk === 'critic' && risk?.level !== 'danger') return false
      if (portfolioFilters.risk === 'fara_manager' && (contract.responsabil_nume || '').trim() && !riskCodes.has('missing_manager')) return false
      if (portfolioFilters.risk === 'fara_document_semnat' && !riskCodes.has('missing_signed_file')) return false
      if (portfolioFilters.risk === 'taskuri_restante' && !riskCodes.has('overdue_tasks')) return false
      if (portfolioFilters.consum === 'fara_consum' && percent > 0) return false
      if (portfolioFilters.consum === 'peste_80' && percent < 80) return false
      if (portfolioFilters.consum === 'peste_90' && percent < 90) return false
      if (portfolioFilters.consum === 'peste_100' && percent < 100) return false
      if (portfolioFilters.termen === 'expirat' && !(Number(daysLeft) < 0)) return false
      if (['7', '30', '90'].includes(portfolioFilters.termen) && !(Number(daysLeft) >= 0 && Number(daysLeft) <= Number(portfolioFilters.termen))) return false
      if (portfolioFilters.lifecycle === 'closed_forced' && !contract.close_forced) return false
      if (portfolioFilters.lifecycle !== 'toate' && portfolioFilters.lifecycle !== 'closed_forced' && !lifecycleActions.has(portfolioFilters.lifecycle) && status !== portfolioFilters.lifecycle) return false
      return true
    })
  }, [contracts, portfolioFilters, riskByContractId])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (portfolioFilters.status !== 'toate') count += 1
    if (portfolioFilters.q.trim()) count += 1
    if (portfolioFilters.risk !== 'toate') count += 1
    if (portfolioFilters.consum !== 'toate') count += 1
    if (portfolioFilters.termen !== 'toate') count += 1
    if (portfolioFilters.lifecycle !== 'toate') count += 1
    return count
  }, [portfolioFilters])

  function updatePortfolioFilter(key, value) {
    setPortfolioFilters(current => ({
      ...current,
      [key]: value,
    }))
  }

  function resetPortfolioFilters() {
    setPortfolioFilters(emptyPortfolioFilters)
  }

  const filterSummary = useMemo(() => {
    const parts = []
    if (portfolioFilters.status !== 'toate') parts.push(`status: ${portfolioFilters.status}`)
    if (portfolioFilters.risk !== 'toate') parts.push(`risc: ${portfolioFilters.risk.replaceAll('_', ' ')}`)
    if (portfolioFilters.consum !== 'toate') parts.push(`consum: ${portfolioFilters.consum.replaceAll('_', ' ')}`)
    if (portfolioFilters.termen !== 'toate') parts.push(`termen: ${portfolioFilters.termen === 'expirat' ? 'expirat' : `${portfolioFilters.termen} zile`}`)
    if (portfolioFilters.lifecycle !== 'toate') parts.push(`ciclu: ${portfolioFilters.lifecycle.replaceAll('_', ' ')}`)
    if (portfolioFilters.q.trim()) parts.push(`căutare: “${portfolioFilters.q.trim()}”`)
    return parts.join(' · ')
  }, [portfolioFilters])

  const quickContractFilters = [
    { key: 'toate', label: 'Toate', patch: { status: 'toate', risk: 'toate' } },
    { key: 'activ', label: 'Active', patch: { status: 'activ' } },
    { key: 'alerte', label: 'Cu alerte', patch: { status: 'toate', risk: 'alerte' } },
    { key: 'risc', label: 'Cu risc', patch: { status: 'toate', risk: 'risc' } },
    { key: 'anulat', label: 'Anulate', patch: { status: 'anulat' } },
  ]

  function applyQuickContractFilter(patch) {
    setPortfolioFilters(current => ({
      ...current,
      ...patch,
    }))
  }

  function quickFilterActive(patch) {
    return Object.entries(patch).every(([key, value]) => portfolioFilters[key] === value)
  }

  const filterInfo = activeFilterCount
    ? `${filteredContracts.length} din ${contracts.length} contracte · ${filterSummary}`
    : `${contracts.length} contracte în portofoliu`

  const hasFilteredOutContracts = filteredContracts.length !== contracts.length

  const filterResetDisabled = activeFilterCount === 0

  function handleSearchFilter(value) {
    updatePortfolioFilter('q', value)
  }

  function filterTableEmptyText() {
    if (loading) return 'Se încarcă...'
    if (hasFilteredOutContracts) return 'Nu există contracte pentru filtrele selectate.'
    return 'Nu există contracte în portofoliu.'
  }

  function filterBadgeTone() {
    if (!activeFilterCount) return 'gray'
    if (filteredContracts.length === 0) return 'warning'
    return 'info'
  }

  function filterButtonVariant(patch) {
    return quickFilterActive(patch) ? 'primary' : 'secondary'
  }

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [contractsRes, dashboardRes, tasksRes] = await Promise.all([
        api.get('/contracts'),
        api.get('/contracts/dashboard'),
        api.get('/contracts/tasks'),
      ])
      setContracts(arrayFrom(contractsRes.data, ['contracts']))
      setDashboard(dashboardRes.data || null)
      setTasks(arrayFrom(tasksRes.data, ['tasks']))
    } catch (err) {
      setError(err.response?.data?.error || 'Contractele nu au putut fi încărcate.')
    } finally {
      setLoading(false)
    }
  }

  function openNewContract() {
    setContractForm(emptyContractForm)
    setContractModalOpen(true)
    setError('')
    setNotice('')
  }

  function openConsumption(contract) {
    setSelectedContract(contract)
    setConsumptionForm({
      ...emptyConsumptionForm,
      moneda: contract.moneda || 'RON',
      cpv_cod: contract.cpv_cod || '',
    })
    setConsumptionModalOpen(true)
    setError('')
    setNotice('')
  }

  async function openSourceLink(contract) {
    setSelectedContract(contract)
    setSourceForm(emptySourceForm)
    setLinkableSources([])
    setSourceModalOpen(true)
    setError('')
    setNotice('')
    setSourcesLoading(true)
    try {
      const response = await api.get('/contracts/linkable-sources')
      setLinkableSources(arrayFrom(response.data, ['sources']))
    } catch (err) {
      setError(err.response?.data?.error || 'Documentele disponibile nu au putut fi încărcate.')
    } finally {
      setSourcesLoading(false)
    }
  }

  async function openDetails(contract) {
    setSelectedContract(contract)
    setContractDetails(null)
    setAttachmentForm(emptyAttachmentForm)
    setAddendumForm(emptyAddendumForm)
    setDetailModalOpen(true)
    setError('')
    setNotice('')
    try {
      const response = await api.get(`/contracts/${contract.id}`)
      setContractDetails(response.data.contract || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Detaliile contractului nu au putut fi încărcate.')
    }
  }

  function openRiskContract(risk) {
    const contract = contracts.find(item => String(item.id) === String(risk?.contract_id))
    if (contract) openDetails(contract)
  }

  function printContract(contract) {
    if (!contract?.id) return
    const token = localStorage.getItem('infraflow_token') || ''
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    window.open(`/api/contracts/${encodeURIComponent(contract.id)}/print${query}`, '_blank', 'noopener,noreferrer')
  }

  function printPortfolio() {
    const token = localStorage.getItem('infraflow_token') || ''
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    window.open(`/api/contracts/portfolio/print${query}`, '_blank', 'noopener,noreferrer')
  }

  function exportPortfolioExcel() {
    const token = localStorage.getItem('infraflow_token') || ''
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    window.open(`/api/contracts/portfolio/export.xlsx${query}`, '_blank', 'noopener,noreferrer')
  }

  async function uploadAttachment(event) {
    event.preventDefault()
    if (!contractDetails?.id || !attachmentForm.file) return
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData()
    form.append('file', attachmentForm.file)
    form.append('categorie', attachmentForm.categorie || 'contract')
    form.append('descriere', attachmentForm.descriere || '')
    try {
      const response = await api.post(`/contracts/${contractDetails.id}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setContractDetails(response.data.contract || contractDetails)
      setAttachmentForm(emptyAttachmentForm)
      setNotice('Atașamentul a fost încărcat în dosarul contractului.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Atașamentul nu a putut fi încărcat.')
    } finally {
      setSaving(false)
    }
  }

  async function saveAddendum(event) {
    event.preventDefault()
    if (!contractDetails?.id) return
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData()
    form.append('numar', addendumForm.numar || '')
    form.append('tip', addendumForm.tip || 'altul')
    form.append('data_semnare', addendumForm.data_semnare || '')
    form.append('valoare_delta', addendumForm.valoare_delta || '')
    form.append('data_sfarsit_noua', addendumForm.data_sfarsit_noua || '')
    form.append('responsabil_nume_nou', addendumForm.responsabil_nume_nou || '')
    form.append('descriere', addendumForm.descriere || '')
    if (addendumForm.file) form.append('file', addendumForm.file)
    try {
      const response = await api.post(`/contracts/${contractDetails.id}/addenda`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setContractDetails(response.data.contract || contractDetails)
      setAddendumForm(emptyAddendumForm)
      setNotice('Actul adițional a fost înregistrat și contractul a fost actualizat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Actul adițional nu a putut fi salvat.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelAddendum(item) {
    if (!contractDetails?.id || !item?.id) return
    const reason = window.prompt('Motiv anulare act adițional:', 'Corectat prin act adițional nou')
    if (reason === null) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.delete(`/contracts/${contractDetails.id}/addenda/${item.id}`, { data: { reason } })
      setContractDetails(response.data.contract || contractDetails)
      setNotice(response.data.note || 'Actul adițional a fost anulat din istoric.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Actul adițional nu a putut fi anulat.')
    } finally {
      setSaving(false)
    }
  }

  async function downloadAttachment(item) {
    if (!contractDetails?.id || !item?.id) return
    try {
      const response = await api.get(`/contracts/${contractDetails.id}/attachments/${item.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.original_name || item.file_name || 'contract-document'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || 'Atașamentul nu a putut fi descărcat.')
    }
  }

  async function cancelAttachment(item) {
    if (!contractDetails?.id || !item?.id) return
    const reason = window.prompt('Motiv anulare atașament:', 'Înlocuit / încărcat greșit')
    if (reason === null) return
    setSaving(true)
    setError('')
    try {
      const response = await api.delete(`/contracts/${contractDetails.id}/attachments/${item.id}`, { data: { reason } })
      setContractDetails(response.data.contract || contractDetails)
      setNotice('Atașamentul a fost anulat din dosarul contractului.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Atașamentul nu a putut fi anulat.')
    } finally {
      setSaving(false)
    }
  }

  async function saveContract(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.post('/contracts', contractForm)
      setContractModalOpen(false)
      setNotice('Contractul a fost adăugat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Contractul nu a putut fi salvat.')
    } finally {
      setSaving(false)
    }
  }

  async function saveConsumption(event) {
    event.preventDefault()
    if (!selectedContract) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.post(`/contracts/${selectedContract.id}/consumptions`, consumptionForm)
      setConsumptionModalOpen(false)
      setSelectedContract(null)
      setNotice('Consumul a fost înregistrat pe contract.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Consumul nu a putut fi înregistrat.')
    } finally {
      setSaving(false)
    }
  }

  async function saveSourceLink(event) {
    event.preventDefault()
    if (!selectedContract || !sourceForm.source_key) return
    const [source_type, source_id] = sourceForm.source_key.split('::')
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.post(`/contracts/${selectedContract.id}/link-source`, { source_type, source_id })
      setSourceModalOpen(false)
      setSelectedContract(null)
      setNotice('Documentul a fost legat de contract și intră automat în consum.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul nu a putut fi legat de contract.')
    } finally {
      setSaving(false)
    }
  }

  async function sendReminders() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post('/contracts/reminders')
      const count = Number(response.data?.reminders_created || 0)
      setNotice(count
        ? `Au fost trimise ${count} remindere pentru contractele cu alerte.`
        : 'Nu există remindere noi de trimis astăzi.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Reminderele nu au putut fi trimise.')
    } finally {
      setSaving(false)
    }
  }

  async function generateTasks() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post('/contracts/tasks/generate')
      const count = Number(response.data?.tasks_created || 0)
      setNotice(count
        ? `Au fost create ${count} task-uri operaționale din alertele contractelor.`
        : 'Nu există task-uri noi de creat din alertele curente.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Task-urile nu au putut fi generate.')
    } finally {
      setSaving(false)
    }
  }

  async function resolveTask(task) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.post(`/contracts/tasks/${task.id}/resolve`, { note: 'Rezolvat din lista Contract Management.' })
      setNotice('Task-ul de contract a fost marcat ca rezolvat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Task-ul nu a putut fi rezolvat.')
    } finally {
      setSaving(false)
    }
  }

  async function createTicketFromTask(task) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post(`/contracts/tasks/${task.id}/ticket`)
      const ticket = response.data?.ticket
      setNotice(response.data?.created
        ? `Ticketul ${ticket?.uuid || ''} a fost creat din task-ul de contract.`
        : `Task-ul este deja legat la ticketul ${ticket?.uuid || ''}.`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Ticketul nu a putut fi creat din task.')
    } finally {
      setSaving(false)
    }
  }

  async function createTaskFromAction(action) {
    if (!contractDetails?.id || !action) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post(`/contracts/${contractDetails.id}/tasks`, {
        action_key: action.key,
        title: action.title,
        description: action.description,
        action: action.action,
        priority: action.priority,
        source: action.source,
      })
      const task = response.data?.task
      setNotice(response.data?.created
        ? `Task creat: ${task?.titlu || action.title}`
        : `Există deja un task deschis pentru această acțiune: ${task?.titlu || action.title}`)
      const details = await api.get(`/contracts/${contractDetails.id}`)
      setContractDetails(details.data.contract || contractDetails)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Task-ul nu a putut fi creat din acțiunea recomandată.')
    } finally {
      setSaving(false)
    }
  }

  async function closeContract(force = false, previousReason = '') {
    if (!contractDetails?.id) return
    const defaultReason = previousReason || 'Contract finalizat și verificat operațional'
    const reason = window.prompt(force ? 'Motiv închidere forțată contract:' : 'Motiv închidere contract:', defaultReason)
    if (reason === null) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post(`/contracts/${contractDetails.id}/close`, { reason, force })
      setContractDetails(response.data.contract || contractDetails)
      setNotice(response.data?.forced ? 'Contractul a fost închis forțat, cu blocajele păstrate în audit.' : 'Contractul a fost închis controlat.')
      await load()
    } catch (err) {
      const readiness = err.response?.data?.readiness
      if (err.response?.status === 409 && readiness?.blockers?.length) {
        const message = `Există blocaje:\n- ${readiness.blockers.join('\n- ')}\n\nVrei să forțezi închiderea cu motiv auditat?`
        if (window.confirm(message)) {
          await closeContract(true, reason)
          return
        }
      }
      setError(err.response?.data?.error || 'Contractul nu a putut fi închis.')
    } finally {
      setSaving(false)
    }
  }

  async function reopenContract() {
    if (!contractDetails?.id) return
    const reason = window.prompt('Motiv redeschidere contract:', 'Contract redeschis pentru documente sau corecții ulterioare')
    if (reason === null) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post(`/contracts/${contractDetails.id}/reopen`, { reason })
      setContractDetails(response.data.contract || contractDetails)
      setNotice('Contractul a fost redeschis controlat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Contractul nu a putut fi redeschis.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelContract() {
    if (!contractDetails?.id) return
    const reason = window.prompt('Motiv anulare contract:', 'Contract anulat prin decizie operațională')
    if (reason === null) return
    if (!window.confirm('Confirmi anularea contractului? Contractul rămâne în dosar, dar nu mai intră în fluxurile active.')) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post(`/contracts/${contractDetails.id}/cancel`, { reason })
      setContractDetails(response.data.contract || contractDetails)
      setNotice('Contractul a fost anulat controlat și rămâne disponibil în dosar.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Contractul nu a putut fi anulat.')
    } finally {
      setSaving(false)
    }
  }

  async function reactivateContract() {
    if (!contractDetails?.id) return
    const reason = window.prompt('Motiv reactivare contract:', 'Contract reactivat după verificare operațională')
    if (reason === null) return
    if (!window.confirm('Confirmi reactivarea contractului? Contractul va reintra în fluxurile active.')) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post(`/contracts/${contractDetails.id}/reactivate`, { reason })
      setContractDetails(response.data.contract || contractDetails)
      setNotice('Contractul a fost reactivat controlat.')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Contractul nu a putut fi reactivat.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Contract Management"
        subtitle="Urmărește valoarea contractată, consumul din facturi/documente și alertele de prag sau termen."
        actions={[
          <Button key="refresh" variant="secondary" onClick={load}>Reîncarcă</Button>,
          <Button key="portfolio" variant="secondary" onClick={printPortfolio}>Raport portofoliu</Button>,
          <Button key="excel" variant="secondary" onClick={exportPortfolioExcel}>Export Excel</Button>,
          <Button key="reminders" variant="secondary" onClick={sendReminders} loading={saving}>Trimite remindere</Button>,
          <Button key="tasks" variant="secondary" onClick={generateTasks} loading={saving}>Generează task-uri</Button>,
          <Button key="new" onClick={openNewContract}>+ Contract nou</Button>,
        ]}
      />

      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card density="compact" loading={loading}>
          <div className="text-xs font-semibold uppercase text-slate-500">Contracte active</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.contracts_active || 0}</div>
          <p className="mt-1 text-xs text-slate-500">din {dashboard?.contracts_total || 0} contracte</p>
        </Card>
        <Card density="compact" loading={loading}>
          <div className="text-xs font-semibold uppercase text-slate-500">Valoare contractată</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{formatMoney(dashboard?.total_contractat || 0)}</div>
          <p className="mt-1 text-xs text-slate-500">total portofoliu</p>
        </Card>
        <Card density="compact" loading={loading}>
          <div className="text-xs font-semibold uppercase text-slate-500">Consum total</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{formatMoney(dashboard?.total_consumat || 0)}</div>
          <p className="mt-1 text-xs text-slate-500">{formatPercent(dashboard?.procent_consum_global || 0)} din portofoliu</p>
        </Card>
        <Card density="compact" loading={loading}>
          <div className="text-xs font-semibold uppercase text-slate-500">Alerte</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.alerts?.length || 0}</div>
          <p className="mt-1 text-xs text-slate-500">praguri sau termene</p>
        </Card>
        <Card density="compact" loading={loading}>
          <div className="text-xs font-semibold uppercase text-slate-500">Task-uri</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.tasks_open || tasks.length || 0}</div>
          <p className="mt-1 text-xs text-slate-500">{dashboard?.tasks_overdue || 0} restante</p>
        </Card>
        <Card density="compact" loading={loading}>
          <div className="text-xs font-semibold uppercase text-slate-500">Cu risc</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.risk_summary?.total || 0}</div>
          <p className="mt-1 text-xs text-slate-500">{dashboard?.risk_summary?.danger || 0} critice</p>
        </Card>
      </div>

      {dashboard?.risk_contracts?.length ? (
        <Card title="Contracte cu risc" subtitle="Radar operațional: contracte depășite, aproape de termen, fără manager, fără fișier semnat sau cu task-uri restante.">
          <div className="grid gap-2">
            {dashboard.risk_contracts.slice(0, 8).map(item => (
              <div key={item.contract_id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.level === 'danger' ? 'danger' : item.level === 'warning' ? 'warning' : 'info'}>{item.level === 'danger' ? 'critic' : item.level === 'warning' ? 'atenție' : 'info'}</Badge>
                    <span className="font-semibold text-slate-900">{item.contract_numar}</span>
                    <span className="text-slate-600">{item.contract_titlu}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    {item.partener ? <span>{item.partener}</span> : null}
                    <span>Responsabil: {item.responsabil_nume || 'nesetat'}</span>
                    <span>Consum: {formatPercent(item.procent_consum || 0)}</span>
                    <span>Termen: {formatDate(item.data_sfarsit)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(item.reasons || []).slice(0, 4).map(reason => (
                      <Badge key={`${item.contract_id}-${reason.code}`} tone={reason.level === 'danger' ? 'danger' : reason.level === 'warning' ? 'warning' : 'info'}>{reason.message}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {item.tasks_overdue ? <Badge tone="danger">{item.tasks_overdue} task-uri restante</Badge> : null}
                  <Button size="sm" variant="secondary" onClick={() => openRiskContract(item)}>Deschide dosar</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {dashboard?.alerts?.length ? (
        <Card title="Alerte contracte" subtitle="Contractele care cer atenție înainte să devină o problemă contabilă sau operațională.">
          <div className="grid gap-2">
            {dashboard.alerts.slice(0, 8).map((alert, index) => (
              <div key={`${alert.contract_id}-${alert.code}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <Badge tone={alertTone(alert.level)}>{alert.code}</Badge>
                  <span className="ml-2 font-medium text-slate-900">{alert.contract_numar}</span>
                  <span className="ml-2 text-slate-600">{alert.contract_titlu}</span>
                </div>
                <div className="text-slate-600">{alert.message}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        title="Task-uri contract"
        subtitle="Acțiuni concrete generate din alerte: verificare termen, valoare consumată, depășiri sau documente de clarificat."
        actions={<Button size="sm" variant="secondary" onClick={generateTasks} loading={saving}>Actualizează task-uri</Button>}
        loading={loading}
      >
        <div className="grid gap-2">
          {tasks.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
              Nu există task-uri deschise. Dacă apar alerte, folosește „Generează task-uri”.
            </div>
          ) : tasks.slice(0, 8).map(task => (
            <div key={task.id || task.uuid} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={task.overdue ? 'danger' : task.alert_level === 'danger' ? 'danger' : task.alert_level === 'warning' ? 'warning' : 'info'}>{task.prioritate || 'normală'}</Badge>
                  <span className="font-semibold text-slate-900">{task.contract_numar}</span>
                  <span className="text-slate-600">{task.titlu}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>Responsabil: {task.responsabil_nume || 'nesetat'}</span>
                  <span>Deadline: {formatDate(task.deadline)}</span>
                  {task.overdue ? <span className="font-semibold text-rose-600">restant</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {task.ticket_uuid ? (
                  <Button size="sm" variant="secondary" onClick={() => { window.location.href = '/sesizari' }}>
                    Ticket legat
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => createTicketFromTask(task)} loading={saving}>
                    Creează ticket
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => resolveTask(task)} loading={saving}>Rezolvat</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {dashboard?.by_manager?.length ? (
        <Card title="Manageri contract" subtitle="Portofoliu pe responsabil, cu alertele care trebuie urmărite înainte de depășiri.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.by_manager.slice(0, 6).map(manager => (
              <div key={manager.key} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{manager.responsabil_nume || 'Fără responsabil'}</div>
                    <div className="mt-1 text-xs text-slate-500">{manager.contracts || 0} contracte în portofoliu</div>
                  </div>
                  <Badge tone={manager.alerts ? 'warning' : 'success'}>{manager.alerts || 0} alerte</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Contractat</span>
                    <span className="font-medium text-slate-900">{formatMoney(manager.total_contractat || 0)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Consum</span>
                    <span className="font-medium text-slate-900">{formatMoney(manager.total_consumat || 0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        title="Contracte"
        subtitle="Portofoliu filtrabil pe status, risc, consum, termen și evenimente de ciclu de viață."
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone={filterBadgeTone()}>{filterInfo}</Badge>
            <Button size="sm" variant="secondary" onClick={resetPortfolioFilters} disabled={filterResetDisabled}>Resetează filtre</Button>
          </div>
        )}
        loading={loading}
      >
        <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap gap-2">
            {quickContractFilters.map(item => (
              <Button
                key={item.key}
                size="sm"
                variant={filterButtonVariant(item.patch)}
                onClick={() => applyQuickContractFilter(item.patch)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Input
              label="Caută"
              value={portfolioFilters.q}
              onChange={event => handleSearchFilter(event.target.value)}
              placeholder="număr, partener, CPV, manager..."
            />
            <Select label="Status" value={portfolioFilters.status} onChange={event => updatePortfolioFilter('status', event.target.value)}>
              <option value="toate">Toate statusurile</option>
              <option value="activ">Active</option>
              <option value="draft">Draft</option>
              <option value="inchis">Închise</option>
              <option value="anulat">Anulate</option>
            </Select>
            <Select label="Risc" value={portfolioFilters.risk} onChange={event => updatePortfolioFilter('risk', event.target.value)}>
              <option value="toate">Toate riscurile</option>
              <option value="alerte">Cu alerte</option>
              <option value="risc">Orice risc</option>
              <option value="critic">Critice</option>
              <option value="fara_manager">Fără manager</option>
              <option value="fara_document_semnat">Fără document semnat</option>
              <option value="taskuri_restante">Task-uri restante</option>
            </Select>
            <Select label="Consum" value={portfolioFilters.consum} onChange={event => updatePortfolioFilter('consum', event.target.value)}>
              <option value="toate">Orice consum</option>
              <option value="fara_consum">Fără consum</option>
              <option value="peste_80">Peste 80%</option>
              <option value="peste_90">Peste 90%</option>
              <option value="peste_100">Depășite</option>
            </Select>
            <Select label="Termen" value={portfolioFilters.termen} onChange={event => updatePortfolioFilter('termen', event.target.value)}>
              <option value="toate">Orice termen</option>
              <option value="7">Scad în 7 zile</option>
              <option value="30">Scad în 30 zile</option>
              <option value="90">Scad în 90 zile</option>
              <option value="expirat">Expirate</option>
            </Select>
            <Select label="Ciclu viață" value={portfolioFilters.lifecycle} onChange={event => updatePortfolioFilter('lifecycle', event.target.value)}>
              <option value="toate">Orice eveniment</option>
              <option value="closed">Închise controlat</option>
              <option value="closed_forced">Închise forțat</option>
              <option value="reopened">Redeschise</option>
              <option value="cancelled">Anulate</option>
              <option value="reactivated">Reactivate</option>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Contract</th>
                <th className="px-3 py-2">Partener</th>
                <th className="px-3 py-2">Responsabil</th>
                <th className="px-3 py-2">CPV</th>
                <th className="px-3 py-2 text-right">Valoare</th>
                <th className="px-3 py-2 text-right">Consum</th>
                <th className="px-3 py-2">Progres</th>
                <th className="px-3 py-2">Termen</th>
                <th className="px-3 py-2 text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContracts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    {filterTableEmptyText()}
                  </td>
                </tr>
              ) : filteredContracts.map(contract => (
                <tr key={contract.id || contract.uuid} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-900">{contract.numar}</div>
                    <div className="max-w-xs text-slate-600">{contract.titlu}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={statusTone(contract.status)}>{contract.status}</Badge>
                      {contract.alerte?.length ? <Badge tone="warning">{contract.alerte.length} alerte</Badge> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{contract.partener || '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{contract.responsabil_nume || '-'}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-800">{contract.cpv_cod || '-'}</div>
                    <div className="max-w-[14rem] text-xs text-slate-500">{contract.cpv_denumire || ''}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-slate-900">{formatMoney(contract.valoare_contract, contract.moneda || 'RON')}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-medium text-slate-900">{formatMoney(contract.valoare_consumata, contract.moneda || 'RON')}</div>
                    <div className="text-xs text-slate-500">rămas {formatMoney(contract.valoare_ramasa, contract.moneda || 'RON')}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="mb-1 text-xs font-medium text-slate-600">{formatPercent(contract.procent_consum || 0)}</div>
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full ${progressClass(contract.procent_consum)}`} style={{ width: percentWidth(contract.procent_consum) }} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-slate-800">{formatDate(contract.data_sfarsit)}</div>
                    <div className="text-xs text-slate-500">
                      {contract.summary?.zile_ramase == null ? '-' : contract.summary.zile_ramase < 0 ? 'expirat' : `${contract.summary.zile_ramase} zile`}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openDetails(contract)}>Detalii</Button>
                      {contract.status !== 'anulat' ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => openSourceLink(contract)}>Leagă doc.</Button>
                          <Button size="sm" variant="secondary" onClick={() => openConsumption(contract)}>+ Consum</Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={detailModalOpen} title="Dosar contract" size="xl" onClose={() => setDetailModalOpen(false)}>
        {contractDetails ? (
          <div className="grid gap-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase text-slate-500">{contractDetails.numar}</div>
                  <h2 className="text-xl font-semibold text-slate-900">{contractDetails.titlu}</h2>
                  <p className="mt-1 text-sm text-slate-600">{contractDetails.partener || 'Partener nesetat'} · {contractDetails.responsabil_nume || 'Responsabil nesetat'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => printContract(contractDetails)}>Fișă print</Button>
                  {contractDetails.status !== 'inchis' && contractDetails.status !== 'anulat' ? (
                    <Button size="sm" variant={contractDetails.cockpit?.close_readiness?.can_close ? 'primary' : 'secondary'} onClick={() => closeContract(false)} loading={saving}>
                      Închide contract
                    </Button>
                  ) : contractDetails.status === 'inchis' ? (
                    <Button size="sm" variant="secondary" onClick={reopenContract} loading={saving}>
                      Redeschide
                    </Button>
                  ) : null}
                  {contractDetails.status === 'anulat' ? (
                    <Button size="sm" variant="secondary" onClick={reactivateContract} loading={saving}>
                      Reactivează
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={cancelContract} loading={saving}>
                      Anulează
                    </Button>
                  )}
                  <Badge tone={statusTone(contractDetails.status)}>{contractDetails.status}</Badge>
                  {contractDetails.alerte?.map((alert, index) => <Badge key={`${alert.code}-${index}`} tone={alertTone(alert.level)}>{alert.code}</Badge>)}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Valoare</div>
                  <div className="font-semibold text-slate-900">{formatMoney(contractDetails.valoare_contract, contractDetails.moneda || 'RON')}</div>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Consum</div>
                  <div className="font-semibold text-slate-900">{formatMoney(contractDetails.valoare_consumata, contractDetails.moneda || 'RON')}</div>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Rămas</div>
                  <div className="font-semibold text-slate-900">{formatMoney(contractDetails.valoare_ramasa, contractDetails.moneda || 'RON')}</div>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Progres</div>
                  <div className="font-semibold text-slate-900">{formatPercent(contractDetails.procent_consum || 0)}</div>
                </div>
              </div>
            </div>

            {contractDetails.status === 'anulat' ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-rose-950">Contract anulat</div>
                    <div className="mt-1">Motiv: {contractDetails.cancelled_reason || contractDetails.cancelledReason || 'nesetat'}</div>
                    <div className="mt-1 text-xs text-rose-700">
                      {contractDetails.cancelled_by_name || 'utilizator necunoscut'} · {formatDate(contractDetails.cancelled_at || contractDetails.cancelledAt)}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={reactivateContract} loading={saving}>Reactivează contract</Button>
                </div>
              </div>
            ) : null}

            <Card title="Cockpit contract" subtitle="Radiografia rapidă: ce este consumat, ce lipsește și ce acțiuni sunt încă deschise.">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Alerte</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.alerts || 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Task-uri deschise</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.tasks_open || 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Tichete deschise</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.tickets_open || 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Documente</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.documents_total || 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Atașamente</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.attachments_total || 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Acte adiționale</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.addenda_total || 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Consumuri</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.consumptions_total || 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Zile rămase</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.days_left ?? '-'}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Completitudine</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatPercent(contractDetails.cockpit?.summary?.completeness_percent || 0)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase text-slate-500">Acțiuni urgente</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.actions_critical || 0}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                    <div className="font-semibold text-slate-900">Task-uri</div>
                    <Badge tone={(contractDetails.cockpit?.summary?.tasks_open || 0) ? 'warning' : 'success'}>{contractDetails.cockpit?.summary?.tasks_open || 0} deschise</Badge>
                  </div>
                  <div className="max-h-56 overflow-auto">
                    {(contractDetails.cockpit?.tasks || []).length === 0 ? (
                      <div className="px-3 py-4 text-sm text-slate-500">Nu există task-uri pentru contract.</div>
                    ) : contractDetails.cockpit.tasks.map(task => (
                      <div key={task.id || task.uuid} className="border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{task.titlu}</span>
                          <Badge tone={task.overdue ? 'danger' : task.status === 'rezolvat' ? 'success' : 'warning'}>{task.status}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span>{task.responsabil_nume || 'responsabil nesetat'}</span>
                          <span>{formatDate(task.deadline)}</span>
                          {task.ticket_uuid ? <span>ticket legat</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                    <div className="font-semibold text-slate-900">Tichete</div>
                    <Badge tone={(contractDetails.cockpit?.summary?.tickets_open || 0) ? 'warning' : 'success'}>{contractDetails.cockpit?.summary?.tickets_open || 0} deschise</Badge>
                  </div>
                  <div className="max-h-56 overflow-auto">
                    {(contractDetails.cockpit?.tickets || []).length === 0 ? (
                      <div className="px-3 py-4 text-sm text-slate-500">Nu există tichete legate.</div>
                    ) : contractDetails.cockpit.tickets.map(ticket => (
                      <div key={ticket.uuid || ticket.id} className="border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{ticket.titlu}</span>
                          <Badge tone={ticket.status === 'rezolvat' || ticket.status === 'inchis' ? 'success' : 'warning'}>{ticket.status}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span>{ticket.prioritate || 'normală'}</span>
                          <span>{formatDate(ticket.termen_limita)}</span>
                          <span>{ticket.uuid}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Închidere contract" subtitle="Control final înainte de trecerea contractului în status închis. Blocajele se pot forța doar cu motiv auditat.">
              <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <div className={`rounded-xl border p-4 ${contractDetails.cockpit?.close_readiness?.can_close ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="text-xs font-semibold uppercase text-slate-500">Stare închidere</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={contractDetails.cockpit?.close_readiness?.can_close ? 'success' : 'warning'}>
                      {contractDetails.cockpit?.close_readiness?.can_close ? 'poate fi închis' : 'are blocaje'}
                    </Badge>
                    <span className="text-2xl font-semibold text-slate-900">{contractDetails.cockpit?.summary?.close_blockers || 0}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">blocaje la controlul final</div>
                  {contractDetails.status !== 'inchis' && contractDetails.status !== 'anulat' ? (
                    <Button className="mt-4" size="sm" variant={contractDetails.cockpit?.close_readiness?.can_close ? 'primary' : 'secondary'} onClick={() => closeContract(false)} loading={saving}>
                      Închide contract
                    </Button>
                  ) : contractDetails.status === 'inchis' ? (
                    <div className="mt-4 grid gap-2">
                      <div className="text-sm font-medium text-slate-700">Contractul este închis.</div>
                      <Button size="sm" variant="secondary" onClick={reopenContract} loading={saving}>
                        Redeschide contract
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-4 text-sm font-medium text-slate-700">Contractul este {contractDetails.status}.</div>
                  )}
                </div>
                <div className="grid gap-3">
                  {contractDetails.status === 'inchis' ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="font-semibold text-slate-900">Ultima închidere</div>
                      <div className="mt-1">Motiv: {contractDetails.closed_reason || 'nesetat'}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {contractDetails.closed_by_name || 'utilizator necunoscut'} · {formatDate(contractDetails.closed_at)}
                        {contractDetails.close_forced ? ' · închidere forțată' : ''}
                      </div>
                    </div>
                  ) : null}
                  {(contractDetails.cockpit?.close_readiness?.blockers || []).length ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <div className="mb-2 text-sm font-semibold text-rose-900">Blocaje obligatorii</div>
                      <ul className="grid gap-1 text-sm text-rose-800">
                        {contractDetails.cockpit.close_readiness.blockers.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Nu există blocaje obligatorii pentru închidere.</div>
                  )}
                  {(contractDetails.cockpit?.close_readiness?.warnings || []).length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="mb-2 text-sm font-semibold text-amber-900">Atenționări</div>
                      <ul className="grid gap-1 text-sm text-amber-800">
                        {contractDetails.cockpit.close_readiness.warnings.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {(contractDetails.closure_history || []).length ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-sm font-semibold text-slate-900">Jurnal închidere/redeschidere</div>
                      <div className="grid gap-2 text-sm">
                        {contractDetails.closure_history.slice().reverse().map((item, index) => (
                          <div key={`${item.action}-${item.at}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="font-medium text-slate-900">
                              {item.action === 'reopened' ? 'Redeschis' : item.action === 'closed_forced' ? 'Închis forțat' : 'Închis'}
                            </div>
                            <div className="text-slate-700">{item.reason || 'fără motiv'}</div>
                            <div className="text-xs text-slate-500">{item.by_name || 'utilizator necunoscut'} · {formatDate(item.at)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {(contractDetails.lifecycle_history || []).length ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-sm font-semibold text-slate-900">Jurnal ciclul de viață</div>
                      <div className="grid gap-2 text-sm">
                        {contractDetails.lifecycle_history.slice().reverse().map((item, index) => (
                          <div key={`${item.action}-${item.at}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="font-medium text-slate-900">
                              {item.action === 'cancelled' ? 'Anulat' : item.action === 'reactivated' ? 'Reactivat' : item.action || 'Eveniment'}
                            </div>
                            <div className="text-slate-700">{item.reason || 'fără motiv'}</div>
                            <div className="text-xs text-slate-500">{item.by_name || 'utilizator necunoscut'} · {formatDate(item.at)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card title="Checklist completitudine contract" subtitle="Ce este gata și ce mai trebuie completat pentru un dosar contractual coerent.">
              <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase text-slate-500">Stare dosar</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={completenessTone(contractDetails.cockpit?.completeness?.status)}>{contractDetails.cockpit?.completeness?.status || 'nesetat'}</Badge>
                    <span className="text-2xl font-semibold text-slate-900">{formatPercent(contractDetails.cockpit?.completeness?.percent || 0)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full ${progressClass(contractDetails.cockpit?.completeness?.percent || 0)}`} style={{ width: percentWidth(contractDetails.cockpit?.completeness?.percent || 0) }} />
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-slate-600">
                    <div>{contractDetails.cockpit?.completeness?.required_ok || 0} / {contractDetails.cockpit?.completeness?.required_total || 0} obligatorii completate</div>
                    <div>{contractDetails.cockpit?.completeness?.missing_required || 0} obligatorii lipsă</div>
                    <div>{contractDetails.cockpit?.completeness?.warnings || 0} recomandări de completat</div>
                  </div>
                </div>
                <div className="grid gap-2">
                  {(contractDetails.cockpit?.completeness?.items || []).map(item => (
                    <div key={item.key} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={completenessTone(item.status)}>{item.status === 'ok' ? 'gata' : item.required ? 'obligatoriu' : 'recomandat'}</Badge>
                          <span className="font-semibold text-slate-900">{item.label}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{item.description}</div>
                      </div>
                      {item.status !== 'ok' ? <div className="max-w-sm text-xs font-medium text-slate-700">{item.action}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Plan rapid de acțiune" subtitle="Pașii recomandați automat din alerte, checklist, task-uri și tichete deschise.">
              {(contractDetails.cockpit?.action_plan || []).length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
                  Contractul nu are acțiuni urgente sau recomandări deschise. Dosarul arată sănătos.
                </div>
              ) : (
                <div className="grid gap-2">
                  {contractDetails.cockpit.action_plan.map((item, index) => (
                    <div key={item.key || `${item.source}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={actionTone(item)}>{Number(item.priority) === 1 ? 'urgent' : Number(item.priority) === 2 ? 'important' : 'recomandat'}</Badge>
                            {item.source ? <Badge tone="gray">{item.source}</Badge> : null}
                            <span className="font-semibold text-slate-900">{item.title}</span>
                          </div>
                          {item.description ? <div className="mt-1 text-xs text-slate-500">{item.description}</div> : null}
                        </div>
                        <div className="grid gap-2 md:max-w-md md:justify-items-end">
                          {item.action ? <div className="text-xs font-medium text-slate-700 md:text-right">{item.action}</div> : null}
                          {item.has_open_task ? (
                            <div className="grid gap-1 text-xs text-slate-600 md:justify-items-end">
                              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                <Badge tone={item.linked_task?.overdue ? 'danger' : 'warning'}>task deschis</Badge>
                                <span className="font-medium text-slate-800">{item.linked_task?.titlu || 'Task operațional'}</span>
                              </div>
                              <div className="flex flex-wrap gap-2 md:justify-end">
                                {item.linked_task?.responsabil_nume ? <span>{item.linked_task.responsabil_nume}</span> : null}
                                {item.linked_task?.deadline ? <span>termen {formatDate(item.linked_task.deadline)}</span> : null}
                              </div>
                            </div>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => createTaskFromAction(item)} loading={saving}>
                              Creează task
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Timeline dosar contract" subtitle="Istoric cronologic: contract, documente sursă, consumuri, acte adiționale, atașamente, task-uri, tichete și alerte.">
              <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-white">
                {(contractDetails.cockpit?.timeline || []).length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">Nu există evenimente în dosarul contractului.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {contractDetails.cockpit.timeline.map(item => (
                      <div key={item.id || `${item.type}-${item.date}-${item.title}`} className="grid gap-3 px-3 py-3 text-sm md:grid-cols-[120px_1fr_auto]">
                        <div className="text-xs font-medium uppercase text-slate-500">{formatDate(item.date)}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={timelineTone(item)}>{item.type_label || item.type || 'Eveniment'}</Badge>
                            {item.status ? <Badge tone="gray">{item.status}</Badge> : null}
                            <span className="font-semibold text-slate-900">{item.title}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                            {item.subtitle ? <span>{item.subtitle}</span> : null}
                            {item.actor ? <span>{item.actor}</span> : null}
                            {item.document_nr ? <span>{item.document_nr}</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                          {Number(item.amount || 0) ? <span className="text-sm font-semibold text-slate-900">{formatMoney(item.amount, item.currency || contractDetails.moneda || 'RON')}</span> : null}
                          {item.attachment ? <Button size="sm" variant="secondary" onClick={() => downloadAttachment(item.attachment)}>Descarcă</Button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card title="Acte adiționale" subtitle="Modificări controlate pentru valoare, termen, responsabil sau condiții contractuale. Istoricul păstrează valorile înainte/după.">
              {contractDetails.status !== 'anulat' ? (
                <form className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-4" onSubmit={saveAddendum}>
                  <Input label="Număr act" value={addendumForm.numar} onChange={event => setAddendumForm({ ...addendumForm, numar: event.target.value })} required />
                  <Select label="Tip" value={addendumForm.tip} onChange={event => setAddendumForm({ ...addendumForm, tip: event.target.value })}>
                    <option value="prelungire">Prelungire termen</option>
                    <option value="majorare">Majorare valoare</option>
                    <option value="diminuare">Diminuare valoare</option>
                    <option value="responsabil">Schimbare responsabil</option>
                    <option value="conditii">Condiții contractuale</option>
                    <option value="altul">Altul</option>
                  </Select>
                  <Input label="Data semnare" type="date" value={addendumForm.data_semnare} onChange={event => setAddendumForm({ ...addendumForm, data_semnare: event.target.value })} required />
                  <Input label="Delta valoare" type="number" step="0.01" value={addendumForm.valoare_delta} onChange={event => setAddendumForm({ ...addendumForm, valoare_delta: event.target.value })} helperText="La diminuare se aplică automat cu minus." />
                  <Input label="Termen nou" type="date" value={addendumForm.data_sfarsit_noua} onChange={event => setAddendumForm({ ...addendumForm, data_sfarsit_noua: event.target.value })} />
                  <Input label="Responsabil nou" value={addendumForm.responsabil_nume_nou} onChange={event => setAddendumForm({ ...addendumForm, responsabil_nume_nou: event.target.value })} />
                  <Input label="Fișier semnat (opțional)" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" onChange={event => setAddendumForm({ ...addendumForm, file: event.target.files?.[0] || null })} helperText={addendumForm.file ? addendumForm.file.name : 'PDF, Word, Excel sau imagine scanată.'} />
                  <label className="lg:col-span-3">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Descriere / obiect</span>
                    <textarea
                      className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                      value={addendumForm.descriere}
                      onChange={event => setAddendumForm({ ...addendumForm, descriere: event.target.value })}
                      placeholder="Ex: prelungire termen, suplimentare valoare, schimbare manager contract..."
                    />
                  </label>
                  <div className="flex items-end lg:col-span-4">
                    <Button type="submit" loading={saving}>Adaugă act adițional</Button>
                  </div>
                </form>
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Contract anulat: nu se mai pot adăuga acte adiționale.</div>
              )}

              <div className="mt-3 grid gap-2">
                {(contractDetails.acte_aditionale || []).length === 0 ? (
                  <div className="rounded-lg border border-slate-200 px-3 py-4 text-center text-sm text-slate-500">Nu există acte adiționale înregistrate pe contract.</div>
                ) : contractDetails.acte_aditionale.map(item => (
                  <div key={item.id || item.uuid} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={item.tip === 'majorare' ? 'success' : item.tip === 'diminuare' ? 'warning' : 'info'}>{item.tip || 'altul'}</Badge>
                          <span className="font-semibold text-slate-900">{item.numar}</span>
                          <span className="text-xs text-slate-500">{formatDate(item.data_semnare)}</span>
                          {item.atasament ? <Badge tone="gray">fișier atașat</Badge> : null}
                        </div>
                        <div className="mt-1 text-slate-600">{item.descriere || 'fără descriere'}</div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {item.atasament ? <Button size="sm" variant="secondary" onClick={() => downloadAttachment(item.atasament)}>Descarcă fișier</Button> : null}
                        {contractDetails.status !== 'anulat' ? <Button size="sm" variant="secondary" onClick={() => cancelAddendum(item)} loading={saving}>Anulează</Button> : null}
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <div className="uppercase text-slate-500">Valoare</div>
                        <div>{Number(item.valoare_delta || 0) ? `${formatMoney(item.valoare_contract_inainte, contractDetails.moneda || 'RON')} → ${formatMoney(item.valoare_contract_dupa, contractDetails.moneda || 'RON')}` : 'fără modificare'}</div>
                        {Number(item.valoare_delta || 0) ? <div className="font-semibold text-slate-800">Delta: {formatMoney(item.valoare_delta, contractDetails.moneda || 'RON')}</div> : null}
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <div className="uppercase text-slate-500">Termen</div>
                        <div>{item.data_sfarsit_dupa && item.data_sfarsit_dupa !== item.data_sfarsit_inainte ? `${formatDate(item.data_sfarsit_inainte)} → ${formatDate(item.data_sfarsit_dupa)}` : 'fără modificare'}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <div className="uppercase text-slate-500">Responsabil</div>
                        <div>{item.responsabil_nume_dupa && item.responsabil_nume_dupa !== item.responsabil_nume_inainte ? `${item.responsabil_nume_inainte || '-'} → ${item.responsabil_nume_dupa}` : 'fără modificare'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Atașamente contract" subtitle="Contract semnat, acte adiționale, garanții, corespondență sau alte documente păstrate în dosarul real al contractului.">
              {contractDetails.status !== 'anulat' ? (
                <form className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[180px_1fr_1fr_auto]" onSubmit={uploadAttachment}>
                  <Select label="Categorie" value={attachmentForm.categorie} onChange={event => setAttachmentForm({ ...attachmentForm, categorie: event.target.value })}>
                    <option value="contract semnat">Contract semnat</option>
                    <option value="act aditional">Act adițional</option>
                    <option value="garantie">Garanție</option>
                    <option value="corespondenta">Corespondență</option>
                    <option value="alt document">Alt document</option>
                  </Select>
                  <Input label="Descriere" value={attachmentForm.descriere} onChange={event => setAttachmentForm({ ...attachmentForm, descriere: event.target.value })} />
                  <Input label="Fișier" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" onChange={event => setAttachmentForm({ ...attachmentForm, file: event.target.files?.[0] || null })} />
                  <div className="flex items-end">
                    <Button type="submit" disabled={!attachmentForm.file || saving} loading={saving}>Încarcă</Button>
                  </div>
                </form>
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Contract anulat: atașamentele existente se pot consulta, dar nu se mai pot încărca fișiere noi.</div>
              )}

              <div className="mt-3 grid gap-2">
                {(contractDetails.atasamente || []).length === 0 ? (
                  <div className="rounded-lg border border-slate-200 px-3 py-4 text-center text-sm text-slate-500">Nu există atașamente încărcate pe contract.</div>
                ) : contractDetails.atasamente.map(item => (
                  <div key={item.id || item.uuid} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">{item.categorie || 'contract'}</Badge>
                        <span className="font-semibold text-slate-900">{item.original_name || item.file_name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{item.descriere || 'fără descriere'}</span>
                        <span>{Number(item.file_size || 0).toLocaleString('ro-RO')} bytes</span>
                        <span>{formatDate(item.uploaded_at)}</span>
                        {item.uploaded_by_name ? <span>{item.uploaded_by_name}</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => downloadAttachment(item)}>Descarcă</Button>
                      {contractDetails.status !== 'anulat' ? <Button size="sm" variant="secondary" onClick={() => cancelAttachment(item)} loading={saving}>Anulează</Button> : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <Card title="Consumuri care scad contractul" subtitle="Manual + facturi/NIR-uri legate, fără dublare între NIR și factura generată.">
                <div className="max-h-80 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Sursa</th><th className="px-3 py-2">Document</th><th className="px-3 py-2 text-right">Valoare</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(contractDetails.consumuri || []).length === 0 ? (
                        <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Nu există consumuri pe contract.</td></tr>
                      ) : contractDetails.consumuri.map(item => (
                        <tr key={item.id || `${item.sursa}-${item.sursa_id}-${item.document_nr}`}>
                          <td className="px-3 py-2">{formatDate(item.data)}</td>
                          <td className="px-3 py-2"><Badge tone={item.generated ? 'info' : 'gray'}>{item.sursa || 'manual'}</Badge></td>
                          <td className="px-3 py-2"><div className="font-medium text-slate-800">{item.document_nr || '-'}</div><div className="text-xs text-slate-500">{item.descriere || ''}</div></td>
                          <td className="px-3 py-2 text-right font-medium">{formatMoney(item.valoare, item.moneda || contractDetails.moneda || 'RON')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="Documente sursă" subtitle="Referate, comenzi, recepții și facturi legate la contract.">
                <div className="grid gap-3">
                  {(contractDetails.documente_sursa?.groups || []).map(group => (
                    <div key={group.type} className="rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                        <div className="font-medium text-slate-900">{group.label}</div>
                        <Badge tone={group.count ? 'info' : 'gray'}>{group.count}</Badge>
                      </div>
                      <div className="max-h-32 overflow-auto">
                        {group.items.length === 0 ? (
                          <div className="px-3 py-3 text-sm text-slate-500">Nimic legat încă.</div>
                        ) : group.items.map(item => (
                          <div key={`${group.type}-${item.id}-${item.document_nr}`} className="border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-slate-800">{item.document_nr || item.id}</span>
                              <span className="text-xs text-slate-500">{formatDate(item.data)}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              {item.status ? <Badge tone={sourceTone(item.type)}>{item.status}</Badge> : null}
                              {item.partener ? <span>{item.partener}</span> : null}
                              {Number(item.valoare || 0) ? <span>{formatMoney(item.valoare, item.moneda || contractDetails.moneda || 'RON')}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card title="Timeline documente" subtitle="Ordine cronologică descrescătoare pentru traseul contractului.">
              <div className="grid gap-2">
                {(contractDetails.documente_sursa?.timeline || []).length === 0 ? (
                  <div className="rounded-lg border border-slate-200 px-3 py-4 text-center text-sm text-slate-500">Nu există documente legate.</div>
                ) : contractDetails.documente_sursa.timeline.map(item => (
                  <div key={`${item.type}-${item.id}-${item.document_nr}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={sourceTone(item.type)}>{item.type_label}</Badge>
                      <span className="font-medium text-slate-900">{item.document_nr || item.id}</span>
                      {item.partener ? <span className="text-slate-500">{item.partener}</span> : null}
                    </div>
                    <div className="flex items-center gap-3 text-slate-600">
                      <span>{formatDate(item.data)}</span>
                      {Number(item.valoare || 0) ? <span>{formatMoney(item.valoare, item.moneda || contractDetails.moneda || 'RON')}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500">Se încarcă dosarul contractului...</div>
        )}
      </Modal>

      <Modal open={contractModalOpen} title="Contract nou" size="lg" onClose={() => setContractModalOpen(false)}>
        <form className="grid gap-4" onSubmit={saveContract}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Număr contract" value={contractForm.numar} required onChange={event => setContractForm({ ...contractForm, numar: event.target.value })} />
            <Select label="Tip" value={contractForm.tip} onChange={event => setContractForm({ ...contractForm, tip: event.target.value })}>
              <option value="achizitie">Achiziție</option>
              <option value="vanzare">Vânzare</option>
              <option value="servicii">Servicii</option>
              <option value="lucrari">Lucrări</option>
              <option value="cadru">Acord cadru</option>
              <option value="altul">Altul</option>
            </Select>
          </div>
          <Input label="Titlu / obiect contract" value={contractForm.titlu} required onChange={event => setContractForm({ ...contractForm, titlu: event.target.value })} />
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Partener" value={contractForm.partener} onChange={event => setContractForm({ ...contractForm, partener: event.target.value })} />
            <Input label="Manager contract / responsabil" value={contractForm.responsabil_nume} onChange={event => setContractForm({ ...contractForm, responsabil_nume: event.target.value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Valoare contract" type="number" step="0.01" value={contractForm.valoare_contract} required onChange={event => setContractForm({ ...contractForm, valoare_contract: event.target.value })} />
            <Input label="Monedă" value={contractForm.moneda} onChange={event => setContractForm({ ...contractForm, moneda: event.target.value.toUpperCase() })} />
            <Input label="Data semnare" type="date" value={contractForm.data_semnare} onChange={event => setContractForm({ ...contractForm, data_semnare: event.target.value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Data început" type="date" value={contractForm.data_start} onChange={event => setContractForm({ ...contractForm, data_start: event.target.value })} />
            <Input label="Data sfârșit" type="date" value={contractForm.data_sfarsit} onChange={event => setContractForm({ ...contractForm, data_sfarsit: event.target.value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Cod CPV" value={contractForm.cpv_cod} placeholder="ex. 09134200-9" onChange={event => setContractForm({ ...contractForm, cpv_cod: event.target.value })} />
            <Input label="Denumire CPV" value={contractForm.cpv_denumire} onChange={event => setContractForm({ ...contractForm, cpv_denumire: event.target.value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="ID PAAP / poziție plan" value={contractForm.paap_id} onChange={event => setContractForm({ ...contractForm, paap_id: event.target.value })} />
            <Input label="Centru cost" value={contractForm.centru_cost_id} onChange={event => setContractForm({ ...contractForm, centru_cost_id: event.target.value })} />
          </div>
          <Input label="Observații" value={contractForm.observatii} onChange={event => setContractForm({ ...contractForm, observatii: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setContractModalOpen(false)}>Renunță</Button>
            <Button type="submit" loading={saving}>Salvează contractul</Button>
          </div>
        </form>
      </Modal>

      <Modal open={sourceModalOpen} title="Leagă document existent" onClose={() => setSourceModalOpen(false)}>
        <form className="grid gap-4" onSubmit={saveSourceLink}>
          {selectedContract ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-900">{selectedContract.numar} — {selectedContract.titlu}</div>
              <div className="text-slate-500">Alege o factură sau recepție/NIR nelegată. După salvare, valoarea se scade automat din contract.</div>
            </div>
          ) : null}
          <Select
            label="Document sursă"
            value={sourceForm.source_key}
            required
            disabled={sourcesLoading}
            onChange={event => setSourceForm({ ...sourceForm, source_key: event.target.value })}
          >
            <option value="">{sourcesLoading ? 'Se încarcă documentele...' : 'Alege documentul'}</option>
            {linkableSources.map(source => (
              <option key={`${source.type}::${source.id}`} value={`${source.type}::${source.id}`}>
                {source.type_label} · {source.label}
              </option>
            ))}
          </Select>
          {!sourcesLoading && linkableSources.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Nu există facturi/NIR-uri nelegate cu valoare. Poți folosi temporar „+ Consum” pentru introducere manuală.
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSourceModalOpen(false)}>Renunță</Button>
            <Button type="submit" loading={saving} disabled={!sourceForm.source_key || sourcesLoading}>Leagă documentul</Button>
          </div>
        </form>
      </Modal>

      <Modal open={consumptionModalOpen} title="Consum contract" onClose={() => setConsumptionModalOpen(false)}>
        <form className="grid gap-4" onSubmit={saveConsumption}>
          {selectedContract ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-900">{selectedContract.numar} — {selectedContract.titlu}</div>
              <div className="text-slate-500">Rămas: {formatMoney(selectedContract.valoare_ramasa, selectedContract.moneda || 'RON')}</div>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Data" type="date" value={consumptionForm.data} required onChange={event => setConsumptionForm({ ...consumptionForm, data: event.target.value })} />
            <Input label="Document" value={consumptionForm.document_nr} placeholder="Factură/NIR/Situație" onChange={event => setConsumptionForm({ ...consumptionForm, document_nr: event.target.value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Valoare" type="number" step="0.01" value={consumptionForm.valoare} required onChange={event => setConsumptionForm({ ...consumptionForm, valoare: event.target.value })} />
            <Input label="Monedă" value={consumptionForm.moneda} onChange={event => setConsumptionForm({ ...consumptionForm, moneda: event.target.value.toUpperCase() })} />
          </div>
          <Input label="Descriere" value={consumptionForm.descriere} onChange={event => setConsumptionForm({ ...consumptionForm, descriere: event.target.value })} />
          <Input label="Cod CPV" value={consumptionForm.cpv_cod} onChange={event => setConsumptionForm({ ...consumptionForm, cpv_cod: event.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConsumptionModalOpen(false)}>Renunță</Button>
            <Button type="submit" loading={saving}>Înregistrează consumul</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
