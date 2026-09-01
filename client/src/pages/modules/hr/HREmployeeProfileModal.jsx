import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import {
  HREmployeeProfileActivity,
  HREmployeeProfileHeader,
  HREmployeeProfileStatusCards,
  HREmployeeProfileTabs,
} from './HREmployeeProfileChrome'

export default function HREmployeeProfileModal({
  open,
  title,
  employee,
  displayName,
  editMode,
  photoInputRef,
  photoPreview,
  contracts,
  dossierSummary,
  expirations,
  workflow,
  coBalance,
  activityItems,
  activeTab,
  guidedIssue,
  editForm,
  children,
  onClose,
  onCancelEdit,
  onPhotoSelected,
  onPrint,
  onSave,
  onStartEdit,
  onReloadActivity,
  onTabChange,
  onRefreshGuidedIssue,
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} size="lg">
      {employee ? (
        <div className="grid gap-4">
          <HREmployeeProfileHeader
            employee={employee}
            displayName={displayName}
            editMode={editMode}
            photoInputRef={photoInputRef}
            photoPreview={photoPreview}
            onCancelEdit={onCancelEdit}
            onPhotoSelected={onPhotoSelected}
            onPrint={onPrint}
            onSave={onSave}
            onStartEdit={onStartEdit}
          />

          <HREmployeeProfileStatusCards
            employee={employee}
            contracts={contracts}
            dossierSummary={dossierSummary}
            expirations={expirations}
            workflow={workflow}
            coBalance={coBalance}
          />

          {guidedIssue ? (
            <HREmployeeGuidedIssue
              issue={guidedIssue}
              employee={employee}
              editForm={editForm}
              editMode={editMode}
              contracts={contracts}
              onRefresh={onRefreshGuidedIssue}
            />
          ) : null}

          <HREmployeeProfileActivity
            items={activityItems}
            onReload={onReloadActivity}
          />

          <HREmployeeProfileTabs
            activeTab={activeTab}
            onTabChange={onTabChange}
          />

          {children}
        </div>
      ) : <p className="text-sm text-slate-500">Se incarca fișa...</p>}
    </Modal>
  )
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  return String(value).trim() !== ''
}

function activeContractFrom(contracts = []) {
  return (Array.isArray(contracts) ? contracts : []).find(item => String(item.status || 'activ') !== 'incetat') || null
}

function guideStatusForField(field, { employee, editForm, editMode, contracts }) {
  const source = editMode && editForm ? { ...employee, ...editForm } : employee || {}
  const contract = activeContractFrom(contracts)
  const label = String(field || '').toLowerCase()

  if (label === 'cui angajator') return { state: 'external', label: 'în Setări', hint: 'Se completează în profilul organizației.' }
  if (label === 'cnp') return hasValue(source.cnp) ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'de completat' }
  if (label === 'nume salariat') return hasValue(source.nume) && hasValue(source.prenume) ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'de completat' }
  if (label === 'contract activ') return contract ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'de creat' }
  if (!contract) return { state: 'pending', label: 'de completat', hint: 'Mai întâi creează un contract activ.' }
  if (label === 'număr contract') return hasValue(contract.numar_contract) ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'de completat' }
  if (label === 'dată contract') return hasValue(contract.data_contract) ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'de completat' }
  if (label === 'dată începere') return hasValue(contract.data_incepere || contract.data_start || source.data_angajare) ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'de completat' }
  if (label === 'funcție') return hasValue(contract.functie || source.functia) ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'recomandat' }
  if (label === 'normă ore') return hasValue(contract.norma_ore) ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'recomandat' }
  if (label === 'salariu bază') return hasValue(contract.salariu_baza) ? { state: 'done', label: 'rezolvat' } : { state: 'pending', label: 'recomandat' }

  return { state: 'pending', label: 'verifică' }
}

function HREmployeeGuidedIssue({ issue, employee, editForm, editMode, contracts, onRefresh }) {
  const isBlocker = issue.severity === 'blocker'
  const toneClass = isBlocker
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-amber-200 bg-amber-50 text-amber-800'
  const badgeClass = isBlocker ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
  const details = (Array.isArray(issue.issue_details) ? issue.issue_details : []).map(item => ({
    ...item,
    status: guideStatusForField(item.field, { employee, editForm, editMode, contracts })
  }))
  const resolvedCount = details.filter(item => item.status.state === 'done').length
  const progress = details.length ? Math.round((resolvedCount / details.length) * 100) : 0
  const remainingBlockers = details.filter(item => item.severity === 'blocker' && item.status.state !== 'done').length

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase opacity-80">{issue.source || 'Ghid corectare'}</div>
          <div className="font-semibold">{issue.title || 'Date de completat'}</div>
          <div className="mt-1 text-xs">
            Zona recomandată: <strong>{issue.target_area || 'Fișă angajat'}</strong>
            {issue.action_label ? ` · ${issue.action_label}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh ? <Button size="sm" variant="secondary" onClick={onRefresh}>Reverifică diagnostic</Button> : null}
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}>
            {isBlocker ? 'blocaj export' : 'atenționare'}
          </span>
        </div>
      </div>
      {details.length ? (
        <div className="mt-3 rounded-md bg-white/60 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold">Progres completare: {resolvedCount}/{details.length}</span>
            <span>{remainingBlockers ? `${remainingBlockers} blocaj(e) rămase` : 'blocajele sunt rezolvate vizual'}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white">
            <div
              className={`h-2 rounded-full ${remainingBlockers ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}
      {details.length ? (
        <div className="mt-3 grid gap-1 sm:grid-cols-2">
          {details.map(item => (
            <div key={`${item.field}-${item.area}`} className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1 text-[11px]">
              <span>{item.field} → {item.area}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${
                item.status.state === 'done'
                  ? 'bg-emerald-100 text-emerald-700'
                  : item.status.state === 'external'
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-white text-rose-700'
              }`}>
                {item.status.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
