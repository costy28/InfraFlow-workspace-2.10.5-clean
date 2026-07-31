import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../hooks/useAuth'

const accounts = [
  {
    key: 'director',
    title: 'Director',
    username: 'director',
    password: 'demo123',
    route: '/dashboard',
    badge: 'Aprobari',
    description: 'Vede tabloul de bord, aproba referatul RA/122 si urmareste costuri, HR si mecanizare.',
  },
  {
    key: 'mecanizare',
    title: 'Coordonator Resurse',
    username: 'sef.mecanizare',
    password: 'demo123',
    route: '/mecanizare',
    badge: 'Operatiuni',
    description: 'Trimite foi de lucru către operatorii din teren și închide foile completate.',
  },
  {
    key: 'kiosk',
    title: 'Operator Kiosk',
    username: 'sofer1',
    password: 'demo123',
    route: '/kiosk',
    badge: 'Mobil',
    description: 'Experiență de telefon pentru angajatul din teren: pontaj, echipamente, concediu și foaie de lucru.',
    publicRoute: true,
  },
  {
    key: 'admin',
    title: 'Admin Demo',
    username: 'demo',
    password: 'demo123',
    route: '/dashboard',
    badge: 'Reset',
    description: 'Acces complet pentru reset demo si verificarea modulelor fara restrictii.',
  },
]

export default function StartDemoPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [demo, setDemo] = useState(null)
  const [loadingKey, setLoadingKey] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/demo-status')
      .then(response => {
        const isDemo = response.data?.demo === true
        setDemo(isDemo)
        if (!isDemo) navigate('/dashboard', { replace: true })
      })
      .catch(() => setDemo(true))
  }, [navigate])

  async function enter(account) {
    setError('')
    setLoadingKey(account.key)
    try {
      localStorage.setItem('infraflow_presentation_mode', 'true')
      if (account.publicRoute) {
        navigate(account.route)
        return
      }
      await login(account.username, account.password)
      navigate(account.route)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut autentifica acest cont demo.')
    } finally {
      setLoadingKey('')
    }
  }

  if (demo === false) return null

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <section className="mx-auto grid min-h-screen max-w-6xl content-center gap-6 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase text-primary-700">InfraFlow ERP demo</div>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950">Organizație Demo SRL</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Scenariu pregătit pentru prezentare: director, coordonator resurse, operator pe mobil și reset rapid al datelor.
            </p>
          </div>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-primary-300"
            onClick={() => navigate('/login')}
          >
            Login manual
          </button>
        </div>

        {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {accounts.map(account => (
            <button
              key={account.key}
              className="group min-h-64 rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md"
              onClick={() => enter(account)}
              disabled={loadingKey === account.key}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-md bg-primary-50 px-2.5 py-1 text-xs font-bold uppercase text-primary-700">{account.badge}</span>
                <span className="text-xs text-slate-400">{account.username}</span>
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-950">{account.title}</h2>
              <p className="mt-3 min-h-20 text-sm leading-6 text-slate-600">{account.description}</p>
              <div className="mt-5 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <div><span className="text-slate-500">User:</span> <strong>{account.username}</strong></div>
                <div><span className="text-slate-500">Parola:</span> <strong>{account.password}</strong></div>
              </div>
              <div className="mt-5 text-sm font-semibold text-primary-700 group-hover:text-primary-800">
                {loadingKey === account.key ? 'Se deschide...' : 'Deschide demo'}
              </div>
            </button>
          ))}
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 md:grid-cols-5">
          {['Start Demo', 'Director aprobă referat', 'Coordonatorul trimite foaia', 'Operatorul completează Kiosk', 'Reset demo'].map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-600 text-xs font-bold text-white">{index + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
