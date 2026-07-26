const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('./core/db')
const { notifyUser } = require('./modules/messaging/routes')
const { checkTicketAlerts } = require('./modules/tickets/scheduler')
const { syncIncomingEmails } = require('./modules/messaging/email-sync')

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const EMAIL_SYNC_TICK_MS = 5 * 60 * 1000
const runtimeNotificationKeys = new Set()
let emailSyncRunning = false

function isMssqlMode() {
  return MSSQL_RELATIONAL_MODE && (DB_MODE === 'mssql' || DB_MODE === 'sqlserver')
}

function timestamp() {
  return new Date().toISOString()
}

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  if (!String(result || '').trim()) return null
  return JSON.parse(result)
}

function mssqlArray(sql, params = {}) {
  return mssqlJson(sql, params) || []
}

function daysUntil(value) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
}

function daysSince(value) {
  if (!value) return Infinity
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
}

function ensureNotificationsDb(db) {
  db.notifications = Array.isArray(db.notifications) ? db.notifications : []
  return db.notifications
}

function notificationKey(userId, event, entityKey) {
  return `${userId}|${event}|${entityKey}`
}

function unreadNotificationExists(db, userId, event, entityKey) {
  const key = notificationKey(userId, event, entityKey)
  if (runtimeNotificationKeys.has(key)) return true
  return ensureNotificationsDb(db).some(item =>
    String(item.user_id) === String(userId) &&
    item.event === event &&
    String(item.entity_key) === String(entityKey) &&
    !item.read_at &&
    item.read !== true
  )
}

function queueNotification(db, userId, event, entityKey, payload) {
  if (!userId || unreadNotificationExists(db, userId, event, entityKey)) return false
  runtimeNotificationKeys.add(notificationKey(userId, event, entityKey))
  ensureNotificationsDb(db).push({
    id: ensureNotificationsDb(db).length + 1,
    user_id: userId,
    event,
    entity_key: String(entityKey),
    title: payload.title || payload.message || event,
    message: payload.message || payload.title || event,
    data: payload,
    created_at: timestamp(),
    read_at: null
  })
  notifyUser(userId, event, payload)
  return true
}

function users(db) {
  return db.users || db.core?.users || []
}

function departments(db) {
  return db.departments || db.core?.departments || []
}

function departmentByCode(db, codes) {
  const expected = new Set(codes.map(code => String(code).toUpperCase()))
  return departments(db).filter(dept => expected.has(String(dept.cod || dept.code || '').toUpperCase()))
}

function usersInDepartments(db, codes) {
  const ids = new Set(departmentByCode(db, codes).map(dept => String(dept.id)))
  return users(db).filter(user => ids.has(String(user.department_id || user.departmentId)))
}

function usersByRole(db, roles) {
  const expected = new Set(roles.map(role => String(role).toLowerCase()))
  return users(db).filter(user => expected.has(String(user.role || '').toLowerCase()))
}

function usersWithPermission(db, permission) {
  return users(db).filter(user =>
    user.role === 'superadmin' ||
    user.role === 'admin' ||
    (user.permissions || []).includes(permission)
  )
}

function isSnowSeason() {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  return (month === 11 && day >= 15) ||
         month === 12 || month === 1 ||
         month === 2 || month === 3 ||
         (month === 4 && day <= 15)
}

function uniqueUsers(...groups) {
  const seen = new Set()
  return groups.flat().filter(user => {
    if (!user?.id || seen.has(String(user.id))) return false
    seen.add(String(user.id))
    return true
  })
}

function mssqlUsersByDepartmentCodes(codes) {
  return mssqlArray(`
SELECT u.id
FROM core.users u
JOIN core.departments d ON d.id = u.department_id
WHERE UPPER(d.cod) IN (SELECT UPPER(value) FROM OPENJSON(JSON_QUERY(@p, '$.codes')))
FOR JSON PATH;
`, { codes })
}

function mssqlDirectorUsers() {
  return mssqlArray(`
SELECT id
FROM core.users
WHERE role IN (N'director', N'director_general', N'manager', N'admin', N'superadmin')
FOR JSON PATH;
`)
}

