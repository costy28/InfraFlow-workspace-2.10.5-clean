import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import DemoCompanyWizard from './DemoCompanyWizard'
import DemoCompanyActivation from './DemoCompanyActivation'
import '../src/index.css'
// Separate development entry, absent from App routes and production build inputs.
function consumeInvitationFragment() {
    const raw = location.hash
    const activation = raw === '#activate' || raw.startsWith('#invite=')
    const token = raw.startsWith('#invite=') ? raw.slice('#invite='.length) : ''
    if (activation) history.replaceState(null, '', location.pathname + '#activate')
    return { activation, token: /^[a-f0-9]{64}$/.test(token) ? token : '' }
}
function SyntheticEntry() {
  const [invitation, setInvitation] = useState(consumeInvitationFragment)
  useEffect(() => {
    const changed = () => setInvitation(consumeInvitationFragment())
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  return invitation.activation ? <DemoCompanyActivation token={invitation.token}
    clearToken={() => setInvitation({ activation: true, token: '' })}
    onLogin={() => { history.replaceState(null, '', location.pathname); setInvitation({ activation: false, token: '' }) }}/>
    : <DemoCompanyWizard />
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')).render(<SyntheticEntry />)
