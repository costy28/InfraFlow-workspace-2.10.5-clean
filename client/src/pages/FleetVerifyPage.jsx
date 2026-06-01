import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/client'

export default function FleetVerifyPage() {
  const { uuid } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.get(`/fleet/verify/${uuid}`).then(response => setData(response.data)).catch(error => setError(error.response?.data?.error || 'Foaia nu a fost găsită.')) }, [uuid])
  return <main className="min-h-screen bg-slate-100 p-5"><div className="mx-auto mt-16 max-w-xl rounded-2xl bg-white p-6 shadow"><h1 className="text-xl font-bold">Verificare foaie de parcurs</h1>{error ? <p className="mt-4 text-rose-700">{error}</p> : data ? <div className="mt-4 text-sm"><p className={data.valida ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{data.valida ? 'Document autentic semnat digital' : 'Document încă nesemnat complet'}</p><p className="mt-3">{data.foaie.nr_foaie} · {data.foaie.sofer_nume}<br />{data.foaie.asset_label}<br />{data.foaie.data}</p></div> : <p className="mt-4">Se încarcă...</p>}</div></main>
}