function notifyMany(db, recipients, event, entityKey, payload) {
  recipients.forEach(user => queueNotification(db, user.id || user, event, entityKey, payload))
}

async function safeRun(name, fn, db) {
  console.log(`[${timestamp()}] scheduler ${name} start`)
  try {
    const result = await fn(db)
    console.log(`[${timestamp()}] scheduler ${name} ok`, result || '')
    return result
  } catch (error) {
    console.error(`[${timestamp()}] scheduler ${name} error:`, error)
    return null
  }
}

// Verifică proiecte cu cantități noi din teren neexportate
async function checkInterstoftPendingExports(db) {
  if (isMssqlMode()) {
    const rows = mssqlArray(`
SELECT DISTINCT ip.id, ip.denumire_intersoft, u.id as responsabil_id
FROM integration.intersoft_projects ip
JOIN work.projects wp ON wp.id = ip.santier_id
JOIN field.site_journals sj ON sj.santier_id = wp.id
JOIN field.journal_activities ja ON ja.journal_id = sj.id
JOIN core.users u ON u.department_id = (
  SELECT id FROM core.departments WHERE cod = 'TEHNIC'
)
WHERE ip.activ = 1
AND sj.data = CAST(GETDATE() AS DATE)
AND ja.articol_deviz IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM integration.intersoft_sync_log sl
  WHERE sl.project_id = ip.id
  AND sl.tip = 'export_cantitati'
  AND CAST(sl.created_at AS DATE) = CAST(GETDATE() AS DATE)
)
FOR JSON PATH;
`)
    rows.forEach(row => notifyUser(row.responsabil_id, 'intersoft_export_pending', {
      project_id: row.id,
      message: `Există cantități noi din teren pentru ${row.denumire_intersoft} ce pot fi exportate spre Intersoft`
    }))
    return { rows: rows.length }
  }

  const source = db || readDb()
  const integration = source.integration || {}
  const field = source.field || {}
  const today = new Date().toISOString().slice(0, 10)
  const responsabili = usersInDepartments(source, ['TEHNIC'])
  const projects = integration.intersoftProjects || []
  const syncLog = integration.intersoftSyncLog || []
  const journals = field.siteJournals || []
  const activities = field.journalActivities || []

  const rows = projects.filter(project => {
    if (project.activ === false) return false
    const journalIds = new Set(journals
      .filter(journal => String(journal.santier_id) === String(project.santier_id) && String(journal.data || '').slice(0, 10) === today)
      .map(journal => journal.id))
    const hasNewQuantities = activities.some(activity => journalIds.has(activity.journal_id) && activity.articol_deviz)
    const exportedToday = syncLog.some(log => Number(log.project_id) === Number(project.id)
      && log.tip === 'export_cantitati'
      && String(log.created_at || '').slice(0, 10) === today)
    return hasNewQuantities && !exportedToday
  })

  rows.forEach(project => responsabili.forEach(user => notifyUser(user.id, 'intersoft_export_pending', {
    project_id: project.id,
    message: `Există cantități noi din teren pentru ${project.denumire_intersoft} ce pot fi exportate spre Intersoft`
  })))
  return { rows: rows.length }
}

