import { useState, useRef } from 'react'
import api from '../api/client'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

// ─── Date statice ─────────────────────────────────────────────────────────────

const JUDETE = [
  'Alba','Arad','Argeș','Bacău','Bihor','Bistrița-Năsăud','Botoșani','Brăila',
  'Brașov','București','Buzău','Călărași','Caraș-Severin','Cluj','Constanța',
  'Covasna','Dâmbovița','Dolj','Galați','Giurgiu','Gorj','Harghita','Hunedoara',
  'Ialomița','Iași','Ilfov','Maramureș','Mehedinți','Mureș','Neamț','Olt',
  'Prahova','Sălaj','Satu Mare','Sibiu','Suceava','Teleorman','Timiș','Tulcea',
  'Vâlcea','Vaslui','Vrancea',
]

const PROFILES = [
  {
    id: 'constructii',
    icon: '🏗️',
    title: 'Construcții & Drumuri',
    desc: 'Mecanizare, Gestiune, Producție Asfalt, Asternere',
    modules: ['gestiune','mecanizare','productie','asternere','controlling','hr'],
  },
  {
    id: 'transport',
    icon: '🚛',
    title: 'Transport & Logistică',
    desc: 'Foi parcurs, Șoferi, Mecanizare, GPS',
    modules: ['fleet','mecanizare','hr','gestiune'],
  },
  {
    id: 'servicii_publice',
    icon: '🏢',
    title: 'Servicii Publice',
    desc: 'HR, Pontaj, Documente, Sesizări, Salubrizare',
    modules: ['hr','documente','sesizari','salubrizare','gestiune'],
  },
  {
    id: 'productie',
    icon: '🏭',
    title: 'Producție Industrială',
    desc: 'Gestiune, Producție, Stocuri, Controlling',
    modules: ['gestiune','productie','stocuri','controlling','achizitii'],
  },
  {
    id: 'custom',
    icon: '⚙️',
    title: 'Personalizat',
    desc: 'Activez manual modulele dorite',
    modules: [],
  },
]

