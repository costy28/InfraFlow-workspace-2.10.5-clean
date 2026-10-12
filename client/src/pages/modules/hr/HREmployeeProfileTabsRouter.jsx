import HREmployeeAttendanceTab from './HREmployeeAttendanceTab'
import HREmployeeContractsTab from './HREmployeeContractsTab'
import HREmployeeEquipmentSection from './HREmployeeEquipmentSection'
import HREmployeeFilesTab from './HREmployeeFilesTab'
import HREmployeeKioskTab from './HREmployeeKioskTab'
import HREmployeePersonalTab from './HREmployeePersonalTab'
import HREmployeeWorkflowTab from './HREmployeeWorkflowTab'

export default function HREmployeeProfileTabsRouter({
  activeTab,
  employee,
  editMode,
  editForm,
  departments,
  linkableUsers,
  coBalance,
  adeverintaData,
  adeverintaTip,
  identityText,
  daysUntil,
  alertTone,
  contracts,
  amendments,
  transferHistory,
  canManageHr,
  canManageContracts = false,
  canGenerateCertificate = false,
  canWriteField = () => false,
  canGenerateWord = false,
  canArchiveWord = false,
  canReadWorkflow = false,
  canReadDossier = false,
  canAccessFileType = () => false,
  canManageWorkflow = false,
  documentTemplates,
  leaves,
  dossierSummary,
  expirations,
  suggestedUpload,
  workflow,
  workflowBusy,
  guidedWorkflowStep,
  guidedIssue,
  employeeEquipment,
  canManageEquipment,
  onEditFormChange,
  onLoadAdeverinta,
  onAdeverintaTipChange,
  onPrintAdeverinta,
  onReloadContracts,
  onError,
  onPrintContract,
  onPrintAmendment,
  onGenerateContractWord,
  onGenerateAmendmentWord,
  onArchiveContractWord,
  onArchiveAmendmentWord,
  onSuggestionUsed,
  onSendDossierReminder,
  onReloadWorkflow,
  onStartWorkflow,
  onToggleWorkflowStep,
  onCloseWorkflow,
  getStepActions,
  onOpenDotare,
  onSaveEmployeeSizes,
  onSetReturnedEquipment,
}) {
  if (!employee) return null

  if (activeTab === 'date') {
    return (
      <HREmployeePersonalTab
        canWriteField={canWriteField}
        employee={employee}
        editMode={editMode}
        editForm={editForm}
        departments={departments}
        linkableUsers={linkableUsers}
        coBalance={coBalance}
        adeverintaData={adeverintaData}
        adeverintaTip={adeverintaTip}
        identityText={identityText}
        daysUntil={daysUntil}
        alertTone={alertTone}
        onEditFormChange={onEditFormChange}
        onLoadAdeverinta={onLoadAdeverinta}
        onAdeverintaTipChange={onAdeverintaTipChange}
        onPrintAdeverinta={onPrintAdeverinta}
        canGenerateCertificate={canGenerateCertificate}
        guidedIssue={guidedIssue}
      />
    )
  }

  if (activeTab === 'contracte') {
    return (
      <HREmployeeContractsTab
        employeeId={employee.id}
        contracts={contracts}
        amendments={amendments}
        transferHistory={transferHistory}
        departments={departments}
        canManage={canManageContracts}
        onReload={onReloadContracts}
        onError={onError}
        onPrintContract={canGenerateWord ? onPrintContract : null}
        onPrintAmendment={canGenerateWord ? onPrintAmendment : null}
        onGenerateContractWord={canGenerateWord ? onGenerateContractWord : null}
        onGenerateAmendmentWord={canGenerateWord ? onGenerateAmendmentWord : null}
        onArchiveContractWord={canArchiveWord ? onArchiveContractWord : null}
        onArchiveAmendmentWord={canArchiveWord ? onArchiveAmendmentWord : null}
        documentTemplates={documentTemplates}
        guidedIssue={guidedIssue}
      />
    )
  }

  if (activeTab === 'pontaj') {
    return <HREmployeeAttendanceTab employee={employee} coBalance={coBalance} leaves={leaves} />
  }

  if (activeTab === 'dosar') {
    return (
      <HREmployeeFilesTab
        employeeId={employee.id}
        canAccessFileType={canAccessFileType}
        canManage={canManageHr}
        onError={onError}
        suggestedUpload={suggestedUpload}
        onSuggestionUsed={onSuggestionUsed}
      />
    )
  }

  if (activeTab === 'kiosk') {
    return (
      <HREmployeeKioskTab
        canRead={canReadDossier}
        dossierSummary={dossierSummary}
        expirations={expirations}
        onSendReminder={canManageHr && canReadWorkflow ? onSendDossierReminder : null}
      />
    )
  }

  if (activeTab === 'flux') {
    return (
      <HREmployeeWorkflowTab
        canRead={canReadWorkflow}
        canManage={canManageWorkflow}
        workflow={workflow}
        busy={workflowBusy}
        guidedStep={guidedWorkflowStep}
        onReload={onReloadWorkflow}
        onStartWorkflow={onStartWorkflow}
        onToggleStep={onToggleWorkflowStep}
        onCloseWorkflow={onCloseWorkflow}
        getStepActions={getStepActions}
      />
    )
  }

  if (activeTab === 'echipamente') {
    return (
      <HREmployeeEquipmentSection
        employeeEquipment={employeeEquipment}
        canManageEquipment={canManageEquipment}
        onOpenDotare={onOpenDotare}
        onSaveEmployeeSizes={onSaveEmployeeSizes}
        onSetReturnedEquipment={onSetReturnedEquipment}
      />
    )
  }

  return null
}
