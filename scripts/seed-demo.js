/**
 * Genereaza data/app-db.demo.json complet cu date demo pentru InfraFlow.
 * Rulare: node scripts/seed-demo.js
 */
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { hashPassword } = require('../server/core/auth')

const ROOT = path.join(__dirname, '..')
const DEMO_DB_NAME = process.env.INFRAFLOW_DEMO_DB_FILE || process.env.INFRAFLOW_DB_FILE || 'app-db.demo.json'
const DB_FILE = path.isAbsolute(DEMO_DB_NAME) ? DEMO_DB_NAME : path.join(ROOT, 'data', DEMO_DB_NAME)
const SEED_FILE = path.join(ROOT, 'data', 'demo-seed.json')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function localDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDate(date)
}

function isoDaysAgo(days, hour = 8) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function pick(list, index) {
  return list[index % list.length]
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/)
  if (parts.length <= 1) return { nume: name || '', prenume: '' }
  return { nume: parts[parts.length - 1], prenume: parts.slice(0, -1).join(' ') }
}

function employeeDepartmentCod(employee) {
  const map = {
    'DEP-001': 'conducere',
    'DEP-002': 'mecanizare',
    'DEP-003': 'gestiune',
    'DEP-004': 'financiar',
    'DEP-005': 'hr',
    'DEP-006': 'tehnic',
    'DEP-007': 'achizitii',
    'DEP-008': 'salubrizare'
  }
  return map[employee.departmentId] || employee.departmentId || ''
}

function buildHrEmployees(seed) {
  return seed.employees.map((employee, index) => {
    const names = splitName(employee.name)
    const department = seed.departments.find((item) => item.id === employee.departmentId)
    return {
      ...employee,
      ...names,
      marca: `M${String(index + 1).padStart(4, '0')}`,
      functia: employee.functie,
      department_id: employee.departmentId,
      department_cod: employeeDepartmentCod(employee),
      department_name: department?.name || '',
      data_angajare: employee.hire_date,
      tip_contract: employee.contract_type,
      salariu_baza: employee.salary_gross,
      norma_ore_zi: 8,
      activ: true,
      email: `${employee.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.')}@infraflow-demo.ro`,
      telefon: `07${String(20000000 + index * 13729).slice(0, 8)}`,
      adresa: `Str. Demo nr. ${index + 10}, Piatra-Neamt`,
      iban: `RO49AAAA1B3100759384${String(index + 1).padStart(4, '0')}`,
      permis_conducere_categorii: /sofer|mecanic|operator/i.test(employee.functie) ? 'B,C,CE' : '',
      permis_conducere_expira: /sofer/i.test(employee.functie) ? addDays(pick([18, 42, 95, 180], index)) : '',
      apt_medical_expira: addDays(pick([14, 28, 65, 120, 240], index)),
      zile_co_drept: 21,
      sursa: 'manual'
    }
  })
}

function withFleetDueDates(assets) {
  const rcaOffsets = [-12, -4, 18, 23, 27, 44, 61, 75, 92, 110, 130, 150]
  const itpOffsets = [-18, 16, 22, 29, 45, 67, 88, 104, 120, 144, 166, 180]
  return assets.map((asset, index) => ({
    ...asset,
    active: true,
    department: asset.costCenterId === 'DEP-SALUB' ? 'Salubrizare' : 'Mecanizare',
    insurance_expiry: addDays(pick(rcaOffsets, index)),
    itp_expiry: addDays(pick(itpOffsets, index)),
    iscir_expiry: asset.category === 'equipment' ? addDays(pick([20, 48, 95, 130, -9], index)) : null,
    currentMeter: asset.odometer_km || asset.ore_motor || 0,
    meterUnit: asset.category === 'vehicle' ? 'km' : 'hours',
    nextServiceDate: addDays(pick([12, 28, 42, -6, 65, 90], index)),
    nextInspectionDate: asset.category === 'vehicle' ? addDays(pick(itpOffsets, index)) : addDays(pick([20, 48, 95, 130, -9], index)),
    nextServiceMeter: Number(asset.odometer_km || asset.ore_motor || 0) + pick([250, 430, -35, 700, 120], index),
    alertDays: 30,
    alertMeter: asset.category === 'vehicle' ? 500 : 50,
    costCenterName: asset.costCenterId || ''
  }))
}

function buildStockEntries(materials) {
  return materials.map((material, index) => ({
    id: `STK-${String(index + 1).padStart(3, '0')}`,
    materialId: material.id,
    materialName: material.name,
    amount: material.stock,
    unit: material.unit,
    type: 'opening_stock',
    date: addDays(-30),
    createdAt: isoDaysAgo(30, 7)
  }))
}

function buildStockOperations(materials) {
  return materials.slice(0, 18).map((material, index) => {
    const amount = index % 3 === 0 ? -Math.max(1, Math.round(Number(material.stock || 10) * 0.08)) : Math.max(1, Math.round(Number(material.stock || 10) * 0.12))
    return {
      id: `MOV-${String(index + 1).padStart(3, '0')}`,
      materialId: material.id,
      materialName: material.name,
      amount,
      unit: material.unit,
      type: amount > 0 ? 'manual_in' : 'manual_out',
      reason: amount > 0 ? 'Aprovizionare demo' : 'Consum lucrare demo',
      date: addDays(-index - 1),
      createdAt: isoDaysAgo(index + 1, 10)
    }
  })
}

function buildTripLogs(seed) {
  const destinations = [
    'Santier DJ207B km 3+500, Piatra-Neamt',
    'Statia asfalt - depozit agregate',
    'Str. Mihail Kogalniceanu',
    'DN15 Piatra-Neamt - marcaje',
    'Depozit materiale Savinesti'
  ]
  const vehicles = seed.fleet_assets.filter((asset) => asset.category === 'vehicle').slice(0, 8)
  const drivers = seed.employees.filter((employee) => /sofer/i.test(employee.functie)).map((employee) => employee.id)
  const rows = Array.from({ length: 30 }, (_, index) => {
    const vehicle = pick(vehicles, index)
    const km = 38 + (index * 7) % 86
    const start = Number(vehicle.odometer_km || 40000) + index * 120
    return {
      id: `fp-${String(index + 1).padStart(3, '0')}`,
      uuid: `fp-${String(index + 1).padStart(3, '0')}`,
      nr_foaie: `FP-2026-${String(index + 1).padStart(4, '0')}`,
      data: addDays(-29 + index),
      date: addDays(-29 + index),
      vehicul_id: vehicle.id,
      assetId: vehicle.id,
      asset_id: vehicle.id,
      sofer_id: pick(drivers, index),
      driverId: pick(drivers, index),
      sofer_text: pick(['Ion Popescu', 'Gheorghe Constantin'], index),
      km_plecare: start,
      km_sosire: start + km,
      km_parcursi: km,
      destination: pick(destinations, index),
      destinatie: pick(destinations, index),
      scopul_deplasarii: index % 2 ? 'Transport materiale' : 'Transport balast',
      marfa: index % 2 ? 'Mixtura asfaltica' : 'Criblura 4-8mm',
      tone: 18 + (index % 6),
      combustibil_start: 180 - (index % 20),
      combustibil_sfarsit: 145 - (index % 12),
      combustibil_adaugat: index % 9 === 0 ? 120 : 0,
      combustibil_sold_initial: 180 - (index % 20),
      combustibil_primit: index % 9 === 0 ? 120 : 0,
      combustibil_sold_final: 145 - (index % 12),
      consum_normat: Math.round(km * 0.38),
      status: index > 27 ? 'deschisa' : 'inchisa',
      cost_center_id: 'DEP-MECAN',
      created_at: isoDaysAgo(29 - index, 6)
    }
  })
  rows.unshift({
    id: 'fp-kiosk-001',
    uuid: 'demo-fp-kiosk-001',
    nr_foaie: 'FP-2026-KIOSK-001',
    data: addDays(0),
    date: addDays(0),
    vehicul_id: 'VEH-001',
    assetId: 'VEH-001',
    asset_id: 'VEH-001',
    sofer_id: 'EMP-001',
    employee_id: 'EMP-001',
    driverId: 'EMP-001',
    sofer_text: 'Ion Popescu',
    nr_inmatriculare: 'NT-01-ABC',
    km_plecare: 48250,
    km_sosire: '',
    km_parcursi: 0,
    destination: 'Reabilitare DJ207B km 3+000 - km 8+500',
    destinatie: 'Reabilitare DJ207B km 3+000 - km 8+500',
    scopul_deplasarii: 'Transport mixtura asfaltica',
    marfa: 'Mixtura asfaltica BA16',
    tone: 0,
    combustibil_sold_initial: 180,
    combustibil_primit: 120,
    combustibil_sold_final: '',
    consum_normat: 0,
    status: 'deschisa',
    trimisa_la_sofer: true,
    trimisa_la: isoDaysAgo(0, 6),
    cost_center_id: 'SUB-BASC',
    observatii: 'Foaie primita in Kiosk pentru completare verso demo.',
    created_at: isoDaysAgo(0, 6)
  })
  return rows
}