function checkAuthorizationExpiry(db) {
  if (isMssqlMode()) {
    const rows = mssqlArray(`
SELECT a.*, e.nume, e.prenume, e.department_id, e.user_id
FROM hr.authorizations a
JOIN hr.employees e ON e.id = a.employee_id
WHERE DATEDIFF(day, GETDATE(), a.data_expirare) BETWEEN 0 AND 30
AND a.activ = 1
AND (a.alertat_la IS NULL OR DATEDIFF(day, a.alertat_la, GETDATE()) >= 7)
FOR JSON PATH;
`)
    rows.forEach(row => {
      const recipients = [...mssqlUsersByDepartmentCodes(['RU']).map(item => item.id), row.user_id].filter(Boolean)
      recipients.forEach(userId => queueNotification(db, userId, 'hr_authorization_expiry', `hr_authorization:${row.id}`, { authorization: row }))
      runMssqlScalar(`UPDATE hr.authorizations SET alertat_la = GETDATE() WHERE id = ${Number(row.id)}; SELECT 1;`)
    })
    return { rows: rows.length }
  }

  const hr = db.hr || {}
  const authorizations = hr.authorizations || []
  const employees = hr.employees || []
  const ruManagers = uniqueUsers(usersInDepartments(db, ['RU']), usersWithPermission(db, 'hr:manage'))
  let count = 0
  authorizations.forEach(auth => {
    const days = daysUntil(auth.data_expirare)
    if (days === null || days < 0 || days > 30 || auth.activ === false || daysSince(auth.alertat_la) < 7) return
    const employee = employees.find(item => String(item.id) === String(auth.employee_id)) || {}
    notifyMany(db, [...ruManagers, ...users(db).filter(user => String(user.id) === String(employee.user_id))], 'hr_authorization_expiry', `hr_authorization:${auth.id}`, { authorization: auth, employee })
    auth.alertat_la = timestamp()
    count += 1
  })
  return { rows: count }
}

function checkPermitExpiry(db) {
  if (isMssqlMode()) {
    const rows = mssqlArray(`
SELECT *
FROM environment.autorizatii
WHERE DATEDIFF(day, GETDATE(), data_expirare) BETWEEN 0 AND 60
AND status = N'valida'
AND (alertat_la IS NULL OR DATEDIFF(day, alertat_la, GETDATE()) >= 7)
FOR JSON PATH;
`)
    const recipients = [...mssqlUsersByDepartmentCodes(['MEDIU', 'PROTECTIA_MEDIULUI']).map(item => item.id), ...mssqlDirectorUsers().map(item => item.id)]
    rows.forEach(row => {
      recipients.forEach(userId => queueNotification(db, userId, 'environment_permit_expiry', `environment_permit:${row.id}`, { permit: row }))
      runMssqlScalar(`UPDATE environment.autorizatii SET alertat_la = GETDATE() WHERE id = ${Number(row.id)}; SELECT 1;`)
    })
    return { rows: rows.length }
  }

  const permits = db.environment?.autorizatii || db.environment?.permits || []
  const recipients = uniqueUsers(usersInDepartments(db, ['MEDIU', 'PROTECTIA_MEDIULUI']), usersByRole(db, ['director', 'director_general', 'manager', 'admin', 'superadmin']))
  let count = 0
  permits.forEach(permit => {
    const days = daysUntil(permit.data_expirare)
    if (days === null || days < 0 || days > 60 || permit.status !== 'valida' || daysSince(permit.alertat_la) < 7) return
    notifyMany(db, recipients, 'environment_permit_expiry', `environment_permit:${permit.id}`, { permit })
    permit.alertat_la = timestamp()
    count += 1
  })
  return { rows: count }
}

function checkEnvironmentDailyAlerts(db) {
  const env = db.environment || {}
  const currentYear = new Date().getFullYear()
  const recipients = uniqueUsers(
    usersInDepartments(db, ['MEDIU', 'PROTECTIA_MEDIULUI']),
    usersByRole(db, ['director', 'director_general', 'manager', 'admin', 'superadmin']),
    usersWithPermission(db, 'environment:manage')
  )
  let count = 0

  ;(env.monitorizare || env.monitoring || []).forEach(row => {
    if (!row.depasit) return
    notifyMany(db, recipients, 'environment_monitoring_exceeded', `environment_monitoring:${row.id}`, {
      title: 'Depășire indicator mediu',
      message: `${row.indicator || 'Indicator'} depășit la ${row.punct || 'punct monitorizare'}.`,
      row
    })
    count += 1
  })

  if (!(env.deseuri || []).some(row => Number(row.an) === currentYear)) {
    notifyMany(db, recipients, 'environment_report_missing', `environment_proddes_missing:${currentYear}`, {
      title: 'Raportare PRODDES lipsă',
      message: `Nu există înregistrări PRODDES pentru anul ${currentYear}.`
    })
    count += 1
  }

  if (!(env.deseuriMunicipale || []).some(row => Number(row.an) === currentYear)) {
    notifyMany(db, recipients, 'environment_report_missing', `environment_mun_missing:${currentYear}`, {
      title: 'Raportare MUN lipsă',
      message: `Nu există înregistrări deșeuri municipale pentru anul ${currentYear}.`
    })
    count += 1
  }

  return { rows: count }
}

