'use strict'
// Static rendering only; no routes, controls, scripts or deletion action.
function renderRetentionPreview(preview) {
  if (preview?.format !== 'infraflow-synthetic-resource-preview-v1' || preview.executionAllowed !== false) throw Error('invalid_inventory_preview')
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const labels = { database: 'Bază de date JSON', storage: 'Fișiere ERP', appKey: 'Cheie locală', runtime: 'Proces local', routing: 'Rutare', backups: 'Backupuri' }
  const statuses = { bound_json: 'Legare verificată în JSON', mismatch: 'Legare neconcordantă', missing: 'Lipsește',
    present_not_content_verified: 'Prezentă; conținutul nu este citit/verificat', present_not_inventoried: 'Prezent; inventar incomplet',
    not_provisioned_or_unlocated: 'Neprovisionat sau nelocalizat', authenticated_running: 'Pornit; răspuns autentificat',
    unreachable_not_proven_stopped: 'Nu răspunde; oprirea nu este dovedită', claim_without_descriptor: 'Rezervare fără descriptor',
    no_local_records_not_stop_proof: 'Fără înregistrări locale; nu dovedește oprirea', not_implemented_in_local_harness: 'Neimplementat în harness',
    local_manifest_verified: 'Copii locale: legare JSON și hash verificate; fără probă de restaurare',
    local_backup_entries_unclassified: 'Există copii/intrări locale neclasificate', local_backup_verification_failed: 'Verificarea copiilor locale a eșuat',
    local_storage_manifest_verified: 'Fișiere locale: hash și manifest verificate; accesul pe document nu este certificat',
    local_storage_entries_unclassified: 'Fișiere locale neclasificate', local_storage_verification_failed: 'Verificarea fișierelor locale a eșuat' }
  const eligibility = { blocked: 'Blocat', retained: 'În perioada de retenție', candidate: 'Candidat temporal — NU autorizează ștergerea' }
  const reasons = { retention_not_enabled: 'Politica de retenție nu este activată explicit.', state_not_eligible: 'Starea trialului nu permite candidatura.',
    not_expired: 'Trialul nu este expirat.', database_missing: 'Baza de date lipsește.', database_binding_mismatch: 'Baza nu corespunde companiei.',
    key_missing: 'Cheia locală lipsește.', key_ownership_requires_confirmation: 'Proprietatea și rolul cheii necesită confirmare.',
    storage_inventory_incomplete: 'Inventarul fișierelor ERP este incomplet.', backups_inventory_incomplete: 'Inventarul backupurilor este incomplet.',
    runtime_running: 'Procesul este încă pornit.', runtime_state_unverified: 'Oprirea procesului nu este dovedită.',
    routing_inventory_incomplete: 'Rutarea nu este inventariată.', unclassified_local_entries: 'Există intrări locale neclasificate.', operation_in_progress: 'Există o operație sau rezervare în curs.',
    external_backups_unverified: 'Backupurile externe nu sunt inventariate/verificate.', storage_entity_access_unverified: 'Accesul la fișiere pe document/entitate nu este verificat de acest inventar.' }
  const deadline = preview.plan.earliestCompleteCleanupAt === null ? 'Nestabilit' : new Date(preview.plan.earliestCompleteCleanupAt).toISOString()
  return `<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'">
<title>InfraFlow — Previzualizare retenție locală</title><style>body{font:16px system-ui;background:#f5f8fa;color:#183243;margin:0;padding:24px}main{max-width:920px;margin:auto}section{background:white;border:1px solid #dce5eb;border-radius:12px;padding:20px;margin:16px 0}h1{font-size:26px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:12px 8px;border-bottom:1px solid #dce5eb;overflow-wrap:anywhere}.warning{background:#fff8dd}code{overflow-wrap:anywhere}p{line-height:1.5}@media(max-width:600px){body{padding:12px}td,th{padding:10px 4px;font-size:14px}}</style>
<main><h1>Retenție Demo — previzualizare locală</h1><section class="warning"><strong>Doar simulare. Ștergerea nu este disponibilă.</strong><p>${escape(preview.warning)}</p></section>
<section><p>Trial: <code>${escape(preview.trialId)}</code> · revizie ${escape(preview.revision)}</p><p>Eligibilitate: ${escape(eligibility[preview.plan.eligibility] || 'Necunoscută')}</p>
<p>Politică: ${preview.plan.policy.enabled ? 'Explicită, numai pentru această simulare' : 'Nestabilită/dezactivată — nu se execută curățarea'}</p>
<p>Retenție date: ${escape(preview.plan.policy.dataRetentionDays ?? 'nestabilită')} zile · backupuri: ${escape(preview.plan.policy.backupRetentionDays ?? 'nestabilită')} zile</p><p>Primul termen posibil pentru curățarea completă: ${escape(deadline)}</p>
<p>Intrări locale neclasificate: ${escape(preview.unknownEntries)}</p></section>
<section><h2>Resurse verificate</h2><table><thead><tr><th>Resursă</th><th>Rezultat</th></tr></thead><tbody>${preview.resources.map(r => `<tr><td>${escape(labels[r.kind] || r.kind)}</td><td>${escape(statuses[r.status] || r.status)}${['backups','storage'].includes(r.kind) && r.verifiedCount !== undefined ? `<br>Verificate: ${escape(r.verifiedCount)} · intrări neclasificate: ${escape(r.unknownEntries)}` : ''}</td></tr>`).join('')}</tbody></table></section>
<section><h2>Condiții încă neîndeplinite</h2><ul>${[...preview.plan.reasons, ...preview.blockers].map(r => `<li>${escape(reasons[r] || r)}</li>`).join('')}</ul><p>Amprentă de comparație, nu semnătură/autorizare: <code>${escape(preview.fingerprint)}</code></p></section></main></html>`
}
module.exports = { renderRetentionPreview }
