import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'

const money = value => Number(value || 0).toFixed(2)

export default function PublicQuotePage() {
  const { token } = useParams()
  const [quote, setQuote] = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [decisionRecorded, setDecisionRecorded] = useState(false)
  const [decision, setDecision] = useState('')
  const [comment, setComment] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let alive = true
    fetch(`/public/quote/${encodeURIComponent(token || '')}`, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit' })
      .then(async response => ({ ok: response.ok, data: await response.json().catch(() => ({})) }))
      .then(result => {
        if (!alive) return
        if (!result.ok) setError('Linkul nu este disponibil sau a expirat.')
        else { setQuote(result.data.quote); setExpiresAt(result.data.expires_at); setDecisionRecorded(Boolean(result.data.decision_recorded)) }
      })
      .catch(() => alive && setError('Oferta nu poate fi încărcată momentan.'))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [token])

  async function submitDecision(event) {
    event.preventDefault()
    if (!decision || decisionRecorded) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/public/quote/${encodeURIComponent(token || '')}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
        body: JSON.stringify({ decision, decided_by_name: name, decided_by_email: email, comment })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Decizia nu a putut fi înregistrată.')
      setDecisionRecorded(true)
      setDecision(data.decision || decision)
    } catch (requestError) { setError(requestError.message || 'Decizia nu a putut fi înregistrată.') } finally { setBusy(false) }
  }

  if (busy && !quote && !error) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-600">Se încarcă oferta…</main>
  if (error && !quote) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="max-w-md rounded-xl border border-slate-200 bg-white p-7 text-center shadow-sm"><h1 className="text-lg font-semibold text-slate-900">Oferta nu este disponibilă</h1><p className="mt-2 text-sm text-slate-600">{error}</p></section></main>
  if (!quote) return null

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6"><section className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-200 p-6 sm:p-8"><p className="text-sm font-medium text-primary-700">Ofertă comercială</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{quote.quote_number} · Revizia {quote.revision_number}</h1><p className="mt-2 text-slate-600">{quote.title}</p><div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2"><span>Client: <strong className="text-slate-900">{quote.account_name}</strong></span><span>Valabilă până la: <strong className="text-slate-900">{quote.valid_until || 'Conform condițiilor ofertei'}</strong></span></div></header><div className="p-6 sm:p-8"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="pb-3 pr-3">#</th><th className="pb-3 pr-3">Descriere</th><th className="pb-3 pr-3 text-right">Cant.</th><th className="pb-3 pr-3 text-right">Preț</th><th className="pb-3 text-right">Total</th></tr></thead><tbody>{quote.lines.map(line => <tr className="border-b border-slate-100" key={line.position}><td className="py-3 pr-3">{line.position}</td><td className="py-3 pr-3">{line.description}</td><td className="py-3 pr-3 text-right">{line.quantity} {line.unit || ''}</td><td className="py-3 pr-3 text-right">{money(line.unit_price)}</td><td className="py-3 text-right font-medium">{money(line.line_total)} {quote.currency}</td></tr>)}</tbody></table></div><div className="mt-5 ml-auto max-w-xs space-y-1 border-t pt-3 text-right text-sm"><p>Subtotal: {money(quote.subtotal)} {quote.currency}</p>{Number(quote.discount_total) ? <p>Discount: −{money(quote.discount_total)} {quote.currency}</p> : null}<p>TVA: {money(quote.tax_total)} {quote.currency}</p><p className="pt-2 text-lg font-bold text-slate-900">Total: {money(quote.total)} {quote.currency}</p></div>{quote.payment_terms || quote.delivery_terms || quote.notes_client ? <section className="mt-8 grid gap-4 border-t pt-6 text-sm text-slate-700 sm:grid-cols-2">{quote.payment_terms ? <div><h2 className="font-semibold text-slate-900">Condiții de plată</h2><p className="mt-1 whitespace-pre-wrap">{quote.payment_terms}</p></div> : null}{quote.delivery_terms ? <div><h2 className="font-semibold text-slate-900">Condiții de livrare</h2><p className="mt-1 whitespace-pre-wrap">{quote.delivery_terms}</p></div> : null}{quote.notes_client ? <div className="sm:col-span-2"><h2 className="font-semibold text-slate-900">Informații suplimentare</h2><p className="mt-1 whitespace-pre-wrap">{quote.notes_client}</p></div> : null}</section> : null}{decisionRecorded ? <section className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-semibold text-emerald-900">Decizia a fost înregistrată</h2><p className="mt-1 text-sm text-emerald-800">Mulțumim. Echipa comercială a fost notificată.</p></section> : <form onSubmit={submitDecision} className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5"><h2 className="font-semibold text-slate-900">Decizia dumneavoastră</h2><p className="mt-1 text-sm text-slate-600">Puteți accepta sau refuza această ofertă. Decizia este finală pentru această revizie.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Nume (opțional)<input value={name} maxLength="300" onChange={event => setName(event.target.value)} /></label><label className="grid gap-1 text-sm">Email (opțional)<input type="email" value={email} maxLength="254" onChange={event => setEmail(event.target.value)} /></label></div><label className="mt-3 grid gap-1 text-sm">Mesaj (opțional)<textarea rows="3" value={comment} maxLength="2000" onChange={event => setComment(event.target.value)} /></label>{error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}{decision ? <p className="mt-3 text-sm font-medium text-slate-700">{decision === 'accepted' ? 'Ai selectat acceptarea. Confirmă pentru a înregistra decizia finală.' : 'Ai selectat refuzul. Confirmă pentru a înregistra decizia finală.'}</p> : null}<div className="mt-4 flex flex-wrap gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={() => setDecision('declined')}>Refuz ofertă</Button><Button type="button" disabled={busy} onClick={decision === 'accepted' ? submitDecision : () => setDecision('accepted')}>{decision === 'accepted' ? 'Confirmă acceptarea' : 'Accept ofertă'}</Button>{decision === 'declined' ? <Button type="button" variant="danger" disabled={busy} onClick={submitDecision}>Confirmă refuzul</Button> : null}</div></form>}<p className="mt-6 text-xs text-slate-500">{expiresAt ? `Linkul este valabil până la ${new Date(expiresAt).toLocaleString('ro-RO')}.` : ''}</p></div></section></main>
}
