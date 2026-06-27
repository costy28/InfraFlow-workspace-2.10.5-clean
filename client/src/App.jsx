import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { PermissionGuard } from './components/PermissionGuard'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SetariPage = lazy(() => import('./pages/SetariPage'))
const DepartamentPage = lazy(() => import('./pages/DepartamentPage'))
const ProductiePage = lazy(() => import('./pages/modules/ProductiePage'))
const StocuriPage = lazy(() => import('./pages/modules/StocuriPage'))
const HRPage = lazy(() => import('./pages/modules/HRPage'))
const TehnicPage = lazy(() => import('./pages/modules/TehnicPage'))
const ControllingPage = lazy(() => import('./pages/modules/ControllingPage'))
const ContabilitateDashboard = lazy(() => import('./pages/accounting/ContabilitateDashboard'))
const PlanConturi = lazy(() => import('./pages/accounting/PlanConturi'))
const SolduriInitiale = lazy(() => import('./pages/accounting/SolduriInitiale'))
const FurnizoriContab = lazy(() => import('./pages/accounting/FurnizoriContab'))
const ClientiContab = lazy(() => import('./pages/accounting/ClientiContab'))
const FacturiIntrare = lazy(() => import('./pages/accounting/FacturiIntrare'))
const FacturiIesire = lazy(() => import('./pages/accounting/FacturiIesire'))
const Trezorerie = lazy(() => import('./pages/accounting/Trezorerie'))
const OperatiuniContabile = lazy(() => import('./pages/accounting/OperatiuniContabile'))
const JurnaleClasice = lazy(() => import('./pages/accounting/JurnaleClasice'))
const RegistruJurnal = lazy(() => import('./pages/accounting/RegistruJurnal'))
const CarteaMare = lazy(() => import('./pages/accounting/CarteaMare'))
const TVADeclaratii = lazy(() => import('./pages/accounting/TVADeclaratii'))
const Balanta = lazy(() => import('./pages/accounting/Balanta'))
const ProfitPierdere = lazy(() => import('./pages/accounting/ProfitPierdere'))
const FisaCont = lazy(() => import('./pages/accounting/FisaCont'))
const InchidereLuna = lazy(() => import('./pages/accounting/InchidereLuna'))
const AlerteLegislative = lazy(() => import('./pages/accounting/AlerteLegislative'))
const SabloaneNote = lazy(() => import('./pages/accounting/SabloaneNote'))
const ContabilitateAnaf = lazy(() => import('./pages/accounting/ContabilitateAnaf'))
const ContabilitateControlling = lazy(() => import('./pages/accounting/ContabilitateControlling'))
const FlotaPage = lazy(() => import('./pages/modules/FlotaPage'))
const FoaieParcursPage = lazy(() => import('./pages/FoaieParcursPage'))
const FcUtilajePage = lazy(() => import('./pages/FcUtilajePage'))
const FAZUtilaje = lazy(() => import('./pages/FAZUtilaje'))
const FisaVehicul = lazy(() => import('./pages/FisaVehicul'))
const MyVehicle = lazy(() => import('./pages/MyVehicle'))
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
const isDemoBuild = import.meta.env.VITE_DEMO_MODE === 'true'
const StartDemoPage = isDemoBuild ? lazy(() => import('./pages/StartDemoPage')) : null

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
        <Route path="/" element={<Navigate to="/login" replace />} />
        {isDemoBuild && <Route path="/start-demo" element={<StartDemoPage />} />}
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
        <Route path="/contabilitate" element={<WithLayout><PermissionGuard permission="accounting:view"><ContabilitateDashboard /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/plan-conturi" element={<WithLayout><PermissionGuard permission="accounting:view"><PlanConturi /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/solduri-initiale" element={<WithLayout><PermissionGuard permission="accounting:view"><SolduriInitiale /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/furnizori" element={<WithLayout><PermissionGuard permission="accounting:view"><FurnizoriContab /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/clienti" element={<WithLayout><PermissionGuard permission="accounting:view"><ClientiContab /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/facturi-intrare" element={<WithLayout><PermissionGuard permission="accounting:view"><FacturiIntrare /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/facturi-iesire" element={<WithLayout><PermissionGuard permission="accounting:view"><FacturiIesire /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/trezorerie" element={<WithLayout><PermissionGuard permission="accounting:view"><Trezorerie /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/operatiuni" element={<WithLayout><PermissionGuard permission="accounting:view"><OperatiuniContabile /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/jurnale" element={<WithLayout><PermissionGuard permission="accounting:reports"><JurnaleClasice /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/registru-jurnal" element={<WithLayout><PermissionGuard permission="accounting:view"><RegistruJurnal /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/cartea-mare" element={<WithLayout><PermissionGuard permission="accounting:reports"><CarteaMare /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/tva-d300" element={<WithLayout><PermissionGuard permission="accounting:reports"><TVADeclaratii /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/balanta" element={<WithLayout><PermissionGuard permission="accounting:reports"><Balanta /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/profit-pierdere" element={<WithLayout><PermissionGuard permission="accounting:reports"><ProfitPierdere /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/anaf/*" element={<WithLayout><PermissionGuard permission="anaf:view"><ContabilitateAnaf /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/controlling/*" element={<WithLayout><PermissionGuard permission="cost_accounting:view"><ContabilitateControlling /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/fisa-cont/:simbol" element={<WithLayout><PermissionGuard permission="accounting:reports"><FisaCont /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/inchidere-luna" element={<WithLayout><PermissionGuard permission="accounting:close"><InchidereLuna /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/alerte" element={<WithLayout><PermissionGuard permission="accounting:view"><AlerteLegislative /></PermissionGuard></WithLayout>} />
        <Route path="/contabilitate/sabloane-note" element={<WithLayout><PermissionGuard permission="accounting:view"><SabloaneNote /></PermissionGuard></WithLayout>} />
        <Route path="/flota/*" element={<WithLayout><PermissionGuard permission="fleet:trip_log_view"><FlotaPage /></PermissionGuard></WithLayout>} />
        <Route path="/foi-parcurs/*" element={<WithLayout><PermissionGuard permission="fleet:trip_log_view"><FoaieParcursPage /></PermissionGuard></WithLayout>} />
        <Route path="/fc-utilaje/*" element={<WithLayout><PermissionGuard permission="fleet:trip_log_view"><FcUtilajePage /></PermissionGuard></WithLayout>} />
        <Route path="/faz-utilaje/*" element={<WithLayout><PermissionGuard permission={['fleet:faz_view', 'fleet:fc_view']}><FAZUtilaje /></PermissionGuard></WithLayout>} />
        <Route path="/fleet/asset/:id" element={<WithLayout><PermissionGuard permission={['mechanization:view', 'fleet:trip_log_view', 'fleet:faz_view']}><FisaVehicul /></PermissionGuard></WithLayout>} />
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
        <Route path="/my-vehicle" element={<WithLayout><MyVehicle /></WithLayout>} />
        <Route path="/sofer/*" element={<SoferPage />} />
        <Route path="/asternere/*" element={<WithLayout><PermissionGuard permission="asternere:view"><AsternерePage /></PermissionGuard></WithLayout>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
