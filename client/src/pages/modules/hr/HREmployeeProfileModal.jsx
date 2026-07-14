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
