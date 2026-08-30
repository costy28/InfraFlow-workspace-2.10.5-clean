import { useState } from 'react'
import api from '../../../api/client'
import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const emptyContractForm = {
  tip: 'CIM',
  numar_contract: '',
  data_contract: '',
  data_start: '',
  data_sfarsit: '',
  norma_ore: 8,
  salariu_baza: '',
  cost_ora: '',
  status: 'activ',
  observatii: ''
}

function EmployeeContractsPanel({
  employeeId,
  contracts,
  amendments,
  departments,
  canManage,
  onReload,
  onError,
  onPrintContract,
  onPrintAmendment,
  onGenerateContractWord,
  onGenerateAmendmentWord,
  onArchiveContractWord,
  onArchiveAmendmentWord,
  documentTemplates = [],
  guidedIssue,
}) {
  const [editing, setEditing] = useState(null)
  const [amendment, setAmendment] = useState(null)
  const hasCimWordTemplate = documentTemplates.some(item => item.id === 'cim' && item.word_template_file)
  const hasActWordTemplate = documentTemplates.some(item => item.id === 'act_aditional' && item.word_template_file)
  const guidedFields = new Set((guidedIssue?.issue_details || []).filter(item => item.target_tab === 'contracte').map(item => String(item.field || '').toLowerCase()))
  const hasContractGuide = guidedFields.size > 0 || guidedIssue?.target_tab === 'contracte'
  const highlightClass = (...fields) => fields.some(field => guidedFields.has(field)) ? 'rounded border border-rose-300 bg-rose-50 px-1 text-rose-800' : ''
  const inputHighlightClass = (...fields) => fields.some(field => guidedFields.has(field)) ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-200' : ''

  function openNew() {
    setEditing({ ...emptyContractForm, data_contract: new Date().toISOString().slice(0, 10), data_start: new Date().toISOString().slice(0, 10) })
  }

  function openEdit(contract) {
    const validType = ['CIM', 'PFA', 'zilier', 'detasat'].includes(contract.tip) ? contract.tip : 'CIM'
    setEditing({
      ...emptyContractForm,
      ...contract,
      tip: validType,
      data_contract: String(contract.data_contract || '').slice(0, 10),
      data_start: String(contract.data_start || contract.data_incepere || '').slice(0, 10),
      data_sfarsit: String(contract.data_sfarsit || contract.data_end || '').slice(0, 10),
      norma_ore: contract.norma_ore || 8,
      status: contract.status || 'activ'
    })
  }

  function openAmendment(contract, type = 'salariu') {
    setAmendment({
      contract_id: contract.id,
      contract_number: contract.numar_contract || `Contract #${contract.id}`,
      tip: type,
      numar_act: '',
      data_act: new Date().toISOString().slice(0, 10),
      data_efect: new Date().toISOString().slice(0, 10),
      salariu_baza: contract.salariu_baza || '',
      norma_ore: contract.norma_ore || 8,
      functia: '',
      functie_cor: '',
      department_id: '',
      status_contract: '',
      observatii: ''
    })
  }

  async function saveContract(event) {
    event.preventDefault()
    try {
      const body = { ...editing, norma_ore: Number(editing.norma_ore || 8), salariu_baza: editing.salariu_baza === '' ? '' : Number(editing.salariu_baza), cost_ora: editing.cost_ora === '' ? '' : Number(editing.cost_ora) }
      if (editing.id) await api.patch(`/hr/employees/${employeeId}/contracts/${editing.id}`, body)
      else await api.post(`/hr/employees/${employeeId}/contracts`, body)
      setEditing(null)
      await onReload()
    } catch (error) { onError(error.response?.data?.error || 'Contractul nu a putut fi salvat.') }
  }

  async function saveAmendment(event) {
    event.preventDefault()
    try {
      const body = { ...amendment }
      if (!['salariu'].includes(body.tip)) body.salariu_baza = ''
      if (!['norma'].includes(body.tip)) body.norma_ore = ''
      if (!['functie'].includes(body.tip)) { body.functia = ''; body.functie_cor = '' }
      if (body.tip !== 'departament') body.department_id = ''
      if (body.tip === 'suspendare') body.status_contract = 'suspendat'
      if (body.tip === 'incetare') body.status_contract = 'incetat'
      if (!['suspendare', 'incetare'].includes(body.tip) && !body.status_contract) body.status_contract = ''
      await api.post(`/hr/employees/${employeeId}/contracts/${amendment.contract_id}/amendments`, body)
      setAmendment(null)
      await onReload()
    } catch (error) { onError(error.response?.data?.error || 'Actul aditional nu a putut fi salvat.') }
  }

  const active = contracts.filter(item => String(item.status || 'activ') !== 'incetat')
  const byContract = (contractId) => amendments.filter(item => String(item.contract_id) === String(contractId))

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Contracte salarizare</div>
          <div className="text-xs text-slate-500">Datele operative folosite de pontaj, salarizare si D112. Separat de PDF-ul CIM din dosar.</div>
        </div>
        {canManage ? <Button size="sm" onClick={openNew}>+ Contract nou</Button> : null}
      </div>
      {hasContractGuide ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <div className="font-semibold">De completat pentru registrul intern</div>
          <div className="mt-1 text-xs">{guidedIssue?.action_label || 'Completează datele contractului activ.'}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {Array.from(guidedFields).map(field => <span key={field} className="rounded-full bg-white px-2 py-0.5 text-[11px]">{field}</span>)}
            {canManage && active[0] ? <Button size="sm" variant="secondary" onClick={() => openEdit(active[0])}>Editează contract activ</Button> : null}
            {canManage && !active[0] ? <Button size="sm" onClick={openNew}>Creează contract activ</Button> : null}
          </div>
        </div>
      ) : null}
      <div className="grid gap-2">
        {contracts.map(contract => (
          <div key={contract.id} className={`rounded border px-3 py-2 text-sm ${String(contract.status || 'activ') === 'incetat' ? 'border-slate-100 bg-slate-50 text-slate-500' : 'border-primary-100 bg-primary-50/40'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{contract.numar_contract || `Contract #${contract.id}`}</strong> · {contract.tip || 'CIM'} · <Badge tone={String(contract.status || 'activ') === 'activ' ? 'success' : 'warning'}>{contract.status || 'activ'}</Badge></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => onPrintContract?.(contract)}>Genereaza</Button>
                {hasCimWordTemplate ? <Button size="sm" variant="secondary" onClick={() => onGenerateContractWord?.(contract)}>Word</Button> : null}
                {hasCimWordTemplate ? <Button size="sm" variant="secondary" onClick={() => onArchiveContractWord?.(contract)}>Arhivează Word</Button> : null}
                {canManage ? <><Button size="sm" variant="secondary" onClick={() => openAmendment(contract)}>Act aditional</Button><Button size="sm" variant="secondary" onClick={() => openEdit(contract)}>Editeaza</Button></> : null}
              </div>
            </div>
            <div className="mt-1 grid gap-1 text-xs text-slate-600 sm:grid-cols-4">
              <div className={highlightClass('dată contract')}>Data contract: {String(contract.data_contract || '').slice(0, 10) || '-'}</div>
              <div className={highlightClass('dată începere')}>Start: {String(contract.data_start || contract.data_incepere || '').slice(0, 10) || '-'}</div>
              <div className={highlightClass('normă ore')}>Norma: {contract.norma_ore || 8} ore/zi</div>
              <div className={highlightClass('salariu bază')}>Salariu: {contract.salariu_baza ? `${Number(contract.salariu_baza).toLocaleString('ro-RO')} RON` : '-'}</div>
            </div>
            {byContract(contract.id).length ? <div className="mt-2 rounded bg-white/70 p-2 text-xs"><div className="mb-1 font-semibold text-slate-600">Istoric acte adiționale</div>{byContract(contract.id).map(item => <div key={item.id || item.uuid} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-1"><span>{item.numar_act || `Act #${item.id}`} · {item.tip} · efect {String(item.data_efect || '').slice(0, 10)}</span><span className="text-slate-500">{item.salariu_baza ? `salariu ${Number(item.salariu_baza).toLocaleString('ro-RO')} RON` : ''}{item.norma_ore ? ` norma ${item.norma_ore}h` : ''}{item.functia ? ` ${item.functia}` : ''}{item.status_contract ? ` ${item.status_contract}` : ''}</span><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => onPrintAmendment?.(item, contract)}>Genereaza act</Button>{hasActWordTemplate ? <Button size="sm" variant="secondary" onClick={() => onGenerateAmendmentWord?.(item, contract)}>Word</Button> : null}{hasActWordTemplate ? <Button size="sm" variant="secondary" onClick={() => onArchiveAmendmentWord?.(item, contract)}>Arhivează</Button> : null}</div></div>)}</div> : null}
          </div>
        ))}
        {!contracts.length ? <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Nu exista contract operational. Incarcarea PDF-ului in dosar nu creeaza automat contract salarial.</div> : null}
        {contracts.length && !active.length ? <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Exista contracte, dar niciunul nu este activ pentru salarizare.</div> : null}
      </div>

      <Modal open={Boolean(editing)} title={editing?.id ? 'Editeaza contract salarial' : 'Contract salarial nou'} onClose={() => setEditing(null)} size="md">
        <form className="grid gap-3" onSubmit={saveContract}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Numar contract" value={editing?.numar_contract || ''} onChange={event => setEditing(current => ({ ...current, numar_contract: event.target.value }))} placeholder="se genereaza la contract nou" className={inputHighlightClass('număr contract')} />
            <Select label="Tip" value={editing?.tip || 'CIM'} onChange={event => setEditing(current => ({ ...current, tip: event.target.value }))} options={[{ value: 'CIM', label: 'CIM' }, { value: 'PFA', label: 'PFA' }, { value: 'zilier', label: 'Zilier' }, { value: 'detasat', label: 'Detasat' }]} />
            <Input label="Data contract" type="date" value={editing?.data_contract || ''} onChange={event => setEditing(current => ({ ...current, data_contract: event.target.value }))} className={inputHighlightClass('dată contract')} />
            <Input label="Data inceperii activitatii" type="date" value={editing?.data_start || ''} onChange={event => setEditing(current => ({ ...current, data_start: event.target.value }))} className={inputHighlightClass('dată începere')} required />
            <Input label="Data sfarsit" type="date" value={editing?.data_sfarsit || ''} onChange={event => setEditing(current => ({ ...current, data_sfarsit: event.target.value }))} />
            <Select label="Status" value={editing?.status || 'activ'} onChange={event => setEditing(current => ({ ...current, status: event.target.value }))} options={[{ value: 'activ', label: 'Activ' }, { value: 'suspendat', label: 'Suspendat' }, { value: 'incetat', label: 'Incetat' }]} />
            <Input label="Norma ore/zi" type="number" step="0.01" value={editing?.norma_ore || ''} onChange={event => setEditing(current => ({ ...current, norma_ore: event.target.value }))} className={inputHighlightClass('normă ore')} required />
            <Input label="Salariu baza brut" type="number" step="0.01" value={editing?.salariu_baza || ''} onChange={event => setEditing(current => ({ ...current, salariu_baza: event.target.value }))} className={inputHighlightClass('salariu bază')} />
            <Input label="Cost ora" type="number" step="0.01" value={editing?.cost_ora || ''} onChange={event => setEditing(current => ({ ...current, cost_ora: event.target.value }))} />
          </div>
          <Input label="Observatii" value={editing?.observatii || ''} onChange={event => setEditing(current => ({ ...current, observatii: event.target.value }))} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Renunta</Button><Button type="submit">Salveaza contract</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(amendment)} title={`Act aditional - ${amendment?.contract_number || ''}`} onClose={() => setAmendment(null)} size="md">
        <form className="grid gap-3" onSubmit={saveAmendment}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Tip act" value={amendment?.tip || 'salariu'} onChange={event => setAmendment(current => ({ ...current, tip: event.target.value }))} options={[
              { value: 'salariu', label: 'Modificare salariu' },
              { value: 'functie', label: 'Modificare functie' },
              { value: 'norma', label: 'Modificare norma' },
              { value: 'departament', label: 'Schimbare departament' },
              { value: 'suspendare', label: 'Suspendare' },
              { value: 'incetare', label: 'Incetare' },
              { value: 'altul', label: 'Alt act' }
            ]} />
            <Input label="Numar act" value={amendment?.numar_act || ''} onChange={event => setAmendment(current => ({ ...current, numar_act: event.target.value }))} placeholder="AA-2026-001" />
            <Input label="Data actului" type="date" value={amendment?.data_act || ''} onChange={event => setAmendment(current => ({ ...current, data_act: event.target.value }))} />
            <Input label="Data efect" type="date" value={amendment?.data_efect || ''} onChange={event => setAmendment(current => ({ ...current, data_efect: event.target.value }))} required />
          </div>
          {amendment?.tip === 'salariu' ? <Input label="Salariu baza brut nou" type="number" step="0.01" value={amendment?.salariu_baza || ''} onChange={event => setAmendment(current => ({ ...current, salariu_baza: event.target.value }))} required /> : null}
          {amendment?.tip === 'norma' ? <Input label="Norma noua ore/zi" type="number" step="0.01" value={amendment?.norma_ore || ''} onChange={event => setAmendment(current => ({ ...current, norma_ore: event.target.value }))} required /> : null}
          {amendment?.tip === 'functie' ? <div className="grid gap-3 sm:grid-cols-2"><Input label="Functie noua" value={amendment?.functia || ''} onChange={event => setAmendment(current => ({ ...current, functia: event.target.value }))} required /><Input label="Cod COR nou" value={amendment?.functie_cor || ''} onChange={event => setAmendment(current => ({ ...current, functie_cor: event.target.value }))} /></div> : null}
          {amendment?.tip === 'departament' ? <Select label="Departament nou" value={amendment?.department_id || ''} onChange={event => setAmendment(current => ({ ...current, department_id: event.target.value }))} options={[{ value: '', label: 'Alege departament' }, ...departments]} required /> : null}
          {['suspendare', 'incetare'].includes(amendment?.tip) ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{amendment.tip === 'incetare' ? 'Contractul va fi marcat incetat, iar angajatul inactiv de la data efectului.' : 'Contractul va fi marcat suspendat.'}</div> : null}
          <Input label="Observatii / temei" value={amendment?.observatii || ''} onChange={event => setAmendment(current => ({ ...current, observatii: event.target.value }))} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAmendment(null)}>Renunta</Button><Button type="submit">Salveaza si aplica</Button></div>
        </form>
      </Modal>
    </div>
  )
}

