import Button from '../../../components/ui/Button'

export const ALL_HR_TABS = [
  { id: 'Dashboard HR',       perm: 'hr:view' },
  { id: 'Inbox HR',           perm: 'hr:view' },
  { id: 'Angajați',           perm: 'hr:employees_manage' },
  { id: 'Pontaj',             perm: 'hr:timesheets_view' },
  { id: 'Pontaj Avansat',     perm: 'hr:timesheets_view' },
  { id: 'Ture & Program',     perm: 'hr:timesheets_view' },
  { id: 'Tichete masă',       perm: 'hr:manage' },
  { id: 'Overview pontaje',   perm: 'hr:timesheets_manage' },
  { id: 'Concedii',           perm: 'hr:leave_manage' },
  { id: 'Autorizații',        perm: 'hr:authorizations_manage' },
  { id: '🦺 Echipamente',      perm: 'echipamente:gestionar', fallbackPerm: 'hr:view' },
  { id: 'Training & Evaluări',perm: 'hr:training' },
  { id: 'Organigramă',        perm: 'hr:view' },
  { id: 'Documente HR',       perm: 'hr:contracts_manage' },
]

export function getVisibleHrTabs(hasPerm) {
  return ALL_HR_TABS
    .filter(tab => hasPerm(tab.perm) || (tab.fallbackPerm && hasPerm(tab.fallbackPerm)))
    .map(tab => tab.id)
}

export default function HRNavigationTabs({
  tabs,
  activeTab,
  onTabChange,
  dashboardAlertsCount = 0,
  inboxTotal = 0
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {tabs.map(tab => (
        <Button key={tab} variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => onTabChange(tab)}>
          {tab === 'Dashboard HR' && dashboardAlertsCount > 0 ? `${tab} 🔴` : tab}
          {tab === 'Inbox HR' && Number(inboxTotal || 0) > 0 ? ` (${inboxTotal})` : ''}
        </Button>
      ))}
    </div>
  )
}