function checkContractExpiry(db) {
  if (isMssqlMode()) {
    const rows = mssqlArray(`
SELECT *
FROM legal.contracts
WHERE DATEDIFF(day, GETDATE(), data_sfarsit) BETWEEN 0 AND 30
AND status IN (N'semnat', N'in_executie')
FOR JSON PATH;
`)
    const legalUsers = mssqlUsersByDepartmentCodes(['JURIDIC']).map(item => item.id)
    rows.forEach(row => [row.responsabil_id, ...legalUsers].filter(Boolean).forEach(userId => queueNotification(db, userId, 'legal_contract_expiry', `legal_contract:${row.id}`, { contract: row })))
    return { rows: rows.length }
  }

  const contracts = db.legal?.contracts || []
  const legalUsers = usersInDepartments(db, ['JURIDIC'])
  let count = 0
  contracts.forEach(contract => {
    const days = daysUntil(contract.data_sfarsit)
    if (days === null || days < 0 || days > 30 || !['semnat', 'in_executie'].includes(contract.status)) return
    notifyMany(db, [...legalUsers, ...users(db).filter(user => String(user.id) === String(contract.responsabil_id))], 'legal_contract_expiry', `legal_contract:${contract.id}`, { contract })
    count += 1
  })
  return { rows: count }
}

function checkRegistryDeadlines(db) {
  if (isMssqlMode()) {
    const rows = mssqlArray(`
SELECT cr.*, r.nr_inregistrare, r.subiect
FROM secretariat.correspondence_tracking cr
JOIN secretariat.registry r ON r.id = cr.registry_id
WHERE cr.termen_raspuns < GETDATE()
AND cr.status NOT IN (N'raspuns_dat')
FOR JSON PATH;
`)
    const admins = mssqlUsersByDepartmentCodes(['SECRETARIAT']).map(item => item.id)
    rows.forEach(row => [row.user_id, ...admins].filter(Boolean).forEach(userId => queueNotification(db, userId, 'secretariat_deadline_overdue', `secretariat_tracking:${row.id}`, { tracking: row })))
    return { rows: rows.length }
  }

  const sec = db.secretariat || {}
  const rows = sec.correspondenceTracking || []
  const registry = sec.registry || []
  const admins = usersInDepartments(db, ['SECRETARIAT'])
  const today = new Date()
  let count = 0
  rows.forEach(row => {
    if (!row.termen_raspuns || new Date(row.termen_raspuns) >= today || row.status === 'raspuns_dat') return
    const reg = registry.find(item => String(item.id) === String(row.registry_id)) || {}
    notifyMany(db, [...admins, ...users(db).filter(user => String(user.id) === String(row.user_id))], 'secretariat_deadline_overdue', `secretariat_tracking:${row.id}`, { tracking: row, registry: reg })
    count += 1
  })
  return { rows: count }
}

