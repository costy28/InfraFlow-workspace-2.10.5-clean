const crypto = require('crypto')

function activeRequirement(row = {}) {
  return !row.cancelled_at && !row.cancelledAt && !['done', 'rejected', 'cancelled'].includes(String(row.status || '').toLowerCase())
}

function createRequirementsFromCrmOrder({ db, user, order, inventoryCheck }) {
  const candidates = Array.isArray(inventoryCheck?.result?.procurement_candidates) ? inventoryCheck.result.procurement_candidates : []
  if (!candidates.length) return { requirements: [], already_created: true, reason: 'Nu există deficit de material pentru această verificare.' }
  if (!Array.isArray(db.departmentRequests)) db.departmentRequests = []
  const requirements = []
  let created = 0
  for (const candidate of candidates) {
    const material = (db.materials || []).find(item => String(item.id) === String(candidate.material_id))
    if (!material) continue
    const sourceKey = `crm-order:${order.id}:material:${material.id}`
    const existing = db.departmentRequests.find(item => item.crm_source_key === sourceKey && activeRequirement(item))
    if (existing) { requirements.push({ ...existing, already_created: true }); continue }
    const now = new Date().toISOString()
    const materialName = material.name || material.denumire || candidate.material_name
    const request = {
      id: `crm-necesar-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      type: 'material', status: 'new', neededDate: '', department: 'Achiziții',
      jobName: `Comandă client ${order.order_number}`, location: '', orderNo: order.order_number,
      priority: 'medie', description: `Necesar creat din verificarea stocului pentru comanda client ${order.order_number}.`,
      recipeId: '', recipeName: '', materialId: material.id, materialName,
      requestedMaterialName: '', requestedUnit: '', mappedMaterialId: material.id, mappedMaterialName: materialName,
      itemName: materialName, amount: Number(candidate.quantity || 0), unit: material.unit || material.um || candidate.unit || '',
      orderDate: '', technical: null, materials: [],
      source_type: 'crm_customer_order', source_id: String(order.id), source_quote_id: order.source_quote_id, source_quote_revision: order.source_quote_revision,
      source_inventory_check_id: inventoryCheck.id, crm_source_key: sourceKey,
      createdBy: user?.id, createdByName: user?.name, createdAt: now
    }
    db.departmentRequests.push(request)
    requirements.push({ ...request, already_created: false })
    created += 1
  }
  return { requirements, already_created: created === 0, created }
}

module.exports = { createRequirementsFromCrmOrder }
