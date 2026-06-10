import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { PermissionGuard } from './components/PermissionGuard'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const StartDemoPage = lazy(() => import('./pages/StartDemoPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SetariPage = lazy(() => import('./pages/SetariPage'))
const DepartamentPage = lazy(() => import('./pages/DepartamentPage'))
const ProductiePage = lazy(() => import('./pages/modules/ProductiePage'))
const StocuriPage = lazy(() => import('./pages/modules/StocuriPage'))
const HRPage = lazy(() => import('./pages/modules/HRPage'))
const TehnicPage = lazy(() => import('./pages/modules/TehnicPage'))
const ControllingPage = lazy(() => import('./pages/modules/ControllingPage'))
const FlotaPage = lazy(() => import('./pages/modules/FlotaPage'))
const FoaieParcursPage = lazy(() => import('./pages/FoaieParcursPage'))
const FcUtilajePage = lazy(() => import('./pages/FcUtilajePage'))
const FAZUtilaje = lazy(() => import('./pages/FAZUtilaje'))
const AchizitiiPage = lazy(() => import('./pages/modules/AchizitiiPage'))
const ReferatePage = lazy(() => import('./pages/modules/ReferatePage'))
const TerenPage = lazy(() => import('./pages/modules/TerenPage'))
const SalubrizarePage = lazy(() => import('./pages/modules/SalubrizarePage'))
const SigurantaCircPage = lazy(() => import('./pages/modules/SigurantaCircPage'))
const MediuPage = lazy(() => import('./pages/modules/MediuPage'))
const JuridicPage = lazy(() => import('./pages/modules/JuridicPage'))
const ArhivaPage = lazy(() => import('./pages/modules/ArhivaPage'))
const SecretariatPage = lazy(() => import('./pages/modules/SecretariatPage'))
const DeszapezirePage = lazy(() => import('./pages/modules/DeszapezirePage'))
const DocumentePage = lazy(() => import('./pages/modules/DocumentePage'))
const MessagingPage = lazy(() => import('./pages/modules/MessagingPage'))
const TicketsPage = lazy(() => import('./pages/modules/TicketsPage'))
const AiPage = lazy(() => import('./pages/AiPage'))
const ImportLegacyPage = lazy(() => import('./pages/ImportLegacyPage'))
const IntersoftPage = lazy(() => import('./pages/modules/IntersoftPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const AnafPage = lazy(() => import('./pages/modules/AnafPage'))
const KioskPage = lazy(() => import('./pages/KioskPage'))
const MecanizarePage = lazy(() => import('./pages/modules/MecanizarePage'))
const GestiunePage = lazy(() => import('./pages/modules/GestiunePage'))
const SoferPage = lazy(() => import('./pages/SoferPage'))
const AsternерePage = lazy(() => import('./pages/modules/AsternерePage'))
const SetupWizardPage = lazy(() => import('./pages/SetupWizardPage'))
const FleetSignPage = lazy(() => import('./pages/FleetSignPage'))
const FleetVerifyPage = lazy(() => import('./pages/FleetVerifyPage'))

function PageLoader() {
  return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Se incarca...</div>
}

function WithLayout({ children }) {
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<StartDemoPage />} />
        <Route path="/start-demo" element={<StartDemoPage />} />
        <Route path="/setup" element={<SetupWizardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/fleet/sign/:token" element={<FleetSignPage />} />
        <Route path="/fleet/verify/:uuid" element={<FleetVerifyPage />} />
        <Route path="/dashboard" element={<WithLayout><DashboardPage /></WithLayout>} />
        <Route path="/departament/:id" element={<WithLayout><DepartamentPage /></WithLayout>} />
        <Route path="/productie/*" element={<WithLayout><PermissionGuard permission="consumptions:view"><ProductiePage /></PermissionGuard></WithLayout>} />
        <Route path="/stocuri/*" element={<WithLayout><PermissionGuard permission="materials:view"><StocuriPage /></PermissionGuard></WithLayout>} />
        <Route path="/hr/*" element={<WithLayout><PermissionGuard permission={['hr:view', 'echipamente:gestionar']}><HRPage /></PermissionGuard></WithLayout>} />
        <Route path="/tehnic/*" element={<WithLayout><TehnicPage /></WithLayout>} />
        <Route path="/controlling/*" element={<WithLayout><PermissionGuard permission="cost_accounting:view"><ControllingPage /></PermissionGuard></WithLayout>} />
        <Route path="/flota/*" element={<WithLayout><PermissionGuard permission="fleet:trip_log_view"><FlotaPage /></PermissionGuard></WithLayout>} />
        <Route path="/foi-parcurs/*" element={<WithLayout><PermissionGuard permission="fleet:trip_log_view"><FoaieParcursPage /></PermissionGuard></WithLayout>} />
        <Route path="/fc-utilaje/*" element={<WithLayout><PermissionGuard permission="fleet:trip_log_view"><FcUtilajePage /></PermissionGuard></WithLayout>} />
        <Route path="/faz-utilaje/*" element={<WithLayout><PermissionGuard permission={['fleet:faz_view', 'fleet:fc_view']}><FAZUtilaje /></PermissionGuard></WithLayout>} />
        <Route path="/achizitii/*" element={<WithLayout><PermissionGuard permission="procurement:view"><AchizitiiPage /></PermissionGuard></WithLayout>} />
        <Route path="/referate/*" element={<WithLayout><PermissionGuard permission="referate:view"><ReferatePage /></PermissionGuard></WithLayout>} />
        <Route path="/teren/*" element={<WithLayout><TerenPage /></WithLayout>} />
        <Route path="/salubrizare/*" element={<WithLayout><SalubrizarePage /></WithLayout>} />
        <Route path="/siguranta-circ/*" element={<WithLayout><SigurantaCircPage /></WithLayout>} />
        <Route path="/siguranta-circulatiei/*" element={<Navigate to="/siguranta-circ" replace />} />
        <Route path="/mediu/*" element={<WithLayout><MediuPage /></WithLayout>} />
        <Route path="/juridic/*" element={<WithLayout><JuridicPage /></WithLayout>} />
        <Route path="/arhiva/*" element={<WithLayout><ArhivaPage /></WithLayout>} />
        <Route path="/secretariat/*" element={<WithLayout><SecretariatPage /></WithLayout>} />
        <Route path="/deszapezire/*" element={<WithLayout><DeszapezirePage /></WithLayout>} />
        <Route path="/documente/*" element={<WithLayout><DocumentePage /></WithLayout>} />
        <Route path="/mesaje/*" element={<WithLayout><MessagingPage /></WithLayout>} />
        <Route path="/sesizari/*" element={<WithLayout><TicketsPage /></WithLayout>} />
        <Route path="/setari/*" element={<WithLayout><SetariPage /></WithLayout>} />
        <Route path="/ai" element={<WithLayout><AiPage /></WithLayout>} />
        <Route path="/ai-assistant" element={<WithLayout><AiPage /></WithLayout>} />
        <Route path="/import-legacy" element={<WithLayout><ImportLegacyPage /></WithLayout>} />
        <Route path="/import-date-vechi" element={<WithLayout><ImportLegacyPage /></WithLayout>} />
        <Route path="/intersoft/*" element={<WithLayout><IntersoftPage /></WithLayout>} />
        <Route path="/ajutor" element={<WithLayout><HelpPage /></WithLayout>} />
        <Route path="/anaf/*" element={<WithLayout><PermissionGuard permission="anaf:view"><AnafPage /></PermissionGuard></WithLayout>} />
        <Route path="/mecanizare/*" element={<WithLayout><PermissionGuard permission="mechanization:view"><MecanizarePage /></PermissionGuard></WithLayout>} />
        <Route path="/gestiune/*" element={<WithLayout><PermissionGuard permission="gestiune:view"><GestiunePage /></PermissionGuard></WithLayout>} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/sofer/*" element={<SoferPage />} />
        <Route path="/asternere/*" element={<WithLayout><PermissionGuard permission="asternere:view"><AsternерePage /></PermissionGuard></WithLayout>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
