import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

export default function HRDocumentTemplateTestModal({
  template,
  form,
  result,
  employees,
  getEmployeeLabel,
  getContracts,
  getAmendments,
  onFormChange,
  onResultClear,
  onClose,
  onSubmit,
}) {
  const title = template ? `Testează Word — ${template.denumire}` : 'Testează șablon Word'
  const employeeOptions = (employees || []).map(employee => ({
    value: employee.id,
    label: getEmployeeLabel(employee),
  }))
  const contractOptions = [
    { value: '', label: 'Contract activ automat' },
    ...getContracts(form.employee_id).map(contract => ({
      value: contract.id,
      label: `${contract.numar_contract || `Contract #${contract.id}`} · ${String(contract.data_start || contract.data_contract || '').slice(0, 10) || '-'}`,
    })),
  ]
  const amendmentOptions = [
    { value: '', label: 'Fără act specific' },
    ...getAmendments(form.contract_id).map(item => ({
      value: item.id,
      label: `${item.numar_act || `Act #${item.id}`} · ${item.tip} · ${String(item.data_efect || '').slice(0, 10)}`,
    })),
  ]

  function handleEmployeeChange(event) {
    const employeeId = event.target.value
    const contracts = getContracts(employeeId)
    onFormChange({ employee_id: employeeId, contract_id: contracts[0]?.id || '', amendment_id: '' })
    onResultClear()
  }

  function updateForm(field, value) {
    onFormChange(current => ({ ...(current || {}), [field]: value }))
  }

  return (
    <Modal open={Boolean(template)} title={title} onClose={onClose} size="md">
      {template ? (
        <form className="grid gap-3" onSubmit={onSubmit}>
          <div className="rounded border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            Testul nu arhivează nimic. Verifică dacă variabilele din documentul Word pot fi detectate și completate pentru un exemplu real.
          </div>
          <Select
            label="Angajat test"
            value={form.employee_id}
            onChange={handleEmployeeChange}
            options={employeeOptions}
          />
          <Select
            label="Contract test"
            value={form.contract_id}
            onChange={event => onFormChange(current => ({ ...(current || {}), contract_id: event.target.value, amendment_id: '' }))}
            options={contractOptions}
          />
          {template.id === 'act_aditional' ? (
            <Select
              label="Act adițional test"
              value={form.amendment_id}
              onChange={event => updateForm('amendment_id', event.target.value)}
              options={amendmentOptions}
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Închide</Button>
            <Button type="submit">Rulează test</Button>
          </div>
          {result ? (
            <div className={`rounded-lg border p-3 text-sm ${result.status === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <div className="mb-2 font-semibold">{result.status === 'ok' ? 'OK — șablonul poate fi folosit' : 'Atenție — verifică șablonul Word'}</div>
              <div>Variabile detectate: <strong>{result.detected_count || 0}</strong></div>
              {result.resolved?.length ? <div className="mt-2 text-xs">Recunoscute: {result.resolved.join(', ')}</div> : null}
              {result.unknown?.length ? <div className="mt-2 text-xs text-rose-700">Necunoscute: {result.unknown.join(', ')}</div> : null}
              {result.missing_values?.length ? <div className="mt-2 text-xs text-amber-700">Fără valoare în exemplu: {result.missing_values.join(', ')}</div> : null}
              {result.warnings?.length ? <ul className="mt-2 list-disc pl-5 text-xs">{result.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
            </div>
          ) : null}
        </form>
      ) : null}
    </Modal>
  )
}