function buildGps(seed) {
  const assets = seed.fleet_assets.slice(0, 15)
  return assets.map((asset, index) => ({
    id: `gps-${String(index + 1).padStart(3, '0')}`,
    asset_id: asset.id,
    vehicle_id: asset.id,
    name: asset.registration || asset.name,
    lat: Number((46.9 + (index % 8) * 0.006).toFixed(6)),
    lng: Number((26.35 + (index % 7) * 0.01).toFixed(6)),
    status: pick(['in_lucru', 'stationat', 'in_tranzit'], index),
    speed: index % 3 === 1 ? 0 : 24 + index,
    timestamp: isoDaysAgo(0, Math.max(1, 23 - index))
  }))
}

function buildReferate(seed) {
  const rows = [
    { dep: 'DEP-002', user: 'USR-004', supplier: 'BITUM TRADING SRL', status: 'aprobat', tip: 'aprovizionare', obs: 'Aprovizionare bitum pentru programul de asfaltare DJ207B.', lines: [['MAT-001', 18, 3350, 12663], ['MAT-024', 120, 18, 453.6]] },
    { dep: 'DEP-002', user: 'USR-004', supplier: 'AUTO PIESE NORD SRL', status: 'la_gestionar', tip: 'aprovizionare', obs: 'Filtre si consumabile pentru revizia autobasculantelor.', lines: [['MAT-013', 20, 85, 357], ['MAT-014', 18, 110, 415.8], ['MAT-009', 80, 19, 319.2]] },
    { dep: 'DEP-007', user: 'USR-013', supplier: 'PETROM SA', status: 'dir_general', tip: 'aprovizionare', obs: 'DEMO DIRECTOR: motorina necesara pentru utilajele alocate in saptamana curenta. Acest referat asteapta aprobarea directorului general.', lines: [['MAT-007', 6500, 6.25, 8531.25]] },
    { dep: 'DEP-006', user: 'USR-010', supplier: 'CONSTRUCTIV MATERIALE SA', status: 'draft', tip: 'servicii', obs: 'Servicii inchiriere utilaj compactare pentru lucrare canalizare.', lines: [['MAT-030', 140, 42, 1234.8]] },
    { dep: 'DEP-006', user: 'USR-010', supplier: 'CONSTRUCTIV MATERIALE SA', status: 'respins', tip: 'aprovizionare', obs: 'Necesar initial respins pentru completare specificatii tehnice.', lines: [['MAT-010', 420, 14, 1234.8], ['MAT-011', 160, 15.5, 520.8]] },
    { dep: 'DEP-008', user: 'USR-014', supplier: 'CONSTRUCTIV MATERIALE SA', status: 'secretariat_final', tip: 'aprovizionare', obs: 'Echipamente SSM pentru echipele operative.', lines: [['MAT-018', 24, 96, 483.84], ['MAT-020', 60, 32, 403.2], ['MAT-023', 24, 155, 781.2]] },
    { dep: 'DEP-003', user: 'USR-008', supplier: 'CONSTRUCTIV MATERIALE SA', status: 'achizitii_final', tip: 'aprovizionare', obs: 'Stoc preventiv materiale antiderapante.', lines: [['MAT-025', 55, 380, 4389]] }
  ]
  return rows.map((row, index) => {
    const items = row.lines.map(([materialId, cantitate, pret, tva], lineIndex) => {
      const material = seed.materials.find((item) => item.id === materialId)
      return {
        id: `ref-${String(index + 1).padStart(3, '0')}-item-${lineIndex + 1}`,
        nr_crt: lineIndex + 1,
        denumire: material?.name || materialId,
        caracteristici: material?.category || '',
        um: material?.unit || '',
        cantitate,
        pret_unitar: pret,
        valoare_tva: tva,
        stoc_magazie: materialId === 'MAT-001' ? 8.2 : Number(material?.stock || 0),
        material_id: materialId,
        cpv_cod: material?.cpv_cod || ''
      }
    })
    const total = Number(items.reduce((sum, item) => sum + item.cantitate * item.pret_unitar + item.valoare_tva, 0).toFixed(2))
    return {
      id: `ref-${String(index + 1).padStart(3, '0')}`,
      uuid: `demo-ref-${String(index + 1).padStart(3, '0')}`,
      numar: 120 + index,
      serie: 'RA',
      nr_referat: `RA/${120 + index}`,
      data_intocmire: addDays(-14 + index),
      tip: row.tip,
      departament_id: row.dep,
      intocmit_de: row.user,
      intocmit_de_nume: pick(seed.users, index + 3).name,
      furnizor_id: null,
      furnizor_manual: row.supplier,
      observatii: row.obs,
      status: row.status,
      prioritate: index === 2 ? 'ridicata' : 'normal',
      valoare_referat: total,
      valoare_estimata: total,
      valoare_factura: row.status === 'aprobat' ? Number((total * 1.03).toFixed(2)) : 0,
      nr_inregistrare: row.status === 'draft' ? '' : `REG-${2026}-${120 + index}`,
      data_inregistrare: row.status === 'draft' ? null : isoDaysAgo(13 - index, 10),
      items,
      created_at: isoDaysAgo(14 - index, 9),
      approved_at: row.status === 'aprobat' ? isoDaysAgo(9 - index, 14) : null
    }
  })
}