function checkArchiveOverdue(db) {
  if (isMssqlMode()) {
    const rows = mssqlArray(`
DECLARE @sql nvarchar(max);
IF OBJECT_ID(N'archive.document_requests', N'U') IS NOT NULL
  AND OBJECT_ID(N'archive.physical_documents', N'U') IS NOT NULL
BEGIN
  SET @sql = N'
SELECT ar.*, ad.nr_inventar, ad.denumire
FROM archive.document_requests ar
JOIN archive.physical_documents ad ON ad.id = ar.document_id
WHERE ar.data_returnare_planificata < GETDATE()
AND ar.status = N''imprumutata''
FOR JSON PATH;';
END
ELSE
BEGIN
  SET @sql = N'
SELECT ar.*, ad.nr_inventar, ad.denumire
FROM archive.requests ar
JOIN archive.documents ad ON ad.id = ar.document_id
WHERE ar.data_returnare_planificata < GETDATE()
AND ar.status = N'imprumutata'
FOR JSON PATH;';
END;
EXEC sp_executesql @sql;
`)
    const archivists = mssqlUsersByDepartmentCodes(['ARHIVA']).map(item => item.id)
    rows.forEach(row => [row.solicitat_de, ...archivists].filter(Boolean).forEach(userId => queueNotification(db, userId, 'archive_overdue', `archive_request:${row.id}`, { request: row })))
    return { rows: rows.length }
  }

  const archive = db.archive || {}
  const rows = archive.requests || []
  const docs = archive.documents || []
  const archivists = usersInDepartments(db, ['ARHIVA'])
  const today = new Date()
  let count = 0
  rows.forEach(row => {
    if (!row.data_returnare_planificata || new Date(row.data_returnare_planificata) >= today || row.status !== 'imprumutata') return
    const doc = docs.find(item => String(item.id) === String(row.document_id)) || {}
    notifyMany(db, [...archivists, ...users(db).filter(user => String(user.id) === String(row.solicitat_de))], 'archive_overdue', `archive_request:${row.id}`, { request: row, document: doc })
    count += 1
  })
  return { rows: count }
}

function checkLitigationTerms(db) {
  if (isMssqlMode()) {
    const rows = mssqlArray(`
SELECT lh.*, l.nr_dosar, l.parte_adversa
FROM legal.litigation_hearings lh
JOIN legal.litigation l ON l.id = lh.litigation_id
WHERE DATEDIFF(day, GETDATE(), lh.data_termen) BETWEEN 0 AND 3
AND lh.rezultat IS NULL
FOR JSON PATH;
`)
    const recipients = [...mssqlUsersByDepartmentCodes(['JURIDIC']).map(item => item.id), ...mssqlDirectorUsers().map(item => item.id)]
    rows.forEach(row => recipients.forEach(userId => queueNotification(db, userId, 'legal_litigation_term', `legal_hearing:${row.id}`, { hearing: row })))
    return { rows: rows.length }
  }

  const legal = db.legal || {}
  const hearings = legal.litigationHearings || []
  const litigations = legal.litigation || []
  const recipients = uniqueUsers(usersInDepartments(db, ['JURIDIC']), usersByRole(db, ['director', 'director_general', 'manager', 'admin', 'superadmin']))
  let count = 0
  hearings.forEach(hearing => {
    const days = daysUntil(hearing.data_termen)
    if (days === null || days < 0 || days > 3 || hearing.rezultat) return
    const litigation = litigations.find(item => String(item.id) === String(hearing.litigation_id)) || {}
    notifyMany(db, recipients, 'legal_litigation_term', `legal_hearing:${hearing.id}`, { hearing, litigation })
    count += 1
  })
  return { rows: count }
}

function checkSnowMorningDutyLog(db) {
  if (!isSnowSeason()) return { skipped: 'outside_snow_season' }
  const azi = new Date().toISOString().split('T')[0]

  if (isMssqlMode()) {
    const exists = Number(runMssqlScalar(`
SELECT COUNT(1)
FROM snow_removal.duty_logs
WHERE data = CAST(GETDATE() AS DATE);
`))
    if (exists > 0) return { exists }
    const recipients = usersWithPermission(db, 'snow_removal:duty_log')
    notifyMany(db, recipients, 'snow_duty_log_missing', `snow_duty_log_missing:${azi}`, {
      title: 'Jurnal deszăpezire lipsă',
      message: 'Nu există jurnal de deszăpezire pentru astăzi. Completează jurnalul zilnic.',
      data: azi
    })
    return { notified: recipients.length }
  }

  const snow = db.snowRemoval || {}
  const exists = (snow.dutyLogs || []).some(log => String(log.data || '').slice(0, 10) === azi)
  if (exists) return { exists: 1 }
  const recipients = usersWithPermission(db, 'snow_removal:duty_log')
  notifyMany(db, recipients, 'snow_duty_log_missing', `snow_duty_log_missing:${azi}`, {
    title: 'Jurnal deszăpezire lipsă',
    message: 'Nu există jurnal de deszăpezire pentru astăzi. Completează jurnalul zilnic.',
    data: azi
  })
  return { notified: recipients.length }
}

