import api from '../../../api/client'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'

function fullName(item) {
  return [item?.nume, item?.prenume].filter(Boolean).join(' ') || item?.name || 'Angajat'
}

function EmployeeDocumentButton({ item, onError }) {
  return (
    <button
      className={`rounded px-2 py-1 text-left text-xs font-medium ${item.cls}`}
      onClick={async () => {
        try {
          await item.fn()
        } catch {
          onError?.(item.error || 'Eroare la generare document.')
        }
      }}
    >
      {item.label}
    </button>
  )
}

function DossierDashboardSection({
  employees,
  dossierDashboard,
  dossierDashboardRows,
  dossierDashboardFilter,
  dossierReminderResult,
  onLoadDashboard,
  onDownloadReport,
  onFilterChange,
  onOpenEmployee,
  onSendReminder,
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800">🧭 Dashboard conformitate dosar HR</div>
          <div className="text-xs text-slate-500">Panou de lucru: lipsuri obligatorii, documente Kiosk neconfirmate și scadențe apropiate.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onLoadDashboard}>Reîncarcă dashboard</Button>
          <Button size="sm" variant="secondary" onClick={onDownloadReport}>Export Excel</Button>
        </div>
      </div>
      {dossierReminderResult ? (
        <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Reminder trimis pentru <strong>{dossierReminderResult.pending || 0}</strong> documente neconfirmate
          {dossierReminderResult.notified_user ? ' · notificare internă creată' : ' · fără utilizator ERP asociat pentru notificare internă'}
          {dossierReminderResult.sent_at ? ` · ${String(dossierReminderResult.sent_at).slice(0, 16).replace('T', ' ')}` : ''}
        </div>
      ) : null}
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Angajați verificați</div><strong>{dossierDashboard.summary?.total || 0}</strong></div>
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Fără probleme</div><strong>{dossierDashboard.summary?.complete || 0}</strong></div>
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Cu lipsuri obligatorii</div><strong>{dossierDashboard.summary?.missing_required || 0}</strong></div>
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Confirmări Kiosk lipsă</div><strong>{dossierDashboard.summary?.pending_ack || 0}</strong></div>
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm"><div className="text-xs text-blue-700">Cu scadențe ≤90 zile</div><strong>{dossierDashboard.summary?.expiring || 0}</strong></div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[
          { value: 'probleme', label: `Probleme (${dossierDashboard.summary?.problem_employees || 0})` },
          { value: 'lipsuri', label: 'Lipsuri obligatorii' },
          { value: 'neconfirmate', label: 'Neconfirmate Kiosk' },
          { value: 'scadente', label: 'Scadențe' },
          { value: 'ok', label: 'Fără probleme' },
          { value: 'toate', label: 'Toate' },
        ].map(filter => (
          <button
            key={filter.value}
            type="button"
            onClick={() => onFilterChange(filter.value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${dossierDashboardFilter === filter.value ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Angajat</th><th className="px-3 py-2">Dosar</th><th className="px-3 py-2">Lipsuri</th><th className="px-3 py-2">Kiosk</th><th className="px-3 py-2">Scadență</th><th className="px-3 py-2 text-right">Acțiuni</th></tr>
          </thead>
          <tbody>
            {dossierDashboardRows.slice(0, 40).map(row => {
              const emp = employees.find(item => String(item.id) === String(row.employee_id))
              const severityClass = row.expired_count ? 'text-rose-700' : row.critical_count ? 'text-red-700' : row.warning_count ? 'text-amber-700' : 'text-blue-700'
              return (
                <tr key={row.employee_id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{row.nume_complet}</div>
                    <div className="text-xs text-slate-400">{row.functia || '-'} · {row.department_name || 'fără departament'} · marca {row.marca || '-'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"><div className={`h-2 ${row.percent === 100 ? 'bg-emerald-500' : row.percent >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${row.percent || 0}%` }} /></div>
                    <div className="mt-1 text-xs text-slate-500">{row.required_done}/{row.required_total} · {row.percent}%</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.missing_required?.length ? <span className="text-rose-700">{row.missing_required.join(', ')}</span> : <span className="text-emerald-700">Complet obligatoriu</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className={row.pending_ack ? 'font-semibold text-amber-700' : 'text-emerald-700'}>{row.pending_ack || 0} neconfirmate</div>
                    <div className="text-slate-400">{row.acknowledged || 0}/{row.kiosk_documents || 0} confirmate</div>
                    {row.last_reminder_at ? <div className="text-slate-400">reminder {String(row.last_reminder_at).slice(0, 10)}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.next_expiration ? (
                      <div>
                        <div className={`font-semibold ${severityClass}`}>{row.next_expiration.label}</div>
                        <div className="text-slate-500">{row.next_expiration.date} · {row.next_expiration.days < 0 ? `expirat de ${Math.abs(row.next_expiration.days)} zile` : `${row.next_expiration.days} zile`}</div>
                      </div>
                    ) : <span className="text-emerald-700">Fără scadențe apropiate</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      {emp ? <Button size="sm" variant="secondary" onClick={() => onOpenEmployee(emp)}>Dosar</Button> : null}
                      {row.pending_ack ? <Button size="sm" onClick={() => onSendReminder(row.employee_id)}>Reminder Kiosk</Button> : null}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!dossierDashboardRows.length ? <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-400">Nu există angajați pentru filtrul selectat.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function HrTemplatesSection({
  templates,
  wordUploading,
  canManageTemplates,
  onLoadTemplates,
  onDownloadWord,
  onOpenWordTest,
  onChooseWord,
  onStartEditing,
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800">🧩 Șabloane HR editabile</div>
          <div className="text-xs text-slate-500">CIM-ul și actele adiționale pot folosi texte proprii Publiserv, cu variabile inserabile.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onLoadTemplates}>Reîncarcă șabloane</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {templates.map(template => (
          <div key={template.id} className="rounded border border-slate-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{template.denumire}</div>
                <div className="text-xs text-slate-500">{template.tip} · {template.system_default ? 'implicit sistem' : 'personalizat'}</div>
                <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${template.word_template_file ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'}`}>
                  {template.word_template_file ? `Word: ${template.word_template_original_name || 'șablon încărcat'}` : 'Fără șablon Word'}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {template.word_template_file ? <Button size="sm" variant="secondary" onClick={() => onDownloadWord(template)}>Descarcă Word</Button> : null}
                {template.word_template_file ? <Button size="sm" variant="secondary" onClick={() => onOpenWordTest(template)}>Testează Word</Button> : null}
                {canManageTemplates ? <Button size="sm" variant="secondary" loading={wordUploading === template.id} onClick={() => onChooseWord(template)}>{template.word_template_file ? 'Înlocuiește Word' : 'Încarcă Word'}</Button> : null}
                {canManageTemplates ? <Button size="sm" variant="secondary" onClick={() => onStartEditing(template)}>Editează text</Button> : null}
              </div>
            </div>
            {template.descriere ? <div className="mt-2 text-xs text-slate-500">{template.descriere}</div> : null}
            {template.word_template_uploaded_at ? <div className="mt-1 text-xs text-slate-400">Încărcat: {String(template.word_template_uploaded_at).slice(0, 16).replace('T', ' ')}</div> : null}
          </div>
        ))}
      </div>
    </Card>
  )
}

function DossierChecklistSection({ employees, dossierChecklist, onLoadChecklist, onOpenEmployee }) {
  const rows = dossierChecklist.rows || []

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800">✅ Checklist dosar personal</div>
          <div className="text-xs text-slate-500">Verificare rapidă pentru documentele obligatorii din dosarul fiecărui angajat.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={onLoadChecklist}>Reîncarcă checklist</Button>
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-slate-200 p-2 text-sm"><div className="text-xs text-slate-500">Angajați</div><strong>{dossierChecklist.summary?.total || 0}</strong></div>
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm"><div className="text-xs text-emerald-700">Complete</div><strong>{dossierChecklist.summary?.complete || 0}</strong></div>
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"><div className="text-xs text-amber-700">Incomplete</div><strong>{dossierChecklist.summary?.incomplete || 0}</strong></div>
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-sm"><div className="text-xs text-rose-700">Cu lipsuri obligatorii</div><strong>{dossierChecklist.summary?.critical_missing || 0}</strong></div>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Angajat</th><th className="px-3 py-2">Complet</th><th className="px-3 py-2">Lipsesc</th><th className="px-3 py-2">Status documente</th><th className="px-3 py-2"></th></tr></thead>
          <tbody>
            {rows.slice().sort((a, b) => a.percent - b.percent || String(a.nume_complet).localeCompare(String(b.nume_complet))).map(row => (
              <tr key={row.employee_id} className="border-t border-slate-100">
                <td className="px-3 py-2"><div className="font-medium">{row.nume_complet}</div><div className="text-xs text-slate-400">{row.functia || '-'} · Marca {row.marca || '-'}</div></td>
                <td className="px-3 py-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"><div className={`h-2 ${row.percent === 100 ? 'bg-emerald-500' : row.percent >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${row.percent || 0}%` }} /></div>
                  <div className="mt-1 text-xs text-slate-500">{row.required_done}/{row.required_total} · {row.percent}%</div>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{row.missing_required?.length ? row.missing_required.join(', ') : <span className="text-emerald-700">Nimic obligatoriu</span>}</td>
                <td className="px-3 py-2">
                  <div className="flex max-w-md flex-wrap gap-1">
                    {(row.items || []).map(item => <span key={item.key} className={`rounded px-2 py-1 text-xs ${item.ok ? 'bg-emerald-50 text-emerald-700' : item.required ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{item.ok ? '✓' : '×'} {item.label}</span>)}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{(() => { const emp = employees.find(item => String(item.id) === String(row.employee_id)); return emp ? <Button size="sm" variant="secondary" onClick={() => onOpenEmployee(emp)}>Dosar</Button> : null })()}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-400">Nu există date pentru checklist.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function EmployeeQuickDocumentsCard({
  employee,
  onError,
  printAdeverinta,
  printActAditional,
  printCerereAngajare,
  printCerereConc,
  printCIM,
  printDecizieConc,
  printDeclDeduceri,
  printDeclFunctieBaza,
  printFisaPost,
  printNotaGDPR,
  printNotaLichidare,
  printNotificarePrv,
}) {
  const employeeDataRequest = () => api.get(`/hr/employees/${employee.id}/adeverinta`, { params: { tip: 'salariat' } })

  const onboardingItems = [
    { label: '📝 Cerere de angajare', fn: async () => { const response = await employeeDataRequest(); printCerereAngajare(response.data) }, cls: 'bg-slate-50 text-slate-700 hover:bg-slate-100' },
    { label: '📑 Contract individual muncă', fn: async () => { const response = await api.get(`/hr/employees/${employee.id}/cim`); printCIM(response.data) }, cls: 'bg-primary-50 text-primary-700 hover:bg-primary-100' },
    { label: '📋 Fișa postului', fn: async () => { const response = await employeeDataRequest(); printFisaPost(response.data) }, cls: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
    { label: '💸 Declarație deduceri personale', fn: async () => { const response = await employeeDataRequest(); printDeclDeduceri(response.data) }, cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
    { label: '🏢 Declarație funcție de bază', fn: async () => { const response = await employeeDataRequest(); printDeclFunctieBaza(response.data) }, cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { label: '🔒 Notă informare GDPR', fn: async () => { const response = await employeeDataRequest(); printNotaGDPR(response.data) }, cls: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  ]
  const certificates = [
    { tip: 'salariat', label: '👤 Adeverință salariat', cls: 'bg-primary-50 text-primary-700 hover:bg-primary-100' },
    { tip: 'venit', label: '💰 Adeverință de venit', cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
    { tip: 'vechime', label: '📅 Adeverință vechime', cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { tip: 'functie', label: '💼 Adeverință funcție', cls: 'bg-slate-50 text-slate-700 hover:bg-slate-100' },
    { tip: 'casa_sanatate', label: '🏥 Adeverință casă sănătate', cls: 'bg-green-50 text-green-700 hover:bg-green-100' },
    { tip: 'concediu_medical', label: '🤒 Adeverință concediu medical', cls: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
  ]
  const contractItems = [
    { label: '📎 Act adițional CIM', fn: async () => { const response = await employeeDataRequest(); printActAditional(response.data) }, cls: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
    { label: '🏖️ Cerere concediu odihnă', fn: async () => { const response = await employeeDataRequest(); printCerereConc(response.data, 'co') }, cls: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
    { label: '🕊️ Cerere concediu fără plată', fn: async () => { const response = await employeeDataRequest(); printCerereConc(response.data, 'fara_plata') }, cls: 'bg-slate-50 text-slate-700 hover:bg-slate-100' },
    { label: '👨‍👩‍👧 Cerere concediu familial', fn: async () => { const response = await employeeDataRequest(); printCerereConc(response.data, 'fam') }, cls: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
  ]
  const terminationItems = [
    { label: '📬 Notificare preaviz concediere', fn: async () => { const response = await employeeDataRequest(); printNotificarePrv(response.data) }, cls: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
    { label: '⚖️ Decizie de concediere', fn: async () => { const response = await employeeDataRequest(); printDecizieConc(response.data) }, cls: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
    { label: '📅 Adeverință vechime la ieșire', fn: async () => { const response = await api.get(`/hr/employees/${employee.id}/adeverinta`, { params: { tip: 'vechime' } }); printAdeverinta(response.data) }, cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { label: '🧾 Notă de lichidare', fn: async () => { const [response, equipment] = await Promise.all([employeeDataRequest(), api.get(`/hr/echipamente/angajat/${employee.id}`)]); printNotaLichidare({ ...response.data, inventar: equipment.data.inventar }) }, cls: 'bg-red-50 text-red-700 hover:bg-red-100' },
  ]

  return (
    <Card className="overflow-hidden">
      <div className="mb-3 flex items-center gap-3 border-b border-slate-100 pb-3">
        {employee.photo_url
          ? <img src={employee.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" onError={event => { event.target.style.display = 'none' }} />
          : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl">👤</div>
        }
        <div>
          <div className="font-semibold text-slate-900">{fullName(employee)}</div>
          <div className="text-xs text-slate-400">{employee.functia || '-'} · {employee.department_name || '-'} · Angajat din {employee.data_angajare || '—'}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">📋 La angajare</div>
          <div className="flex flex-col gap-1">
            {onboardingItems.map(item => <EmployeeDocumentButton key={item.label} item={item} onError={onError} />)}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">📄 Adeverințe</div>
          <div className="flex flex-col gap-1">
            {certificates.map(item => (
              <EmployeeDocumentButton
                key={item.tip}
                item={{
                  ...item,
                  error: 'Eroare la generare adeverință.',
                  fn: async () => {
                    const response = await api.get(`/hr/employees/${employee.id}/adeverinta`, { params: { tip: item.tip } })
                    printAdeverinta(response.data)
                  },
                }}
                onError={onError}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">🔄 Pe durata contractului</div>
          <div className="flex flex-col gap-1">
            {contractItems.map(item => <EmployeeDocumentButton key={item.label} item={item} onError={onError} />)}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">🔴 La încetare contract</div>
          <div className="flex flex-col gap-1">
            {terminationItems.map(item => <EmployeeDocumentButton key={item.label} item={item} onError={onError} />)}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function HRDocumentsPanel({
  employees,
  filteredEmployees,
  dossierDashboard,
  dossierDashboardRows,
  dossierDashboardFilter,
  dossierReminderResult,
  dossierChecklist,
  hrDocumentTemplates,
  templateWordUploading,
  canManageTemplates,
  onDownloadDossierReport,
  onLoadDossierDashboard,
  onLoadDossierChecklist,
  onLoadHrDocumentTemplates,
  onDossierDashboardFilterChange,
  onOpenEmployee,
  onSendDossierReminder,
  onDownloadTemplateWordFile,
  onOpenTemplateWordTest,
  onChooseTemplateWordFile,
  onStartTemplateEditing,
  onError,
  printAdeverinta,
  printActAditional,
  printCerereAngajare,
  printCerereConc,
  printCIM,
  printDecizieConc,
  printDeclDeduceri,
  printDeclFunctieBaza,
  printFisaPost,
  printNotaGDPR,
  printNotaLichidare,
  printNotificarePrv,
}) {
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 text-sm font-semibold text-slate-700">📂 Dosar personal — generare documente HR</div>
            <p className="text-xs text-slate-400">Selectează angajatul și documentul dorit. Documentele se deschid în tab nou pentru print / salvare PDF.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={onDownloadDossierReport}>📊 Export raport dosar HR</Button>
        </div>
      </Card>

      <DossierDashboardSection
        employees={employees}
        dossierDashboard={dossierDashboard}
        dossierDashboardRows={dossierDashboardRows}
        dossierDashboardFilter={dossierDashboardFilter}
        dossierReminderResult={dossierReminderResult}
        onLoadDashboard={onLoadDossierDashboard}
        onDownloadReport={onDownloadDossierReport}
        onFilterChange={onDossierDashboardFilterChange}
        onOpenEmployee={onOpenEmployee}
        onSendReminder={onSendDossierReminder}
      />

      <HrTemplatesSection
        templates={hrDocumentTemplates}
        wordUploading={templateWordUploading}
        canManageTemplates={canManageTemplates}
        onLoadTemplates={onLoadHrDocumentTemplates}
        onDownloadWord={onDownloadTemplateWordFile}
        onOpenWordTest={onOpenTemplateWordTest}
        onChooseWord={onChooseTemplateWordFile}
        onStartEditing={onStartTemplateEditing}
      />

      <DossierChecklistSection
        employees={employees}
        dossierChecklist={dossierChecklist}
        onLoadChecklist={onLoadDossierChecklist}
        onOpenEmployee={onOpenEmployee}
      />

      <div className="grid gap-4">
        {filteredEmployees.map(employee => (
          <EmployeeQuickDocumentsCard
            key={employee.id}
            employee={employee}
            onError={onError}
            printAdeverinta={printAdeverinta}
            printActAditional={printActAditional}
            printCerereAngajare={printCerereAngajare}
            printCerereConc={printCerereConc}
            printCIM={printCIM}
            printDecizieConc={printDecizieConc}
            printDeclDeduceri={printDeclDeduceri}
            printDeclFunctieBaza={printDeclFunctieBaza}
            printFisaPost={printFisaPost}
            printNotaGDPR={printNotaGDPR}
            printNotaLichidare={printNotaLichidare}
            printNotificarePrv={printNotificarePrv}
          />
        ))}
        {filteredEmployees.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">Nu există angajați activi.</div>
        ) : null}
      </div>
    </div>
  )
}