function buildReferateFlux(referate) {
  const labels = ['draft', 'inregistrat', 'la_achizitii', 'la_gestionar', 'cfp', 'contabil_sef', 'dir_adjunct', 'secretariat_2', 'dir_general', 'secretariat_final', 'achizitii_final', 'aprobat']
  return referate.flatMap((referat, index) => {
    const last = referat.status === 'respins' ? 3 : Math.max(0, labels.indexOf(referat.status))
    const steps = labels.slice(0, last + 1)
    const rows = steps.map((step, stepIndex) => ({
      id: `flux-${referat.id}-${stepIndex + 1}`,
      referat_id: referat.id,
      pas: step,
      actiune: stepIndex === 0 ? 'creat' : 'inainteaza',
      user_id: pick(['USR-004', 'USR-008', 'USR-013', 'USR-003', 'USR-002', 'USR-010'], stepIndex),
      user_name: pick(['Vasile Dima', 'Maria Ionescu', 'Oana Barbu', 'Elena Marin', 'Mihai Preda', 'Demo Director'], stepIndex),
      data_actiune: isoDaysAgo(14 - index - stepIndex, 9 + (stepIndex % 6)),
      observatii: stepIndex === 0 ? referat.observatii : ''
    }))
    if (referat.status === 'respins') {
      rows.push({
        id: `flux-${referat.id}-respins`,
        referat_id: referat.id,
        pas: 'respins',
        actiune: 'respins',
        user_id: 'USR-002',
        user_name: 'Mihai Preda',
        data_actiune: isoDaysAgo(7, 15),
        observatii: 'Se completeaza caracteristicile tehnice si se reia fluxul.'
      })
    }
    return rows
  })
}

function buildProcurementOrders(seed) {
  const suppliers = seed.suppliers
  const materials = seed.materials
  return Array.from({ length: 12 }, (_, index) => {
    const first = pick(materials, index)
    const second = pick(materials, index + 7)
    const status = pick(['emisa', 'partial', 'receptionata', 'closed'], index)
    const firstQty = 10 + index * 3
    const secondQty = index % 3 === 0 ? 0 : 4 + index
    const firstPrice = [6.2, 3200, 185, 210, 4.7, 38][index % 6]
    const secondPrice = [18, 42, 85, 155, 32][index % 5]
    const lines = [
      {
        id: `PO-${String(index + 1).padStart(3, '0')}-L1`,
        material_id: first.id,
        materialId: first.id,
        materialName: first.name,
        unit: first.unit,
        cantitate: firstQty,
        amount: firstQty,
        pret: firstPrice,
        unitPrice: firstPrice,
        cpv_cod: first.cpv_cod,
        cantitate_receptionata: ['partial', 'receptionata', 'closed'].includes(status) ? Math.round(firstQty * (status === 'partial' ? 0.45 : 1)) : 0,
        cantitate_ramasa: ['partial'].includes(status) ? Math.round(firstQty * 0.55) : ['receptionata', 'closed'].includes(status) ? 0 : firstQty
      }
    ]
    if (secondQty) {
      lines.push({
        id: `PO-${String(index + 1).padStart(3, '0')}-L2`,
        material_id: second.id,
        materialId: second.id,
        materialName: second.name,
        unit: second.unit,
        cantitate: secondQty,
        amount: secondQty,
        pret: secondPrice,
        unitPrice: secondPrice,
        cpv_cod: second.cpv_cod,
        cantitate_receptionata: ['receptionata', 'closed'].includes(status) ? secondQty : 0,
        cantitate_ramasa: ['receptionata', 'closed'].includes(status) ? 0 : secondQty
      })
    }
    const value = Number(lines.reduce((sum, line) => sum + line.cantitate * line.pret, 0).toFixed(2))
    const receivedAmount = lines.reduce((sum, line) => sum + Number(line.cantitate_receptionata || 0), 0)
    return {
      id: `PO-${String(index + 1).padStart(3, '0')}`,
      uuid: `demo-po-${String(index + 1).padStart(3, '0')}`,
      date: addDays(-18 + index),
      orderNo: `CMD-2026-${String(101 + index).padStart(4, '0')}`,
      supplierId: pick(suppliers, index).id,
      supplierName: pick(suppliers, index).name,
      supplier: pick(suppliers, index).name,
      furnizor: pick(suppliers, index).name,
      lines,
      materialId: first.id,
      materialName: lines.map((line) => line.materialName).join(', '),
      quantity: firstQty,
      amount: lines.reduce((sum, line) => sum + line.cantitate, 0),
      remainingAmount: lines.reduce((sum, line) => sum + line.cantitate_ramasa, 0),
      receivedAmount,
      unit: first.unit,
      unitPrice: firstPrice,
      value,
      status,
      estimatedDate: addDays(-12 + index),
      expectedDate: addDays(5 + index),
      createdAt: isoDaysAgo(20 - index, 11)
    }
  })
}

function buildProcurementReceipts(orders) {
  return orders
    .filter((order) => ['partial', 'receptionata', 'closed'].includes(order.status))
    .map((order, index) => ({
      id: `REC-PO-${String(index + 1).padStart(3, '0')}`,
      uuid: `demo-rec-po-${String(index + 1).padStart(3, '0')}`,
      orderId: order.id,
      orderUuid: order.uuid,
      orderNo: order.orderNo,
      nr_aviz: `AVZ-${2026}-${String(300 + index).padStart(4, '0')}`,
      date: addDays(-8 + index),
      observatii: 'Receptie demo generata automat.',
      createdBy: 'USR-008',
      createdByName: 'Maria Ionescu',
      createdAt: isoDaysAgo(8 - index, 12),
      lines: order.lines
        .filter((line) => Number(line.cantitate_receptionata || 0) > 0)
        .map((line) => ({ material_id: line.material_id, materialName: line.materialName, cantitate_receptionata: line.cantitate_receptionata, unit: line.unit }))
    }))
}

