import { useEffect, useMemo, useState } from 'react'
import { Calculator, Printer, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../hooks/useAuth'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import { commercialOfferEmailBody, openCommercialOfferPrint } from '../utils/commercialOfferPrint'

function formatMoney(value, currency = 'EUR') {
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0))
}

export default function CommercialOfferPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState(null)
  const [available, setAvailable] = useState(null)
  const [form, setForm] = useState({ packageKey: 'start', deployment: 'hosted', totalUsers: 5, addonKeys: [], billingMonths: 1, discountPercent: 0, taxPercent: 0, currency: 'EUR', issueDate: new Date().toISOString().slice(0, 10), customerName: '', contactName: '', customerEmail: '', validityDays: 30 })
  const [offer, setOffer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [creatingCrmOffer, setCreatingCrmOffer] = useState(false)
  const [crmAccounts, setCrmAccounts] = useState([])
  const [savingCatalog, setSavingCatalog] = useState(false)
  const [error, setError] = useState('')

  const selectedPackage = useMemo(
    () => catalog?.packages?.find(item => item.key === form.packageKey) || null,
    [catalog, form.packageKey]
  )

  async function preview(nextForm = form) {
    setCalculating(true)
    setError('')
    try {
      const response = await api.post('/commercial/offers/preview', nextForm)
      setOffer(response.data.offer)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut calcula oferta internă.')
    } finally {
      setCalculating(false)
    }
  }

  useEffect(() => {
    if (user?.role !== 'superadmin') return
    let active = true
    api.get('/commercial/offers/status')
      .then(response => {
        if (!response.data?.enabled) {
          setAvailable(false)
          return null
        }
        setAvailable(true)
        return api.get('/commercial/offers/catalog')
      })
      .then(response => {
        if (!response || !active) return
        const nextCatalog = response.data
        setCatalog(nextCatalog)
        const first = nextCatalog.packages?.find(item => item.key === 'start') || nextCatalog.packages?.[0]
        const nextForm = { packageKey: first?.key || 'start', deployment: 'hosted', totalUsers: first?.includedUsers || 5, addonKeys: [], billingMonths: 1, discountPercent: 0, taxPercent: 0, currency: 'EUR', issueDate: new Date().toISOString().slice(0, 10), customerName: '', contactName: '', customerEmail: '', validityDays: 30 }
        setForm(nextForm)
        api.get('/crm/quotes/workspace').then(workspace => {
          if (active) setCrmAccounts(workspace.data?.accounts || [])
        }).catch(() => setCrmAccounts([]))
        return preview(nextForm)
      })
      .catch(err => active && setError(err.response?.data?.error || 'Nu pot încărca catalogul intern.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [user?.role])

  function changePackage(packageKey) {
    const packageItem = catalog?.packages?.find(item => item.key === packageKey)
    setForm(current => ({ ...current, packageKey, totalUsers: Math.max(Number(current.totalUsers || 0), Number(packageItem?.includedUsers || 1)) }))
  }

  function toggleAddon(key) {
    setForm(current => ({
      ...current,
      addonKeys: current.addonKeys.includes(key) ? current.addonKeys.filter(item => item !== key) : [...current.addonKeys, key],
    }))
  }

  function changeCatalogPrice(group, key, field, value) {
    setCatalog(current => ({
      ...current,
      [group]: (current?.[group] || []).map(item => item.key === key ? { ...item, [field]: value } : item),
    }))
  }

  async function saveCatalog() {
    if (!catalog) return
    setSavingCatalog(true)
    setError('')
    try {
      const response = await api.put('/commercial/offers/catalog', { packages: catalog.packages, addons: catalog.addons })
      setCatalog(response.data)
      await preview(form)
    } catch (err) {
      setError(err.response?.data?.error || 'Tarifele standard nu au putut fi salvate.')
    } finally {
      setSavingCatalog(false)
    }
  }

  function printOffer() {
    try {
      openCommercialOfferPrint({ offer, customerName: form.customerName, contactName: form.contactName, validityDays: form.validityDays })
    } catch (err) {
      setError(err.message || 'Fișa printabilă nu a putut fi generată.')
    }
  }

  async function createEmailDraft() {
    if (!offer) return setError('Calculează oferta înainte de a crea draftul de email.')
    const recipient = String(form.customerEmail || '').trim()
    if (!recipient) return setError('Completează adresa de email a clientului pentru a crea draftul.')
    setCreatingDraft(true)
    setError('')
    try {
      const response = await api.post('/messaging/email/drafts', {
        to: recipient,
        subject: `Propunere InfraFlow ${offer.package.label} — ${form.customerName || 'configurație orientativă'}`,
        body: commercialOfferEmailBody({ offer, customerName: form.customerName, contactName: form.contactName, validityDays: form.validityDays }),
        preview: `Propunere ${offer.package.label}: ${formatMoney(offer.totals.gross, offer.currency)} pentru ${offer.billingMonths} luni`,
        category: 'general',
        importance: 'normal',
        source_type: 'commercial_offer',
        source_id: `${offer.package.key}-${Date.now()}`,
        source_label: `Ofertare internă — ${offer.package.label}`,
        source_url: '/ofertare-interna',
      })
      const id = response.data?.draft?.id
      navigate(id ? `/mesaje?email=${encodeURIComponent(id)}` : '/mesaje')
    } catch (err) {
      setError(err.response?.data?.error || 'Draftul de email nu a putut fi creat.')
    } finally {
      setCreatingDraft(false)
    }
  }

  function validUntil(issueDate, days) {
    const date = new Date(`${issueDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + Math.max(1, Number(days) || 30))
    return date.toISOString().slice(0, 10)
  }

  async function createCrmOffer() {
    if (!offer) return setError('Calculează oferta înainte de a crea oferta CRM.')
    if (!form.crmAccountId) return setError('Alege prospectul/clientul CRM pentru oferta editabilă.')
    setCreatingCrmOffer(true)
    setError('')
    try {
      const factor = Number(offer.exchangeRate?.rate || 1)
      const convert = value => Math.round(Number(value || 0) * factor * 100) / 100
      const subscriptionLines = [
        { key: 'package', description: `Abonament InfraFlow ${offer.package.label}`, monthly: offer.monthly.packageEur },
        ...(offer.extraUsers > 0 ? [{ key: 'extra_users', description: `Utilizatori suplimentari (${offer.extraUsers})`, monthly: offer.monthly.additionalUsersEur }] : []),
        ...offer.addons.map(item => ({ key: `addon_${item.key}`, description: `Extensie: ${item.label}${item.included ? ' (inclusă)' : ''}`, monthly: item.chargedMonthlyEur })),
      ].map(item => ({ item_type: 'service', item_reference: `infraflow_${item.key}`, description: item.description, quantity: offer.billingMonths, unit: 'lună', unit_price: convert(item.monthly), discount_percent: offer.discountPercent, tax_percent: offer.taxPercent, notes: 'Generată din ofertarea internă.' }))
      const implementation = offer.billedLines.find(line => line.key === 'implementation')
      const result = await api.post('/crm/quotes', {
        title: `InfraFlow ${offer.package.label}${form.customerName ? ` — ${form.customerName}` : ''}`,
        account_id: form.crmAccountId,
        currency: offer.currency,
        issue_date: form.issueDate,
        valid_until: validUntil(form.issueDate, form.validityDays),
        payment_terms: `Plată pentru ${offer.billingMonths} ${offer.billingMonths === 1 ? 'lună' : 'luni'}.`,
        notes_internal: `Creată din ofertarea internă.${offer.exchangeRate ? ` Curs BNR: 1 EUR = ${offer.exchangeRate.rate} RON, data ${offer.exchangeRate.date}.` : ''}`,
        notes_client: offer.notes.join(' '),
        lines: [...subscriptionLines, { item_type: 'service', item_reference: 'infraflow_implementation', description: 'Configurare și implementare inițială', quantity: 1, unit: 'serviciu', unit_price: implementation?.unitPrice || convert(offer.implementation.fromEur), discount_percent: 0, tax_percent: offer.taxPercent, notes: 'Generată din ofertarea internă.' }],
      })
      navigate(`/crm/oferte/${result.data.quote.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Oferta CRM nu a putut fi creată.')
    } finally {
      setCreatingCrmOffer(false)
    }
  }

  if (user?.role !== 'superadmin') {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">Calculatorul intern de ofertare este disponibil doar pentru Superadmin.</div>
  }

  if (available === false) {
    return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700"><strong>Instrument intern inactiv.</strong><p className="mt-2">Ofertarea internă nu este disponibilă în Demo și nu se afișează implicit în instalațiile client. Pentru laptopul intern InfraFlow, activează explicit variabila de runtime <code>INFRAFLOW_INTERNAL_OFFERING=1</code>, apoi repornește serviciul.</p></div>
  }

  return (
    <div className="grid gap-4">
      <PageHeader title="Ofertare internă" subtitle="Simulare internă pentru pachet, extensii, utilizatori și implementare. Nu emite licențe și nu modifică datele clientului." />
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
      <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Tarife standard pachete și extensii</summary>
        <p className="mt-2 text-sm text-slate-600">Aceste valori devin baza noilor simulări. În oferta CRM finală poți modifica în continuare prețul, discountul și TVA-ul pe fiecare poziție.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Pachet</th><th className="p-2">Abonament EUR/lună</th><th className="p-2">Utilizatori incluși</th><th className="p-2">Utilizator supl. EUR/lună</th><th className="p-2">Implementare EUR</th></tr></thead>
            <tbody>{(catalog?.packages || []).map(item => <tr className="border-b border-slate-100" key={item.key}><td className="p-2 font-medium">{item.label}</td><td className="p-2"><input className="h-9 w-28 rounded border border-slate-300 px-2" min="0" step="0.01" type="number" value={item.monthlyEur} onChange={event => changeCatalogPrice('packages', item.key, 'monthlyEur', event.target.value)} /></td><td className="p-2"><input className="h-9 w-24 rounded border border-slate-300 px-2" min="1" step="1" type="number" value={item.includedUsers} onChange={event => changeCatalogPrice('packages', item.key, 'includedUsers', event.target.value)} /></td><td className="p-2">{item.extraUserEur === null ? <span className="text-slate-500">La ofertă</span> : <input className="h-9 w-28 rounded border border-slate-300 px-2" min="0" step="0.01" type="number" value={item.extraUserEur} onChange={event => changeCatalogPrice('packages', item.key, 'extraUserEur', event.target.value)} />}</td><td className="p-2"><input className="h-9 w-28 rounded border border-slate-300 px-2" min="0" step="0.01" type="number" value={item.implementationEur} onChange={event => changeCatalogPrice('packages', item.key, 'implementationEur', event.target.value)} /></td></tr>)}</tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{(catalog?.addons || []).map(item => <label className="flex items-center justify-between gap-3 rounded border border-slate-200 p-2 text-sm" key={item.key}><span>{item.label}</span><span className="flex items-center gap-1"><input className="h-9 w-24 rounded border border-slate-300 px-2" min="0" step="0.01" type="number" value={item.monthlyEur} onChange={event => changeCatalogPrice('addons', item.key, 'monthlyEur', event.target.value)} /> EUR/lună</span></label>)}</div>
        <div className="mt-4"><Button size="sm" loading={savingCatalog} onClick={saveCatalog}>Salvează tarifele standard</Button></div>
      </details>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="Configurează oferta" subtitle="Prețuri orientative interne. Costurile de infrastructură nu sunt incluse.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">Pachet
              <select className="h-10 rounded-md border border-slate-300 bg-white px-3" value={form.packageKey} onChange={event => changePackage(event.target.value)} disabled={loading}>
                {(catalog?.packages || []).map(item => <option key={item.key} value={item.key}>{item.label} · de la {formatMoney(item.monthlyEur)}/lună</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Livrare
              <select className="h-10 rounded-md border border-slate-300 bg-white px-3" value={form.deployment} onChange={event => setForm(current => ({ ...current, deployment: event.target.value }))} disabled={loading}>
                {(catalog?.deploymentModels || []).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Utilizatori nominali
              <input className="h-10 rounded-md border border-slate-300 px-3" min="1" type="number" value={form.totalUsers} onChange={event => setForm(current => ({ ...current, totalUsers: event.target.value }))} />
              <span className="text-xs font-normal text-slate-500">Incluși în {selectedPackage?.label || 'pachet'}: {selectedPackage?.includedUsers || '-'}.</span>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Perioada contractată
              <select className="h-10 rounded-md border border-slate-300 bg-white px-3" value={form.billingMonths} onChange={event => setForm(current => ({ ...current, billingMonths: Number(event.target.value) }))}>
                {(catalog?.billingMonths || [1, 3, 6, 9, 12]).map(months => <option key={months} value={months}>{months} {months === 1 ? 'lună' : 'luni'}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Monedă ofertă
              <select className="h-10 rounded-md border border-slate-300 bg-white px-3" value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value }))}><option value="EUR">EUR</option><option value="RON">RON · curs BNR</option></select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Data emiterii
              <input className="h-10 rounded-md border border-slate-300 px-3" type="date" value={form.issueDate} onChange={event => setForm(current => ({ ...current, issueDate: event.target.value }))} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Discount comercial %
              <input className="h-10 rounded-md border border-slate-300 px-3" min="0" max="100" step="0.01" type="number" value={form.discountPercent} onChange={event => setForm(current => ({ ...current, discountPercent: event.target.value }))} />
              <span className="text-xs font-normal text-slate-500">Se aplică abonamentului pentru întreaga perioadă. De regulă, pentru 6+ luni.</span>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">TVA %
              <input className="h-10 rounded-md border border-slate-300 px-3" min="0" max="100" step="0.01" type="number" value={form.taxPercent} onChange={event => setForm(current => ({ ...current, taxPercent: event.target.value }))} />
              <span className="text-xs font-normal text-slate-500">Poți lăsa 0% dacă nu ești plătitor de TVA.</span>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{(catalog?.deploymentModels || []).find(item => item.key === form.deployment)?.note}</div>
          </div>
          <div className="mt-5">
            <div className="text-sm font-semibold text-slate-800">Extensii opționale</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {(catalog?.addons || []).map(item => {
                const included = item.includedIn?.includes(form.packageKey)
                return <label key={item.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                  <input className="mt-0.5" type="checkbox" checked={form.addonKeys.includes(item.key)} onChange={() => toggleAddon(item.key)} />
                  <span><strong>{item.label}</strong><br /><span className="text-xs text-slate-500">{included ? 'Inclus în acest pachet' : `${formatMoney(item.monthlyEur)}/lună`}{item.note ? ` · ${item.note}` : ''}</span></span>
                </label>
              })}
            </div>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="text-sm font-semibold text-slate-800">Date pentru fișa printabilă <span className="font-normal text-slate-500">(opțional)</span></div>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">Client / organizație
                <input className="h-10 rounded-md border border-slate-300 px-3" value={form.customerName} onChange={event => setForm(current => ({ ...current, customerName: event.target.value }))} placeholder="Ex. Construct SRL" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Persoană de contact
                <input className="h-10 rounded-md border border-slate-300 px-3" value={form.contactName} onChange={event => setForm(current => ({ ...current, contactName: event.target.value }))} placeholder="Nume contact" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Email client
                <input className="h-10 rounded-md border border-slate-300 px-3" type="email" value={form.customerEmail} onChange={event => setForm(current => ({ ...current, customerEmail: event.target.value }))} placeholder="contact@client.ro" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Valabilitate (zile)
                <input className="h-10 rounded-md border border-slate-300 px-3" min="1" max="365" type="number" value={form.validityDays} onChange={event => setForm(current => ({ ...current, validityDays: event.target.value }))} />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Prospect/client CRM <span className="font-normal text-slate-500">(pentru oferta editabilă)</span>
                <select className="h-10 rounded-md border border-slate-300 bg-white px-3" value={form.crmAccountId || ''} onChange={event => setForm(current => ({ ...current, crmAccountId: event.target.value }))}><option value="">Alege prospectul/clientul</option>{crmAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
              </label>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2"><Button icon={<Calculator size={16} />} loading={calculating} onClick={() => preview()}>Calculează oferta</Button><Button variant="secondary" disabled={!offer || !form.crmAccountId} loading={creatingCrmOffer} onClick={createCrmOffer}>Creează ofertă CRM editabilă</Button></div>
        </Card>

        <Card title="Rezumat ofertă" subtitle="Include perioada contractată, discountul și TVA-ul ales. Proforma Oblio se emite ulterior numai din comanda CRM confirmată." loading={loading} actions={[<Button key="draft" size="sm" variant="secondary" disabled={!offer || creatingDraft} loading={creatingDraft} onClick={createEmailDraft}>Creează draft email</Button>, <Button key="print" size="sm" variant="secondary" icon={<Printer size={14} />} disabled={!offer} onClick={printOffer}>Fișă PDF</Button>, <Button key="refresh" size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={calculating} onClick={() => preview()}>Recalculează</Button>]}> 
          {offer ? <div className="grid gap-4">
            <div className="rounded-lg bg-primary-50 p-4 text-primary-950"><div className="text-xs font-semibold uppercase tracking-wide text-primary-700">Total de plată pentru perioada aleasă</div><div className="mt-1 text-3xl font-bold">{formatMoney(offer.totals.gross, offer.currency)}</div><div className="mt-1 text-xs">{offer.package.label} · {offer.billingMonths} luni · {offer.totalUsers} utilizatori</div></div>
            {offer.exchangeRate ? <div className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">Curs BNR blocat: <strong>1 EUR = {offer.exchangeRate.rate} RON</strong> · publicat pentru {offer.exchangeRate.date}.</div> : null}
            <div className="grid gap-2 text-sm text-slate-700">{offer.billedLines.map(line => <div className="rounded border border-slate-200 p-3" key={line.key}><div className="flex justify-between gap-3"><strong>{line.description}</strong><strong>{formatMoney(line.total, offer.currency)}</strong></div><div className="mt-1 text-xs text-slate-500">Fără TVA: {formatMoney(line.net, offer.currency)} · TVA {line.taxPercent}%: {formatMoney(line.tax, offer.currency)}{line.discount ? ` · Discount: ${formatMoney(line.discount, offer.currency)}` : ''}</div></div>)}</div>
            <div className="grid gap-2 rounded bg-slate-50 p-3 text-sm text-slate-700"><div className="flex justify-between"><span>Subtotal abonament</span><strong>{formatMoney(offer.totals.subscriptionBeforeDiscount, offer.currency)}</strong></div><div className="flex justify-between"><span>Discount comercial</span><strong>− {formatMoney(offer.totals.subscriptionDiscount, offer.currency)}</strong></div><div className="flex justify-between"><span>Total fără TVA</span><strong>{formatMoney(offer.totals.net, offer.currency)}</strong></div><div className="flex justify-between"><span>TVA</span><strong>{formatMoney(offer.totals.tax, offer.currency)}</strong></div></div>
            {offer.addons.length ? <div className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-semibold text-slate-800">Extensii selectate</div><ul className="mt-2 grid gap-1 text-slate-600">{offer.addons.map(item => <li key={item.key}>{item.label}: {item.included ? 'inclusă' : `${formatMoney(item.chargedMonthlyEur)}/lună`}</li>)}</ul></div> : null}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><ul className="grid gap-1">{offer.notes.map(note => <li key={note}>• {note}</li>)}</ul></div>
          </div> : null}
        </Card>
      </div>
    </div>
  )
}
