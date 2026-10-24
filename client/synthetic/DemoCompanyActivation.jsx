import { useState } from 'react'
import Button from '../src/components/ui/Button'
import Input from '../src/components/ui/Input'

export default function DemoCompanyActivation({ token, clearToken, onLogin }) {
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null)
  async function activate(event) {
    event.preventDefault(); setError('')
    if (password !== confirmation) { setError('Parolele nu coincid.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/demo-company/activate', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ token, password, confirmPassword: confirmation }) })
      const data = await response.json()
      if (!response.ok) {
        if (data.code === 'invitation_invalid') { clearToken(); throw Error('Invitația este invalidă, expirată sau deja folosită. Solicită un link nou sau autentifică-te dacă ai activat deja contul.') }
        throw Error('Activarea nu a fost finalizată. Verifică parola și încearcă din nou. Dacă persistă, contactează administratorul.')
      }
      setResult(data); clearToken()
    } catch (e) { setError(e.message) }
    finally { setPassword(''); setConfirmation(''); setBusy(false) }
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800">
    <div className="mx-auto max-w-xl space-y-5">
      <header><p className="font-bold text-emerald-800">InfraFlow</p><h1 className="mt-1 text-2xl font-semibold">Activează compania Demo</h1></header>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Activare sintetică pe laptop. Nu se trimit emailuri și nu se modifică Demo-ul public.</p>
      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm">{error}</p>}
      {result ? <section className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-6" role="status">
        <h2 className="text-xl font-semibold text-emerald-800">Contul de test a fost activat</h2>
        <p>Utilizator: <strong>{result.username}</strong></p>
        <p>Acces până la {new Date(result.expiresAt).toLocaleString('ro-RO')}. Cele 15 zile nu se resetează la autentificare.</p>
        <Button onClick={onLogin}>Continuă la autentificare</Button>
      </section> : token ? <form onSubmit={activate} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Alege parola contului</h2>
        <p className="text-sm text-slate-600">Folosește o parolă unică, lungă, cu litere mari și mici, cifre și simboluri. Regulile finale sunt verificate de server.</p>
        <Input label="Parolă nouă" type="password" autoComplete="new-password" required minLength={12} maxLength={256} disabled={busy} value={password} onChange={e => setPassword(e.target.value)}/>
        <Input label="Confirmă parola" type="password" autoComplete="new-password" required maxLength={256} disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)}/>
        <Button type="submit" loading={busy}>Activează contul de test</Button>
        <p className="text-xs text-slate-500">Tokenul nu este salvat în browser. Dacă reîncarci pagina înainte de activare, redeschide linkul original al invitației.</p>
      </form> : <section className="space-y-4 rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold">Redeschide invitația originală</h2>
        <p className="text-sm">Linkul nu mai este disponibil în această pagină. Dacă ai activat deja contul, poți continua la autentificare.</p>
        <Button variant="secondary" onClick={onLogin}>Continuă la autentificare</Button>
      </section>}
    </div>
  </main>
}