function checkSnowDraftDutyLogReminder(db) {
  if (!isSnowSeason()) return { skipped: 'outside_snow_season' }
  const azi = new Date().toISOString().split('T')[0]

  if (isMssqlMode()) {
    const rows = mssqlArray(`
SELECT id, uuid, data, ofiter_serviciu_id
FROM snow_removal.duty_logs
WHERE data = CAST(GETDATE() AS DATE)
AND status = N'draft'
FOR JSON PATH;
`)
    rows.forEach(row => queueNotification(db, row.ofiter_serviciu_id, 'snow_duty_log_draft_reminder', `snow_duty_log_draft:${row.id}`, {
      title: 'Jurnal deszăpezire netrimis',
      message: 'Jurnalul de azi nu a fost trimis spre aprobare. Termen: miezul nopții.',
      duty_log: row
    }))
    return { rows: rows.length }
  }

  const snow = db.snowRemoval || {}
  const rows = (snow.dutyLogs || []).filter(log => String(log.data || '').slice(0, 10) === azi && log.status === 'draft')
  rows.forEach(row => queueNotification(db, row.ofiter_serviciu_id, 'snow_duty_log_draft_reminder', `snow_duty_log_draft:${row.id}`, {
    title: 'Jurnal deszăpezire netrimis',
    message: 'Jurnalul de azi nu a fost trimis spre aprobare. Termen: miezul nopții.',
    duty_log: row
  }))
  return { rows: rows.length }
}

function closeWorkOrdersMonth(db) {
  if (new Date().getDate() !== 1) return { skipped: true }
  db.work = db.work || {}
  db.work.orders = Array.isArray(db.work.orders) ? db.work.orders : []
  let count = 0
  db.work.orders.forEach(order => {
    if (order.status === 'in_lucru') {
      order.status = 'partial'
      order.month_closed_at = timestamp()
      count += 1
    }
  })
  if (count) notifyMany(db, usersInDepartments(db, ['TEHNIC']), 'work_orders_month_close', `work_orders:${new Date().toISOString().slice(0, 7)}`, {
    title: 'Raport lunar comenzi de lucru',
    message: `${count} comenzi de lucru au fost marcate parțial pentru raportul lunar.`
  })
  return { rows: count }
}

function checkHrEmployeeDocumentExpiry(db) {
  const hr = db.hr || {}
  const employees = hr.employees || []
  const hrManagers = uniqueUsers(
    usersByRole(db, ['hr', 'admin', 'superadmin']),
    usersWithPermission(db, 'hr:manage')
  )
  const THRESHOLDS = [60, 30, 7]
  const docFields = [
    { field: 'data_expirare_contract', label: 'Contract de muncă', alertKey: 'contract' },
    { field: 'data_expirare_permis',   label: 'Permis de conducere', alertKey: 'permis' },
    { field: 'data_expirare_iscir',    label: 'Autorizație ISCIR', alertKey: 'iscir' },
    { field: 'adeverinta_medicala',    label: 'Adeverință medicală', alertKey: 'medical' },
  ]
  let count = 0
  employees.filter(emp => emp.activ !== false).forEach(emp => {
    docFields.forEach(doc => {
      const val = emp[doc.field]
      if (!val) return
      const days = daysUntil(val)
      if (days === null || days > 60 || days < -7) return
      const threshold = THRESHOLDS.find(t => days <= t)
      if (!threshold) return
      const entityKey = `hr_doc_${emp.id}_${doc.alertKey}_${val}`
      const payload = {
        title: `${doc.label} expiră${days < 0 ? 't' : ''}`,
        message: `${emp.prenume || ''} ${emp.nume || ''} — ${doc.label}: ${days < 0 ? `expirat cu ${Math.abs(days)} zile` : `expiră în ${days} zile (${val})`}`,
        employee_id: emp.id, field: doc.field, data: val, days,
      }
      // Notify HR managers
      notifyMany(db, hrManagers, 'hr_document_expiry', entityKey, payload)
      // Notify the employee themselves if they have a user account
      const empUser = users(db).find(u => String(u.id) === String(emp.user_id))
      if (empUser) queueNotification(db, empUser.id, 'hr_document_expiry_self', entityKey, payload)
      count += 1
    })
  })
  return { rows: count }
}

