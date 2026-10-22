import { createRoot } from 'react-dom/client'
import DemoCompanyWizard from './DemoCompanyWizard'
import '../src/index.css'
// Separate development entry, absent from App routes and production build inputs.
if (import.meta.env.DEV) createRoot(document.getElementById('root')).render(<DemoCompanyWizard />)
