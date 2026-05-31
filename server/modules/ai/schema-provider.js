const SCHEMA_MAP = {
  stoc: `
    inventory.materials: id, cod, denumire, um, stoc_curent, stoc_minim
    inventory.stock_entries: material_id, tip, cantitate, created_at
  `,
  utilaje: `
    fleet.assets: id, tip, marca, nr_inmatriculare, status, ore_motor_total
    fleet.work_logs: asset_id, santier_id, data, ore_efectuate, combustibil_l
  `,
  personal: `
    hr.employees: id, nume, prenume, functia, department_id, activ
    hr.time_sheets: employee_id, data, ore_lucrate, tip, santier_id
    hr.leave_requests: employee_id, tip, data_start, data_sfarsit, status
  `,
  financiar: `
    controlling.cost_centers: id, cod, denumire, buget_lunar
    controlling.cost_entries: cost_center_id, categorie, valoare, luna
    controlling.budgets: cost_center_id, an, luna, valoare
  `,
  santiere: `
    work.projects: id, cod, denumire, status, data_termen
    field.project_progress: santier_id, data, progres_fizic_procent
    field.site_journals: santier_id, data, status
  `,
  documente: `
    documents.documents: id, uuid, tip_id, nr_document, status, creat_de
    documents.circuit_steps: document_id, nr_pas, status, user_responsabil
  `,
  sesizari: `
    tickets.tickets: id, uuid, tip, prioritate, status, titlu
    tickets.comments: ticket_id, tip, continut, created_at
  `,
  deszapezire: `
    snow_removal.duty_logs: id, data, tip_interventie, status
    snow_removal.vehicle_route_sheets: duty_log_id, utilaj_id, sare_consumata_to
    snow_removal.monthly_reports: luna, sare_totala_to, cost_total
  `
}

function detectEntitati(intrebare) {
  const lower = intrebare.toLowerCase()
  const entitati = []
  if (/bitum|stoc|material|livrare|nisip|agregat/.test(lower))
    entitati.push('stoc')
  if (/utilaj|excavator|finisor|combustibil|autobascul|km/.test(lower))
    entitati.push('utilaje')
  if (/angajat|pontaj|concediu|ore|salariat|personal/.test(lower))
    entitati.push('personal')
  if (/buget|cheltuieli|cost|centru|controlling/.test(lower))
    entitati.push('financiar')
  if (/santier|proiect|progres|lucrare|dj/.test(lower))
    entitati.push('santiere')
  if (/document|referat|situatie|aprobare|circuit/.test(lower))
    entitati.push('documente')
  if (/sesizare|ticket|problema|idee/.test(lower))
    entitati.push('sesizari')
  if (/deszapezire|sare|cacl|clorura|iarna|ninsoare|traseu/.test(lower))
    entitati.push('deszapezire')
  return entitati.length > 0 ? entitati : ['stoc']
}

function getRelevantSchema(entitati, userRole) {
  // Dacă rolul nu permite financiar → exclude
  const allowed = userRole?.includes('controlling:view_all')
    ? entitati
    : entitati.filter(e => e !== 'financiar')
  return [...new Set(allowed)]
    .map(e => SCHEMA_MAP[e] || '')
    .join('\n')
}

module.exports = { SCHEMA_MAP, detectEntitati, getRelevantSchema }
