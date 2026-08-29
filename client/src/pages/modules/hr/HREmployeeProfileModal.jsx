import Modal from '../../../components/ui/Modal'
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
  children,
  onClose,
  onCancelEdit,
  onPhotoSelected,
  onPrint,
  onSave,
  onStartEdit,
  onReloadActivity,
  onTabChange,
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

          {guidedIssue ? <HREmployeeGuidedIssue issue={guidedIssue} /> : null}

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

function HREmployeeGuidedIssue({ issue }) {
  const isBlocker = issue.severity === 'blocker'
  const toneClass = isBlocker
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-amber-200 bg-amber-50 text-amber-800'
  const badgeClass = isBlocker ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
  const details = Array.isArray(issue.issue_details) ? issue.issue_details : []

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
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}>
          {isBlocker ? 'blocaj export' : 'atenționare'}
        </span>
      </div>
      {details.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {details.map(item => (
            <span key={`${item.field}-${item.area}`} className="rounded-full bg-white/70 px-2 py-0.5 text-[11px]">
              {item.field} → {item.area}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