const TOTAL_STEPS = 4

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ current }) {
  const labels = ['Societate', 'Activitate', 'Administrator', 'Licență']
  return (
    <div className="mb-8 flex items-center justify-center gap-0">
      {labels.map((label, i) => {
        const step = i + 1
        const done    = step < current
        const active  = step === current
        const pending = step > current
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all
                ${done    ? 'bg-green-500 text-white'       : ''}
                ${active  ? 'bg-primary-600 text-white ring-4 ring-primary-200' : ''}
                ${pending ? 'bg-slate-200 text-slate-400'   : ''}
              `}>
                {done ? '✓' : step}
              </div>
              <span className={`hidden text-xs sm:block font-medium
                ${active  ? 'text-primary-700' : ''}
                ${done    ? 'text-green-600'   : ''}
                ${pending ? 'text-slate-400'   : ''}
              `}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div className={`mx-2 h-0.5 w-12 sm:w-16 transition-all ${done ? 'bg-green-400' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Pas 1: Societate ─────────────────────────────────────────────────────────

function Step1({ data, onChange }) {
  const [cuiLoading, setCuiLoading] = useState(false)
  const [cuiMsg, setCuiMsg] = useState('')
  const logoInputRef = useRef(null)

  async function lookupCUI() {
    if (!data.cui.trim()) return
    setCuiLoading(true)
    setCuiMsg('')
    try {
      const res = await api.get(`/setup/anaf/${data.cui.replace(/\D/g, '')}`)
      const d = res.data
      onChange({
        ...data,
        name:    d.denumire || data.name,
        address: d.adresa   || data.address,
        phone:   d.telefon  || data.phone,
      })
      setCuiMsg(`✓ ${d.denumire || 'Societate găsită în ANAF'}`)
    } catch {
      setCuiMsg('⚠ CUI negăsit în ANAF — completați manual')
    } finally {
      setCuiLoading(false)
    }
  }

  function handleLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Logo prea mare (max 2MB)'); return }
    const reader = new FileReader()
    reader.onload = ev => onChange({ ...data, logoDataUrl: ev.target.result, logoName: file.name })
    reader.readAsDataURL(file)
  }

  return (
    <div className="grid gap-4">
      {/* CUI */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">CUI / CIF *</label>
        <div className="flex gap-2">
          <input
            className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            placeholder="ex: RO12345678"
            value={data.cui}
            onChange={e => onChange({ ...data, cui: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && lookupCUI()}
          />
          <Button type="button" variant="secondary" loading={cuiLoading} onClick={lookupCUI}>
            Verifică ANAF
          </Button>
        </div>
        {cuiMsg && <p className="mt-1 text-xs text-slate-500">{cuiMsg}</p>}
      </div>

      <Input
        label="Denumire societate *"
        value={data.name}
        onChange={e => onChange({ ...data, name: e.target.value })}
        placeholder="S.C. Exemplu S.A."
      />

      <Input
        label="Adresă sediu *"
        value={data.address}
        onChange={e => onChange({ ...data, address: e.target.value })}
        placeholder="Str. Exemplu nr. 1"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Oraș *"
          value={data.city}
          onChange={e => onChange({ ...data, city: e.target.value })}
          placeholder="Cluj-Napoca"
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Județ *</label>
          <select
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            value={data.county}
            onChange={e => onChange({ ...data, county: e.target.value })}
          >
            <option value="">— Selectați județul —</option>
            {JUDETE.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Email contact"
          type="email"
          value={data.email}
          onChange={e => onChange({ ...data, email: e.target.value })}
          placeholder="office@societate.ro"
        />
        <Input
          label="Telefon"
          type="tel"
          value={data.phone}
          onChange={e => onChange({ ...data, phone: e.target.value })}
          placeholder="0264 123 456"
        />
      </div>

      {/* Logo upload */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Logo societate (opțional, max 2MB)</label>
        <div
          className="flex cursor-pointer items-center gap-4 rounded-lg border-2 border-dashed border-slate-200 p-4 transition hover:border-primary-400"
          onClick={() => logoInputRef.current?.click()}
        >
          {data.logoDataUrl
            ? <img src={data.logoDataUrl} alt="Logo" className="h-16 w-32 object-contain" />
            : <div className="flex flex-col items-center gap-1 text-slate-400">
                <span className="text-2xl">🖼️</span>
                <span className="text-xs">Click pentru upload</span>
              </div>
          }
          {data.logoName && <span className="text-xs text-slate-500">{data.logoName}</span>}
        </div>
        <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogo} />
      </div>
    </div>
  )
}

// ─── Pas 2: Profil industrie ──────────────────────────────────────────────────

function Step2({ selected, onSelect }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PROFILES.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className={`flex items-start gap-4 rounded-xl border-2 p-4 text-left transition hover:border-primary-400 hover:bg-primary-50 ${
            selected === p.id
              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
              : 'border-slate-200 bg-white'
          }`}
        >
          <span className="mt-0.5 text-3xl">{p.icon}</span>
          <div>
            <div className={`font-semibold ${selected === p.id ? 'text-primary-700' : 'text-slate-900'}`}>{p.title}</div>
            <div className="mt-0.5 text-xs text-slate-500">{p.desc}</div>
          </div>
          {selected === p.id && (
            <div className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white text-xs">✓</div>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Pas 3: Administrator ─────────────────────────────────────────────────────

function Step3({ data, onChange }) {
  const [showPass, setShowPass]  = useState(false)
  const [showConf, setShowConf]  = useState(false)

  const passStrength = (() => {
    const p = data.password
    if (!p) return null
    let score = 0
    if (p.length >= 8)  score++
    if (p.length >= 12) score++
    if (/[A-Z]/.test(p)) score++
    if (/[0-9]/.test(p)) score++
    if (/[^A-Za-z0-9]/.test(p)) score++
    if (score <= 1) return { label: 'Slabă', color: 'bg-rose-400', w: 'w-1/4' }
    if (score <= 3) return { label: 'Medie', color: 'bg-amber-400', w: 'w-2/4' }
    return { label: 'Puternică', color: 'bg-green-500', w: 'w-full' }
  })()

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nume complet *"
          value={data.name}
          onChange={e => onChange({ ...data, name: e.target.value })}
          placeholder="Ion Popescu"
        />
        <Input
          label="Username * (fără spații)"
          value={data.username}
          onChange={e => onChange({ ...data, username: e.target.value.toLowerCase().replace(/\s/g,'') })}
          placeholder="ion.popescu"
          helperText="3-32 caractere: litere, cifre, punct, minus"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Email *"
          type="email"
          value={data.email}
          onChange={e => onChange({ ...data, email: e.target.value })}
          placeholder="ion@societate.ro"
        />
        <Input
          label="Funcție / Rol în companie"
          value={data.title}
          onChange={e => onChange({ ...data, title: e.target.value })}
          placeholder="Director IT"
        />
      </div>

      {/* Parolă */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Parolă * (minim 8 caractere)</label>
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            className="h-10 w-full rounded-md border border-slate-300 px-3 pr-10 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            value={data.password}
            onChange={e => onChange({ ...data, password: e.target.value })}
            autoComplete="new-password"
          />
          <button type="button" className="absolute inset-y-0 right-3 text-slate-400 hover:text-slate-600" onClick={() => setShowPass(v => !v)}>
            {showPass ? '🙈' : '👁'}
          </button>
        </div>
        {passStrength && (
          <div className="mt-1.5">
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${passStrength.color} ${passStrength.w}`} />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Putere: {passStrength.label}</p>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Confirmă parola *</label>
        <div className="relative">
          <input
            type={showConf ? 'text' : 'password'}
            className={`h-10 w-full rounded-md border px-3 pr-10 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
              data.confirmPassword && data.confirmPassword !== data.password ? 'border-rose-400' : 'border-slate-300'
            }`}
            value={data.confirmPassword}
            onChange={e => onChange({ ...data, confirmPassword: e.target.value })}
            autoComplete="new-password"
          />
          <button type="button" className="absolute inset-y-0 right-3 text-slate-400 hover:text-slate-600" onClick={() => setShowConf(v => !v)}>
            {showConf ? '🙈' : '👁'}
          </button>
        </div>
        {data.confirmPassword && data.confirmPassword !== data.password && (
          <p className="mt-1 text-xs text-rose-600">Parolele nu coincid.</p>
        )}
      </div>
    </div>
  )
}

// ─── Pas 4: Licență ───────────────────────────────────────────────────────────

function Step4({ licenseKey, onChange, licenseStatus, onSkip }) {
  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 text-sm text-primary-800">
        <div className="mb-2 text-base font-semibold">Activare licență</div>
        <p>Dacă ați primit o cheie de licență de la InfraSuite, introduceți-o mai jos pentru a activa toate funcționalitățile.</p>
        <p className="mt-1 text-xs text-primary-600">Format: XXXXX-XXXXX-XXXXX-XXXXX sau fișier .iflic</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Cheie licență</label>
        <input
          className="h-10 w-full rounded-md border border-slate-300 px-3 font-mono text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          value={licenseKey}
          onChange={e => onChange(e.target.value)}
        />
        {licenseStatus === 'invalid' && (
          <p className="mt-1 text-xs text-rose-600">Cheie invalidă — verificați și reîncercați.</p>
        )}
        {licenseStatus === 'ok' && (
          <p className="mt-1 text-xs text-green-600">✓ Cheie licență validă!</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
        <div className="mb-1 text-sm font-medium text-slate-700">Sau continuați fără licență</div>
        <p className="mb-3 text-xs text-slate-500">
          Mod demo: 30 de zile, max 3 utilizatori.
          Puteți activa licența ulterior din <strong>Setări → Licență</strong>.
        </p>
        <Button type="button" variant="secondary" onClick={onSkip}>
          Continuă în mod demo (30 zile)
        </Button>
      </div>
    </div>
  )
}

// ─── Pagina principală ────────────────────────────────────────────────────────

export default function SetupWizardPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [company, setCompany] = useState({
    name: '', cui: '', address: '', city: '', county: '',
    email: '', phone: '', logoDataUrl: '', logoName: '',
  })
  const [profile, setProfile] = useState('')
  const [admin, setAdmin] = useState({
    name: '', username: '', email: '', password: '', confirmPassword: '', title: '',
  })
  const [licenseKey, setLicenseKey]   = useState('')
  const [licenseStatus, setLicenseStatus] = useState(null) // null | 'ok' | 'invalid'

  function validateStep() {
    if (step === 1) {
      if (!company.name.trim())    return 'Denumirea societății este obligatorie.'
      if (!company.cui.trim())     return 'CUI-ul este obligatoriu.'
      if (!company.address.trim()) return 'Adresa este obligatorie.'
      if (!company.city.trim())    return 'Orașul este obligatoriu.'
      if (!company.county)         return 'Județul este obligatoriu.'
    }
    if (step === 2) {
      if (!profile) return 'Selectați un profil de activitate.'
    }
    if (step === 3) {
      if (!admin.name.trim())     return 'Numele complet este obligatoriu.'
      if (!/^[a-z0-9._-]{3,32}$/.test(admin.username)) return 'Username invalid: 3-32 caractere, litere/cifre/punct/minus.'
      if (!admin.email.trim())    return 'Email-ul administratorului este obligatoriu.'
      if (admin.password.length < 8) return 'Parola trebuie să aibă minim 8 caractere.'
      if (admin.password !== admin.confirmPassword) return 'Parolele nu coincid.'
    }
    return null
  }

  function handleNext() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep(s => s + 1)
  }

  function handleBack() {
    setError('')
    setStep(s => s - 1)
  }

  async function handleFinish(skipLicense = false) {
    setError('')
    setLoading(true)
    try {
      const selectedProfile = PROFILES.find(p => p.id === profile)
      const body = {
        companyName:      company.name,
        companyCui:       company.cui.replace(/\D/g, ''),
        address:          company.address,
        city:             company.city,
        county:           company.county,
        email:            company.email,
        phone:            company.phone,
        logoDataUrl:      company.logoDataUrl || null,
        industry_profile: profile,
        modules_enabled:  selectedProfile?.modules || [],
        adminName:        admin.name,
        username:         admin.username.toLowerCase().trim(),
        adminEmail:       admin.email,
        password:         admin.password,
        confirmPassword:  admin.confirmPassword,
        adminTitle:       admin.title,
        licenseText:      (!skipLicense && licenseKey.trim()) ? licenseKey.trim() : null,
        maxUsers:         50,
        maxDevices:       50,
        trialDays:        30,
      }

      const response = await api.post('/setup/complete', body)
      localStorage.setItem('infraflow_token', response.data.token)
      localStorage.setItem('infraflow_remember', admin.username.toLowerCase().trim())
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err.response?.data?.error || 'Configurarea a eșuat. Verificați datele și reîncercați.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-4 sm:p-8">
      {/* Header */}
      <div className="mx-auto mb-6 max-w-2xl text-center">
        <div className="mb-2 text-4xl">🏗️</div>
        <h1 className="text-2xl font-bold text-white">InfraFlow ERP</h1>
        <p className="mt-1 text-primary-200">Configurare inițială — Pas {step}/{TOTAL_STEPS}</p>
      </div>

      {/* Card principal */}
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <Stepper current={step} />

          {/* Titlu pas */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">
              {step === 1 && '📋 Configurare societate'}
              {step === 2 && '🏭 Tip de activitate'}
              {step === 3 && '👤 Contul administratorului'}
              {step === 4 && '🔑 Activare licență'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {step === 1 && 'Introduceți datele societății dvs. Câmpurile marcate cu * sunt obligatorii.'}
              {step === 2 && 'Profilul selectat va configura automat modulele și setările pentru industria dvs.'}
              {step === 3 && 'Creați contul de administrator principal. Puteți adăuga alți utilizatori ulterior.'}
              {step === 4 && 'Opțional — puteți continua și activa licența ulterior din Setări.'}
            </p>
          </div>

          {/* Conținut pas */}
          <form onSubmit={e => { e.preventDefault(); step < TOTAL_STEPS ? handleNext() : handleFinish() }}>
            {step === 1 && <Step1 data={company} onChange={setCompany} />}
            {step === 2 && <Step2 selected={profile} onSelect={p => { setProfile(p); setError('') }} />}
            {step === 3 && <Step3 data={admin} onChange={setAdmin} />}
            {step === 4 && (
              <Step4
                licenseKey={licenseKey}
                onChange={setLicenseKey}
                licenseStatus={licenseStatus}
                onSkip={() => handleFinish(true)}
              />
            )}

            {/* Eroare */}
            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                ⚠️ {error}
              </div>
            )}

            {/* Navigare */}
            <div className="mt-6 flex items-center justify-between gap-4">
              {step > 1
                ? <Button type="button" variant="secondary" onClick={handleBack}>← Înapoi</Button>
                : <div />
              }

              {step < TOTAL_STEPS && (
                <Button type="submit">
                  Continuă →
                </Button>
              )}

              {step === TOTAL_STEPS && licenseKey.trim() && (
                <Button type="submit" loading={loading}>
                  ✅ Finalizează configurarea
                </Button>
              )}

              {step === TOTAL_STEPS && !licenseKey.trim() && (
                <Button type="button" loading={loading} onClick={() => handleFinish(true)}>
                  ✅ Finalizează configurarea
                </Button>
              )}
            </div>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-primary-300">
          InfraFlow ERP · v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'} · InfraSuite
        </p>
      </div>
    </div>
  )
}
