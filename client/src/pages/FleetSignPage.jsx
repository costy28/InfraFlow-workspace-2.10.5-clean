import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/client'
import SignaturePad from '../components/SignaturePad'

export default function FleetSignPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ responsabil_nume: '', responsabil_functie: '', signature_svg: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  useEffect(() => { api.get(`/fleet/sign/${token}`).then(response => setData(response.data)).catch(error => setError(error.response?.data?.error || 'Link expirat sau invalid')) }, [token])
  async function submit(event) {
    event.preventDefault()
    if (!form.signature_svg) return setError('Semnătura este obligatorie.')
    try {
      const response = await api.post(`/fleet/sign/${token}`, form)
      setDone(response.data.mesaj)
    } catch (error) { setError(error.response?.data?.error || 'Semnătura nu a putut fi salvată.') }
  }
  if (done) return <main className="min-h-screen bg-slate-100 p-6"><div className="mx-auto mt-16 max-w-xl rounded-2xl bg-white p-8 text-center shadow"><h1 className="text-xl font-bold text-emerald-700">Semnătură înregistrată!</h1><p className="mt-3 text-slate-600">{done}<br />Această pagină se poate închide.</p></div></main>
  return <main className="min-h-screen bg-slate-100 p-4"><form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow">
    <h1 className="text-xl font-bold">InfraFlow - Semnătură Foaie Parcurs</h1>
    {error ? <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
    {data ? <>
      <div className="rounded-xl bg-slate-50 p-4 text-sm"><b>{data.foaie.nr_foaie}</b><br />Șofer: {data.sofer.nume}<br />Utilaj: {data.sofer.utilaj}<br />Data: {data.foaie.data}<br />Km parcurși: {data.foaie.km_parcursi ?? '-'} km</div>
      <table className="w-full text-left text-xs"><thead><tr><th>Ora</th><th>Destinație</th><th>Km</th><th>Activitate</th></tr></thead><tbody>{data.activitati.map((row, index) => <tr key={index}><td>{row.ora_plecare} - {row.ora_sosire}</td><td>{row.destinatie}</td><td>{row.km_parcursi}</td><td>{row.activitate}</td></tr>)}</tbody></table>
      <input className="w-full rounded-lg border p-3" placeholder="Nume și prenume" required value={form.responsabil_nume} onChange={event => setForm({ ...form, responsabil_nume: event.target.value })} />
      <input className="w-full rounded-lg border p-3" placeholder="Funcția" value={form.responsabil_functie} onChange={event => setForm({ ...form, responsabil_functie: event.target.value })} />
      <SignaturePad onChange={signature_svg => setForm(current => ({ ...current, signature_svg }))} />
      <button className="w-full rounded-xl bg-emerald-700 p-3 font-semibold text-white">Semnez și confirm</button>
    </> : <p>Se încarcă...</p>}
  </form></main>
}
