import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Lock } from 'lucide-react'
import api from '../api/client'

export default function DemoInvitePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const token = params.get('token') || ''

  async function activate(event) {
    event.preventDefault()
    setError('')
    if (!token) {
      setError('Linkul de activare este incomplet.')
      return
    }
    setLoading(true)
    try {
      const response = await api.post('/demo/invites/activate', {
        token,
        password,
        password_confirmation: confirmation,
      })
      setUsername(response.data?.username || '')
    } catch (err) {
      setError(err.response?.data?.error || 'Accesul Demo nu a putut fi activat.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-2xl font-bold text-white shadow-lg">IF</div>
          <h1 className="text-2xl font-bold text-slate-900">Activează accesul Demo</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Alege o parolă proprie. Linkul este unic și devine inutil după activare.</p>
        </div>

        {username ? (
          <div className="grid gap-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-semibold">Accesul Demo a fost activat.</p>
              <p className="mt-2">Utilizatorul tău este <strong>{username}</strong>.</p>
            </div>
            <button type="button" className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700" onClick={() => navigate('/login', { state: { demoInviteActivated: true, username } })}>
              Mergi la autentificare
            </button>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={activate}>
            <div>
              <label htmlFor="demo-password" className="mb-1.5 block text-sm font-medium text-slate-700">Parolă nouă</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} />
                <input id="demo-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword(current => !current)} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600" aria-label="Afișează sau ascunde parola">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Folosește cel puțin 10 caractere, o literă mare, o literă mică și o cifră.</p>
            </div>
            <div>
              <label htmlFor="demo-password-confirmation" className="mb-1.5 block text-sm font-medium text-slate-700">Confirmă parola</label>
              <input id="demo-password-confirmation" type={showPassword ? 'text' : 'password'} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700" role="alert">{error}</p>}
            <button type="submit" disabled={loading} className="mt-1 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60">{loading ? 'Se activează...' : 'Activează accesul'}</button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-400"><Link to="/login" className="hover:underline">Înapoi la autentificare</Link></p>
      </section>
    </main>
  )
}
