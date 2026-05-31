import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FileJson, UploadCloud } from 'lucide-react'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'

const previewRows = [
  { key: 'utilizatori', label: 'utilizatori', previewKey: 'utilizatori_preview' },
  { key: 'materiale', label: 'materiale', previewKey: 'materiale_preview' },
  { key: 'retete', label: 'rețete', previewKey: 'retete_preview' },
  { key: 'consumuri', label: 'consumuri de producție' },
  { key: 'miscari_stoc', label: 'mișcări de stoc' },
  { key: 'utilaje', label: 'utilaje', previewKey: 'utilaje_preview' },
  { key: 'centre_cost', label: 'centre de cost', previewKey: 'centre_cost_preview' },
]

function makeFormData(file) {
  const formData = new FormData()
  formData.append('file', file)
  return formData
}

function ProgressBar({ value }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-primary-600 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function PreviewLine({ row, preview }) {
  const count = preview?.[row.key] || 0
  const names = preview?.[row.previewKey] || []
  const detail = names.length ? ` (${names.join(', ')}${count > names.length ? '...' : ''})` : ''
  return (
    <li className="flex items-start gap-2 text-sm text-slate-700">
      <span className="mt-0.5 text-primary-600">✅</span>
      <span><strong>{count}</strong> {row.label}{detail}</span>
    </li>
  )
}

export default function ImportLegacyPage() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const step = useMemo(() => {
    if (result) return 3
    if (preview) return 2
    return 1
  }, [preview, result])

  const chooseFile = async selectedFile => {
    setError('')
    setResult(null)
    setPreview(null)
    setConfirmed(false)
    setProgress(0)

    if (!selectedFile) return
    if (!selectedFile.name.toLowerCase().endsWith('.json')) {
      setError('Selectează un fișier backup în format .json.')
      return
    }

    setFile(selectedFile)
    setLoadingPreview(true)
    try {
      const response = await api.post('/integration/legacy/preview', makeFormData(selectedFile), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setPreview(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Nu am putut citi backup-ul.')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleDrop = event => {
    event.preventDefault()
    chooseFile(event.dataTransfer.files?.[0])
  }

  const handleImport = async () => {
    if (!file || !confirmed) return
    setError('')
    setImporting(true)
    setProgress(15)

    const timer = window.setInterval(() => {
      setProgress(current => Math.min(92, current + 8))
    }, 400)

    try {
      const response = await api.post('/integration/legacy/import', makeFormData(file), {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(response.data)
      setProgress(100)
      window.setTimeout(() => navigate('/dashboard'), 1800)
    } catch (err) {
      setError(err.response?.data?.error || 'Importul nu a putut fi finalizat.')
    } finally {
      window.clearInterval(timer)
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-primary-600">Integrare legacy</p>
          <h1 className="text-2xl font-semibold text-slate-900">Import date vechi</h1>
          <p className="mt-1 text-sm text-slate-500">
            Importă backup-ul JSON din InfraFlow v1 / Asfalt Pro și mută datele reale în InfraFlow v2.
          </p>
        </div>
        <Badge variant={step === 3 ? 'green' : step === 2 ? 'blue' : 'gray'}>Pasul {step} din 3</Badge>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {step === 1 && (
        <Card title="Pasul 1 - Upload fișier backup" subtitle="Selectează fișierul .json generat de aplicația veche.">
          <div
            className="grid min-h-72 place-items-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-primary-500 hover:bg-primary-50/40"
            onDragOver={event => event.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="max-w-md">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary-700">
                <UploadCloud size={28} />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Trage backup-ul aici</h2>
              <p className="mt-2 text-sm text-slate-500">
                Acceptăm doar fișiere JSON, de tip `asfalt-pro-backup-YYYYMMDD.json`.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={event => chooseFile(event.target.files?.[0])}
              />
              <Button
                className="mt-5"
                loading={loadingPreview}
                icon={<FileJson size={18} />}
                onClick={() => inputRef.current?.click()}
              >
                Selectează fișier backup
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card
            title="Pasul 2 - Preview import"
            subtitle={file ? `Backup selectat: ${file.name}` : 'Backup analizat fara import.'}
            actions={<Button variant="secondary" onClick={() => inputRef.current?.click()}>Alege alt fișier</Button>}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => chooseFile(event.target.files?.[0])}
            />
            <ul className="grid gap-3">
              {previewRows.map(row => <PreviewLine key={row.key} row={row} preview={preview} />)}
            </ul>

            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>⚠️ ATENȚIE:</strong> Importul va suprascrie datele existente din aplicație.
            </div>

            <label className="mt-4 flex items-start gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
              />
              <span>Am înțeles că datele existente vor fi înlocuite</span>
            </label>

            <div className="mt-5 space-y-3">
              {importing && <ProgressBar value={progress} />}
              <Button
                disabled={!confirmed || importing}
                loading={importing}
                icon={<UploadCloud size={18} />}
                onClick={handleImport}
              >
                Importă datele
              </Button>
            </div>
          </Card>

          <Card title="Rezumat backup" subtitle={`Data backup: ${preview?.backup_data || '-'}`}>
            <div className="grid grid-cols-2 gap-3">
              {previewRows.map(row => (
                <div key={row.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xl font-semibold text-slate-900">{preview?.[row.key] || 0}</div>
                  <div className="text-xs font-medium uppercase text-slate-500">{row.label}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card className="border-primary-200 bg-primary-50" title="Pasul 3 - Succes">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-primary-700">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Import finalizat cu succes!</h2>
              <p className="mt-2 text-sm text-slate-700">
                Toate datele din aplicația anterioară sunt acum în InfraFlow v2.
              </p>
              <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(result?.importat || {}).filter(([key]) => key !== 'erori').map(([key, value]) => (
                  <div key={key} className="rounded-md bg-white px-3 py-2">
                    <strong>{value}</strong> {key.replaceAll('_', ' ')}
                  </div>
                ))}
              </div>
              <Button className="mt-5" onClick={() => navigate('/dashboard')}>Mergi la Dashboard</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