function buildPaapDemo() {
  const year = new Date().getFullYear() + 1
  const rows = [
    ['paap-001', '09134200-9', 'Motorina', 'Motorina Euro 5 pentru utilaje si transport', 'litri', 120000, 780000, 612000, 'Licitatie deschisa', 1, 'Oana Barbu', 'Buget local / venituri proprii', 'Program lucrari drumuri 2027', 'Achizitii'],
    ['paap-002', '44113620-7', 'Bitum', 'Bitum rutier 50/70', 'tone', 420, 1320000, 975000, 'Licitatie deschisa', 1, 'Oana Barbu', 'Venituri proprii', 'Program asfaltare 2027', 'Achizitii'],
    ['paap-003', '14212200-2', 'Agregate', 'Agregate concasate pentru statia de asfalt', 'tone', 2800, 294000, 188000, 'Procedura simplificata', 2, 'Oana Barbu', 'Venituri proprii', 'Program asfaltare 2027', 'Achizitii'],
    ['paap-004', '44811000-8', 'Vopsele', 'Vopsea pentru marcaje rutiere', 'kg', 1600, 52000, 48500, 'Achizitie directa', 2, 'Oana Barbu', 'Buget local', 'Siguranta circulatiei', 'Tehnic'],
    ['paap-005', '18830000-6', 'Incaltaminte de protectie', 'Bocanci si cizme protectie S3', 'per', 210, 46200, 11200, 'Achizitie directa', 3, 'Ana Rusu', 'Buget local', 'Protectia muncii', 'Resurse Umane'],
    ['paap-006', '34992200-9', 'Indicatoare rutiere', 'Indicatoare si semnalizare rutiera temporara', 'buc', 280, 98000, 101500, 'Achizitie directa', 3, 'Oana Barbu', 'Buget local', 'Siguranta circulatiei', 'Tehnic']
  ]
  const paap = rows.map(([id, cpv_cod, cpv_denumire, material, um, cantitate, valoare_estimata, valoare_executata, procedura, trimestru, responsabil_achizitie, modalitate_finantare, obiectiv_strategie_locala, unitate_responsabila], index) => ({
    id,
    an: year,
    cpv_cod,
    cpv_denumire,
    material,
    um,
    cantitate,
    valoare_estimata,
    procedura,
    trimestru,
    valoare_executata,
    sursa: 'demo',
    responsabil_achizitie,
    curs_bnr_eur: 5,
    data_estimata_incepere: `${year}-${String(Math.min(12, trimestru * 3 - 2)).padStart(2, '0')}-15`,
    data_estimata_finalizare: `${year}-${String(Math.min(12, trimestru * 3)).padStart(2, '0')}-28`,
    modalitate_finantare,
    obiectiv_strategie_locala,
    modalitate_desfasurare: 'Online',
    unitate_responsabila,
    created_at: isoDaysAgo(25 - index, 10),
    created_by: 'USR-013'
  }))
  const paapExecutie = paap.map((item, index) => ({
    id: `paap-exec-${String(index + 1).padStart(3, '0')}`,
    paap_id: item.id,
    factura_id: `FACT-DEMO-${String(index + 1).padStart(3, '0')}`,
    comanda_id: `PO-${String(index + 1).padStart(3, '0')}`,
    valoare: item.valoare_executata,
    data: addDays(-20 + index * 3),
    note: 'Executie demo din comenzi si receptii.'
  }))
  return { paap, paapExecutie }
}

function buildHrContracts(employees) {
  return employees.map((employee, index) => ({
    id: `CTR-${String(index + 1).padStart(3, '0')}`,
    employee_id: employee.id,
    nr_contract: `CIM-${2020 + (index % 5)}-${String(index + 11).padStart(4, '0')}`,
    data_start: employee.data_angajare || employee.hire_date,
    tip_contract: employee.tip_contract || 'CIM nedeterminat',
    norma_ore_zi: 8,
    salariu_baza: employee.salariu_baza || employee.salary_gross || 0,
    status: 'activ',
    created_at: isoDaysAgo(30, 8)
  }))
}

function buildTimesheets(employees) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()
  const rows = []
  employees.forEach((employee) => {
    for (let day = 1; day <= Math.max(20, today); day += 1) {
      const date = new Date(year, month, day)
      const weekend = [0, 6].includes(date.getDay())
      const leaveCo = employee.id === 'EMP-006' && day >= 9 && day <= 12
      const leaveCm = employee.id === 'EMP-012' && day >= 4 && day <= 5
      const absent = employee.id === 'EMP-014' && day === 3
      const overtime = !weekend && ['EMP-001', 'EMP-003', 'EMP-011'].includes(employee.id) && [2, 6, 8, 13, 17].includes(day)
      rows.push({
        id: `TS-${employee.id}-${String(day).padStart(2, '0')}`,
        employee_id: employee.id,
        employeeName: employee.name,
        date: localDate(date),
        data: localDate(date),
        ore_lucrate: weekend ? 0 : 8,
        hours: weekend ? 0 : 8,
        tip: weekend ? 'liber' : leaveCo ? 'co' : leaveCm ? 'cm' : absent ? 'absent' : 'lucru',
        ore_suplimentare_s1: overtime ? 2 : 0,
        ore_suplimentare_s2: employee.id === 'EMP-001' && day === 8 ? 1 : 0,
        ore_noapte: employee.id === 'EMP-009' && [5, 12, 19].includes(day) ? 4 : 0,
        cost_center: employee.department_id === 'DEP-002' ? 'DEP-MECAN' : employee.department_id === 'DEP-008' ? 'DEP-SALUB' : 'DEP-TEHNIC',
        validat: day < today - 1,
        observatii: overtime ? 'Ore suplimentare lucrare urgenta' : ''
      })
    }
  })
  return rows
}

function buildLeaveRequests(employees) {
  const employee = (id) => employees.find((item) => item.id === id) || {}
  return [
    { id: 'leave-001', uuid: 'demo-leave-001', employee_id: 'EMP-006', employee_name: employee('EMP-006').name, tip: 'co', data_start: addDays(-1), data_sfarsit: addDays(3), zile: 5, motiv: 'Concediu odihna programat', status: 'aprobata', aprobat_de: 'USR-009', aprobat_la: isoDaysAgo(2, 10), created_at: isoDaysAgo(7, 9) },
    { id: 'leave-002', uuid: 'demo-leave-002', employee_id: 'EMP-012', employee_name: employee('EMP-012').name, tip: 'cm', data_start: addDays(-4), data_sfarsit: addDays(-3), zile: 2, motiv: 'Concediu medical', status: 'aprobat', aprobat_de: 'USR-009', aprobat_la: isoDaysAgo(4, 9), created_at: isoDaysAgo(5, 8) },
    { id: 'leave-003', uuid: 'demo-leave-003', employee_id: 'EMP-001', employee_name: employee('EMP-001').name, tip: 'co', data_start: addDays(14), data_sfarsit: addDays(18), zile: 5, motiv: 'Concediu odihna vara', status: 'cerut', created_at: isoDaysAgo(1, 12) },
    { id: 'leave-004', uuid: 'demo-leave-004', employee_id: 'EMP-014', employee_name: employee('EMP-014').name, tip: 'cfp', data_start: addDays(20), data_sfarsit: addDays(21), zile: 2, motiv: 'Probleme personale', status: 'respinsa', created_at: isoDaysAgo(3, 11), respins_de: 'USR-009', respins_la: isoDaysAgo(2, 14) }
  ]
}

function buildAuthorizations(employees) {
  const authTypes = ['Permis conducere C/CE', 'ISCIR stivuitor', 'Macaragiu', 'Sef santier', 'SSM lucrari drumuri', 'Apt medical']
  return employees.slice(0, 12).map((employee, index) => ({
    id: `AUTH-${String(index + 1).padStart(3, '0')}`,
    uuid: `demo-auth-${String(index + 1).padStart(3, '0')}`,
    employee_id: employee.id,
    employee_name: employee.name,
    tip: pick(authTypes, index),
    tip_autorizatie: pick(authTypes, index),
    numar: `AUT-${2026}-${String(200 + index).padStart(4, '0')}`,
    data_emitere: addDays(-365 + index * 12),
    data_expirare: addDays(pick([-8, 9, 18, 27, 45, 80, 130], index)),
    emitent: pick(['ARR Neamt', 'Medicina Muncii', 'ISCIR', 'SSM Nord Consult'], index),
    observatii: index < 4 ? 'Urmarire scadenta demo' : '',
    created_at: isoDaysAgo(30 - index, 10)
  }))
}