function fleetDocumentRows(db) {
  const fleet = db.fleet || {}
  const assets = db.fleetAssets || fleet.assets || []
  const assetById = new Map(assets.map(asset => [String(asset.id), asset]))
  const assetLabel = (assetId) => {
    const asset = assetById.get(String(assetId)) || {}
    return [asset.name, asset.registration, asset.cod].filter(Boolean).join(' / ') || String(assetId || 'utilaj')
  }
  const rows = []
  ;(fleet.asigurari || []).filter(item => item.activa !== false).forEach(item => rows.push({
    key: `asigurare:${item.id}:${item.data_expirarii}`,
    label: item.tip || 'Asigurare',
    asset: assetLabel(item.asset_id),
    data: item.data_expirarii,
    notif_zile: Number(item.notif_zile || 15)
  }))
  ;(fleet.itp || []).forEach(item => rows.push({
    key: `itp:${item.id}:${item.planificat_pe}`,
    label: 'ITP',
    asset: assetLabel(item.asset_id),
    data: item.planificat_pe,
    notif_zile: Number(item.notif_zile || 30)
  }))
  ;(fleet.taxe || []).forEach(item => rows.push({
    key: `taxa:${item.id}:${item.data_expirarii}`,
    label: item.tip || 'Taxă',
    asset: assetLabel(item.asset_id),
    data: item.data_expirarii,
    notif_zile: Number(item.notif_zile || 7)
  }))
  ;(fleet.iscir || []).forEach(item => rows.push({
    key: `iscir:${item.id}:${item.data_expirarii}`,
    label: item.tip_autorizare || 'ISCIR',
    asset: assetLabel(item.asset_id),
    data: item.data_expirarii,
    notif_zile: Number(item.notif_zile || 30)
  }))
  return rows
}

function checkFleetDocumentDeadlines(db) {
  const rows = fleetDocumentRows(db)
    .map(item => ({ ...item, days: daysUntil(item.data) }))
    .filter(item => item.days !== null && item.days <= Math.max(60, item.notif_zile) && item.days >= -30)
    .sort((a, b) => a.days - b.days)

  if (!rows.length) return { rows: 0 }
  const recipients = uniqueUsers(
    usersByRole(db, ['superadmin', 'admin']),
    usersWithPermission(db, 'mecanizare:manage'),
    usersWithPermission(db, 'fleet:manage')
  )
  const lines = rows.slice(0, 8).map(item => {
    const prefix = item.days <= 0 ? '🔴' : item.days <= 7 ? '🟠' : '🟡'
    const when = item.days < 0 ? `expirat cu ${Math.abs(item.days)} zile` : item.days === 0 ? 'expiră azi' : `expiră în ${item.days} zile`
    return `${prefix} ${item.label} ${item.asset} — ${when}`
  })
  notifyMany(db, recipients, 'fleet_document_deadlines', `fleet_deadlines:${new Date().toISOString().slice(0, 10)}`, {
    title: 'Scadențe flotă în atenție',
    message: `⚠️ ${rows.length} scadențe în atenție:\n${lines.join('\n')}`,
    rows: rows.slice(0, 20)
  })
  return { rows: rows.length, notified: recipients.length }
}

