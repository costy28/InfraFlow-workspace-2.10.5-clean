import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import PageHeader from '../../../components/ui/PageHeader'

export function HRPageHeader({ onImport, onNewEmployee }) {
  return (
    <PageHeader title="Resurse Umane" subtitle="Angajați, pontaj, concedii și autorizații." actions={[
      <Button key="import" variant="secondary" onClick={onImport}>📥 Import din CSV/Excel</Button>,
      <Button key="new" onClick={onNewEmployee}>+ Angajat nou</Button>,
    ]} />
  )
}

export function HRFilters({ activeTab, filters, onFiltersChange, departments, authTypes }) {
  const setFilter = (field, value) => onFiltersChange({ ...filters, [field]: value })

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-4">
      <Select
        label="Departament"
        value={filters.dept_id}
        onChange={event => setFilter('dept_id', event.target.value)}
        options={[{ value: '', label: 'Toate departamentele' }, ...departments]}
      />
      {activeTab === 'Angajați' ? (
        <Select
          label="Activ"
          value={filters.activ}
          onChange={event => setFilter('activ', event.target.value)}
          options={[{ value: '', label: 'Toți' }, { value: '1', label: 'Activi' }, { value: '0', label: 'Inactivi' }]}
        />
      ) : null}
      {activeTab === 'Pontaj' ? (
        <Input
          label="Luna"
          type="month"
          value={filters.luna}
          onChange={event => setFilter('luna', event.target.value)}
        />
      ) : null}
      {activeTab === 'Autorizații' ? (
        <>
          <Select
            label="Tip"
            value={filters.tip}
            onChange={event => setFilter('tip', event.target.value)}
            options={[{ value: '', label: 'Toate tipurile' }, ...authTypes.map(type => ({ value: type, label: type }))]}
          />
          <Select
            label="Status alertă"
            value={filters.alert}
            onChange={event => setFilter('alert', event.target.value)}
            options={[{ value: '', label: 'Toate' }, { value: 'alert', label: 'Alertă 30 zile' }, { value: 'expirat', label: 'Expirat' }]}
          />
        </>
      ) : null}
    </div>
  )
}
