import Card from '../../components/ui/Card'

export default function ModulePlaceholder({ title = 'Modul' }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">
        Modul pregatit pentru migrarea ecranelor din aplicatia existenta.
      </p>
    </Card>
  )
}
