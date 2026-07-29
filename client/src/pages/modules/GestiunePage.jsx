import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/client'
import Input from '../../components/forms/Input'
import Select from '../../components/forms/Select'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Modal from '../../components/ui/Modal'
import { exportExcel } from '../../utils/export'

const tabs = ['Dashboard', 'Nomenclator', 'Recepție (NIR)', 'Bon Consum', 'Inventar', 'Furnizori', 'Raport Valoric']

function today() { return new Date().toISOString().slice(0, 10) }
function currentMonth() { return new Date().toISOString().slice(0, 7) }
function fmt(v) { return Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function stockBadge(stoc, min) {
  if (min > 0 && stoc === 0) return { tone: 'danger', label: 'Epuizat' }
  if (min > 0 && stoc < min) return { tone: 'danger', label: 'Critic' }
  if (min > 0 && stoc < min * 1.5) return { tone: 'warning', label: 'Atenție' }
  return { tone: 'success', label: 'OK' }
}

function statusTone(s) {
  if (s === 'confirmat' || s === 'aprobat' || s === 'finalizat') return 'success'
  if (s === 'anulat'    || s === 'respins')                      return 'danger'
  if (s === 'draft'     || s === 'in_curs')                      return 'warning'
  return 'neutral'
}

const emptyMatForm  = { name: '', unit: '', categorie: 'general', cod_intern: '', stoc_minim: '', pret_achizitie: '', locatie_depozit: '', furnizor_preferat: '' }
const emptyFurForm  = { nume: '', cui: '', nr_reg_com: '', adresa: '', telefon: '', email: '', iban: '', banca: '', pers_contact: '', observatii: '' }
const emptyNirForm  = { data: today(), furnizor_id: '', furnizor_name: '', nr_factura: '', data_factura: '', nr_aviz: '', contract_id: '', observatii: '', linii: [] }
const emptyBcForm   = { data: today(), department: '', lucrare: '', observatii: '', linii: [] }
const emptyLine     = { material_id: '', cantitate: '', pret_unitar: '' }

export default function GestiunePage() {
  const [activeTab, setActiveTab] = useState('Dashboard')

  // data
  const [dashboard, setDashboard] = useState(null)
  const [materials, setMaterials] = useState([])
  const [furnizori, setFurnizori] = useState([])
  const [contracts, setContracts] = useState([])
  const [nirList, setNirList] = useState([])
  const [bcList, setBcList] = useState([])
  const [inventare, setInventare] = useState([])
  const [raportValoric, setRaportValoric] = useState(null)

  // filters
  const [matSearch, setMatSearch]     = useState('')
  const [matCategorie, setMatCategorie] = useState('')
  const [nirLuna, setNirLuna]         = useState(currentMonth())
  const [nirStatus, setNirStatus]     = useState('')
  const [bcLuna, setBcLuna]           = useState(currentMonth())
  const [bcStatus, setBcStatus]       = useState('')
  const [furSearch, setFurSearch]     = useState('')
  const [rvCategorie, setRvCategorie] = useState('')

  // modals
  const [matModal, setMatModal]     = useState(false)
  const [matForm, setMatForm]       = useState(emptyMatForm)
  const [matEditing, setMatEditing] = useState(null)

  const [furModal, setFurModal]     = useState(false)
  const [furForm, setFurForm]       = useState(emptyFurForm)
  const [furEditing, setFurEditing] = useState(null)

  const [nirModal, setNirModal]     = useState(false)
  const [nirForm, setNirForm]       = useState(emptyNirForm)
  const [nirView, setNirView]       = useState(null)

  const [bcModal, setBcModal]       = useState(false)
  const [bcForm, setBcForm]         = useState(emptyBcForm)
  const [bcView, setBcView]         = useState(null)
  const [bcRejectId, setBcRejectId] = useState(null)
  const [bcRejectMotiv, setBcRejectMotiv] = useState('')

  const [invModal, setInvModal]     = useState(false)
  const [invActive, setInvActive]   = useState(null) // editing inventar

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // ── load helpers ────────────────────────────────────────────────────────────
  async function loadBase() {
    setLoading(true); setError('')
    try {
      const [matsRes, dashRes, furRes, contractsRes] = await Promise.all([
        api.get('/materials'),
        api.get('/gestiune/dashboard'),
        api.get('/gestiune/furnizori'),
        api.get('/contracts').catch(() => ({ data: { contracts: [] } })),
      ])
      setMaterials(matsRes.data?.materials || [])
      setDashboard(dashRes.data || {})
      setFurnizori(Array.isArray(furRes.data) ? furRes.data : [])
      setContracts(contractsRes.data?.contracts || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la încărcare.')
    } finally { setLoading(false) }
  }

  async function loadNir() {
    try {
      const res = await api.get('/gestiune/nir', { params: { luna: nirLuna, status: nirStatus || undefined } })
      setNirList(Array.isArray(res.data) ? res.data : [])
    } catch { setNirList([]) }
  }

  async function loadBc() {
    try {
      const res = await api.get('/gestiune/bonuri-consum', { params: { luna: bcLuna, status: bcStatus || undefined } })
      setBcList(Array.isArray(res.data) ? res.data : [])
    } catch { setBcList([]) }
  }

  async function loadInventare() {
    try {
      const res = await api.get('/gestiune/inventare')
      setInventare(Array.isArray(res.data) ? res.data : [])
    } catch { setInventare([]) }
  }

  async function loadRaport() {
    try {
      const res = await api.get('/gestiune/raport-valoric', { params: { categorie: rvCategorie || undefined } })
      setRaportValoric(res.data || null)
    } catch { setRaportValoric(null) }
  }

  useEffect(() => { loadBase() }, [])
  useEffect(() => { if (activeTab === 'Recepție (NIR)')  loadNir()       }, [activeTab, nirLuna, nirStatus])
  useEffect(() => { if (activeTab === 'Bon Consum')      loadBc()        }, [activeTab, bcLuna, bcStatus])
  useEffect(() => { if (activeTab === 'Inventar')        loadInventare() }, [activeTab])
  useEffect(() => { if (activeTab === 'Raport Valoric')  loadRaport()    }, [activeTab, rvCategorie])

  // ── computed ────────────────────────────────────────────────────────────────
  const matOptions = useMemo(() =>
    [{ value: '', label: 'Alege material…' }, ...materials.map(m => ({
      value: String(m.id),
      label: `${m.name || m.denumire}${m.cod_intern ? ` [${m.cod_intern}]` : ''} (${m.unit || m.um || ''})`
    }))]
  , [materials])

  const furOptions = useMemo(() =>
    [{ value: '', label: 'Alege furnizor…' }, ...furnizori.map(f => ({ value: f.id, label: f.nume }))]
  , [furnizori])

  const contractOptions = useMemo(() =>
    [{ value: '', label: 'Fără contract' }, ...contracts
      .filter(contract => !['anulat', 'inchis'].includes(String(contract.status || '').toLowerCase()))
      .map(contract => ({ value: contract.id, label: `${contract.numar || contract.id} — ${contract.titlu || contract.partener || 'contract'}` }))]
  , [contracts])

  const filteredMats = useMemo(() => {
    let list = materials
    if (matSearch)    list = list.filter(m => [m.name, m.cod_intern, m.categorie, m.unit].join(' ').toLowerCase().includes(matSearch.toLowerCase()))
    if (matCategorie) list = list.filter(m => (m.categorie || m.category || 'general') === matCategorie)
    return list
  }, [materials, matSearch, matCategorie])

  const matCategorii = useMemo(() =>
    [...new Set(materials.map(m => m.categorie || m.category || 'general').filter(Boolean))].sort()
  , [materials])

  const filteredFur = useMemo(() => {
    if (!furSearch) return furnizori
    return furnizori.filter(f => [f.nume, f.cui, f.email, f.telefon].join(' ').toLowerCase().includes(furSearch.toLowerCase()))
  }, [furnizori, furSearch])

  // ── material CRUD ────────────────────────────────────────────────────────────
  async function saveMaterial(ev) {
    ev.preventDefault(); setSaving(true); setError('')
    try {
      if (matEditing) {
        await api.patch(`/materials/${matEditing.id}`, matForm)
      } else {
        await api.post('/materials', { ...matForm, stock: 0, alert: Number(matForm.stoc_minim || 0), recipeMaterial: matForm.categorie === 'asfalt' })
      }
      setMatModal(false); setMatEditing(null); setMatForm(emptyMatForm)
      await loadBase()
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare.') }
    finally { setSaving(false) }
  }

  function deleteMaterial(id) {
    const material = materials.find(item => String(item.id) === String(id))
    setConfirmAction({
      title: 'Șterge material',
      message: `Ștergi materialul ${material?.name || material?.denumire || id}?`,
      details: 'Operațiunea poate fi refuzată dacă materialul are mișcări de stoc sau documente legate. Verifică istoricul înainte de ștergere.',
      confirmLabel: 'Șterge materialul',
      tone: 'danger',
      run: async () => {
        await api.delete(`/materials/${id}`)
        await loadBase()
      },
    })
  }

  // ── furnizor CRUD ────────────────────────────────────────────────────────────
  async function saveFurnizor(ev) {
    ev.preventDefault(); setSaving(true); setError('')
    try {
      if (furEditing) {
        await api.patch(`/gestiune/furnizori/${furEditing.id}`, furForm)
      } else {
        await api.post('/gestiune/furnizori', furForm)
      }
      setFurModal(false); setFurEditing(null); setFurForm(emptyFurForm)
      const res = await api.get('/gestiune/furnizori')
      setFurnizori(Array.isArray(res.data) ? res.data : [])
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare.') }
    finally { setSaving(false) }
  }

  function deleteFurnizor(id) {
    const furnizor = furnizori.find(item => String(item.id) === String(id))
    setConfirmAction({
      title: 'Șterge furnizor',
      message: `Ștergi furnizorul ${furnizor?.nume || id}?`,
      details: 'Dacă furnizorul este folosit în recepții, comenzi sau facturi, serverul poate bloca operațiunea.',
      confirmLabel: 'Șterge furnizorul',
      tone: 'danger',
      run: async () => {
        await api.delete(`/gestiune/furnizori/${id}`)
        setFurnizori(f => f.filter(x => x.id !== id))
      },
    })
  }

  // ── NIR lines helpers ────────────────────────────────────────────────────────
  function nirAddLine() { setNirForm(f => ({ ...f, linii: [...f.linii, { ...emptyLine }] })) }
  function nirRemoveLine(idx) { setNirForm(f => ({ ...f, linii: f.linii.filter((_, i) => i !== idx) })) }
  function nirSetLine(idx, key, val) {
    setNirForm(f => {
      const linii = f.linii.map((l, i) => i === idx ? { ...l, [key]: val } : l)
      // auto-fill pret_unitar from material
      if (key === 'material_id' && val) {
        const mat = materials.find(m => String(m.id) === val)
        if (mat && mat.pret_achizitie) linii[idx].pret_unitar = String(mat.pret_achizitie)
      }
      return { ...f, linii }
    })
  }

  async function saveNir(ev) {
    ev.preventDefault(); setSaving(true); setError('')
    try {
      await api.post('/gestiune/nir', {
        ...nirForm,
        linii: nirForm.linii.map(l => ({ ...l, cantitate: Number(l.cantitate), pret_unitar: Number(l.pret_unitar || 0) }))
      })
      setNirModal(false); setNirForm(emptyNirForm)
      await loadNir(); await loadBase()
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare NIR.') }
    finally { setSaving(false) }
  }

  function confirmNir(id) {
    const nir = nirList.find(item => String(item.id) === String(id))
    setConfirmAction({
      title: 'Confirmă recepția NIR',
      message: `Confirmi recepția ${nir?.numar || id}?`,
      details: 'Stocurile materialelor din NIR vor fi actualizate. După confirmare, corecțiile se fac prin anulare/retur, nu prin editare brută.',
      confirmLabel: 'Confirmă recepția',
      tone: 'warning',
      run: async () => {
        await api.patch(`/gestiune/nir/${id}`, { status: 'confirmat' })
        await loadNir()
        await loadBase()
      },
    })
  }

  function cancelNir(id) {
    const nir = nirList.find(item => String(item.id) === String(id))
    setConfirmAction({
      title: 'Anulează NIR',
      message: `Anulezi NIR-ul ${nir?.numar || id}?`,
      details: 'Dacă NIR-ul era confirmat, stocurile vor fi revertite conform mișcărilor înregistrate.',
      confirmLabel: 'Anulează NIR',
      tone: 'danger',
      run: async () => {
        await api.patch(`/gestiune/nir/${id}`, { status: 'anulat' })
        await loadNir()
        await loadBase()
      },
    })
  }

  // ── BC lines helpers ─────────────────────────────────────────────────────────
  function bcAddLine() { setBcForm(f => ({ ...f, linii: [...f.linii, { ...emptyLine }] })) }
  function bcRemoveLine(idx) { setBcForm(f => ({ ...f, linii: f.linii.filter((_, i) => i !== idx) })) }
  function bcSetLine(idx, key, val) {
    setBcForm(f => ({ ...f, linii: f.linii.map((l, i) => i === idx ? { ...l, [key]: val } : l) }))
  }

  async function saveBc(ev) {
    ev.preventDefault(); setSaving(true); setError('')
    try {
      await api.post('/gestiune/bonuri-consum', {
        ...bcForm,
        linii: bcForm.linii.map(l => ({ ...l, cantitate: Number(l.cantitate) }))
      })
      setBcModal(false); setBcForm(emptyBcForm)
      await loadBc(); await loadBase()
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare BC.') }
    finally { setSaving(false) }
  }

  function approveBc(id) {
    const bon = bcList.find(item => String(item.id) === String(id))
    setConfirmAction({
      title: 'Aprobă bon de consum',
      message: `Aprobi bonul ${bon?.numar || id}?`,
      details: 'Materialele din bon vor fi scăzute din stoc. Verifică liniile înainte de aprobare.',
      confirmLabel: 'Aprobă bonul',
      tone: 'warning',
      run: async () => {
        await api.patch(`/gestiune/bonuri-consum/${id}`, { status: 'aprobat' })
        await loadBc()
        await loadBase()
      },
    })
  }

  async function rejectBc() {
    try {
      await api.patch(`/gestiune/bonuri-consum/${bcRejectId}`, { status: 'respins', motiv_respingere: bcRejectMotiv })
      setBcRejectId(null); setBcRejectMotiv('')
      await loadBc()
    } catch (err) { setError(err.response?.data?.error || 'Eroare.') }
  }

  function deleteBc(id) {
    const bon = bcList.find(item => String(item.id) === String(id))
    setConfirmAction({
      title: 'Șterge bon de consum',
      message: `Ștergi bonul ${bon?.numar || id}?`,
      details: 'Ștergerea este potrivită pentru drafturi sau documente introduse greșit. Pentru documente aprobate, folosește anulare/corecție dacă fluxul o cere.',
      confirmLabel: 'Șterge bonul',
      tone: 'danger',
      run: async () => {
        await api.delete(`/gestiune/bonuri-consum/${id}`)
        await loadBc()
      },
    })
  }

  // ── inventar ────────────────────────────────────────────────────────────────
  function createInventar() {
    setConfirmAction({
      title: 'Creează inventar',
      message: 'Creezi un inventar nou?',
      details: 'Se va prelua stocul scriptic curent din sistem. Completează apoi stocul faptic pentru fiecare material.',
      confirmLabel: 'Creează inventar',
      tone: 'warning',
      run: async () => {
        const res = await api.post('/gestiune/inventare', { data: today() })
        setInvActive(res.data)
        await loadInventare()
      },
    })
  }

  async function updateInvLine(invId, matId, val) {
    setInvActive(prev => {
      if (!prev) return prev
      return {
        ...prev,
        linii: prev.linii.map(l =>
          String(l.material_id) === String(matId)
            ? { ...l, stoc_faptic: Number(val), diferenta: Number(val) - l.stoc_scriptic }
            : l
        )
      }
    })
  }

  async function saveInvLines() {
    if (!invActive) return
    try {
      const res = await api.patch(`/gestiune/inventare/${invActive.id}`, { linii: invActive.linii })
      setInvActive(res.data)
    } catch (err) { setError(err.response?.data?.error || 'Eroare la salvare.') }
  }

  function finalizeInventar(id) {
    const inventar = invActive || inventare.find(item => String(item.id) === String(id))
    setConfirmAction({
      title: 'Finalizează inventar',
      message: `Finalizezi inventarul ${inventar?.numar || id}?`,
      details: 'Diferențele dintre stocul scriptic și cel faptic vor fi aplicate la stoc. Verifică atent liniile înainte de finalizare.',
      confirmLabel: 'Finalizează inventarul',
      tone: 'danger',
      run: async () => {
        await api.patch(`/gestiune/inventare/${id}`, { status: 'finalizat' })
        setInvActive(null)
        await loadInventare()
        await loadBase()
      },
    })
  }

  async function runConfirmAction() {
    if (!confirmAction?.run) return
    setConfirmLoading(true)
    setError('')
    try {
      await confirmAction.run()
      setConfirmAction(null)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Acțiunea nu a putut fi executată.')
    } finally {
      setConfirmLoading(false)
    }
  }

  // ── print NIR ────────────────────────────────────────────────────────────────
  function printNir(nir) {
    const rows = (nir.linii || []).map((l, i) =>
      `<tr><td>${i + 1}</td><td>${l.materialName}</td><td>${l.unit}</td><td class="n">${l.cantitate}</td><td class="n">${fmt(l.pret_unitar)}</td><td class="n">${fmt(l.valoare)}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>NIR ${nir.numar}</title>
<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm}h2{text-align:center;margin-bottom:2px}
.sub{text-align:center;color:#555;margin:0 0 10px}.meta{display:flex;gap:24px;margin-bottom:10px;font-size:9pt}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #bbb;padding:3px 6px;font-size:9pt}
th{background:#f0f0f0;text-align:center}.n{text-align:right}.total{font-weight:bold;background:#eee}
@media print{body{margin:1cm}}</style></head><body>
<h2>NOTĂ DE INTRARE RECEPȚIE</h2>
<p class="sub">Nr. <strong>${nir.numar}</strong> din ${nir.data}</p>
<div class="meta">
  <span>Furnizor: <strong>${nir.furnizor_name || '—'}</strong></span>
  <span>Factură: <strong>${nir.nr_factura || '—'}</strong> / ${nir.data_factura || '—'}</span>
  ${nir.nr_aviz ? `<span>Aviz: <strong>${nir.nr_aviz}</strong></span>` : ''}
</div>
<table><thead><tr><th>#</th><th>Denumire material</th><th>UM</th><th>Cantitate</th><th>Preț unitar</th><th>Valoare</th></tr></thead>
<tbody>${rows}
<tr class="total"><td colspan="5" style="text-align:right">TOTAL</td><td class="n">${fmt(nir.valoare_totala)} RON</td></tr>
</tbody></table>
${nir.observatii ? `<p>Obs: ${nir.observatii}</p>` : ''}
<div style="display:flex;justify-content:space-between;margin-top:32px;font-size:9pt">
  <div style="text-align:center;min-width:160px">Gestionar<br><br>____________________</div>
  <div style="text-align:center;min-width:160px">Contabil<br><br>____________________</div>
  <div style="text-align:center;min-width:160px">Primit de<br><br>____________________</div>
</div>
</body></html>`
    const win = window.open('', '_blank')
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => win.print(), 400)
  }

  // ── print BC ─────────────────────────────────────────────────────────────────
  function printBc(bc) {
    const rows = (bc.linii || []).map((l, i) =>
      `<tr><td>${i + 1}</td><td>${l.materialName}</td><td>${l.unit}</td><td class="n">${l.cantitate}</td><td class="n">${fmt(l.pret_unitar || 0)}</td><td class="n">${fmt(l.cantitate * (l.pret_unitar || 0))}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>BC ${bc.numar}</title>
<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm}h2{text-align:center;margin-bottom:2px}
.sub{text-align:center;color:#555;margin:0 0 10px}.meta{display:flex;gap:24px;margin-bottom:10px;font-size:9pt}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:3px 6px;font-size:9pt}
th{background:#f0f0f0;text-align:center}.n{text-align:right}.total{font-weight:bold;background:#eee}
@media print{body{margin:1cm}}</style></head><body>
<h2>BON DE CONSUM</h2>
<p class="sub">Nr. <strong>${bc.numar}</strong> din ${bc.data}</p>
<div class="meta">
  <span>Departament: <strong>${bc.department || '—'}</strong></span>
  ${bc.lucrare ? `<span>Lucrare: <strong>${bc.lucrare}</strong></span>` : ''}
</div>
<table><thead><tr><th>#</th><th>Denumire material</th><th>UM</th><th>Cantitate</th><th>Preț unitar</th><th>Valoare</th></tr></thead>
<tbody>${rows}</tbody></table>
${bc.observatii ? `<p>Obs: ${bc.observatii}</p>` : ''}
<div style="display:flex;justify-content:space-between;margin-top:32px;font-size:9pt">
  <div style="text-align:center;min-width:160px">Eliberat de<br><br>____________________</div>
  <div style="text-align:center;min-width:160px">Aprobat de<br><span>${bc.aprobat_de || ''}</span><br>____________________</div>
  <div style="text-align:center;min-width:160px">Primit de<br><br>____________________</div>
</div>
</body></html>`
    const win = window.open('', '_blank')
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => win.print(), 400)
  }

  // ── print raport valoric ─────────────────────────────────────────────────────
  function printRaportValoric() {
    if (!raportValoric) return
    const rows = (raportValoric.rows || []).map(r =>
      `<tr><td>${r.cod_intern || '—'}</td><td>${r.name}</td><td>${r.categorie}</td><td>${r.unit}</td><td class="n">${r.stoc}</td><td class="n">${fmt(r.pret_achizitie)}</td><td class="n">${fmt(r.valoare)}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Raport Valoric Stoc</title>
<style>body{font-family:Arial,sans-serif;font-size:9pt;margin:1.5cm}h2{text-align:center}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:3px 5px}
th{background:#f0f0f0;text-align:center}.n{text-align:right}.total{font-weight:bold;background:#e8e8e8}
@media print{body{margin:1cm}}</style></head><body>
<h2>RAPORT VALORIC STOC — ${today()}</h2>
<table><thead><tr><th>Cod</th><th>Denumire</th><th>Categorie</th><th>UM</th><th>Cantitate</th><th>Preț (RON)</th><th>Valoare (RON)</th></tr></thead>
<tbody>${rows}
<tr class="total"><td colspan="6" style="text-align:right">TOTAL VALOARE STOC</td><td class="n">${fmt(raportValoric.totalValoare)} RON</td></tr>
</tbody></table>
</body></html>`
    const win = window.open('', '_blank')
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => win.print(), 400)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">📦 Gestiune / Depozit</h1>
          <p className="text-sm text-slate-500">Nomenclator, NIR, bonuri consum, inventar, furnizori, raport valoric</p>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div> : null}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md -mb-px border border-b-0 transition ${activeTab === tab ? 'border-slate-200 bg-white text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >{tab}</button>
        ))}
      </div>

      {/* ── DASHBOARD ─────────────────────────────────────────────────────────── */}
      {activeTab === 'Dashboard' ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Total materiale', value: dashboard?.stats?.totalMateriale ?? '…', icon: '📋' },
              { label: 'Valoare stoc total', value: dashboard?.stats?.valoareTotal != null ? `${fmt(dashboard.stats.valoareTotal)} RON` : '…', icon: '💰', big: true },
              { label: 'Intrări luna', value: dashboard?.stats?.valoareIntrari != null ? `${fmt(dashboard.stats.valoareIntrari)} RON` : '…', icon: '📥', tone: 'green' },
              { label: 'Ieșiri luna', value: dashboard?.stats?.valoareIesiri != null ? `${fmt(dashboard.stats.valoareIesiri)} RON` : '…', icon: '📤', tone: 'orange' },
              { label: 'Alerte stoc minim', value: dashboard?.stats?.alerteStoc ?? '…', icon: '⚠️', tone: (dashboard?.stats?.alerteStoc || 0) > 0 ? 'rose' : '' },
              { label: 'BC în așteptare', value: dashboard?.stats?.bcPending ?? '…', icon: '📝', tone: (dashboard?.stats?.bcPending || 0) > 0 ? 'amber' : '' },
            ].map(k => (
              <Card key={k.label} className="text-center">
                <div className="text-xl">{k.icon}</div>
                <div className={`font-bold ${k.big ? 'text-lg' : 'text-2xl'} ${k.tone === 'rose' && Number(String(k.value).replace(/[^0-9]/g,'')) > 0 ? 'text-rose-600' : k.tone === 'amber' && Number(String(k.value).replace(/[^0-9]/g,'')) > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{k.value}</div>
                <div className="text-xs text-slate-500">{k.label}</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Alerte stoc */}
            <Card>
              <div className="mb-3 text-sm font-semibold text-slate-700">⚠️ Alerte stoc minim</div>
              {(dashboard?.alerteStoc || []).length === 0
                ? <p className="text-sm text-slate-400">Nicio alertă de stoc minim.</p>
                : (dashboard?.alerteStoc || []).map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                    <div className="font-medium text-slate-800">{a.name}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`${a.stoc === 0 ? 'text-rose-700 font-bold' : 'text-amber-700'}`}>
                        {a.stoc === 0 ? 'EPUIZAT' : `${a.stoc} / min ${a.min} ${a.unit}`}
                      </span>
                    </div>
                  </div>
                ))
              }
            </Card>

            {/* Recepții recente */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">📥 Recepții recente (NIR)</div>
                <button className="text-xs text-primary-600 hover:underline" onClick={() => setActiveTab('Recepție (NIR)')}>vezi toate →</button>
              </div>
              {(dashboard?.recentNir || []).length === 0
                ? <p className="text-sm text-slate-400">Nicio recepție înregistrată.</p>
                : (dashboard?.recentNir || []).map(n => (
                  <div key={n.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
                    <div>
                      <span className="font-medium text-slate-800">{n.numar}</span>
                      <span className="ml-2 text-slate-500">{n.furnizor_name}</span>
                      <span className="ml-2 text-xs text-slate-400">{n.data}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">{fmt(n.valoare_totala)} RON</span>
                      <Badge tone={statusTone(n.status)}>{n.status}</Badge>
                    </div>
                  </div>
                ))
              }
            </Card>
          </div>
        </div>
      ) : null}

      {/* ── NOMENCLATOR ─────────────────────────────────────────────────────── */}
      {activeTab === 'Nomenclator' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Caută" value={matSearch} onChange={e => setMatSearch(e.target.value)} placeholder="Nume, cod, categorie…" />
              <Select label="Categorie" value={matCategorie} onChange={e => setMatCategorie(e.target.value)}
                options={[{ value: '', label: 'Toate categoriile' }, ...matCategorii.map(c => ({ value: c, label: c }))]} />
              <Button onClick={() => { setMatEditing(null); setMatForm(emptyMatForm); setMatModal(true) }}>+ Material nou</Button>
              <Button variant="secondary" onClick={() => exportExcel(
                filteredMats.map(m => ({
                  'Cod intern': m.cod_intern || '', 'Denumire': m.name || m.denumire, 'UM': m.unit || m.um,
                  'Categorie': m.categorie || m.category, 'Stoc curent': m.stock ?? m.stoc_curent,
                  'Stoc minim': m.alert || m.stoc_minim, 'Preț achizitie (RON)': m.pret_achizitie || '',
                  'Locație depozit': m.locatie_depozit || '',
                })),
                'Nomenclator_materiale'
              )}>📊 Export Excel</Button>
              <span className="ml-auto text-sm text-slate-500">{filteredMats.length} materiale</span>
            </div>
          </Card>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cod</th>
                  <th className="px-3 py-2">Denumire</th>
                  <th className="px-3 py-2">UM</th>
                  <th className="px-3 py-2">Categorie</th>
                  <th className="px-3 py-2 text-right">Stoc</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2 text-right">Preț (RON)</th>
                  <th className="px-3 py-2">Locație</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMats.length ? filteredMats.map(m => {
                  const stoc = Number(m.stock ?? m.stoc_curent ?? 0)
                  const min  = Number(m.alert || m.stoc_minim || 0)
                  const sb   = stockBadge(stoc, min)
                  return (
                    <tr key={m.id} className={sb.tone === 'danger' ? 'bg-rose-50/40' : sb.tone === 'warning' ? 'bg-amber-50/30' : ''}>
                      <td className="px-3 py-2 text-xs text-slate-500">{m.cod_intern || '—'}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{m.name || m.denumire}</td>
                      <td className="px-3 py-2">{m.unit || m.um}</td>
                      <td className="px-3 py-2 capitalize">{m.categorie || m.category || 'general'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{stoc}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{min || '—'}</td>
                      <td className="px-3 py-2 text-right">{m.pret_achizitie ? fmt(m.pret_achizitie) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{m.locatie_depozit || '—'}</td>
                      <td className="px-3 py-2"><Badge tone={sb.tone}>{sb.label}</Badge></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button className="text-xs text-primary-600 hover:underline" onClick={() => {
                            setMatEditing(m)
                            setMatForm({ name: m.name || m.denumire || '', unit: m.unit || m.um || '', categorie: m.categorie || m.category || 'general', cod_intern: m.cod_intern || '', stoc_minim: String(m.alert || m.stoc_minim || ''), pret_achizitie: String(m.pret_achizitie || ''), locatie_depozit: m.locatie_depozit || '', furnizor_preferat: m.furnizor_preferat || '' })
                            setMatModal(true)
                          }}>✏️</button>
                          <button className="text-xs text-rose-500 hover:underline" onClick={() => deleteMaterial(m.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan="10" className="px-3 py-8 text-center text-sm text-slate-400">{loading ? 'Se încarcă…' : 'Niciun material găsit.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── NIR ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'Recepție (NIR)' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Luna" type="month" value={nirLuna} onChange={e => setNirLuna(e.target.value)} />
              <Select label="Status" value={nirStatus} onChange={e => setNirStatus(e.target.value)} options={[
                { value: '', label: 'Toate' }, { value: 'draft', label: 'Draft' },
                { value: 'confirmat', label: 'Confirmat' }, { value: 'anulat', label: 'Anulat' },
              ]} />
              <Button onClick={() => { setNirForm({ ...emptyNirForm, linii: [{ ...emptyLine }] }); setNirModal(true) }}>+ NIR nou</Button>
            </div>
          </Card>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr.</th><th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Furnizor</th><th className="px-3 py-2">Factură</th>
                  <th className="px-3 py-2">Contract</th><th className="px-3 py-2">Linii</th><th className="px-3 py-2 text-right">Valoare</th>
                  <th className="px-3 py-2">Status</th><th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nirList.length ? nirList.map(n => (
                  <tr key={n.id}>
                    <td className="px-3 py-2 font-medium text-primary-700">{n.numar}</td>
                    <td className="px-3 py-2">{n.data}</td>
                    <td className="px-3 py-2">{n.furnizor_name || '—'}</td>
                    <td className="px-3 py-2 text-xs">{n.nr_factura || '—'}</td>
                    <td className="px-3 py-2 text-xs">{n.contract_numar ? <Badge tone="info">{n.contract_numar}</Badge> : '—'}</td>
                    <td className="px-3 py-2">{(n.linii || []).length} pos.</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(n.valoare_totala)} RON</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(n.status)}>{n.status}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="rounded bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100" onClick={() => setNirView(n)}>👁️</button>
                        <button className="rounded bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100" onClick={() => printNir(n)}>🖨️</button>
                        {n.status === 'draft' ? (
                          <>
                            <button className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100" onClick={() => confirmNir(n.id)}>✅ Confirmă</button>
                            <button className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100" onClick={() => cancelNir(n.id)}>❌</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="9" className="px-3 py-8 text-center text-sm text-slate-400">Niciun NIR pentru {nirLuna}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── BON CONSUM ───────────────────────────────────────────────────────── */}
      {activeTab === 'Bon Consum' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Luna" type="month" value={bcLuna} onChange={e => setBcLuna(e.target.value)} />
              <Select label="Status" value={bcStatus} onChange={e => setBcStatus(e.target.value)} options={[
                { value: '', label: 'Toate' }, { value: 'draft', label: 'Draft' },
                { value: 'aprobat', label: 'Aprobat' }, { value: 'respins', label: 'Respins' },
              ]} />
              <Button onClick={() => { setBcForm({ ...emptyBcForm, linii: [{ ...emptyLine }] }); setBcModal(true) }}>+ Bon Consum nou</Button>
            </div>
          </Card>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr.</th><th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Departament</th><th className="px-3 py-2">Lucrare</th>
                  <th className="px-3 py-2">Linii</th><th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Aprobat de</th><th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bcList.length ? bcList.map(b => (
                  <tr key={b.id} className={b.status === 'draft' ? 'bg-amber-50/20' : ''}>
                    <td className="px-3 py-2 font-medium text-primary-700">{b.numar}</td>
                    <td className="px-3 py-2">{b.data}</td>
                    <td className="px-3 py-2">{b.department || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{b.lucrare || '—'}</td>
                    <td className="px-3 py-2">{(b.linii || []).length} pos.</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                    <td className="px-3 py-2 text-xs text-slate-500">{b.aprobat_de || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="rounded bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100" onClick={() => setBcView(b)}>👁️</button>
                        <button className="rounded bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100" onClick={() => printBc(b)}>🖨️</button>
                        {b.status === 'draft' ? (
                          <>
                            <button className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100" onClick={() => approveBc(b.id)}>✅ Aprobă</button>
                            <button className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100" onClick={() => { setBcRejectId(b.id); setBcRejectMotiv('') }}>❌ Respinge</button>
                            <button className="text-xs text-rose-400 hover:underline" onClick={() => deleteBc(b.id)}>🗑️</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="8" className="px-3 py-8 text-center text-sm text-slate-400">Niciun bon de consum pentru {bcLuna}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── INVENTAR ─────────────────────────────────────────────────────────── */}
      {activeTab === 'Inventar' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Button onClick={createInventar}>+ Inventar nou</Button>
              <span className="text-sm text-slate-500">{inventare.length} inventare înregistrate</span>
            </div>
          </Card>

          {/* active editing */}
          {invActive ? (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{invActive.numar} — {invActive.data}</div>
                  <div className="text-xs text-slate-500">Completează stocul faptic pentru fiecare material</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={saveInvLines}>💾 Salvează</Button>
                  <Button onClick={() => finalizeInventar(invActive.id)}>✅ Finalizează</Button>
                  <button className="text-xs text-slate-400 hover:underline" onClick={() => setInvActive(null)}>Închide</button>
                </div>
              </div>
              <div className="overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Material</th>
                      <th className="px-3 py-2 text-left">UM</th>
                      <th className="px-3 py-2 text-right">Scriptic</th>
                      <th className="px-3 py-2 text-right">Faptic</th>
                      <th className="px-3 py-2 text-right">Diferență</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invActive.linii.map(l => (
                      <tr key={l.material_id} className={l.diferenta !== 0 ? 'bg-amber-50/30' : ''}>
                        <td className="px-3 py-1 font-medium">{l.materialName}</td>
                        <td className="px-3 py-1">{l.unit}</td>
                        <td className="px-3 py-1 text-right">{l.stoc_scriptic}</td>
                        <td className="px-3 py-1 text-right">
                          <input
                            type="number" step="0.001" min="0"
                            value={l.stoc_faptic}
                            onChange={e => updateInvLine(invActive.id, l.material_id, e.target.value)}
                            className="w-24 rounded border border-slate-300 px-2 py-0.5 text-right text-sm focus:border-primary-500 focus:outline-none"
                          />
                        </td>
                        <td className={`px-3 py-1 text-right font-semibold ${l.diferenta > 0 ? 'text-green-700' : l.diferenta < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {l.diferenta > 0 ? '+' : ''}{l.diferenta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {/* inventare list */}
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr.</th><th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Linii</th><th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Creat de</th><th className="px-3 py-2">Finalizat de</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventare.length ? inventare.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-3 py-2 font-medium text-primary-700">{inv.numar}</td>
                    <td className="px-3 py-2">{inv.data}</td>
                    <td className="px-3 py-2">{(inv.linii || []).length} pos.</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(inv.status)}>{inv.status}</Badge></td>
                    <td className="px-3 py-2 text-xs text-slate-500">{inv.created_by}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{inv.finalizat_de || '—'}</td>
                    <td className="px-3 py-2">
                      {inv.status === 'in_curs' ? (
                        <button className="rounded bg-primary-50 px-2 py-1 text-xs text-primary-700 hover:bg-primary-100" onClick={() => setInvActive(inv)}>✏️ Completează</button>
                      ) : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="7" className="px-3 py-8 text-center text-sm text-slate-400">Niciun inventar înregistrat.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── FURNIZORI ────────────────────────────────────────────────────────── */}
      {activeTab === 'Furnizori' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Caută" value={furSearch} onChange={e => setFurSearch(e.target.value)} placeholder="Nume, CUI, email…" />
              <Button onClick={() => { setFurEditing(null); setFurForm(emptyFurForm); setFurModal(true) }}>+ Furnizor nou</Button>
              <Button variant="secondary" onClick={() => exportExcel(
                filteredFur.map(f => ({ 'Nume': f.nume, 'CUI': f.cui, 'Nr. Reg. Com.': f.nr_reg_com, 'Adresă': f.adresa, 'Tel': f.telefon, 'Email': f.email, 'IBAN': f.iban, 'Bancă': f.banca, 'Persoană contact': f.pers_contact })),
                'Furnizori'
              )}>📊 Export Excel</Button>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredFur.map(f => (
              <Card key={f.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{f.nume}</div>
                    <div className="text-xs text-slate-500">CUI: {f.cui || '—'} · {f.nr_reg_com || ''}</div>
                    {f.adresa ? <div className="mt-1 text-xs text-slate-400">{f.adresa}</div> : null}
                  </div>
                  <div className="flex gap-1">
                    <button className="text-xs text-primary-600 hover:underline" onClick={() => { setFurEditing(f); setFurForm({ ...f }); setFurModal(true) }}>✏️</button>
                    <button className="text-xs text-rose-500 hover:underline" onClick={() => deleteFurnizor(f.id)}>🗑️</button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                  {f.telefon ? <div><span className="text-slate-400">📞 </span>{f.telefon}</div> : null}
                  {f.email   ? <div><span className="text-slate-400">✉️ </span>{f.email}</div>   : null}
                  {f.iban    ? <div className="col-span-2"><span className="text-slate-400">🏦 </span>{f.iban}{f.banca ? ` — ${f.banca}` : ''}</div> : null}
                  {f.pers_contact ? <div className="col-span-2"><span className="text-slate-400">👤 </span>{f.pers_contact}</div> : null}
                </div>
              </Card>
            ))}
            {filteredFur.length === 0 ? (
              <div className="col-span-3 rounded-xl border-2 border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
                {loading ? 'Se încarcă…' : 'Niciun furnizor înregistrat.'}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── RAPORT VALORIC ───────────────────────────────────────────────────── */}
      {activeTab === 'Raport Valoric' ? (
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Select label="Categorie" value={rvCategorie} onChange={e => setRvCategorie(e.target.value)}
                options={[{ value: '', label: 'Toate categoriile' }, ...(raportValoric?.categorii || []).map(c => ({ value: c, label: c }))]} />
              <Button onClick={loadRaport}>↺ Actualizează</Button>
              {raportValoric ? (
                <>
                  <Button variant="secondary" onClick={printRaportValoric}>🖨️ Print / PDF</Button>
                  <Button variant="secondary" onClick={() => exportExcel(
                    (raportValoric.rows || []).map(r => ({
                      'Cod': r.cod_intern, 'Denumire': r.name, 'Categorie': r.categorie, 'UM': r.unit,
                      'Stoc': r.stoc, 'Stoc minim': r.stoc_minim, 'Preț (RON)': r.pret_achizitie, 'Valoare (RON)': r.valoare,
                      'Locație': r.locatie, 'Status': r.status,
                    })),
                    `RaportValoric_${today()}`
                  )}>📊 Export Excel</Button>
                </>
              ) : null}
              {raportValoric ? (
                <div className="ml-auto rounded-lg bg-primary-50 px-4 py-2 text-sm">
                  <span className="text-slate-600">Valoare totală stoc: </span>
                  <span className="text-lg font-bold text-primary-700">{fmt(raportValoric.totalValoare)} RON</span>
                </div>
              ) : null}
            </div>
          </Card>

          {raportValoric ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Cod</th><th className="px-3 py-2">Denumire</th>
                    <th className="px-3 py-2">Categorie</th><th className="px-3 py-2">UM</th>
                    <th className="px-3 py-2 text-right">Stoc</th><th className="px-3 py-2 text-right">Min</th>
                    <th className="px-3 py-2 text-right">Preț (RON)</th><th className="px-3 py-2 text-right">Valoare (RON)</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(raportValoric.rows || []).map(r => (
                    <tr key={r.id} className={r.status === 'epuizat' || r.status === 'critic' ? 'bg-rose-50/30' : r.status === 'atentie' ? 'bg-amber-50/20' : ''}>
                      <td className="px-3 py-2 text-xs text-slate-400">{r.cod_intern || '—'}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                      <td className="px-3 py-2 capitalize text-slate-500">{r.categorie}</td>
                      <td className="px-3 py-2">{r.unit}</td>
                      <td className="px-3 py-2 text-right font-semibold">{r.stoc}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{r.stoc_minim || '—'}</td>
                      <td className="px-3 py-2 text-right">{r.pret_achizitie ? fmt(r.pret_achizitie) : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmt(r.valoare)}</td>
                      <td className="px-3 py-2"><Badge tone={r.status === 'ok' ? 'success' : r.status === 'atentie' ? 'warning' : 'danger'}>{r.status}</Badge></td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan="7" className="px-3 py-2 text-right">TOTAL VALOARE STOC</td>
                    <td className="px-3 py-2 text-right text-primary-700">{fmt(raportValoric.totalValoare)} RON</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-sm text-slate-400">
              Apasă Actualizează pentru a genera raportul valoric
            </div>
          )}
        </div>
      ) : null}

      {/* ═══ MODALS ═══════════════════════════════════════════════════════════ */}

      {/* ── MODAL MATERIAL ──────────────────────────────────────────────────── */}
      <Modal open={matModal} title={matEditing ? 'Editează material' : 'Material nou'} onClose={() => { setMatModal(false); setMatEditing(null) }} size="lg">
        <form className="grid gap-3" onSubmit={saveMaterial}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Denumire *" value={matForm.name} onChange={e => setMatForm({ ...matForm, name: e.target.value })} required />
            <Input label="Unitate măsură (UM) *" value={matForm.unit} onChange={e => setMatForm({ ...matForm, unit: e.target.value })} placeholder="buc, kg, l, m, t…" required />
            <Select label="Categorie" value={matForm.categorie} onChange={e => setMatForm({ ...matForm, categorie: e.target.value })} options={[
              { value: 'general', label: 'General' }, { value: 'asfalt', label: 'Asfalt' },
              { value: 'constructii', label: 'Construcții' }, { value: 'electrice', label: 'Electrice' },
              { value: 'piese_auto', label: 'Piese auto' }, { value: 'combustibil', label: 'Combustibil' },
              { value: 'consumabile', label: 'Consumabile' }, { value: 'altele', label: 'Altele' },
            ]} />
            <Input label="Cod intern" value={matForm.cod_intern} onChange={e => setMatForm({ ...matForm, cod_intern: e.target.value })} placeholder="ex: MAT-001" />
            <Input label="Stoc minim" type="number" step="0.001" min="0" value={matForm.stoc_minim} onChange={e => setMatForm({ ...matForm, stoc_minim: e.target.value })} />
            <Input label="Preț achiziție (RON)" type="number" step="0.01" min="0" value={matForm.pret_achizitie} onChange={e => setMatForm({ ...matForm, pret_achizitie: e.target.value })} />
            <Input label="Locație depozit" value={matForm.locatie_depozit} onChange={e => setMatForm({ ...matForm, locatie_depozit: e.target.value })} placeholder="ex: Raft A3, Depozit 2" />
            <Select label="Furnizor preferat" value={matForm.furnizor_preferat} onChange={e => setMatForm({ ...matForm, furnizor_preferat: e.target.value })}
              options={[{ value: '', label: 'Fără preferință' }, ...furnizori.map(f => ({ value: f.id, label: f.nume }))]} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setMatModal(false); setMatEditing(null) }}>Renunță</Button>
            <Button type="submit" disabled={saving}>{matEditing ? 'Actualizează' : 'Salvează'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL FURNIZOR ──────────────────────────────────────────────────── */}
      <Modal open={furModal} title={furEditing ? 'Editează furnizor' : 'Furnizor nou'} onClose={() => { setFurModal(false); setFurEditing(null) }} size="lg">
        <form className="grid gap-3" onSubmit={saveFurnizor}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Denumire *" value={furForm.nume} onChange={e => setFurForm({ ...furForm, nume: e.target.value })} required />
            <Input label="CUI" value={furForm.cui} onChange={e => setFurForm({ ...furForm, cui: e.target.value })} />
            <Input label="Nr. Reg. Com." value={furForm.nr_reg_com} onChange={e => setFurForm({ ...furForm, nr_reg_com: e.target.value })} />
            <Input label="Telefon" value={furForm.telefon} onChange={e => setFurForm({ ...furForm, telefon: e.target.value })} />
            <Input label="Email" type="email" value={furForm.email} onChange={e => setFurForm({ ...furForm, email: e.target.value })} />
            <Input label="Persoană contact" value={furForm.pers_contact} onChange={e => setFurForm({ ...furForm, pers_contact: e.target.value })} />
            <Input label="IBAN" value={furForm.iban} onChange={e => setFurForm({ ...furForm, iban: e.target.value })} className="md:col-span-2" />
            <Input label="Bancă" value={furForm.banca} onChange={e => setFurForm({ ...furForm, banca: e.target.value })} />
            <Input label="Adresă" value={furForm.adresa} onChange={e => setFurForm({ ...furForm, adresa: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={2} value={furForm.observatii} onChange={e => setFurForm({ ...furForm, observatii: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setFurModal(false); setFurEditing(null) }}>Renunță</Button>
            <Button type="submit" disabled={saving}>{furEditing ? 'Actualizează' : 'Salvează'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL NIR ─────────────────────────────────────────────────────────── */}
      <Modal open={nirModal} title="NIR nou — Notă de Intrare Recepție" onClose={() => setNirModal(false)} size="lg">
        <form className="grid gap-3" onSubmit={saveNir}>
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Data" type="date" value={nirForm.data} onChange={e => setNirForm({ ...nirForm, data: e.target.value })} required />
            <Select label="Furnizor" value={nirForm.furnizor_id} onChange={e => {
              const f = furnizori.find(x => x.id === e.target.value)
              setNirForm({ ...nirForm, furnizor_id: e.target.value, furnizor_name: f?.nume || '' })
            }} options={furOptions} />
            <Input label="Furnizor (manual)" value={nirForm.furnizor_name} onChange={e => setNirForm({ ...nirForm, furnizor_name: e.target.value })} placeholder="Dacă nu e în listă" />
            <Input label="Nr. factură" value={nirForm.nr_factura} onChange={e => setNirForm({ ...nirForm, nr_factura: e.target.value })} />
            <Input label="Dată factură" type="date" value={nirForm.data_factura} onChange={e => setNirForm({ ...nirForm, data_factura: e.target.value })} />
            <Input label="Nr. aviz" value={nirForm.nr_aviz} onChange={e => setNirForm({ ...nirForm, nr_aviz: e.target.value })} />
            <Select label="Contract urmărit" value={nirForm.contract_id || ''} onChange={e => setNirForm({ ...nirForm, contract_id: e.target.value })} options={contractOptions} />
          </div>

          {/* Linii */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Linii produse</span>
              <button type="button" className="rounded bg-primary-50 px-2 py-1 text-primary-700 hover:bg-primary-100" onClick={nirAddLine}>+ Adaugă linie</button>
            </div>
            {nirForm.linii.map((l, idx) => (
              <div key={idx} className="mb-2 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {idx === 0 && <label className="mb-1 block text-xs text-slate-500">Material</label>}
                  <select className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-primary-500 focus:outline-none" value={l.material_id} onChange={e => nirSetLine(idx, 'material_id', e.target.value)} required>
                    {matOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  {idx === 0 && <label className="mb-1 block text-xs text-slate-500">Cantitate</label>}
                  <input type="number" step="0.001" min="0.001" required className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-primary-500 focus:outline-none" value={l.cantitate} onChange={e => nirSetLine(idx, 'cantitate', e.target.value)} />
                </div>
                <div className="col-span-3">
                  {idx === 0 && <label className="mb-1 block text-xs text-slate-500">Preț unitar (RON)</label>}
                  <input type="number" step="0.01" min="0" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-primary-500 focus:outline-none" value={l.pret_unitar} onChange={e => nirSetLine(idx, 'pret_unitar', e.target.value)} />
                </div>
                <div className="col-span-1 flex items-end justify-end pb-1">
                  <span className="text-xs font-semibold text-slate-700">{l.cantitate && l.pret_unitar ? fmt(Number(l.cantitate) * Number(l.pret_unitar)) : '—'}</span>
                </div>
                <div className="col-span-1 flex items-end pb-1">
                  <button type="button" className="text-rose-400 hover:text-rose-600" onClick={() => nirRemoveLine(idx)}>✕</button>
                </div>
              </div>
            ))}
            <div className="text-right text-sm font-semibold text-slate-700">
              Total: {fmt(nirForm.linii.reduce((s, l) => s + (Number(l.cantitate || 0) * Number(l.pret_unitar || 0)), 0))} RON
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={2} value={nirForm.observatii} onChange={e => setNirForm({ ...nirForm, observatii: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNirModal(false)}>Renunță</Button>
            <Button type="submit" disabled={saving || !nirForm.linii.length}>Salvează NIR (draft)</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL BON CONSUM ─────────────────────────────────────────────────── */}
      <Modal open={bcModal} title="Bon de Consum nou" onClose={() => setBcModal(false)} size="lg">
        <form className="grid gap-3" onSubmit={saveBc}>
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Data" type="date" value={bcForm.data} onChange={e => setBcForm({ ...bcForm, data: e.target.value })} required />
            <Input label="Departament" value={bcForm.department} onChange={e => setBcForm({ ...bcForm, department: e.target.value })} placeholder="ex: Asternere" />
            <Input label="Lucrare / Obiectiv" value={bcForm.lucrare} onChange={e => setBcForm({ ...bcForm, lucrare: e.target.value })} placeholder="ex: DN7 km 12" />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Linii materiale</span>
              <button type="button" className="rounded bg-primary-50 px-2 py-1 text-primary-700 hover:bg-primary-100" onClick={bcAddLine}>+ Adaugă linie</button>
            </div>
            {bcForm.linii.map((l, idx) => (
              <div key={idx} className="mb-2 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-8">
                  {idx === 0 && <label className="mb-1 block text-xs text-slate-500">Material</label>}
                  <select className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-primary-500 focus:outline-none" value={l.material_id} onChange={e => bcSetLine(idx, 'material_id', e.target.value)} required>
                    {matOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  {idx === 0 && <label className="mb-1 block text-xs text-slate-500">Cantitate</label>}
                  <input type="number" step="0.001" min="0.001" required className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-primary-500 focus:outline-none" value={l.cantitate} onChange={e => bcSetLine(idx, 'cantitate', e.target.value)} />
                </div>
                <div className="col-span-1 flex items-end pb-1">
                  <button type="button" className="text-rose-400 hover:text-rose-600" onClick={() => bcRemoveLine(idx)}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observații</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={2} value={bcForm.observatii} onChange={e => setBcForm({ ...bcForm, observatii: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setBcModal(false)}>Renunță</Button>
            <Button type="submit" disabled={saving || !bcForm.linii.length}>Salvează (draft)</Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL RESPINGERE BC ──────────────────────────────────────────────── */}
      <Modal open={Boolean(bcRejectId)} title="Respinge bon de consum" onClose={() => setBcRejectId(null)}>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Motiv respingere</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none" rows={3} value={bcRejectMotiv} onChange={e => setBcRejectMotiv(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBcRejectId(null)}>Renunță</Button>
            <Button onClick={rejectBc}>Respinge</Button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL VIEW NIR ───────────────────────────────────────────────────── */}
      <Modal open={Boolean(nirView)} title={nirView ? `${nirView.numar} — ${nirView.furnizor_name || ''}` : ''} onClose={() => setNirView(null)} size="lg">
        {nirView ? (
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>Data: <strong>{nirView.data}</strong></div>
              <div>Factură: <strong>{nirView.nr_factura || '—'}</strong> / {nirView.data_factura || '—'}</div>
              {nirView.nr_aviz ? <div>Aviz: <strong>{nirView.nr_aviz}</strong></div> : null}
              <div>Status: <Badge tone={statusTone(nirView.status)}>{nirView.status}</Badge></div>
            </div>
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="border border-slate-200 px-2 py-1 text-left">Material</th><th className="border border-slate-200 px-2 py-1 text-right">Cant.</th><th className="border border-slate-200 px-2 py-1">UM</th><th className="border border-slate-200 px-2 py-1 text-right">Preț</th><th className="border border-slate-200 px-2 py-1 text-right">Valoare</th></tr>
              </thead>
              <tbody>
                {(nirView.linii || []).map((l, i) => (
                  <tr key={i}><td className="border border-slate-200 px-2 py-1">{l.materialName}</td><td className="border border-slate-200 px-2 py-1 text-right">{l.cantitate}</td><td className="border border-slate-200 px-2 py-1">{l.unit}</td><td className="border border-slate-200 px-2 py-1 text-right">{fmt(l.pret_unitar)}</td><td className="border border-slate-200 px-2 py-1 text-right font-medium">{fmt(l.valoare)}</td></tr>
                ))}
                <tr className="bg-slate-50 font-bold"><td colSpan="4" className="border border-slate-200 px-2 py-1 text-right">TOTAL</td><td className="border border-slate-200 px-2 py-1 text-right">{fmt(nirView.valoare_totala)} RON</td></tr>
              </tbody>
            </table>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => printNir(nirView)}>🖨️ Print</Button>
              <Button variant="secondary" onClick={() => setNirView(null)}>Închide</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ── MODAL VIEW BC ────────────────────────────────────────────────────── */}
      <Modal open={Boolean(bcView)} title={bcView ? `${bcView.numar} — ${bcView.department || ''}` : ''} onClose={() => setBcView(null)} size="lg">
        {bcView ? (
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>Data: <strong>{bcView.data}</strong></div>
              <div>Lucrare: <strong>{bcView.lucrare || '—'}</strong></div>
              <div>Status: <Badge tone={statusTone(bcView.status)}>{bcView.status}</Badge></div>
              {bcView.aprobat_de ? <div>Aprobat de: <strong>{bcView.aprobat_de}</strong></div> : null}
              {bcView.motiv_respingere ? <div className="col-span-2 text-rose-700">Motiv respingere: {bcView.motiv_respingere}</div> : null}
            </div>
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="border border-slate-200 px-2 py-1 text-left">Material</th><th className="border border-slate-200 px-2 py-1 text-right">Cant.</th><th className="border border-slate-200 px-2 py-1">UM</th></tr>
              </thead>
              <tbody>
                {(bcView.linii || []).map((l, i) => (
                  <tr key={i}><td className="border border-slate-200 px-2 py-1">{l.materialName}</td><td className="border border-slate-200 px-2 py-1 text-right">{l.cantitate}</td><td className="border border-slate-200 px-2 py-1">{l.unit}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => printBc(bcView)}>🖨️ Print</Button>
              <Button variant="secondary" onClick={() => setBcView(null)}>Închide</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel}
        tone={confirmAction?.tone}
        loading={confirmLoading}
        onCancel={() => !confirmLoading && setConfirmAction(null)}
        onConfirm={runConfirmAction}
      />
    </div>
  )
}
