function SkeletonRows({ columns }) {
  return Array.from({ length: 5 }).map((_, index) => (
    <tr key={index}>
      {columns.map(column => (
        <td key={column.key} className="px-3 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        </td>
      ))}
    </tr>
  ))
}

export default function Table({
  columns = [],
  data,
  rows,
  loading = false,
  onRowClick,
  pagination,
  empty = 'Nu exista date.',
}) {
  const tableRows = data || rows || []

  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-slate-200 bg-white shadow-[var(--shadow-card)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/90">
            <tr>
              {columns.map(column => (
                <th key={column.key} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <SkeletonRows columns={columns} /> : tableRows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            ) : tableRows.map((row, index) => (
              <tr
                key={row.id || row.uuid || index}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition ${onRowClick ? 'cursor-pointer hover:bg-primary-50' : 'hover:bg-slate-50/70'}`}
              >
                {columns.map(column => (
                  <td key={column.key} className="px-3 py-2 align-top text-slate-700">
                    {column.render ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && <div className="border-t border-slate-200 p-3">{pagination}</div>}
    </div>
  )
}
