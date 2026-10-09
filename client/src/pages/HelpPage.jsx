import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import FeedbackToast from '../components/ui/FeedbackToast'
import Input from '../components/ui/Input'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'

const emptyForm = { id: '', category: '', title: '', summary: '', stepsText: '', active: true, sort_order: '', image_id: '', image_caption: '' }

function errorMessage(error, fallback) {
  return error?.response?.data?.error || fallback
}

function articleToForm(article = {}) {
  return {
    id: article.id || '', category: article.category || '', title: article.title || '', summary: article.summary || '',
    stepsText: Array.isArray(article.steps) ? article.steps.join('\n') : '', active: article.active !== false,
    sort_order: article.sort_order ?? '', image_id: article.image_id || '', image_caption: article.image_caption || '',
  }
}

function HelpImage({ imageId, alt }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    let objectUrl = ''
    let active = true
    if (!imageId) { setSource(''); return undefined }
    api.get(`/help/images/${encodeURIComponent(imageId)}`, { responseType: 'blob' })
      .then(response => {
        if (!active) return
        objectUrl = URL.createObjectURL(response.data)
        setSource(objectUrl)
      })
      .catch(() => { if (active) setSource('') })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId])
  if (!source) return null
  return <img src={source} alt={alt} className="mt-4 max-h-80 w-full rounded-lg border border-slate-200 object-contain" />
}