function buildTimesheetDepartments(departments) {
  const luna = new Date().toISOString().slice(0, 7)
  return departments.map((dept, index) => ({
    id: `TD-${String(index + 1).padStart(3, '0')}`,
    luna,
    department_cod: dept.cod || dept.id,
    status: pick(['finalizat', 'in_lucru', 'finalizat', 'necompletat'], index),
    completat_la: index % 4 === 3 ? null : isoDaysAgo(Math.max(0, 3 - index), 15),
    completat_de: pick(['USR-004', 'USR-008', 'USR-009', 'USR-013'], index),
    created_at: isoDaysAgo(10 - index, 8)
  }))
}

function buildHrEquipment(employees) {
  const types = [
    { id: 1, denumire: 'Salopeta', categorie: 'protectie', tip_marimi: 'numeric', durata_luni: 12, are_marime: true, are_serie: false, are_expirare: true, valoare_inventar: 185, cod_articol: 'Ares 82/83', activ: true },
    { id: 2, denumire: 'Bocanci', categorie: 'protectie', tip_marimi: 'numeric', durata_luni: 12, are_marime: true, are_serie: false, are_expirare: true, valoare_inventar: 210, cod_articol: 'Bocanci S3', activ: true },
    { id: 3, denumire: 'Cizme cauciuc', categorie: 'protectie', tip_marimi: 'numeric', durata_luni: 24, are_marime: true, are_serie: false, are_expirare: true, valoare_inventar: 96, cod_articol: 'CIZ-01', activ: true },
    { id: 6, denumire: 'Vesta reflectorizanta', categorie: 'SSM', tip_marimi: 'text', durata_luni: 12, are_marime: true, are_serie: false, are_expirare: true, valoare_inventar: 32, cod_articol: '4100217', activ: true },
    { id: 9, denumire: 'Casca protectie', categorie: 'SSM', tip_marimi: 'text', durata_luni: 36, are_marime: true, are_serie: false, are_expirare: true, valoare_inventar: 58, cod_articol: 'CAS-SSM', activ: true },
    { id: 16, denumire: 'Trusa scule mecanic', categorie: 'scule', tip_marimi: 'text', durata_luni: 0, are_marime: false, are_serie: true, are_expirare: false, valoare_inventar: 850, cod_articol: 'SCULE-MEC', activ: true }
  ]
  const sizes = [
    ...[40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60].map((marime, index) => ({ id: 100 + index, tip_id: 1, marime: String(marime), ordine: index + 1 })),
    ...[38, 39, 40, 41, 42, 43, 44, 45, 46].flatMap((marime, index) => ([{ id: 200 + index, tip_id: 2, marime: String(marime), ordine: index + 1 }, { id: 300 + index, tip_id: 3, marime: String(marime), ordine: index + 1 }])),
    ...['S', 'M', 'L', 'XL'].flatMap((marime, index) => ([{ id: 400 + index, tip_id: 6, marime, ordine: index + 1 }, { id: 500 + index, tip_id: 9, marime, ordine: index + 1 }]))
  ]
  const employeeSizes = employees.flatMap((employee, index) => ([
    { id: `SIZE-${employee.id}-1`, angajat_id: employee.id, tip_id: 1, marime: String(pick([48, 50, 52, 54, 56], index)) },
    { id: `SIZE-${employee.id}-2`, angajat_id: employee.id, tip_id: 2, marime: String(pick([39, 40, 41, 42, 43, 44], index)) },
    { id: `SIZE-${employee.id}-6`, angajat_id: employee.id, tip_id: 6, marime: pick(['M', 'L', 'XL'], index) }
  ]))
  const dotari = employees.flatMap((employee, index) => {
    const base = [
      { tip_id: 1, data_dotare: addDays(pick([-390, -330, -220, -80], index)), marime: String(pick([48, 50, 52, 54, 56], index)), cantitate: 1 },
      { tip_id: 2, data_dotare: addDays(pick([-360, -300, -180, -35], index)), marime: String(pick([39, 40, 41, 42, 43, 44], index)), cantitate: 1 },
      { tip_id: 6, data_dotare: addDays(pick([-340, -250, -90, -20], index)), marime: pick(['M', 'L', 'XL'], index), cantitate: 1 }
    ]
    if (['EMP-004', 'EMP-009'].includes(employee.id)) base.push({ tip_id: 16, data_dotare: addDays(-120), marime: '', cantitate: 1, numar_serie: `SC-${employee.id}` })
    return base.map((item, itemIndex) => {
      const type = types.find((row) => row.id === item.tip_id) || {}
      return {
        id: `DOT-${employee.id}-${itemIndex + 1}`,
        angajat_id: employee.id,
        tip_id: item.tip_id,
        data_dotare: item.data_dotare,
        marime: item.marime,
        cantitate: item.cantitate,
        numar_serie: item.numar_serie || '',
        valoare_inventar: type.valoare_inventar || 0,
        durata_luni: type.durata_luni || 0,
        stare: 'in_uz',
        predat_la_lichidare: false,
        observatii: 'Dotare demo'
      }
    })
  })
  return {
    echipamenteTipuri: types,
    echipamenteMarimi: sizes,
    echipamenteDepartament: [
      { id: 1, departament: 'Mecanizare', tip_id: 1, culoare: 'Bleomarin', cod_articol: 'Ares 82/83', obligatoriu: true },
      { id: 2, departament: 'Mecanizare', tip_id: 2, culoare: 'Negru', cod_articol: 'Bocanci S3', obligatoriu: true },
      { id: 3, departament: 'Salubrizare', tip_id: 6, culoare: 'Reflectorizant', cod_articol: '4100217', obligatoriu: true },
      { id: 4, departament: 'Tehnic', tip_id: 9, culoare: 'Alb', cod_articol: 'CAS-SSM', obligatoriu: true }
    ],
    angajatEchipamente: employeeSizes,
    echipamenteDotari: dotari
  }
}

function hashKioskPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function buildNotifications() {
  return [
    { id: 'notif-001', tip: 'alerta_doc', type: 'alerta_doc', mesaj: 'RCA VEH-002 expirat acum 4 zile!', message: 'RCA VEH-002 expirat acum 4 zile!', urgenta: 'critica', read: false, created_at: isoDaysAgo(1, 8) },
    { id: 'notif-002', tip: 'alerta_doc', type: 'alerta_doc', mesaj: 'ITP UTIL-001 expira in 18 zile.', message: 'ITP UTIL-001 expira in 18 zile.', urgenta: 'ridicata', read: false, created_at: isoDaysAgo(1, 9) },
    { id: 'notif-003', tip: 'alerta_stoc', type: 'alerta_stoc', mesaj: 'Stoc Bitum 50/70 aproape de limita minima.', message: 'Stoc Bitum 50/70 aproape de limita minima.', urgenta: 'ridicata', read: false, created_at: isoDaysAgo(2, 10) },
    { id: 'notif-004', tip: 'aprobare', type: 'aprobare', mesaj: 'Referatul REFNEC-2026-0015 asteapta aprobarea ta.', message: 'Referatul REFNEC-2026-0015 asteapta aprobarea ta.', urgenta: 'normala', read: false, created_at: isoDaysAgo(2, 13) },
    { id: 'notif-005', tip: 'info', type: 'info', mesaj: 'Foaia de parcurs FP-2026-0031 a fost inchisa de Ion Popescu.', message: 'Foaia de parcurs FP-2026-0031 a fost inchisa de Ion Popescu.', urgenta: 'scazuta', read: true, created_at: isoDaysAgo(3, 15) },
    { id: 'notif-006', tip: 'alerta_hr', type: 'alerta_hr', mesaj: '3 autorizatii HR expira in urmatoarele 30 zile.', message: '3 autorizatii HR expira in urmatoarele 30 zile.', urgenta: 'normala', read: false, created_at: isoDaysAgo(4, 12) },
    { id: 'notif-007', tip: 'mediu', type: 'mediu', mesaj: 'Raportul deseuri luna curenta este in lucru.', message: 'Raportul deseuri luna curenta este in lucru.', urgenta: 'scazuta', read: true, created_at: isoDaysAgo(5, 9) },
    { id: 'notif-008', tip: 'controlling', type: 'controlling', mesaj: 'Centrul SUB-BASC a consumat 78% din bugetul lunar.', message: 'Centrul SUB-BASC a consumat 78% din bugetul lunar.', urgenta: 'normala', read: false, created_at: isoDaysAgo(5, 14) },
    { id: 'notif-009', tip: 'chat', type: 'chat', mesaj: 'Mesaj nou in #mecanizare.', message: 'Mesaj nou in #mecanizare.', urgenta: 'scazuta', read: false, created_at: isoDaysAgo(0, 11) },
    { id: 'notif-010', tip: 'achizitii', type: 'achizitii', mesaj: 'Comanda CMD-2026-0104 este gata de receptie.', message: 'Comanda CMD-2026-0104 este gata de receptie.', urgenta: 'normala', read: false, created_at: isoDaysAgo(1, 16) }
  ]
}

