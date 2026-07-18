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

export default function ContractePage() {
  const [contracts, setContracts] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [consumptionModalOpen, setConsumptionModalOpen] = useState(false)
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [selectedContract, setSelectedContract] = useState(null)
  const [contractForm, setContractForm] = useState(emptyContractForm)
  const [consumptionForm, setConsumptionForm] = useState(emptyConsumptionForm)
  const [sourceForm, setSourceForm] = useState(emptySourceForm)
  const [linkableSources, setLinkableSources] = useState([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('toate')

  const filteredContracts = useMemo(() => {
    if (filter === 'toate') return contracts
    if (filter === 'alerte') return contracts.filter(contract => contract.alerte?.length)
    return contracts.filter(contract => contract.status === filter)
  }, [contracts, filter])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [contractsRes, dashboardRes] = await Promise.all([
        api.get('/contracts'),
        api.get('/contracts/dashboard'),
      ])
      setContracts(arrayFrom(contractsRes.data, ['contracts']))
      setDashboard(dashboardRes.data || null)
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

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Contract Management"
        subtitle="Urmărește valoarea contractată, consumul din facturi/documente și alertele de prag sau termen."
        actions={[
          <Button key="refresh" variant="secondary" onClick={load}>Reîncarcă</Button>,
          <Button key="new" onClick={openNewContract}>+ Contract nou</Button>,
        ]}
      />

      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
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
      </div>

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
        title="Contracte"
        subtitle="Prima evidență operațională. Legarea automată din facturi/NIR-uri se va extinde peste această fundație."
        actions={(
          <Select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filtru contracte">
            <option value="toate">Toate</option>
            <option value="activ">Active</option>
            <option value="draft">Draft</option>
            <option value="inchis">Închise</option>
            <option value="alerte">Cu alerte</option>
          </Select>
        )}
        loading={loading}
      >
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
                    {loading ? 'Se încarcă...' : 'Nu există contracte în filtrul selectat.'}
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
                      <Button size="sm" variant="secondary" onClick={() => openSourceLink(contract)}>Leagă doc.</Button>
                      <Button size="sm" variant="secondary" onClick={() => openConsumption(contract)}>+ Consum</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