export default function HREmployeeContractsTab({
  employeeId,
  contracts,
  amendments,
  transferHistory,
  departments,
  canManage,
  onReload,
  onError,
  onPrintContract,
  onPrintAmendment,
  onGenerateContractWord,
  onGenerateAmendmentWord,
  onArchiveContractWord,
  onArchiveAmendmentWord,
  documentTemplates,
  guidedIssue,
}) {
  const transfers = Array.isArray(transferHistory) ? transferHistory : []

  return (
    <>
      <EmployeeContractsPanel
        employeeId={employeeId}
        contracts={contracts}
        amendments={amendments}
        departments={departments}
        canManage={canManage}
        onReload={onReload}
        onError={onError}
        onPrintContract={onPrintContract}
        onPrintAmendment={onPrintAmendment}
        onGenerateContractWord={onGenerateContractWord}
        onGenerateAmendmentWord={onGenerateAmendmentWord}
        onArchiveContractWord={onArchiveContractWord}
        onArchiveAmendmentWord={onArchiveAmendmentWord}
        documentTemplates={documentTemplates}
        guidedIssue={guidedIssue}
      />

      {transfers.length ? (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Istoric departamente</div>
          <div className="grid gap-2">
            {transfers.map(item => <div key={item.uuid || item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{item.departament_vechi_nume || item.dept_vechi || 'Fara departament'}</strong> → <strong>{item.departament_nou_nume || item.dept_nou}</strong></span><span className="text-xs text-slate-500">{item.data_transfer} · {item.motiv || 'fara motiv'}</span></div>)}
          </div>
        </div>
      ) : null}
    </>
  )
}