function buildMessaging() {
  const channels = [
    { id: 'ch-001', tip: 'departament', type: 'departament', nume: '#mecanizare', name: '#mecanizare', members: ['sef.mecanizare', 'sofer1', 'sofer2'] },
    { id: 'ch-002', tip: 'departament', type: 'departament', nume: '#gestiune', name: '#gestiune', members: ['sef.gestiune', 'gestionar'] },
    { id: 'ch-003', tip: 'direct', type: 'direct', nume: 'director - sef.mecanizare', name: 'director - sef.mecanizare', members: ['director', 'sef.mecanizare'] }
  ]
  const samples = [
    'Am incarcat foile de parcurs pe ziua de azi.',
    'Confirm receptia materialelor, verific cantitatile.',
    'Trimitem autobasculanta la DJ207B dupa ora 11.',
    'Referatul pentru filtre este in aprobare.',
    'Verificam stocul de motorina la final de schimb.',
    'Programarea pentru finisor ramane valabila.'
  ]
  const messages = channels.flatMap((channel, channelIndex) =>
    Array.from({ length: 6 }, (_, index) => ({
      id: `msg-${channel.id}-${index + 1}`,
      channel_id: channel.id,
      channelId: channel.id,
      author: pick(channel.members, index),
      userName: pick(channel.members, index),
      text: pick(samples, index + channelIndex),
      created_at: isoDaysAgo(3 - Math.floor(index / 2), 8 + index)
    }))
  )
  return { channels, messages }
}

function buildCostEntries() {
  const month = new Date().toISOString().slice(0, 7) + '-01'
  return [
    { id: 'cost-001', cost_center_id: 'SUB-BASC', categorie: 'combustibil', descriere: 'Motorina autobasculante', valoare: 18400, data: addDays(-8), luna: month, validat: true },
    { id: 'cost-002', cost_center_id: 'SUB-FINISOR', categorie: 'mentenanta', descriere: 'Revizie finisor asfalt', valoare: 6200, data: addDays(-11), luna: month, validat: true },
    { id: 'cost-003', cost_center_id: 'DEP-SALUB', categorie: 'materiale', descriere: 'Consumabile salubrizare', valoare: 9800, data: addDays(-6), luna: month, validat: true },
    { id: 'cost-004', cost_center_id: 'DEP-TEHNIC', categorie: 'materiale', descriere: 'Marcaje si indicatoare', valoare: 4300, data: addDays(-3), luna: month, validat: true }
  ]
}

function buildMechanizationDemo() {
  const month = new Date().toISOString().slice(0, 7)
  const today = addDays(0)
  const plannings = [
    { id: 'plan-001', date: today, asset_id: 'VEH-001', asset_name: 'Autobasculanta MAN TGS 35.460 / NT-01-ABC', department: 'Tehnic', job_name: 'Reabilitare DJ207B km 3+000 - km 8+500', operator: 'Ion Popescu', ora_start: '07:00', ora_sfarsit: '15:00', status: 'planificat', observatii: 'Transport agregate' },
    { id: 'plan-002', date: today, asset_id: 'UTIL-005', asset_name: 'Finisor asfalt Vogele S1800', department: 'Tehnic', job_name: 'Reabilitare DJ207B km 3+000 - km 8+500', operator: 'Florin Lazar', ora_start: '08:00', ora_sfarsit: '16:00', status: 'planificat', observatii: 'Asternere mixtura' },
    { id: 'plan-003', date: today, asset_id: 'UTIL-006', asset_name: 'Cilindru compactor Hamm HD120', department: 'Tehnic', job_name: 'Reabilitare DJ207B km 3+000 - km 8+500', operator: 'Sorin Munteanu', ora_start: '08:00', ora_sfarsit: '16:00', status: 'planificat', observatii: 'Compactare' }
  ]
  const workOrders = [
    { id: 'wo-001', date: today, asset_id: 'VEH-001', asset_name: 'Autobasculanta MAN TGS 35.460 / NT-01-ABC', operator: 'Ion Popescu', activitate: 'Transport criblura 4-8mm', locatie: 'DJ207B km 3+500', ore_lucrate: 7.5, km_parcursi: 84, consum_carburant: 38, consum_normat: 34, cost_center_id: 'SUB-BASC', status: 'activ', observatii: '2 curse depozit - santier' },
    { id: 'wo-002', date: today, asset_id: 'UTIL-005', asset_name: 'Finisor asfalt Vogele S1800', operator: 'Florin Lazar', activitate: 'Asternere BA16', locatie: 'DJ207B km 4+100', ore_lucrate: 6.5, km_parcursi: 0, consum_carburant: 52, consum_normat: 50, cost_center_id: 'SUB-FINISOR', status: 'activ', observatii: 'Front lucru deschis' },
    { id: 'wo-003', date: addDays(-1), asset_id: 'UTIL-006', asset_name: 'Cilindru compactor Hamm HD120', operator: 'Sorin Munteanu', activitate: 'Compactare strat uzura', locatie: 'DJ207B', ore_lucrate: 8, km_parcursi: 0, consum_carburant: 46, consum_normat: 48, cost_center_id: 'DEP-MECAN', status: 'inchis', observatii: 'Finalizat fara abateri' },
    { id: 'wo-004', date: `${month}-03`, asset_id: 'VEH-003', asset_name: 'Autobasculanta Volvo FMX / NT-03-CDE', operator: 'Gheorghe Constantin', activitate: 'Transport mixtura asfaltica', locatie: 'DN15 Piatra-Neamt', ore_lucrate: 7, km_parcursi: 96, consum_carburant: 44, consum_normat: 40, cost_center_id: 'SUB-BASC', status: 'inchis', observatii: 'Consum usor peste norma din cauza stationarii' }
  ]
  const fuelLogs = [
    { id: 'fuel-001', data: today, asset_id: 'VEH-001', asset_name: 'Autobasculanta MAN TGS 35.460 / NT-01-ABC', nr_document: 'BF-2401', furnizor: 'PETROM SA', cantitate_litri: 160, pret_litru: 7.42, valoare_totala: 1187.2, km_ore: 48320, sofer_operator: 'Ion Popescu', cost_center_id: 'SUB-BASC' },
    { id: 'fuel-002', data: today, asset_id: 'UTIL-005', asset_name: 'Finisor asfalt Vogele S1800', nr_document: 'BF-2402', furnizor: 'PETROM SA', cantitate_litri: 120, pret_litru: 7.42, valoare_totala: 890.4, km_ore: 2010, sofer_operator: 'Florin Lazar', cost_center_id: 'SUB-FINISOR' },
    { id: 'fuel-003', data: addDays(-1), asset_id: 'UTIL-006', asset_name: 'Cilindru compactor Hamm HD120', nr_document: 'BF-2398', furnizor: 'PETROM SA', cantitate_litri: 95, pret_litru: 7.39, valoare_totala: 702.05, km_ore: 2470, sofer_operator: 'Sorin Munteanu', cost_center_id: 'DEP-MECAN' },
    { id: 'fuel-004', data: `${month}-03`, asset_id: 'VEH-003', asset_name: 'Autobasculanta Volvo FMX / NT-03-CDE', nr_document: 'BF-2360', furnizor: 'PETROM SA', cantitate_litri: 140, pret_litru: 7.35, valoare_totala: 1029, km_ore: 76520, sofer_operator: 'Gheorghe Constantin', cost_center_id: 'SUB-BASC' }
  ]
  const interventions = [
    { id: 'int-001', asset_id: 'UTIL-002', asset_name: 'Excavator Komatsu PC210', data_intrare: addDays(-2), tip: 'reparatie', descriere: 'Pierdere ulei hidraulic - verificare furtun presiune', status: 'in_lucru', cost_piese: 1250, cost_manopera: 600, cost_extern: 0, cost_total: 1850, mecanic: 'Cristian Pavel', cost_center_id: 'SUB-EXC3' },
    { id: 'int-002', asset_id: 'VEH-002', asset_name: 'Autobasculanta DAF CF 85.360 / NT-02-BCD', data_intrare: `${month}-04`, data_iesire: `${month}-05`, tip: 'revizie', descriere: 'Schimb filtre si ulei', status: 'finalizat', cost_piese: 980, cost_manopera: 320, cost_extern: 0, cost_total: 1300, mecanic: 'Cristian Pavel', cost_center_id: 'SUB-BASC' }
  ]
  return { plannings, workOrders, fuelLogs, interventions, fazReports: [] }
}

