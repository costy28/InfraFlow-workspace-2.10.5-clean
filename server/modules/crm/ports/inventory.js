function round(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000
}

function normalized(value) {
  return String(value == null ? '' : value).trim().toLocaleLowerCase('ro-RO')
}

function lineSnapshot(line = {}) {
  if (line.line_snapshot && typeof line.line_snapshot === 'object') return line.line_snapshot
  try { return JSON.parse(String(line.line_snapshot || '{}')) } catch { return {} }
}

function materialStock(material = {}) {
  return Math.max(0, round(material.stock ?? material.stoc_curent ?? material.currentStock ?? 0))
}

function materialReferences(material = {}) {
  return [material.id, material.code, material.cod, material.sku, material.item_code, material.itemCode, material.reference, material.cod_intern]
    .map(normalized)
    .filter(Boolean)
}

function resolveMaterial(materials, line, snapshot) {
  const reference = normalized(line.item_code || snapshot.item_reference || snapshot.item_code)
  if (reference) {
    const byReference = materials.filter(material => materialReferences(material).includes(reference))
    if (byReference.length === 1) return { material: byReference[0], matched_by: 'referință' }
  }
  const description = normalized(line.description || snapshot.description)
  if (description) {
    const byName = materials.filter(material => normalized(material.name || material.denumire || material.materialName) === description)
    if (byName.length === 1) return { material: byName[0], matched_by: 'denumire exactă' }
  }
  return { material: null, matched_by: null }
}

function checkAvailability({ order, db }) {
  const materials = Array.isArray(db?.materials) ? db.materials : []
  const lines = Array.isArray(order?.lines) ? order.lines : []
  const resultLines = lines.map(line => {
    const snapshot = lineSnapshot(line)
    const itemType = normalized(snapshot.item_type || line.item_type || 'custom')
    const requested = round(line.quantity)
    const base = {
      line_id: line.id,
      position: Number(line.position || line.line_no || 0),
      item_type: itemType,
      item_reference: line.item_code || snapshot.item_reference || null,
      description: line.description || snapshot.description || '',
      unit: line.unit || snapshot.unit || '',
      requested_quantity: requested,
      stock_policy: 'informativ; stocul nu este rezervat și nu se modifică'
    }
    if (itemType !== 'material') return { ...base, status: 'not_applicable', reason: 'Poziție comercială fără gestionare de stoc.' }
    const match = resolveMaterial(materials, line, snapshot)
    if (!match.material) return { ...base, status: 'unmapped', reason: 'Materialul nu poate fi asociat în siguranță cu nomenclatorul de stoc. Completează referința materialului sau folosește denumirea exactă.' }
    const available = materialStock(match.material)
    const shortage = Math.max(0, round(requested - available))
    return {
      ...base,
      material_id: match.material.id,
      material_name: match.material.name || match.material.denumire || match.material.materialName || '',
      matched_by: match.matched_by,
      available_quantity: available,
      shortage_quantity: shortage,
      status: shortage > 0 ? 'shortage' : 'sufficient',
      reason: shortage > 0 ? `Lipsesc ${shortage} ${base.unit || ''}`.trim() : 'Disponibil la momentul verificării.'
    }
  })
  const materialLines = resultLines.filter(line => line.item_type === 'material')
  const shortages = resultLines.filter(line => line.status === 'shortage')
  const unmapped = resultLines.filter(line => line.status === 'unmapped')
  const check_status = !materialLines.length ? 'not_applicable' : unmapped.length ? 'attention_required' : shortages.length ? 'shortage' : 'sufficient'
  return {
    check_status,
    checked_at: new Date().toISOString(),
    reservation: 'none',
    summary: {
      total_lines: resultLines.length,
      material_lines: materialLines.length,
      sufficient_lines: resultLines.filter(line => line.status === 'sufficient').length,
      shortage_lines: shortages.length,
      unmapped_lines: unmapped.length
    },
    lines: resultLines,
    procurement_candidates: shortages.map(line => ({ material_id: line.material_id, material_name: line.material_name, quantity: line.shortage_quantity, unit: line.unit, source_line_id: line.line_id }))
  }
}

module.exports = { checkAvailability }
