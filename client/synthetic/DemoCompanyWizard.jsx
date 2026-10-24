import { useEffect, useState } from 'react'
import Button from '../src/components/ui/Button'
import Input from '../src/components/ui/Input'

const TOKEN = 'synthetic_demo_setup_token'
const defaults = { companyName: '', country: 'RO', locale: 'ro-RO', currency: 'RON', timezone: 'Europe/Bucharest' }
const steps = ['Profilul companiei', 'Module', 'Verificare']
const labels = { documents: 'Documente', messaging: 'Mesaje', hr: 'Resurse umane', logistics: 'Logistică & Transport' }
const messages = { revision_conflict: 'Configurația s-a schimbat între timp. Reîncarcă progresul înainte să continui.',
  trial_not_active: 'Trialul nu mai este activ. Contactează administratorul InfraFlow.',
  wrong_company_or_owner: 'Contul nu are acces la configurarea acestei companii.',
  forbidden_role: 'Contul nu are rolul necesar pentru configurare.',
  module_not_allowed: 'Alege numai modulele permise pentru această companie.' }

export default function DemoCompanyWizard() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN) || '')
  const [view, setView] = useState(null), [step, setStep] = useState(0)
  const [profile, setProfile] = useState(defaults), [modules, setModules] = useState([])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [login, setLogin] = useState({ username: '', password: '' })
  function logout() { sessionStorage.removeItem(TOKEN); setToken(''); setView(null) }
  async function request(url, method = 'GET', body, bearer = token) {
    const res = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) })
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 401 && bearer) logout()
      throw Error(messages[data.code] || data.error || 'Cererea nu a putut fi procesată.')
    }
    return data
  }
  async function load(bearer = token) {
    setBusy(true); setError('')
    try {
      const data = await request('/demo-company/setup', 'GET', undefined, bearer)
      setView(data); setProfile(data.setup.profile || defaults); setModules(data.setup.modules)
      setStep(!data.setup.profile ? 0 : !data.setup.modules.length ? 1 : 2)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  useEffect(() => { if (token) load(token) }, [token]) // Synthetic entry; no ERP auth context or service worker.
  async function signIn(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const data = await request('/login', 'POST', login, '')
      if (!data.token) throw Error('Acest ecran de test nu acceptă acest flux de autentificare.')
      sessionStorage.setItem(TOKEN, data.token); setToken(data.token); setLogin({ username: '', password: '' })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const action = ['profile','modules','complete'][step]
      const result = await request('/demo-company/setup', 'PATCH', { step: action,
        input: step === 0 ? profile : step === 1 ? { modules } : {}, expectedRevision: view.setup.revision })
      setView({ ...view, setup: result.setup }); setStep(Math.min(step + 1, 2))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function applyConfiguration() {
    setBusy(true); setError('')
    try {
      const result = await request('/demo-company/setup/apply', 'POST', { expectedRevision: view.setup.revision })
      setView({ ...view, application: result.application })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-bold text-emerald-800">InfraFlow</p><h1 className="text-2xl font-semibold">Configurează compania Demo</h1></div>
        {token && <Button variant="secondary" onClick={logout} disabled={busy}>Ieșire</Button>}
      </header>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Mediu sintetic de test. {view?.application ? 'Configurația este aplicată exclusiv în ERP-ul de test, nu în Demo-ul public.' : 'Progresul este salvat separat. Aplicarea în ERP-ul de test necesită confirmare distinctă.'}</p>
      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm">{error}
        {token && <div className="mt-3"><Button variant="secondary" disabled={busy} onClick={() => load()}>Reîncarcă progresul</Button></div>}
      </div>}
      {!token ? <form onSubmit={signIn} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Autentificare în compania de test</h2>
        <Input label="Utilizator" autoComplete="username" required value={login.username} onChange={e => setLogin({ ...login, username: e.target.value })}/>
        <Input label="Parolă" type="password" autoComplete="current-password" required value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })}/>
        <Button type="submit" loading={busy}>Autentificare</Button>
      </form> : !view ? <p role="status">{busy ? 'Se încarcă progresul…' : 'Progresul nu este disponibil.'}</p> : <>
        <p className="text-sm text-slate-600">Acces până la {new Date(view.expiresAt).toLocaleString('ro-RO')}. Reluarea configurării nu prelungește trialul.</p>
        <ol className="grid grid-cols-3 gap-2" aria-label="Pașii configurării">{steps.map((name, index) => <li key={name} aria-current={index === step ? 'step' : undefined}
          className={`rounded-xl border p-3 text-sm ${index === step ? 'border-emerald-700 bg-emerald-50 font-semibold' : 'bg-white text-slate-500'}`}><span className="block">{index + 1}.</span>{name}</li>)}</ol>
        {view.setup.completedAt ? <section className="rounded-2xl border border-emerald-200 bg-white p-6" role="status">
          <h2 className="text-xl font-semibold text-emerald-800">{view.application ? 'Configurația a fost aplicată în ERP-ul de test' : 'Configurația de test a fost salvată'}</h2>
          <p className="mt-3">{view.setup.profile.companyName} · {view.setup.modules.map(k => labels[k] || k).join(', ')}</p>
          <p className="mt-3 text-sm text-slate-600">Nu s-au schimbat datele Demo-ului public. Licența, conturile și termenul trialului rămân neschimbate.</p>
          {!view.application && <Button className="mt-4" loading={busy} onClick={applyConfiguration}>Aplică în ERP-ul de test</Button>}
        </section> : <form onSubmit={save} className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{steps[step]}</h2>
          {step === 0 && <div className="grid gap-4 sm:grid-cols-2">{[
            ['companyName','Numele companiei',200],['country','Țară — cod (ex. RO)',2],['locale','Limbă și format (ex. ro-RO)',50],
            ['currency','Monedă — cod (ex. RON)',3],['timezone','Fus orar',100],
          ].map(([key,label,max]) => <Input key={key} label={label} required maxLength={max} disabled={busy} value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })}/>)}</div>}
          {step === 1 && <fieldset className="space-y-3"><legend className="mb-3 text-sm text-slate-600">Alege cel puțin un modul din cele permise pentru trial.</legend>
            {view.availableModules.map(key => <label key={key} className="flex items-center gap-3 rounded-xl border p-4"><input type="checkbox" disabled={busy} checked={modules.includes(key)}
              onChange={e => setModules(e.target.checked ? [...modules,key] : modules.filter(k => k !== key))}/><span>{labels[key] || key}</span></label>)}</fieldset>}
          {step === 2 && <dl className="grid gap-3 text-sm"><div><dt className="text-slate-500">Companie</dt><dd>{view.setup.profile.companyName}</dd></div>
            <div><dt className="text-slate-500">Profil regional</dt><dd>{view.setup.profile.country} · {view.setup.profile.locale} · {view.setup.profile.currency} · {view.setup.profile.timezone}</dd></div>
            <div><dt className="text-slate-500">Module selectate</dt><dd>{view.setup.modules.map(k => labels[k] || k).join(', ')}</dd></div></dl>}
          <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
            <Button type="button" variant="secondary" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>Înapoi</Button>
            <Button type="submit" loading={busy} disabled={step === 1 && modules.length === 0}>{step === 2 ? 'Confirmă configurația de test' : 'Salvează și continuă'}</Button>
          </div>
        </form>}
      </>}
    </div>
  </main>
}