function buildDb(seed) {
  const passwordHash = hashPassword('demo123')
  const userEmployeeMap = {
    director: 'EMP-007',
    contabil: 'EMP-005',
    'sef.mecanizare': 'EMP-004',
    'sef.gestiune': 'EMP-008',
    sofer1: 'EMP-001',
    sofer2: 'EMP-003',
    gestionar: 'EMP-002',
    hr: 'EMP-006'
  }
  const users = seed.users.map((user) => ({
    ...user,
    employee_id: user.employee_id || userEmployeeMap[user.username] || '',
    employeeId: user.employeeId || userEmployeeMap[user.username] || '',
    passwordHash,
    createdAt: isoDaysAgo(20, 8),
    demoHint: user.username === 'director' ? 'Cont director: aproba referate, vede mecanizare, HR sumar si controlling.' : undefined
  }))
  const hrEmployees = buildHrEmployees(seed)
  const timesheets = buildTimesheets(hrEmployees)
  const leaveRequests = buildLeaveRequests(hrEmployees)
  const authorizations = buildAuthorizations(hrEmployees)
  const hrContracts = buildHrContracts(hrEmployees)
  const timesheetDepartments = buildTimesheetDepartments(seed.departments)
  const hrEquipment = buildHrEquipment(hrEmployees)
  const fleetAssets = withFleetDueDates(seed.fleet_assets)
  const costCenters = seed.cost_centers.map((center) => ({
    ...center,
    cod: center.cod || center.code || center.id,
    denumire: center.denumire || center.name,
    name: center.name || center.denumire,
    buget_lunar: Number(center.buget_lunar || center.monthly_budget || 0),
    buget_anual: Number(center.buget_anual || center.monthly_budget * 12 || 0),
    activ: center.activ !== false,
    nivel: center.parent_id ? 2 : 1,
    parinte_id: center.parent_id || null
  }))
  const stockEntries = buildStockEntries(seed.materials)
  const stockOperations = buildStockOperations(seed.materials)
  const tripLogs = buildTripLogs(seed)
  const gpsPositions = buildGps(seed)
  const referate = buildReferate(seed)
  const referateFlux = buildReferateFlux(referate)
  const procurementOrders = buildProcurementOrders(seed)
  const procurementReceipts = buildProcurementReceipts(procurementOrders)
  const paapDemo = buildPaapDemo()
  const messaging = buildMessaging()
  const mechanization = buildMechanizationDemo()
  const db = {
    company: seed.company,
    settings: {
      ...seed.settings,
      scaleProductMap: {
        'BITUM 50/70': 'MAT-001',
        'CRIBLURA 4-8': 'MAT-003',
        MOTORINA: 'MAT-007',
        'VOPSEA MARCAJ ALB': 'MAT-010'
      }
    },
    users,
    roles: [],
    departments: seed.departments,
    permissions: [],
    role_permissions: [],
    cost_centers: costCenters,
    costCenters,
    employees: hrEmployees,
    hr: {
      employees: hrEmployees,
      timesheets,
      timeSheets: timesheets,
      leaveRequests,
      authorizations,
      contracts: hrContracts,
      timesheetDepartments,
      training: [
        { id: 'TR-001', titlu: 'Instruire SSM lucrari drumuri', data_start: addDays(-3), data_sfarsit: addDays(-3), furnizor: 'SSM Nord Consult', status: 'finalizat' },
        { id: 'TR-002', titlu: 'Operator utilaje - reinstruire periodica', data_start: addDays(8), data_sfarsit: addDays(8), furnizor: 'ISCIR Training', status: 'planificat' }
      ],
      trainingEmployees: [],
      evaluations: [],
      tures: [
        { id: 1, nume: 'Tura I', ora_start: '06:00', ora_sfarsit: '14:00', ore_normale: 8, culoare: '#F59E0B', activ: true },
        { id: 2, nume: 'Tura II', ora_start: '14:00', ora_sfarsit: '22:00', ore_normale: 8, culoare: '#0EA5E9', activ: true },
        { id: 3, nume: 'Normal', ora_start: '08:00', ora_sfarsit: '16:00', ore_normale: 8, culoare: '#10B981', activ: true }
      ],
      schedules: [],
      overtimeCompensations: [
        { id: 'OTC-001', employee_id: 'EMP-001', ore: 8, tip: 'timp_liber', data: addDays(-12), created_by: 'USR-009', created_at: isoDaysAgo(12, 10) }
      ],
      kioskUsers: [
        { id: 1, uuid: 'demo-kiosk-sofer1', employee_id: 'EMP-001', username: 'sofer1', passwordHash: hashKioskPassword('demo123'), act_tip: 'CI', activ: true, created_at: isoDaysAgo(20, 8) }
      ],
      kioskResetCodes: [],
      mealTicketsConfig: { valoare_tichet: 40 },
      ...hrEquipment
    },
    fleetAssets,
    fleet: { assets: fleetAssets, tripLogs },
    fleetTripLogs: tripLogs,
    materials: seed.materials.map((material) => {
      const demoStock = material.id === 'MAT-001' ? 8.2 : material.stock
      return { ...material, stock: demoStock, stoc_curent: demoStock, stockMin: material.alert }
    }),
    inventory: {
      materials: seed.materials,
      movements: stockOperations,
      stockOperations,
      department_stocks: [],
      stock_transfers: [],
      department_consumptions: []
    },
    stock_entries: stockEntries,
    stockEntries,
    stock_operations: stockOperations,
    stockMovements: stockOperations,
    suppliers: seed.suppliers,
    clients: [],
    projects: seed.projects.map((project) => ({
      ...project,
      progressPercent: Number(project.procent_fizic || project.progressPercent || 0),
      progres_fizic_procent: Number(project.procent_fizic || project.progres_fizic_procent || 0)
    })),
    work: {
      projects: seed.projects.map((project) => ({
        ...project,
        progressPercent: Number(project.procent_fizic || project.progressPercent || 0),
        progres_fizic_procent: Number(project.procent_fizic || project.progres_fizic_procent || 0)
      }))
    },
    recipes: [
      { id: 'REC-001', name: 'BA16 rul 50/70', active: true },
      { id: 'REC-002', name: 'BAD22.4 leg 50/70', active: true }
    ],
    environment_reports: seed.environment_reports,
    environment: { reports: seed.environment_reports },
    procurement_orders: procurementOrders,
    procurementOrders,
    procurementReceipts,
    procurement_requirements: referate,
    consumptions: [
      { id: 'cons-000', date: addDays(0), recipeId: 'REC-001', recipeName: 'BA16 rul 50/70', reportNo: 'RZ-2026-AZI', ticket: 'TIC-2406', asphalt: 124, jobName: 'DJ207B', operatorName: 'Operator Demo', createdAt: isoDaysAgo(0, 10) },
      { id: 'cons-001', date: addDays(-5), recipeId: 'REC-001', recipeName: 'BA16 rul 50/70', asphalt: 86, jobName: 'DJ207B', createdAt: isoDaysAgo(5, 13) },
      { id: 'cons-002', date: addDays(-3), recipeId: 'REC-002', recipeName: 'BAD22.4 leg 50/70', asphalt: 54, jobName: 'MARC-DN15', createdAt: isoDaysAgo(3, 12) }
    ],
    department_consumptions: [],
    fleet_work_logs: [
      { id: 'fwl-001', assetId: 'UTIL-005', assetName: 'Finisor asfalt Vogele S1800', date: addDays(-4), hours: 7.5, jobName: 'DJ207B', costCenterId: 'SUB-FINISOR' },
      { id: 'fwl-002', assetId: 'UTIL-001', assetName: 'Excavator Liebherr R926', date: addDays(-2), hours: 6, jobName: 'Canalizare Str. Mihail Kogalniceanu', costCenterId: 'SUB-EXC3' }
    ],
    mechanization,
    technicalWorkLogs: [],
    fleetRequests: [
      { id: 'fr-001', assetId: 'VEH-001', date: addDays(1), startTime: '07:00', endTime: '15:00', department: 'Tehnic', jobName: 'Reabilitare DJ207B km 3+000 - km 8+500', status: 'approved', createdAt: isoDaysAgo(1, 10) },
      { id: 'fr-002', assetId: 'UTIL-005', date: addDays(2), startTime: '08:00', endTime: '16:00', department: 'Tehnic', jobName: 'Reabilitare DJ207B km 3+000 - km 8+500', status: 'planned', createdAt: isoDaysAgo(0, 9) }
    ],
    fleet_requests: [],
    timesheets,
    leave_requests: leaveRequests,
    trip_logs: tripLogs,
    gps_positions: gpsPositions,
    referate,
    referateFlux,
    referateCounters: [{ an: new Date().getFullYear(), last_nr: 126 }],
    notifications: buildNotifications(),
    audit: [
      { id: 'audit-001', action: 'demo_seed', details: 'Date demo generate', createdAt: new Date().toISOString(), userName: 'Sistem' }
    ],
    messages: messaging.messages,
    message_channels: messaging.channels,
    messaging: { channels: messaging.channels, messages: messaging.messages },
    departmentRequests: [
      { id: 'dreq-001', type: 'material', materialId: 'MAT-001', materialName: 'Bitum 50/70', amount: 24, unit: 'tone', department: 'Tehnic', status: 'approved', jobName: 'Reabilitare DJ207B km 3+000 - km 8+500', createdAt: isoDaysAgo(2, 9) },
      { id: 'dreq-002', type: 'material', materialId: 'MAT-010', materialName: 'Vopsea marcaj alb', amount: 720, unit: 'kg', department: 'Tehnic', status: 'planned', jobName: 'Marcaje rutiere DN15 Piatra-Neamt', createdAt: isoDaysAgo(3, 11) },
      { id: 'dreq-003', type: 'material', materialId: 'MAT-025', materialName: 'Sare industriala', amount: 130, unit: 'tone', department: 'Salubrizare', status: 'planned', jobName: 'Stoc preventiv iarna', createdAt: isoDaysAgo(4, 10) }
    ],
    department_requests: [
      { id: 'dr-001', type: 'material', itemName: 'Criblura 4-8mm', amount: 45, unit: 'tone', department: 'Tehnic', status: 'planned', jobName: 'Reabilitare DJ207B km 3+000 - km 8+500', createdAt: isoDaysAgo(7, 9) }
    ],
    documents: [],
    cost_entries: buildCostEntries(),
    controlling: { costCenters, costEntries: buildCostEntries(), entries: buildCostEntries(), costCenterObjects: [] },
    paap: paapDemo.paap,
    paapExecutie: paapDemo.paapExecutie,
    devices: [],
    workstationRequests: [],
    _demo_mode: true,
    _seed_version: '2.12.23',
    _seeded_at: new Date().toISOString()
  }
  return db
}

ensureDir(path.join(ROOT, 'data'))
ensureDir(path.join(ROOT, 'logs'))

if (!fs.existsSync(SEED_FILE)) {
  console.error('EROARE: data/demo-seed.json nu exista.')
  process.exit(1)
}

const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))
const db = buildDb(seed)
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8')

console.log('=== InfraFlow Demo Seed generat ===')
console.log('Fisier:', DB_FILE)
console.log('Users:', db.users.length)
console.log('Angajati:', db.employees.length)
console.log('Fleet assets:', db.fleetAssets.length)
console.log('Materiale:', db.materials.length)
console.log('Foi parcurs:', db.trip_logs.length)
console.log('GPS pozitii:', db.gps_positions.length)
console.log('Notificari:', db.notifications.length)
console.log('')
console.log('Parola demo pentru toti utilizatorii: demo123')
console.log('Porneste serverul: .\\scripts\\windows\\start-demo.ps1')