export default function HelpPage() {
  const { user } = useAuth()
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [openCategory, setOpenCategory] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const importInputRef = useRef(null)
  const isSuperadmin = user?.role === 'superadmin' || (Array.isArray(user?.roles) && user.roles.includes('superadmin'))

  const loadHelp = async () => {
    setLoading(true)
    try {
      const response = await api.get('/help')
      const nextArticles = response.data?.help?.articles || []
      setArticles(nextArticles)
      setOpenCategory(current => current || nextArticles[0]?.category || '')
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, 'Ajutorul nu a putut fi încărcat.') })
    } finally { setLoading(false) }
  }

  useEffect(() => { loadHelp() }, [])

  const normalizedQuery = query.trim().toLocaleLowerCase('ro-RO')
  const groupedArticles = useMemo(() => {
    const result = new Map()
    articles
      .filter(article => article.active !== false || isSuperadmin)
      .filter(article => !normalizedQuery || [article.category, article.title, article.summary, ...(article.steps || [])].join(' ').toLocaleLowerCase('ro-RO').includes(normalizedQuery))
      .forEach(article => {
        if (!result.has(article.category)) result.set(article.category, [])
        result.get(article.category).push(article)
      })
    return Array.from(result.entries())
  }, [articles, isSuperadmin, normalizedQuery])

  function openNewArticle() {
    setForm({ ...emptyForm, category: groupedArticles[0]?.[0] || '' })
    setEditorOpen(true)
  }

  async function saveArticle(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = {
        category: form.category, title: form.title, summary: form.summary,
        steps: form.stepsText.split('\n').map(item => item.trim()).filter(Boolean), active: form.active,
        sort_order: form.sort_order === '' ? undefined : Number(form.sort_order), image_id: form.image_id, image_caption: form.image_caption,
      }
      const response = form.id ? await api.patch(`/help/articles/${encodeURIComponent(form.id)}`, payload) : await api.post('/help/articles', payload)
      setArticles(response.data?.help?.articles || [])
      setEditorOpen(false)
      setFeedback({ tone: 'success', text: form.id ? 'Articolul a fost actualizat.' : 'Articolul a fost publicat.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, 'Articolul nu a putut fi salvat.') })
    } finally { setSaving(false) }
  }

  async function uploadImage(file) {
    if (!file) return
    setUploading(true)
    try {
      const data = new FormData()
      data.append('image', file)
      const response = await api.post('/help/images', data)
      setForm(current => ({ ...current, image_id: response.data?.image?.id || '' }))
      setFeedback({ tone: 'success', text: 'Imaginea a fost încărcată controlat. Salvează articolul pentru a o atașa.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, 'Imaginea nu a putut fi încărcată.') })
    } finally { setUploading(false) }
  }

  async function deleteArticle(article) {
    if (!window.confirm(`Ștergi articolul „${article.title}”?`)) return
    try {
      const response = await api.delete(`/help/articles/${encodeURIComponent(article.id)}`)
      setArticles(response.data?.help?.articles || [])
      setFeedback({ tone: 'success', text: 'Articolul a fost șters.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, 'Articolul nu a putut fi șters.') })
    }
  }

  async function exportHelp() {
    try {
      const response = await api.get('/help/export', { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'infraflow-ajutor.zip'
      link.click()
      URL.revokeObjectURL(url)
      setFeedback({ tone: 'success', text: 'Biblioteca Ajutor a fost exportată. O poți importa în altă instalație InfraFlow.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, 'Biblioteca Ajutor nu a putut fi exportată.') })
    }
  }

  async function importHelp(file) {
    if (!file) return
    if (!window.confirm('Importul va înlocui întreaga bibliotecă Ajutor din această instalație. Continui?')) return
    setUploading(true)
    try {
      const data = new FormData()
      data.append('help_package', file)
      data.append('replace', 'true')
      const response = await api.post('/help/import', data)
      setArticles(response.data?.help?.articles || [])
      setOpenCategory(response.data?.help?.articles?.[0]?.category || '')
      setFeedback({ tone: 'success', text: 'Biblioteca Ajutor a fost importată.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, 'Pachetul Ajutor nu a putut fi importat.') })
    } finally {
      setUploading(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className="module-workspace help-workspace min-w-0 grid gap-5">
      <PageHeader
        title="Ajutor"
        subtitle="Răspunsuri scurte pentru activitățile uzuale, actualizate direct în aplicație."
        actions={isSuperadmin ? [
          <Button key="import" variant="secondary" disabled={uploading} onClick={() => importInputRef.current?.click()}>Importă Ajutor</Button>,
          <Button key="export" variant="secondary" onClick={exportHelp}>Exportă Ajutor</Button>,
          <Button key="new" onClick={openNewArticle}>+ Articol nou</Button>,
        ] : []}
      />
      <input ref={importInputRef} className="hidden" type="file" accept=".zip,application/zip" onChange={event => importHelp(event.target.files?.[0])} />
      <Card className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Input label="Caută în Ajutor" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: ofertă, stoc, pontaj, cursă" />
        {isSuperadmin ? <p className="pb-2 text-xs text-slate-500">Editor disponibil doar pentru superadmin. Articolele inactive rămân vizibile doar aici; folosește Export/Import pentru a transfera biblioteca între Demo și client.</p> : null}
      </Card>
      {loading ? <LoadingSkeleton rows={6} /> : null}
      {!loading && !groupedArticles.length ? <Card><p className="text-sm text-slate-500">Nu există articole pentru căutarea curentă.</p></Card> : null}
      {!loading && groupedArticles.map(([category, categoryArticles]) => {
        const expanded = normalizedQuery || openCategory === category
        return (
          <Card key={category} className="overflow-hidden">
            <button type="button" className="flex w-full items-center justify-between gap-4 text-left" onClick={() => setOpenCategory(expanded && !normalizedQuery ? '' : category)}>
              <span className="text-lg font-semibold text-slate-900">{category}</span><span className="text-sm text-slate-400">{expanded ? '−' : '+'}</span>
            </button>
            {expanded ? <div className="mt-4 grid gap-3">
              {categoryArticles.map(article => <article key={article.id} className={`rounded-xl border p-4 ${article.active === false ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{article.title}</h2>{article.active === false ? <span className="mt-1 inline-block text-xs font-medium text-amber-700">Ascuns pentru utilizatori</span> : null}</div>
                  {isSuperadmin ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => { setForm(articleToForm(article)); setEditorOpen(true) }}>Editează</Button><Button size="sm" variant="ghost" onClick={() => deleteArticle(article)}>Șterge</Button></div> : null}
                </div>
                {article.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p> : null}
                {article.steps?.length ? <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">{article.steps.map((step, index) => <li key={`${article.id}-${index}`}>{step}</li>)}</ol> : null}
                <HelpImage imageId={article.image_id} alt={article.image_caption || article.title} />
                {article.image_caption ? <p className="mt-2 text-xs text-slate-500">{article.image_caption}</p> : null}
              </article>)}
            </div> : null}
          </Card>
        )
      })}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={form.id ? 'Editează articol de ajutor' : 'Articol nou de ajutor'} size="lg">
        <form className="grid gap-4" onSubmit={saveArticle}>
          <div className="grid gap-4 md:grid-cols-2"><Input label="Categorie" required value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="Ex.: CRM / Vânzări" /><Input label="Ordine în categorie" type="number" min="0" value={form.sort_order} onChange={event => setForm({ ...form, sort_order: event.target.value })} placeholder="10" /></div>
          <Input label="Titlu" required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ce trebuie să știe utilizatorul?" />
          <label className="grid gap-1 text-sm font-medium text-slate-700">Rezumat<textarea className="min-h-20 rounded-[var(--radius-control)] border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={form.summary} onChange={event => setForm({ ...form, summary: event.target.value })} placeholder="O explicație scurtă, orientată pe rezultat." /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Pași (câte unul pe rând)<textarea className="min-h-40 rounded-[var(--radius-control)] border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" value={form.stepsText} onChange={event => setForm({ ...form, stepsText: event.target.value })} placeholder={'Deschide modulul.\nAlege acțiunea dorită.\nCompletează datele și salvează.'} /></label>
          <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700">Captură sau fotografie (PNG, JPG, WEBP; max. 3 MB)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => uploadImage(event.target.files?.[0])} /><span className="text-xs font-normal text-slate-500">{uploading ? 'Se încarcă…' : form.image_id ? 'Imagine selectată pentru articol.' : 'Imaginea este opțională.'}</span></label><Input label="Explicație captură" value={form.image_caption} onChange={event => setForm({ ...form, image_caption: event.target.value })} placeholder="Ce trebuie să observe utilizatorul" /></div>
          {form.image_id ? <HelpImage imageId={form.image_id} alt={form.image_caption || form.title || 'Previzualizare imagine'} /> : null}
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} /> Publicat pentru utilizatori</label>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4"><Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>Anulează</Button><Button type="submit" loading={saving}>{form.id ? 'Salvează articolul' : 'Publică articolul'}</Button></div>
        </form>
      </Modal>
      {feedback ? <FeedbackToast tone={feedback.tone} onClose={() => setFeedback(null)}>{feedback.text}</FeedbackToast> : null}
    </div>
  )
}
