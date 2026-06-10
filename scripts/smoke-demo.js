/**
 * Smoke test pentru instanta demo InfraFlow.
 * Rulare: node scripts/smoke-demo.js [http://localhost:4190]
 */
const http = require('http')
const https = require('https')

const BASE_URL = (process.argv[2] || process.env.DEMO_BASE_URL || 'http://localhost:4190').replace(/\/+$/, '')
const USERNAME = process.env.DEMO_USERNAME || 'demo'
const PASSWORD = process.env.DEMO_PASSWORD || 'demo123'
const DIRECTOR_USERNAME = process.env.DEMO_DIRECTOR_USERNAME || 'director'
const MECHANIZATION_USERNAME = process.env.DEMO_MECHANIZATION_USERNAME || 'sef.mecanizare'

const checks = []

function addCheck(name, ok, details = '') {
  checks.push({ name, ok, details })
  const marker = ok ? 'OK ' : 'ERR'
  console.log(`[${marker}] ${name}${details ? ` - ${details}` : ''}`)
}

function request(method, pathname, options = {}) {
  const url = new URL(pathname, BASE_URL)
  const payload = options.body ? JSON.stringify(options.body) : null
  const headers = {
    Accept: 'application/json',
    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
  }
  const transport = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = transport.request(url, { method, headers, timeout: 10_000 }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        let data = raw
        try { data = raw ? JSON.parse(raw) : null } catch {}
        resolve({ status: res.statusCode, data, raw })
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout la ${method} ${url.href}`))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function countFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key].length
  }
  if (Array.isArray(data)) return data.length
  return 0
}

async function main() {
  console.log(`InfraFlow demo smoke test: ${BASE_URL}`)

  const demoStatus = await request('GET', '/api/demo-status')
  addCheck('/api/demo-status', demoStatus.status === 200 && demoStatus.data?.demo === true, `status=${demoStatus.status}, demo=${demoStatus.data?.demo}`)

  const health = await request('GET', '/api/system/health')
  addCheck('/api/system/health mode=json', health.status === 200 && health.data?.mode === 'json', `status=${health.status}, mode=${health.data?.mode}`)

  const root = await request('GET', '/')
  addCheck('pagina start demo se incarca', root.status === 200 && String(root.raw || '').includes('InfraFlow'), `status=${root.status}`)
  addCheck('banner DEMO in HTML', String(root.raw || '').includes('DEMO - Date fictive'), '')

  const startDemo = await request('GET', '/start-demo')
  addCheck('/start-demo include conturi demo', startDemo.status === 200 && String(startDemo.raw || '').includes('Director:') && String(startDemo.raw || '').includes('Kiosk sofer'), `status=${startDemo.status}`)

  const login = await request('POST', '/api/login', { body: { username: USERNAME, password: PASSWORD } })
  addCheck(`login ${USERNAME}`, login.status === 200 && Boolean(login.data?.token), `status=${login.status}, user=${login.data?.user?.username || '-'}`)
  const token = login.data?.token
  if (!token) throw new Error('Login demo fara token; opresc testul.')

  const session = await request('GET', '/api/session', { token })
  addCheck('/api/session', session.status === 200 && session.data?.user?.username === USERNAME, `status=${session.status}`)

  const settings = await request('GET', '/api/settings', { token })
  addCheck('/api/settings companie Publiserv Demo', settings.status === 200 && String(settings.data?.settings?.companyName || '').includes('PUBLISERV DEMO'), `company=${settings.data?.settings?.companyName || '-'}`)

  const resetForbidden = await request('POST', '/api/demo-reset', { body: {} })
  addCheck('/api/demo-reset cere autentificare', resetForbidden.status === 401, `status=${resetForbidden.status}`)

  const directorLogin = await request('POST', '/api/login', { body: { username: DIRECTOR_USERNAME, password: PASSWORD } })
  const directorToken = directorLogin.data?.token
  const directorPermissions = Array.isArray(directorLogin.data?.user?.permissions) ? directorLogin.data.user.permissions : []
  addCheck(`login ${DIRECTOR_USERNAME}`, directorLogin.status === 200 && Boolean(directorToken) && directorPermissions.includes('referate:dir_general'), `status=${directorLogin.status}, role=${directorLogin.data?.user?.role || '-'}`)

  if (directorToken) {
    const directorReferate = await request('GET', '/api/referate?status=dir_general', { token: directorToken })
    const pendingDirector = Array.isArray(directorReferate.data?.referate) ? directorReferate.data.referate[0] : null
    addCheck('/api/referate?status=dir_general pentru director', directorReferate.status === 200 && Boolean(pendingDirector), `status=${directorReferate.status}, count=${directorReferate.data?.referate?.length || 0}`)

    if (pendingDirector) {
      const beforeOrders = await request('GET', '/api/procurement-orders', { token: directorToken })
      const beforeCount = countFrom(beforeOrders.data, ['orders'])
      const approval = await request('POST', `/api/referate/${pendingDirector.uuid || pendingDirector.id}/inainteaza`, {
        token: directorToken,
        body: { observatii: 'Aprobat din smoke test director demo.' }
      })
      const approvedReferat = approval.data?.referat
      addCheck('director aproba referat dir_general', approval.status === 200 && approvedReferat?.status === 'secretariat_final' && Boolean(approvedReferat?.comanda_id), `status=${approval.status}, next=${approvedReferat?.status || '-'}`)

      const afterOrders = await request('GET', '/api/procurement-orders', { token: directorToken })
      const afterCount = countFrom(afterOrders.data, ['orders'])
      addCheck('aprobarea director genereaza comanda', afterOrders.status === 200 && afterCount > beforeCount, `orders=${beforeCount}->${afterCount}`)
    }
  }

  const materials = await request('GET', '/api/materials', { token })
  const materialCount = countFrom(materials.data, ['materials'])
  addCheck('/api/materials >= 30', materials.status === 200 && materialCount >= 30, `status=${materials.status}, count=${materialCount}`)

  const fleet = await request('GET', '/api/fleet-assets', { token })
  const fleetCount = countFrom(fleet.data, ['assets', 'fleetAssets'])
  addCheck('/api/fleet-assets >= 20', fleet.status === 200 && fleetCount >= 20, `status=${fleet.status}, count=${fleetCount}`)

  const notifications = await request('GET', '/api/notifications', { token })
  const notificationCount = countFrom(notifications.data, ['notifications'])
  addCheck('/api/notifications raspunde', notifications.status === 200, `status=${notifications.status}, count=${notificationCount}`)

  const fleetAlerts = await request('GET', '/api/fleet-alerts', { token })
  const fleetAlertCount = countFrom(fleetAlerts.data, ['alerts'])
  addCheck('/api/fleet-alerts are alerte demo', fleetAlerts.status === 200 && fleetAlertCount > 0, `status=${fleetAlerts.status}, count=${fleetAlertCount}`)

  const mechanizationDashboard = await request('GET', '/api/mechanization/dashboard', { token })
  addCheck('/api/mechanization/dashboard are alocari', mechanizationDashboard.status === 200 && Number(mechanizationDashboard.data?.stats?.alocateAzi || 0) > 0, `status=${mechanizationDashboard.status}, alocate=${mechanizationDashboard.data?.stats?.alocateAzi}`)
  addCheck('/api/mechanization/dashboard are costuri', mechanizationDashboard.status === 200 && Number(mechanizationDashboard.data?.stats?.costLuna || 0) > 0, `cost=${mechanizationDashboard.data?.stats?.costLuna}, litri=${mechanizationDashboard.data?.stats?.litriLuna}`)

  const tripLogs = await request('GET', '/api/fleet/trip-logs', { token })
  const tripLogCount = countFrom(tripLogs.data, ['trip_logs'])
  addCheck('/api/fleet/trip-logs >= 30', tripLogs.status === 200 && tripLogCount >= 30, `status=${tripLogs.status}, count=${tripLogCount}`)

  const mechanizationLogin = await request('POST', '/api/login', { body: { username: MECHANIZATION_USERNAME, password: PASSWORD } })
  const mechanizationToken = mechanizationLogin.data?.token
  addCheck(`login ${MECHANIZATION_USERNAME}`, mechanizationLogin.status === 200 && Boolean(mechanizationToken), `status=${mechanizationLogin.status}, role=${mechanizationLogin.data?.user?.role || '-'}`)
  if (mechanizationToken) {
    const mechanizationTrips = await request('GET', '/api/fleet/trip-logs', { token: mechanizationToken })
    const demoTrip = Array.isArray(mechanizationTrips.data?.trip_logs)
      ? mechanizationTrips.data.trip_logs.find((item) => item.nr_foaie === 'FP-2026-KIOSK-001')
      : null
    addCheck('mecanizare vede foaia kiosk demo', mechanizationTrips.status === 200 && Boolean(demoTrip), `status=${mechanizationTrips.status}, foaie=${demoTrip?.nr_foaie || '-'}`)
    if (demoTrip?.uuid) {
      const sendToDriver = await request('POST', `/api/fleet/trip-logs/${demoTrip.uuid}/trimite`, {
        token: mechanizationToken,
        body: { sofer_id: demoTrip.sofer_id || 'EMP-001' }
      })
      addCheck('mecanizare trimite foaia la sofer', sendToDriver.status === 200 && sendToDriver.data?.trip_log?.status === 'trimisa', `status=${sendToDriver.status}, next=${sendToDriver.data?.trip_log?.status || '-'}`)
    }
  }

  const hrStats = await request('GET', '/api/hr/stats', { token })
  addCheck('/api/hr/stats are 15 angajati', hrStats.status === 200 && Number(hrStats.data?.total_angajati || 0) >= 15, `status=${hrStats.status}, total=${hrStats.data?.total_angajati}`)
  addCheck('/api/hr/stats are concedii si autorizatii', hrStats.status === 200 && Number(hrStats.data?.in_concediu || 0) > 0 && Number(hrStats.data?.autorizatii_expira_30_zile || 0) > 0, `concediu=${hrStats.data?.in_concediu}, autorizatii=${hrStats.data?.autorizatii_expira_30_zile}`)

  const currentMonth = new Date().toISOString().slice(0, 7)
  const leaveStart = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const leaveEnd = new Date(Date.now() + 16 * 86400000).toISOString().slice(0, 10)
  const hrTimesheet = await request('GET', `/api/hr/timesheets/monthly-sheet?luna=${currentMonth}`, { token })
  const hrTimesheetCount = countFrom(hrTimesheet.data, ['items'])
  addCheck('/api/hr/timesheets/monthly-sheet are pontaj', hrTimesheet.status === 200 && hrTimesheetCount >= 15, `status=${hrTimesheet.status}, count=${hrTimesheetCount}`)

  const hrOverview = await request('GET', `/api/hr/timesheets/overview?luna=${currentMonth}`, { token })
  const hrOverviewCount = Array.isArray(hrOverview.data) ? hrOverview.data.length : 0
  const hrOverviewHasProgress = Array.isArray(hrOverview.data) && hrOverview.data.some((item) => Number(item.procent || 0) > 0)
  addCheck('/api/hr/timesheets/overview are departamente', hrOverview.status === 200 && hrOverviewCount >= 5 && hrOverviewHasProgress, `status=${hrOverview.status}, count=${hrOverviewCount}`)

  const hrLeaves = await request('GET', '/api/hr/leave-requests', { token })
  const hrLeaveCount = Array.isArray(hrLeaves.data) ? hrLeaves.data.length : 0
  addCheck('/api/hr/leave-requests are cereri', hrLeaves.status === 200 && hrLeaveCount >= 4, `status=${hrLeaves.status}, count=${hrLeaveCount}`)

  const hrAuthorizations = await request('GET', '/api/hr/authorizations', { token })
  const hrAuthorizationCount = Array.isArray(hrAuthorizations.data) ? hrAuthorizations.data.length : 0
  const hasExpiringAuthorization = Array.isArray(hrAuthorizations.data) && hrAuthorizations.data.some((item) => item.alert || item.expirat)
  addCheck('/api/hr/authorizations are scadente', hrAuthorizations.status === 200 && hrAuthorizationCount >= 10 && hasExpiringAuthorization, `status=${hrAuthorizations.status}, count=${hrAuthorizationCount}`)

  const hrEquipmentNeed = await request('GET', '/api/hr/echipamente/raport-necesar', { token })
  const hrEquipmentNeedCount = countFrom(hrEquipmentNeed.data, ['rows'])
  addCheck('/api/hr/echipamente/raport-necesar are pozitii', hrEquipmentNeed.status === 200 && hrEquipmentNeedCount > 0, `status=${hrEquipmentNeed.status}, count=${hrEquipmentNeedCount}`)

  const hrEquipmentExpiry = await request('GET', '/api/hr/echipamente/expirari?zile=90', { token })
  const hrEquipmentExpiryCount = countFrom(hrEquipmentExpiry.data, ['rows'])
  addCheck('/api/hr/echipamente/expirari are alerte', hrEquipmentExpiry.status === 200 && hrEquipmentExpiryCount > 0, `status=${hrEquipmentExpiry.status}, count=${hrEquipmentExpiryCount}`)

  const kioskLogin = await request('POST', '/api/hr/kiosk/login', { body: { username: 'sofer1', password: PASSWORD } })
  const kioskToken = kioskLogin.data?.token
  addCheck('login kiosk sofer1', kioskLogin.status === 200 && Boolean(kioskToken), `status=${kioskLogin.status}, employee=${kioskLogin.data?.employee_name || '-'}`)

  if (kioskToken) {
    const kioskProfile = await request('GET', '/api/hr/kiosk/me', { token: kioskToken })
    addCheck('/api/hr/kiosk/me are profil sofer', kioskProfile.status === 200 && kioskProfile.data?.angajat?.id === 'EMP-001' && Number(kioskProfile.data?.pontaj_luna?.ore_total || 0) > 0, `status=${kioskProfile.status}, ore=${kioskProfile.data?.pontaj_luna?.ore_total}`)

    const kioskLeave = await request('POST', '/api/hr/kiosk/sync', {
      token: kioskToken,
      body: {
        operations: [{
          id: 'smoke-kiosk-leave-001',
          type: 'leave_request',
          data: {
            uuid: 'smoke-kiosk-leave-001',
            employee_id: 'EMP-001',
            tip: 'CO',
            data_start: leaveStart,
            data_sfarsit: leaveEnd,
            motiv: 'Test smoke Kiosk sofer'
          }
        }]
      }
    })
    addCheck('/api/hr/kiosk/sync trimite cerere CO', kioskLeave.status === 200 && kioskLeave.data?.ok === true && Array.isArray(kioskLeave.data?.synced) && kioskLeave.data.synced.length > 0, `status=${kioskLeave.status}, failed=${kioskLeave.data?.failed?.length || 0}`)

    const kioskTrips = await request('GET', '/api/hr/kiosk/my-trips', { token: kioskToken })
    const trips = Array.isArray(kioskTrips.data?.trips) ? kioskTrips.data.trips : []
    const activeKioskTrip = trips.find((item) => ['deschisa', 'trimisa', 'in_lucru'].includes(item.status))
    addCheck('/api/hr/kiosk/my-trips are foaie activa', kioskTrips.status === 200 && Boolean(activeKioskTrip), `status=${kioskTrips.status}, count=${trips.length}, tripStatus=${activeKioskTrip?.status || '-'}`)

    if (activeKioskTrip?.uuid) {
      const saveVerso = await request('PATCH', `/api/fleet/trip-logs/${activeKioskTrip.uuid}/verso-kiosk`, {
        token: kioskToken,
        body: {
          activitati: [
            { id: 'smoke-act-1', locul_plecarii: 'Depou central', locul_sosirii: 'DJ207B km 4+200', ziua: new Date().toISOString().slice(0, 10), ora: '08', minut: '15', km_incarcat: 18, km_gol: 4, tone: 18, marfa: 'Mixtura asfaltica BA16' }
          ],
          km_sosire: 48302,
          km_cat1: 40,
          km_cat2: 8,
          km_cat3: 4,
          observatii: 'Completare verso din smoke test demo.'
        }
      })
      const savedTrip = saveVerso.data?.trip_log || saveVerso.data?.foaie
      addCheck('/api/fleet/trip-logs/:uuid/verso-kiosk salveaza', saveVerso.status === 200 && savedTrip?.status === 'completata', `status=${saveVerso.status}, foaie=${savedTrip?.nr_foaie || '-'}`)

      if (mechanizationToken) {
        const closeByMechanization = await request('PATCH', `/api/fleet/trip-logs/${activeKioskTrip.uuid}/close-mecanizare`, { token: mechanizationToken })
        addCheck('mecanizare inchide foaia completata', closeByMechanization.status === 200 && closeByMechanization.data?.trip_log?.status === 'inchisa', `status=${closeByMechanization.status}, next=${closeByMechanization.data?.trip_log?.status || '-'}`)
      }
    }
  }

  const referateStats = await request('GET', '/api/referate/stats', { token })
  addCheck('/api/referate/stats are referate', referateStats.status === 200 && Number(referateStats.data?.total || 0) >= 5, `status=${referateStats.status}, total=${referateStats.data?.total}`)

  const referateList = await request('GET', '/api/referate', { token })
  const referateCount = countFrom(referateList.data, ['referate'])
  const referatWithFlux = Array.isArray(referateList.data?.referate) && referateList.data.referate.some((item) => Array.isArray(item.flux) && item.flux.length > 1)
  addCheck('/api/referate are flux demo', referateList.status === 200 && referateCount >= 7 && referatWithFlux, `status=${referateList.status}, count=${referateCount}`)

  const procurementOrders = await request('GET', '/api/procurement-orders', { token })
  const procurementOrderCount = countFrom(procurementOrders.data, ['orders'])
  addCheck('/api/procurement-orders >= 10', procurementOrders.status === 200 && procurementOrderCount >= 10, `status=${procurementOrders.status}, count=${procurementOrderCount}`)

  const procurementRequirements = await request('GET', '/api/procurement-requirements', { token })
  const procurementRequirementCount = countFrom(procurementRequirements.data, ['requirements'])
  addCheck('/api/procurement-requirements are necesar', procurementRequirements.status === 200 && procurementRequirementCount >= 2, `status=${procurementRequirements.status}, count=${procurementRequirementCount}`)

  const nextYear = new Date().getFullYear() + 1
  const paap = await request('GET', `/api/paap?an=${nextYear}`, { token })
  const paapCount = countFrom(paap.data, ['paap'])
  const paapHasExecution = Array.isArray(paap.data?.paap) && paap.data.paap.some((item) => Number(item.valoare_executata || 0) > 0 && Number(item.procent || 0) > 50)
  addCheck(`/api/paap?an=${nextYear} are executie`, paap.status === 200 && paapCount >= 6 && paapHasExecution, `status=${paap.status}, count=${paapCount}`)

  const controllingDashboard = await request('GET', '/api/controlling/dashboard', { token })
  addCheck('/api/controlling/dashboard are buget', controllingDashboard.status === 200 && Number(controllingDashboard.data?.total_buget || 0) > 0, `status=${controllingDashboard.status}, buget=${controllingDashboard.data?.total_buget}, real=${controllingDashboard.data?.total_real}`)

  const resetDemo = await request('POST', '/api/demo-reset', { token, body: {} })
  addCheck('/api/demo-reset reseteaza date demo', resetDemo.status === 200 && resetDemo.data?.ok === true, `status=${resetDemo.status}`)

  const afterResetDirectorLogin = await request('POST', '/api/login', { body: { username: DIRECTOR_USERNAME, password: PASSWORD } })
  const afterResetDirectorRefs = afterResetDirectorLogin.data?.token
    ? await request('GET', '/api/referate?status=dir_general', { token: afterResetDirectorLogin.data.token })
    : { status: 0, data: {} }
  addCheck('dupa reset referatul director revine', afterResetDirectorRefs.status === 200 && Array.isArray(afterResetDirectorRefs.data?.referate) && afterResetDirectorRefs.data.referate.length === 1, `status=${afterResetDirectorRefs.status}, count=${afterResetDirectorRefs.data?.referate?.length || 0}`)

  const afterResetKioskLogin = await request('POST', '/api/hr/kiosk/login', { body: { username: 'sofer1', password: PASSWORD } })
  const afterResetKioskTrips = afterResetKioskLogin.data?.token
    ? await request('GET', '/api/hr/kiosk/my-trips', { token: afterResetKioskLogin.data.token })
    : { status: 0, data: {} }
  const afterResetTrips = Array.isArray(afterResetKioskTrips.data?.trips) ? afterResetKioskTrips.data.trips : []
  const resetActiveTrip = afterResetTrips.find((item) => item.nr_foaie === 'FP-2026-KIOSK-001' && item.status === 'deschisa')
  addCheck('dupa reset foaia sofer revine deschisa', afterResetKioskTrips.status === 200 && Boolean(resetActiveTrip), `status=${afterResetKioskTrips.status}, trip=${resetActiveTrip?.status || '-'}`)

  const summary = {
    passed: checks.filter((item) => item.ok).length,
    failed: checks.filter((item) => !item.ok).length,
    total: checks.length
  }
  console.log(`Rezultat: ${summary.passed}/${summary.total} checks OK`)
  if (summary.failed) process.exit(1)
}

main().catch((error) => {
  console.error('[ERR] Smoke test esuat:', error.message)
  process.exit(1)
})
