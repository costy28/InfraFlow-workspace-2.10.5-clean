import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../hooks/useAuth'

const LS_REMEMBER = 'infraflow_remember'

function InputField({ label, id, type = 'text', value, onChange, autoComplete, icon: Icon, required, suffix }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        {Icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Icon size={16} />
          </div>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required={required}
          className={`w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${Icon ? 'pl-10' : 'pl-3'}`}
        />
        {suffix}
      </div>
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [view, setView] = useState('login') // 'login' | 'forgot' | 'reset'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [forgotUsername, setForgotUsername] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Mesaj de succes după Setup Wizard
  useEffect(() => {
    if (location.state?.setupDone) {
      setInfo('✅ Configurare finalizată! Logați-vă cu contul de administrator creat.')
    }
  }, [location.state])

  // Verifică dacă setup-ul e necesar la mount — redirecționează dacă da
  useEffect(() => {
    api.get('/setup/status').then(res => {
      if (res.data?.required) navigate('/setup', { replace: true })
    }).catch(() => { /* server poate fi offline, ignorăm */ })
  }, [navigate])

  // Restaurăm username din remember me
  useEffect(() => {
    const saved = localStorage.getItem(LS_REMEMBER)
    if (saved) {
      setUsername(saved)
      setRememberMe(true)
    }
  }, [])

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
      if (rememberMe) {
        localStorage.setItem(LS_REMEMBER, username.trim())
      } else {
        localStorage.removeItem(LS_REMEMBER)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Autentificare eșuată. Verificați datele.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await api.post('/auth/forgot-password', { username: forgotUsername })
      setInfo(response.data.message || 'Verificați emailul sau contactați administratorul.')
      setView('reset')
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la procesarea cererii.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await api.post('/auth/reset-password', {
        username: forgotUsername,
        code: resetCode,
        newPassword,
      })
      setInfo(response.data.message || 'Parola a fost resetată.')
      setView('login')
      setUsername(forgotUsername)
      setPassword('')
    } catch (err) {
      setError(err.response?.data?.error || 'Cod invalid sau expirat.')
    } finally {
      setLoading(false)
    }
  }

  const passwordSuffix = (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => setShowPassword(v => !v)}
      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
    >
      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-sm">
        {/* Logo + branding */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg">
            <span className="text-2xl font-bold">IF</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">InfraFlow</h1>
          <p className="mt-1 text-sm text-slate-500">Sistem ERP infrastructură publică</p>
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-primary-700 hover:underline"
            onClick={() => navigate('/start-demo')}
          >
            Deschide Start Demo
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">

          {/* ── VIEW: LOGIN ── */}
          {view === 'login' && (
            <>
              <h2 className="mb-6 text-lg font-semibold text-slate-900">Autentificare</h2>
              <form className="grid gap-4" onSubmit={handleLogin}>
                <InputField
                  label="Utilizator"
                  id="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  icon={User}
                  required
                />
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">Parolă</label>
                    <button type="button" onClick={() => { setView('forgot'); setForgotUsername(username); setError(''); setInfo('') }} className="mb-1.5 text-xs text-primary-600 hover:underline">
                      Ai uitat parola?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Lock size={16} />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Ține-mă minte pe acest dispozitiv
                </label>

                {error && <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
                {info && <p className="rounded-lg bg-primary-50 px-3 py-2.5 text-sm text-primary-700">{info}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:bg-primary-700 disabled:opacity-60"
                >
                  {loading ? 'Se autentifică...' : 'Autentificare'}
                </button>
              </form>
            </>
          )}

          {/* ── VIEW: FORGOT PASSWORD ── */}
          {view === 'forgot' && (
            <>
              <button onClick={() => { setView('login'); setError(''); setInfo('') }} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                ← Înapoi
              </button>
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Resetare parolă</h2>
              <p className="mb-6 text-sm text-slate-500">Introdu utilizatorul sau emailul. Dacă contul există, vei primi un cod de resetare.</p>
              <form className="grid gap-4" onSubmit={handleForgot}>
                <InputField
                  label="Utilizator sau email"
                  id="forgot-user"
                  value={forgotUsername}
                  onChange={e => setForgotUsername(e.target.value)}
                  autoComplete="username email"
                  icon={Mail}
                  required
                />
                {error && <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
                <button type="submit" disabled={loading} className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60">
                  {loading ? 'Se procesează...' : 'Trimite cod resetare'}
                </button>
                <button type="button" onClick={() => { setView('reset'); setError(''); }} className="text-center text-sm text-primary-600 hover:underline">
                  Am deja un cod de resetare
                </button>
              </form>
            </>
          )}

          {/* ── VIEW: RESET PASSWORD ── */}
          {view === 'reset' && (
            <>
              <button onClick={() => { setView('forgot'); setError(''); }} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                ← Înapoi
              </button>
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Introdu codul</h2>
              {info && <p className="mb-4 rounded-lg bg-primary-50 px-3 py-2.5 text-sm text-primary-700">{info}</p>}
              <form className="grid gap-4" onSubmit={handleReset}>
                <InputField
                  label="Utilizator"
                  id="reset-user"
                  value={forgotUsername}
                  onChange={e => setForgotUsername(e.target.value)}
                  icon={User}
                  required
                />
                <InputField
                  label="Cod de resetare (6 cifre)"
                  id="reset-code"
                  value={resetCode}
                  onChange={e => setResetCode(e.target.value)}
                  autoComplete="one-time-code"
                  required
                />
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">Parolă nouă</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Lock size={16} />
                    </div>
                    <input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowNewPassword(v => !v)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {error && <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
                <button type="submit" disabled={loading} className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60">
                  {loading ? 'Se resetează...' : 'Resetează parola'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">InfraFlow ERP · v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}</p>
      </div>
    </main>
  )
}
