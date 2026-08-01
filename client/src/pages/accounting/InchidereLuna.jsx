import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Input from '../../components/forms/Input'
import { formatMoney } from '../../utils/format'
import { AccountingShell, DropdownMenu, Info, Table, currentMonth, statusTone } from './accounting-shared'
export function InchidereLuna() {
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(searchParams.get('luna') || currentMonth())
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submissionRef, setSubmissionRef] = useState('')
  const [reopenReason, setReopenReason] = useState('')

  useEffect(() => { load() }, [month])

  function load() {
    const [an, luna] = month.split('-')
    setError('')
    api.get(`/accounting/periods/${an}/${Number(luna)}/check`)
      .then(res => setData(res.data))
      .catch(err => {
        setData(null)
        setError(err.response?.data?.error || 'Nu am putut verifica luna selectata.')
      })
  }

  async function closeMonth() {
    const [an, luna] = month.split('-')
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/close`)
      setMessage('Luna a fost inchisa.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Luna nu a putut fi inchisa.')
    }
  }

  async function reopenMonth() {
    const [an, luna] = month.split('-')
    if (!reopenReason.trim()) {
      setError('Completeaza motivul redeschiderii pentru jurnalul de audit.')
      return
    }
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/reopen`, { motiv: reopenReason })
      setMessage('Luna a fost redeschisa.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Luna nu a putut fi redeschisa.')
    }
  }

  async function markSubmitted() {
    const [an, luna] = month.split('-')
    if (!submissionRef.trim()) {
      setError('Completeaza numarul recipisei sau referinta depunerii.')
      return
    }
    try {
      setError('')
      await api.post(`/accounting/periods/${an}/${Number(luna)}/mark-submitted`, { depunere_ref: submissionRef })
      setMessage('Declaratiile au fost marcate ca depuse.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Declaratiile nu au putut fi marcate ca depuse.')
    }
  }

  async function downloadDossier() {
    const [an, luna] = month.split('-')
    try {
      const response = await api.post(`/accounting/periods/${an}/${Number(luna)}/dossier`, {}, { responseType: 'blob' })
      downloadBlob(response.data, `Dosar_contabil_${an}_${luna}.zip`)
      setMessage('Dosarul lunar a fost generat si arhivat in audit.')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Dosarul lunar nu a putut fi generat.') }
  }

  async function printDossier() {
    const [an, luna] = month.split('-')
    try {
      const response = await api.get(`/accounting/periods/${an}/${Number(luna)}/dossier-print`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) { setError(err.response?.data?.error || 'Coperta dosarului nu a putut fi deschisa.') }
  }

  const checks = data?.checks || {}
  const status = data?.period?.status || 'deschisa'
  const submission = data?.submission || { declarations: [], missing: [] }
  const blockers = [
    checks.draft_count ? `${checks.draft_count} documente draft` : '',
    checks.unbalanced_journals ? `${checks.unbalanced_journals} note dezechilibrate` : '',
    checks.journal_structure_ok === false ? 'note fara linii contabile' : '',
    checks.balance_ok === false ? 'balanta dezechilibrata' : '',
    checks.tva_checked === false ? 'TVA neverificat' : '',
    checks.tva_current === false ? 'TVA modificat după verificare' : '',
    checks.bank_unclassified ? `${checks.bank_unclassified} operații bancare neclasificate` : '',
    checks.bank_imports_unfinished ? `${checks.bank_imports_unfinished} extrase bancare nefinalizate` : ''
  ].filter(Boolean)
  const resolveTarget = (row) => row.resolve_url || '/contabilitate'
  const actionItems = [
    { label: 'Verifica luna', onClick: load },
    checks.can_close ? { label: 'Inchide luna', onClick: closeMonth } : null,
    checks.can_reopen ? { label: 'Redeschide luna', onClick: reopenMonth } : null,
    checks.can_mark_submitted ? { label: 'Declaratii depuse', onClick: markSubmitted } : null,
    ['inchisa', 'depusa'].includes(status) ? { label: 'Descarca dosar ZIP', onClick: downloadDossier } : null,
    { label: 'Coperta / PDF', onClick: printDossier },
    { type: 'separator' },
    { label: 'TVA / D300', to: `/contabilitate/tva-d300?luna=${month}` },
    { label: 'Balanta', to: `/contabilitate/balanta?luna=${month}` },
    { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` },
  ].filter(Boolean)
  const assistantSteps = [
    { label: 'Documente', ok: !checks.draft_count, detail: checks.draft_count ? `${checks.draft_count} draft` : 'Toate documentele sunt validate', to: `/contabilitate/inchidere-luna?luna=${month}` },
    { label: 'Trezorerie', ok: !(data?.drafts || []).some(row => row.categorie === 'Trezorerie') && checks.bank_reconciliation_ok !== false, detail: checks.bank_reconciliation_ok === false ? `${checks.bank_unclassified || 0} neclasificate · ${checks.bank_imports_unfinished || 0} importuri deschise` : checks.outstanding_advances ? `${checks.outstanding_advances} avansuri de urmărit` : 'Operațiile sunt procesate', to: `/contabilitate/operatiuni?luna=${month}` },
    { label: 'Stocuri', ok: true, detail: 'Verifică sincronizarea și CMP', to: `/contabilitate/operatiuni?luna=${month}` },
    { label: 'TVA', ok: checks.tva_checked && checks.tva_current !== false, detail: checks.tva_checked ? checks.tva_current === false ? 'Documente modificate, reverifică' : 'TVA verificat și actual' : 'TVA necesită verificare', to: `/contabilitate/tva-d300?luna=${month}` },
    { label: 'Balanță', ok: checks.balance_ok && checks.journal_structure_ok, detail: checks.balance_ok ? 'Balanță echilibrată' : 'Există diferențe', to: `/contabilitate/balanta?luna=${month}` },
    { label: 'Închidere', ok: checks.can_close || ['inchisa', 'depusa'].includes(status), detail: ['inchisa', 'depusa'].includes(status) ? `Luna este ${status}` : checks.can_close ? 'Pregătită pentru închidere' : 'Așteaptă pașii anteriori', to: `/contabilitate/inchidere-luna?luna=${month}` },
    { label: 'Declarații', ok: submission.ready, detail: submission.ready ? 'Toate recipisele obligatorii sunt acceptate' : `Lipsesc: ${(submission.missing || []).join(', ') || '-'}`, to: `/contabilitate/audit-fiscal?luna=${month}` }
  ]
  const completedSteps = assistantSteps.filter(step => step.ok).length
  const closeProgress = Math.round((completedSteps / Math.max(assistantSteps.length, 1)) * 100)
  const firstBlockingStep = assistantSteps.find(step => !step.ok)
  const closeVerdict = buildCloseVerdict({
    status,
    checks,
    blockers,
    submission,
    month,
    firstBlockingStep,
    closeMonth,
    markSubmitted,
    downloadDossier,
    load
  })
  const verdictClasses = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900'
  }[closeVerdict.tone] || 'border-slate-200 bg-slate-50 text-slate-900'

  return (
    <AccountingShell
      active="inchidere"
      title="Inchidere luna"
      subtitle="Verificari contabile, blocare luna si marcarea declaratiilor depuse."
      actions={<DropdownMenu align="right" label="Actiuni luna" items={actionItems} />}
    >
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Luna" type="month" value={month} onChange={event => setMonth(event.target.value)} />
          <Input label="Referinta depunere" value={submissionRef} onChange={event => setSubmissionRef(event.target.value)} placeholder="Recipisa / numar inregistrare" />
          <Input label="Motiv redeschidere" value={reopenReason} onChange={event => setReopenReason(event.target.value)} placeholder="Corectie document, control..." />
        </div>
      </Card>
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {data ? (
        <>
          <Card>
            <div className={`rounded-xl border px-4 py-4 ${verdictClasses}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-75">Verdict operare lună</div>
                  <h3 className="mt-1 text-lg font-bold">{closeVerdict.title}</h3>
                  <p className="mt-1 text-sm opacity-90">{closeVerdict.detail}</p>
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold opacity-75">
                      <span>Progres verificări</span>
                      <span>{completedSteps}/{assistantSteps.length} · {closeProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/70">
                      <div className="h-full rounded-full bg-current transition-all" style={{ width: `${closeProgress}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:min-w-56">
                  {closeVerdict.to ? (
                    <Link to={closeVerdict.to} className="rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
                      {closeVerdict.actionLabel}
                    </Link>
                  ) : (
                    <button type="button" onClick={closeVerdict.onClick} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
                      {closeVerdict.actionLabel}
                    </button>
                  )}
                  {firstBlockingStep && !['inchisa', 'depusa'].includes(status) ? (
                    <span className="text-xs opacity-75">Primul blocaj: {firstBlockingStep.label}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase text-slate-500">Status luna</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={statusTone(status)}>{status}</Badge>
                  <span className="text-sm text-slate-600">{checks.can_close ? 'Luna poate fi inchisa.' : blockers.length ? `Blocaje: ${blockers.join(', ')}.` : 'Luna nu este in starea necesara pentru inchidere.'}</span>
                </div>
              </div>
              <div className="text-sm text-slate-500">
                Note: {data.counts?.journals || 0} · Intrari: {data.counts?.invoices_in || 0} · Note credit: {data.counts?.credit_notes || 0} · Stingeri: {data.counts?.settlements || 0} · Trezorerie: {data.counts?.treasury || 0}
              </div>
            </div>
          </Card>
          <Card>
            <h3 className="text-base font-semibold text-slate-900">Asistent închidere lunară</h3>
            <p className="mt-1 text-sm text-slate-500">Parcurge pașii în ordine. Fiecare etapă deschide direct zona care trebuie verificată.</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {assistantSteps.map((step, index) => (
                <Link key={step.label} to={step.to} className={`flex items-start gap-3 rounded-md border px-3 py-3 transition hover:shadow-sm ${step.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.ok ? 'bg-emerald-700 text-white' : 'bg-amber-500 text-white'}`}>{step.ok ? '✓' : index + 1}</span>
                  <span><strong className="block text-sm text-slate-900">{step.label}</strong><span className="text-xs text-slate-600">{step.detail}</span></span>
                </Link>
              ))}
            </div>
          </Card>
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Info label="Documente draft" value={checks.draft_count || 0} />
            <Info label="Note dezechilibrate" value={checks.unbalanced_journals || 0} />
            <Info label="Balanta" value={data.balance?.balanced ? 'Echilibrata' : formatMoney(data.balance?.difference || 0)} />
            <Info label="TVA" value={`${checks.tva_checked ? checks.tva_current === false ? 'Reverifică' : 'Verificat' : 'Neverificat'} · ${formatMoney(data.vat?.diferenta || 0)}`} />
            <Info label="Structura note" value={checks.journal_structure_ok ? 'Corecta' : `${checks.journals_without_lines || 0} fara linii`} />
            <Info label="Avansuri nestinse" value={checks.outstanding_advances || 0} />
            <Info label="Bancă neclasificat" value={checks.bank_unclassified || 0} />
            <Info label="Importuri deschise" value={checks.bank_imports_unfinished || 0} />
          </div>
          {status === 'inchisa' && !submission.ready ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Luna nu poate fi marcata depusa. Lipsesc recipise acceptate pentru: {(submission.missing || []).join(', ')}. <Link className="font-semibold underline" to={`/contabilitate/audit-fiscal?luna=${month}`}>Deschide Audit fiscal</Link></div> : null}
          {checks.outstanding_advances ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              Avansurile nestinse nu blocheaza inchiderea, dar trebuie urmarite in lunile urmatoare. <Link className="font-semibold underline" to={`/contabilitate/trezorerie?luna=${month}&corelare=avans_nestins`}>Vezi avansurile</Link>
            </div>
          ) : null}
          {checks.tva_checked === false || checks.tva_current === false ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {checks.tva_current === false ? 'Documentele cu TVA s-au modificat după ultima verificare.' : 'TVA-ul lunii trebuie verificat înainte de închidere.'} <Link className="font-semibold underline" to={`/contabilitate/tva-d300?luna=${month}`}>Mergi la TVA / D300</Link>
            </div>
          ) : null}
          {checks.bank_reconciliation_ok === false ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Reconcilierea bancară nu este finalizată: {checks.bank_unclassified || 0} operații neclasificate și {checks.bank_imports_unfinished || 0} importuri deschise. <Link className="font-semibold underline" to={`/contabilitate/operatiuni?luna=${month}`}>Rezolvă reconcilierea</Link>
            </div>
          ) : null}
          {checks.balance_ok === false ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Balanta are diferenta {formatMoney(data.balance?.difference || 0)}. <Link className="font-semibold underline" to={`/contabilitate/balanta?luna=${month}`}>Verifica balanta</Link>
            </div>
          ) : null}
          <Table headers={['Data', 'Tip', 'Document', 'Status', 'Rezolvare']}>
            {(data.drafts || []).map(row => (
              <tr key={`${row.categorie}-${row.uuid || row.id}`}>
                <td className="px-3 py-2">{row.data || '-'}</td>
                <td className="px-3 py-2">{row.categorie}</td>
                <td className="px-3 py-2">{row.document || '-'}</td>
                <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
                <td className="px-3 py-2">
                  <DropdownMenu align="right" label="Actiuni" items={[
                    { label: 'Deschide documentul', to: resolveTarget(row) },
                    { label: 'Facturi intrare', to: `/contabilitate/facturi-intrare?luna=${month}&status=draft` },
                    { label: 'Facturi iesire', to: `/contabilitate/facturi-iesire?luna=${month}&status=draft` },
                    { label: 'Trezorerie draft', to: `/contabilitate/trezorerie?luna=${month}&status=draft` }
                  ]} />
                </td>
              </tr>
            ))}
          </Table>
          <Table headers={['Data', 'Document', 'Tip', 'Debit', 'Credit', 'Diferenta', 'Rezolvare']}>
            {(data.unbalanced || []).map(row => (
              <tr key={row.uuid || row.id}>
                <td className="px-3 py-2">{row.data || '-'}</td>
                <td className="px-3 py-2">{row.nr_document || row.id}</td>
                <td className="px-3 py-2">{row.tip_document || '-'}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.total_debit)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.total_credit)}</td>
                <td className="px-3 py-2 text-right font-semibold text-red-700">{formatMoney(row.diferenta)}</td>
                <td className="px-3 py-2">
                  <DropdownMenu align="right" label="Actiuni" items={[
                    { label: 'Registru jurnal', to: `/contabilitate/registru-jurnal?luna=${month}` },
                    { label: 'Balanta', to: `/contabilitate/balanta?luna=${month}` },
                    { label: 'Cartea Mare', to: `/contabilitate/cartea-mare?de_la=${month}-01&pana_la=${month}-31` }
                  ]} />
                </td>
              </tr>
            ))}
          </Table>
          {data.latest_snapshot ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Snapshot contabil</h3>
                  <p className="text-sm text-slate-500">Versiunea {data.latest_snapshot.versiune} · {data.latest_snapshot.created_at?.slice(0, 16).replace('T', ' ')} · {data.latest_snapshot.created_by_name || '-'}</p>
                </div>
                <Badge tone="info">{data.latest_snapshot.balance_rows?.length || 0} conturi</Badge>
              </div>
              <div className="mt-3 break-all rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">SHA-256: {data.latest_snapshot.checksum}</div>
            </Card>
          ) : null}
          <Table headers={['Data', 'Eveniment', 'Utilizator', 'Detalii']}>
            {(data.history || []).map(event => (
              <tr key={event.id}>
                <td className="px-3 py-2">{event.created_at?.slice(0, 16).replace('T', ' ') || '-'}</td>
                <td className="px-3 py-2"><Badge tone={event.type === 'redeschidere' ? 'warning' : event.type === 'depunere' ? 'info' : 'success'}>{event.type}</Badge></td>
                <td className="px-3 py-2">{event.user_name || event.user_id || '-'}</td>
                <td className="px-3 py-2">{event.details?.motiv || event.details?.referinta || event.details?.checksum || '-'}</td>
              </tr>
            ))}
          </Table>
        </>
      ) : null}
    </AccountingShell>
  )
}

export default InchidereLuna

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  URL.revokeObjectURL(url)
}

function buildCloseVerdict({ status, checks, blockers, submission, month, firstBlockingStep, closeMonth, markSubmitted, downloadDossier, load }) {
  if (status === 'depusa') {
    return {
      tone: 'success',
      title: 'Luna este închisă și declarațiile sunt marcate ca depuse.',
      detail: 'Nu mai este nevoie de acțiuni curente. Poți păstra dosarul lunar pentru audit sau controale.',
      actionLabel: 'Descarcă dosar ZIP',
      onClick: downloadDossier
    }
  }
  if (status === 'inchisa' && !submission.ready) {
    return {
      tone: 'warning',
      title: 'Luna este închisă, dar nu poate fi marcată ca depusă.',
      detail: `Lipsesc recipise acceptate pentru: ${(submission.missing || []).join(', ') || 'declarații obligatorii'}.`,
      actionLabel: 'Deschide Audit fiscal',
      to: `/contabilitate/audit-fiscal?luna=${month}`
    }
  }
  if (status === 'inchisa' && checks.can_mark_submitted) {
    return {
      tone: 'info',
      title: 'Luna este închisă. Ultimul pas este marcarea declarațiilor depuse.',
      detail: 'Completează referința depunerii/recipisei și marchează depunerea ca finalizată.',
      actionLabel: 'Marchează depus',
      onClick: markSubmitted
    }
  }
  if (status === 'inchisa') {
    return {
      tone: 'success',
      title: 'Luna este închisă și protejată la modificări.',
      detail: 'Poți descărca dosarul lunar sau redeschide luna doar cu motiv auditat.',
      actionLabel: 'Descarcă dosar ZIP',
      onClick: downloadDossier
    }
  }
  if (checks.can_close) {
    return {
      tone: 'success',
      title: 'Luna este pregătită pentru închidere.',
      detail: 'Verificările principale sunt curate. Poți bloca luna și genera snapshot-ul contabil.',
      actionLabel: 'Închide luna',
      onClick: closeMonth
    }
  }
  if (firstBlockingStep?.to) {
    return {
      tone: blockers.length ? 'danger' : 'warning',
      title: blockers.length ? 'Luna este blocată de verificări nerezolvate.' : 'Mai există pași de verificat înainte de închidere.',
      detail: blockers.length ? blockers.slice(0, 3).join(' · ') : firstBlockingStep.detail,
      actionLabel: `Rezolvă: ${firstBlockingStep.label}`,
      to: firstBlockingStep.to
    }
  }
  return {
    tone: 'info',
    title: 'Verifică luna înainte de închidere.',
    detail: 'Rulează din nou controlul lunar pentru a vedea starea actuală.',
    actionLabel: 'Verifică luna',
    onClick: load
  }
}
