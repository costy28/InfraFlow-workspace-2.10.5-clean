function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatMoney(value, currency = 'EUR') {
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0))
}

function row(label, value) {
  return `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
}

export function commercialOfferEmailBody({ offer, customerName, contactName, validityDays }) {
  if (!offer) return ''
  const recipient = String(contactName || customerName || '').trim()
  const validDays = Math.max(1, Math.min(365, Number(validityDays) || 30))
  const details = offer.billedLines.map(line => `- ${line.description}: ${formatMoney(line.total, offer.currency)} (fără TVA ${formatMoney(line.net, offer.currency)}, TVA ${line.taxPercent}%)`).join('\n')
  const exchange = offer.exchangeRate ? `\nCurs BNR blocat: 1 EUR = ${offer.exchangeRate.rate} RON, data ${offer.exchangeRate.date}.` : ''
  return `Bună${recipient ? `, ${recipient}` : ''},

Îți transmitem propunerea orientativă InfraFlow pentru pachetul ${offer.package.label}, în varianta ${offer.deployment.label}.

Perioada contractată: ${offer.billingMonths} ${offer.billingMonths === 1 ? 'lună' : 'luni'}
Utilizatori nominali: ${offer.totalUsers} (${offer.includedUsers} incluși în pachet)

Poziții propuse:
${details}

Total fără TVA: ${formatMoney(offer.totals.net, offer.currency)}
TVA (${offer.taxPercent}%): ${formatMoney(offer.totals.tax, offer.currency)}
Total de plată: ${formatMoney(offer.totals.gross, offer.currency)}${exchange}
Valabilitatea orientativă a propunerii: ${validDays} zile.

Discount comercial abonament: ${offer.discountPercent}% (${formatMoney(offer.totals.subscriptionDiscount, offer.currency)}). Migrarea de date, integrările speciale și dezvoltările personalizate se stabilesc separat, după validarea necesarului.

Cu stimă,
InfraFlow`
}

export function openCommercialOfferPrint({ offer, customerName, contactName, validityDays }) {
  if (!offer) throw new Error('Calculează oferta înainte de a genera fișa printabilă.')

  const preview = window.open('about:blank', '_blank')
  if (!preview) throw new Error('Fereastra de print a fost blocată. Permite popup-uri pentru InfraFlow și reîncearcă.')

  const generatedAt = new Date().toLocaleString('ro-RO')
  const safeCustomer = String(customerName || '').trim()
  const safeContact = String(contactName || '').trim()
  const validDays = Math.max(1, Math.min(365, Number(validityDays) || 30))
  const lines = offer.billedLines.map(line => `${row(line.description, formatMoney(line.total, offer.currency))}<div class="line-note">Fără TVA ${escapeHtml(formatMoney(line.net, offer.currency))} · TVA ${escapeHtml(line.taxPercent)}%</div>`).join('')
  const notes = offer.notes.length
    ? `<section class="notes"><h2>Observații</h2><ul>${offer.notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul></section>`
    : ''
  const recipient = safeCustomer || safeContact
    ? `<section class="recipient"><div><span>Client</span><strong>${escapeHtml(safeCustomer || '—')}</strong></div><div><span>Persoană de contact</span><strong>${escapeHtml(safeContact || '—')}</strong></div></section>`
    : ''

  preview.document.open()
  preview.document.write(`<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Ofertă orientativă InfraFlow</title><style>
    *{box-sizing:border-box} body{margin:0;background:#f1f5f9;color:#0f172a;font:15px/1.5 Arial,sans-serif}.toolbar{display:flex;gap:8px;max-width:820px;margin:20px auto 0}.toolbar button{border:1px solid #0f5b48;border-radius:7px;background:#0f5b48;color:#fff;padding:9px 13px;font:600 14px Arial,sans-serif;cursor:pointer}.toolbar button+button{background:#fff;color:#0f5b48}.sheet{max-width:820px;margin:16px auto;background:#fff;padding:46px 52px;box-shadow:0 1px 8px #0f172a20}.brand{color:#0f5b48;font-size:24px;font-weight:700}.eyebrow{margin-top:28px;color:#64748b;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{margin:4px 0 8px;font-size:30px}.meta,.line-note{color:#64748b;font-size:13px}.recipient{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:28px 0;padding:15px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}.recipient span{display:block;color:#64748b;font-size:12px}.recipient strong{display:block;margin-top:2px}h2{margin:28px 0 10px;font-size:16px}.total{padding:20px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px}.total span{display:block;color:#065f46;font-size:12px;font-weight:700;text-transform:uppercase}.total strong{display:block;margin-top:3px;font-size:32px;color:#064e3b}.row{display:flex;justify-content:space-between;gap:20px;padding:9px 0;border-bottom:1px solid #e2e8f0}.row span{color:#475569}.row.total-row{font-size:16px;border-bottom:0}.row.total-row strong{color:#0f5b48}ul{margin:0;padding-left:20px}.notes{margin-top:24px;padding:15px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px}.notes h2{margin:0 0 8px}.footer{margin-top:38px;padding-top:14px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px}@media print{body{background:#fff}.toolbar{display:none!important}.sheet{margin:0;box-shadow:none;max-width:none;padding:0}@page{margin:1.5cm}}@media(max-width:600px){.sheet{padding:28px}.recipient{grid-template-columns:1fr}}
  </style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Printează / Salvează PDF</button><button type="button" onclick="window.close()">Închide</button></div><main class="sheet"><div class="brand">InfraFlow</div><div class="eyebrow">Propunere comercială orientativă</div><h1>${escapeHtml(offer.package.label)} · ${escapeHtml(offer.deployment.label)}</h1><div class="meta">Generată la ${escapeHtml(generatedAt)} · valabilitate orientativă: ${validDays} zile</div>${recipient}<section class="total"><span>Total de plată pentru ${escapeHtml(offer.billingMonths)} luni</span><strong>${formatMoney(offer.totals.gross, offer.currency)}</strong><div>${escapeHtml(offer.totalUsers)} utilizatori nominali · TVA ${escapeHtml(offer.taxPercent)}%</div></section><section><h2>Poziții contractate</h2>${lines}<div class="row total-row"><span>Total fără TVA</span><strong>${formatMoney(offer.totals.net, offer.currency)}</strong></div>${row(`TVA (${offer.taxPercent}%)`, formatMoney(offer.totals.tax, offer.currency))}<div class="row total-row"><span>Total de plată</span><strong>${formatMoney(offer.totals.gross, offer.currency)}</strong></div></section>${offer.exchangeRate ? `<section><h2>Curs valutar</h2>${row('Curs BNR EUR/RON', `1 EUR = ${offer.exchangeRate.rate} RON · ${offer.exchangeRate.date}`)}</section>` : ''}${notes}<div class="footer">Discount abonament: ${escapeHtml(offer.discountPercent)}%. Oferta contractuală finală se stabilește după validarea necesarului și a configurației. · InfraFlow ERP</div></main></body></html>`)
  preview.document.close()
  preview.focus()
}
