import { useMemo, useState } from 'react'
import Button from './Button'
import Table from './Table'

export default function CompactTable({
  columns = [],
  data,
  rows,
  loading = false,
  onRowClick,
  pagination,
  empty = 'Nu există date.',
  initialLimit = 5,
  itemLabel = 'înregistrări',
  compactHint = 'Afișăm doar cele mai relevante rânduri ca pagina să rămână ușor de urmărit.',
}) {
  const [expanded, setExpanded] = useState(false)
  const allRows = useMemo(() => {
    const source = Array.isArray(data) ? data : rows || []
    return Array.isArray(source) ? source : []
  }, [data, rows])
  const limit = Math.max(1, Number(initialLimit || 5))
  const visibleRows = expanded ? allRows : allRows.slice(0, limit)
  const hiddenCount = Math.max(0, allRows.length - visibleRows.length)
  const hasMore = allRows.length > limit

  return (
    <div className="grid gap-2">
      <Table
        columns={columns}
        data={visibleRows}
        loading={loading}
        onRowClick={onRowClick}
        pagination={expanded ? pagination : null}
        empty={empty}
      />
      {hasMore ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>
            {expanded
              ? `Se afișează toate cele ${allRows.length} ${itemLabel}.`
              : `${compactHint} Încă ${hiddenCount} ${itemLabel} ascunse.`}
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => setExpanded(value => !value)}>
            {expanded ? 'Arată compact' : `Vezi toate (${allRows.length})`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
