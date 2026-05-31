/**
 * Utilitare export Excel (SheetJS) și PDF (print window)
 * Utilizare:
 *   exportExcel([{ Col1: val, Col2: val }], 'Raport_Productie_2026-05')
 *   exportPdf({ title, subtitle, columns, rows })
 */
import * as XLSX from 'xlsx'

// ─── Excel ────────────────────────────────────────────────────────────────────

/**
 * @param {Array<Object>} rows    – array de obiecte cu aceleași chei
 * @param {string} filename       – fără extensie, ex: 'Raport_Productie'
 * @param {string} [sheetName]    – numele tab-ului în Excel
 */
export function exportExcel(rows, filename, sheetName = 'Date') {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Lățimi automate bazate pe cel mai lung text per coloană
  const colWidths = {}
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const len = Math.max(String(key).length, String(value ?? '').length)
      colWidths[key] = Math.max(colWidths[key] || 0, len)
    }
  }
  ws['!cols'] = Object.values(colWidths).map(w => ({ wch: Math.min(w + 2, 50) }))

  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/**
 * Export multi-sheet
 * @param {Array<{name: string, rows: Array}>} sheets
 * @param {string} filename
 */
export function exportExcelMultiSheet(sheets, filename) {
  const wb = XLSX.utils.book_new()
  for (const { name, rows } of sheets) {
    if (!rows?.length) continue
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── PDF (print window) ───────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {string}   opts.title
 * @param {string}   [opts.subtitle]
 * @param {Array<{key: string, label: string, align?: string}>} opts.columns
 * @param {Array<Object>} opts.rows
 * @param {string}   [opts.filename]  – folosit ca titlu fereastra
 */
export function exportPdf({ title, subtitle, columns, rows, filename }) {
  const html = buildPrintHtml({ title, subtitle, columns, rows })
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    alert('Permite popup-urile pentru a putea exporta PDF.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  // Mică întârziere pentru a lăsa browserul să randeze tabelul
  setTimeout(() => {
    win.print()
  }, 400)
}

function buildPrintHtml({ title, subtitle, columns, rows }) {
  const now = new Date().toLocaleString('ro-RO')
  const thead = columns.map(c => `<th>${c.label}</th>`).join('')
  const tbody = rows.map(row =>
    `<tr>${columns.map(c => `<td style="text-align:${c.align || 'left'}">${row[c.key] ?? ''}</td>`).join('')}</tr>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 20px; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 12px; }
  .meta { font-size: 10px; color: #94a3b8; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0f6e56; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: right; }
  @media print {
    body { padding: 10px; }
    @page { margin: 1cm; }
  }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
  <div class="meta">Generat: ${now} · InfraFlow ERP</div>
  <table>
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
  <div class="footer">InfraFlow ERP — ${now}</div>
</body>
</html>`
}