async function runHourlyChecks() {
  const db = readDb()
  await safeRun('checkTicketAlerts', checkTicketAlerts, db)
  await safeRun('checkAuthorizationExpiry', checkAuthorizationExpiry, db)
  await safeRun('checkHrEmployeeDocumentExpiry', checkHrEmployeeDocumentExpiry, db)
  await safeRun('checkPermitExpiry', checkPermitExpiry, db)
  await safeRun('checkContractExpiry', checkContractExpiry, db)
  await safeRun('checkRegistryDeadlines', checkRegistryDeadlines, db)
  await safeRun('checkArchiveOverdue', checkArchiveOverdue, db)
  await safeRun('checkLitigationTerms', checkLitigationTerms, db)
  const hour = new Date().getHours()
  if (hour === 6) await safeRun('checkSnowMorningDutyLog', checkSnowMorningDutyLog, db)
  if (hour === 8) await safeRun('checkEnvironmentDailyAlerts', checkEnvironmentDailyAlerts, db)
  if (hour === 8) await safeRun('checkFleetDocumentDeadlines', checkFleetDocumentDeadlines, db)
  if (hour === 23) await safeRun('checkSnowDraftDutyLogReminder', checkSnowDraftDutyLogReminder, db)
  if (!isMssqlMode()) writeDb(db)
}

async function runDailyChecks() {
  const db = readDb()
  await safeRun('checkInterstoftPendingExports', checkInterstoftPendingExports, db)
  await safeRun('closeWorkOrdersMonth', closeWorkOrdersMonth, db)
  if (!isMssqlMode()) writeDb(db)
}

function emailAutoSyncConfig(db) {
  const settings = db?.settings || {}
  return {
    enabled: settings.email_sync_enabled === true,
    intervalMin: Math.max(5, Math.min(1440, Number(settings.email_sync_interval_min || 15))),
    limit: Math.max(1, Math.min(50, Number(settings.email_sync_limit || 20)))
  }
}

function isEmailAutoSyncDue(db) {
  const config = emailAutoSyncConfig(db)
  if (!config.enabled) return false
  const last = db?.messaging?.emailSync?.last_auto_sync_started_at || db?.messaging?.emailSync?.last_auto_sync_at || ''
  if (!last) return true
  const elapsedMs = Date.now() - new Date(last).getTime()
  return Number.isNaN(elapsedMs) || elapsedMs >= config.intervalMin * 60 * 1000
}

async function runEmailAutoSyncChecks() {
  if (emailSyncRunning) return { skipped: 'already_running' }
  const db = readDb()
  const config = emailAutoSyncConfig(db)
  if (!config.enabled) return { skipped: 'disabled' }
  if (!isEmailAutoSyncDue(db)) return { skipped: 'not_due' }
  emailSyncRunning = true
  try {
    const result = await safeRun('syncIncomingEmailAuto', () => syncIncomingEmails(db, {
      actor: { id: 'system-email-sync', name: 'InfraFlow Email Sync', role: 'system' },
      limit: config.limit,
      mode: 'auto',
      persist: false
    }), db)
    writeDb(db)
    return result || { ok: false }
  } finally {
    emailSyncRunning = false
  }
}

function millisecondsUntilMidnight() {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}

function startScheduler() {
  runHourlyChecks()
  runEmailAutoSyncChecks()
  setInterval(runHourlyChecks, HOUR_MS)
  setInterval(runEmailAutoSyncChecks, EMAIL_SYNC_TICK_MS).unref?.()
  setTimeout(() => {
    runDailyChecks()
    setInterval(runDailyChecks, DAY_MS)
  }, millisecondsUntilMidnight())
}

startScheduler()

module.exports = {
  checkInterstoftPendingExports,
  checkAuthorizationExpiry,
  checkPermitExpiry,
  checkContractExpiry,
  checkEnvironmentDailyAlerts,
  checkRegistryDeadlines,
  checkArchiveOverdue,
  checkLitigationTerms,
  checkFleetDocumentDeadlines,
  isSnowSeason,
  checkSnowMorningDutyLog,
  checkSnowDraftDutyLogReminder,
  closeWorkOrdersMonth,
  runHourlyChecks,
  runDailyChecks,
  runEmailAutoSyncChecks,
  startScheduler
}
