function fullName(item) {
  return [item?.nume, item?.prenume].filter(Boolean).join(' ') || item?.name || 'Angajat'
}

export function createHrDocumentPrintActions({
  api,
  employeeDetails,
  selectedDossierSummary,
  selectedEmployeeExpirations,
  selectedEmployeeLeaves,
  employeeContracts,
  coBalance,
  hrDocumentTemplates,
  setError,
  openEmployee,
  adeverintaTip,
  setAdeverintaData,
}) {
  function identityText(emp) {
    const tip = emp.act_identitate_tip || 'CI'
    const serie = String(emp.act_identitate_serie || '').toUpperCase()
    const numar = emp.act_identitate_numar || ''
    const eliberatDe = emp.act_identitate_eliberat_de || ''
    if (!serie && !numar && !eliberatDe) return 'posesor/posesoare al/a BI/CI seria ____ nr. __________'
    return `posesor/posesoare al/a ${tip} seria ${serie || '____'} nr. ${numar || '__________'}${eliberatDe ? `, eliberat/ă de ${eliberatDe}` : ''}`
  }

  function printGeneratedHtml(html, data = {}) {
    const generatedAt = data.data_generare || data.data || new Date().toISOString().slice(0, 10)
    const docNo = data.numar || data.nr_cim || '____'
    const footer = `<div style="position:fixed;bottom:10mm;left:0;right:0;width:100%;text-align:center;font-size:8pt;color:#999;border-top:1px solid #ddd;padding-top:4pt;background:white">Document generat electronic din aplicația InfraFlow la data de ${generatedAt}. Nr. ${docNo}.</div>`
    const output = String(html || '').replace('</body>', `${footer}</body>`)
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(output)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  function printEmployeeProfile() {
    if (!employeeDetails) return
    const dossier = selectedDossierSummary || {}
    const expirations = selectedEmployeeExpirations || []
    const leaveRows = selectedEmployeeLeaves || []
    const contractRows = employeeContracts || []
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Fișă angajat</title>
<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm;color:#111}h1{text-align:center;font-size:16pt;margin:0 0 12px}h2{font-size:12pt;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px}.box{border:1px solid #ccc;padding:8px;margin:8px 0}table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border:1px solid #ccc;padding:5px;text-align:left}th{background:#f3f4f6}.muted{color:#666}.warn{color:#b45309}.bad{color:#b91c1c}.ok{color:#047857}@media print{body{margin:1.2cm}}</style></head><body>
<h1>Fișă angajat HR</h1>
<div class="box grid">
  <div><strong>Nume:</strong> ${fullName(employeeDetails)}</div>
  <div><strong>Marcă:</strong> ${employeeDetails.marca || '-'}</div>
  <div><strong>Funcție:</strong> ${employeeDetails.functia || '-'}</div>
  <div><strong>Departament:</strong> ${employeeDetails.department_name || '-'}</div>
  <div><strong>Data angajării:</strong> ${employeeDetails.data_angajare || '-'}</div>
  <div><strong>Normă:</strong> ${employeeDetails.norma_ore_zi || 8} ore/zi</div>
</div>
<h2>Sumar conformitate</h2>
<table><tbody>
<tr><th>Dosar HR</th><td>${dossier.percent ?? 0}% · ${dossier.required_done ?? 0}/${dossier.required_total ?? 0} obligatorii</td></tr>
<tr><th>Lipsuri obligatorii</th><td>${dossier.missing_required?.length ? dossier.missing_required.join(', ') : '<span class="ok">Nu există</span>'}</td></tr>
<tr><th>Confirmări Kiosk lipsă</th><td>${dossier.pending_ack ?? 0}</td></tr>
<tr><th>CO rămas</th><td>${coBalance ? `${coBalance.zile_ramase} zile din ${coBalance.zile_drept}` : '-'}</td></tr>
</tbody></table>
<h2>Date personale</h2>
<div class="grid">
  <div>CNP: ${employeeDetails.cnp || '-'}</div><div>Telefon: ${employeeDetails.telefon || '-'}</div>
  <div>Email: ${employeeDetails.email || '-'}</div><div>Adresă: ${employeeDetails.adresa || '-'}</div>
  <div>Act identitate: ${identityText(employeeDetails)}</div><div>Valabil act: ${employeeDetails.act_identitate_valabil_pana || '-'}</div>
</div>
<h2>Contracte</h2>
<table><thead><tr><th>Tip</th><th>Număr</th><th>Dată</th><th>Start</th><th>Status</th><th>Salariu</th></tr></thead><tbody>
${contractRows.length ? contractRows.map(item => `<tr><td>${item.tip || '-'}</td><td>${item.numar_contract || '-'}</td><td>${item.data_contract || '-'}</td><td>${item.data_start || '-'}</td><td>${item.status || '-'}</td><td>${item.salariu_baza || '-'}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">Nu există contracte înregistrate.</td></tr>'}
</tbody></table>
<h2>Concedii recente</h2>
<table><thead><tr><th>Tip</th><th>Start</th><th>Sfârșit</th><th>Zile</th><th>Status</th></tr></thead><tbody>
${leaveRows.length ? leaveRows.slice(0, 12).map(item => `<tr><td>${item.tip || '-'}</td><td>${item.data_start || '-'}</td><td>${item.data_sfarsit || '-'}</td><td>${item.zile || '-'}</td><td>${item.status || '-'}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Nu există cereri de concediu.</td></tr>'}
</tbody></table>
<h2>Scadențe apropiate</h2>
<table><thead><tr><th>Document</th><th>Data</th><th>Zile</th><th>Sursa</th></tr></thead><tbody>
${expirations.length ? expirations.map(item => `<tr><td>${item.label}</td><td>${item.date}</td><td class="${item.days < 0 ? 'bad' : item.days <= 30 ? 'warn' : ''}">${item.days < 0 ? `expirat de ${Math.abs(item.days)} zile` : `${item.days} zile`}</td><td>${item.source || '-'}</td></tr>`).join('') : '<tr><td colspan="4" class="ok">Nu există scadențe în următoarele 90 zile.</td></tr>'}
</tbody></table>
</body></html>`
    printGeneratedHtml(html, { data_generare: new Date().toISOString().slice(0, 10), numar: employeeDetails.marca || employeeDetails.id })
  }

  function getHrTemplate(id) {
    return hrDocumentTemplates.find(item => item.id === id && item.activ !== false)
  }

  function valueAtPath(source, path) {
    return String(path || '').split('.').reduce((current, key) => current?.[key], source)
  }

  function renderHrTemplate(templateId, data = {}, fallbackBody = '') {
    const template = getHrTemplate(templateId)
    const body = template?.template_html || fallbackBody
    if (!body) return ''
    const rendered = String(body).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
      const value = valueAtPath(data, key)
      if (value === undefined || value === null || value === '') return '—'
      return String(value)
    })
    return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>${template?.denumire || data.titlu || 'Document HR'}</title>
<style>
  body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm;color:#000}
  h1,h2{text-align:center;font-size:14pt;margin:8px 0}
  h3{font-size:12pt;margin:12px 0 4px}
  p,li{margin:4px 0;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  td,th{border:1px solid #555;padding:4px 8px;font-size:10pt}
  @media print{body{margin:1.5cm 2cm}}
</style></head><body>${rendered}</body></html>`
  }

  function printCIM(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const contract = data.contract || {}
    const template = getHrTemplate('cim')
    if (template?.template_html) {
      const htmlFromTemplate = renderHrTemplate('cim', {
        ...data,
        angajat: emp,
        company: co,
        contract: {
          ...contract,
          functia: contract.functia || emp.functia || '',
          data_start: String(contract.data_start || contract.data_incepere || emp.data_angajare || '').slice(0, 10),
          data_contract: String(contract.data_contract || data.data_generare || '').slice(0, 10),
          tip: contract.tip || 'CIM',
          norma_ore: contract.norma_ore || emp.norma_ore || 8,
          salariu_baza: contract.salariu_baza || emp.salariu_baza || ''
        }
      })
      printGeneratedHtml(htmlFromTemplate, data)
      return htmlFromTemplate
    }
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>CIM</title>
<style>
  body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm;color:#000}
  h2{text-align:center;font-size:14pt;margin:8px 0}
  h3{font-size:12pt;margin:12px 0 4px}
  p,li{margin:4px 0;line-height:1.7}
  .bold{font-weight:bold}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  td,th{border:1px solid #555;padding:4px 8px;font-size:10pt}
  .signatures{margin-top:48px;display:flex;justify-content:space-between}
  .signatures div{text-align:center;min-width:180px}
  @media print{body{margin:1.5cm 2cm}}
</style></head><body>
<h2>CONTRACT INDIVIDUAL DE MUNCĂ</h2>
<p style="text-align:center">Nr. <span class="bold">${data.nr_cim}</span> / data: <span class="bold">${data.data_generare}</span></p>
<hr>
<h3>I. ANGAJATOR</h3>
<table><tr><td><strong>Denumire</strong></td><td>${co.denumire}</td><td><strong>CUI</strong></td><td>${co.cui}</td></tr>
<tr><td><strong>Adresă</strong></td><td colspan="3">${co.adresa}</td></tr>
<tr><td><strong>Nr. înregistrare</strong></td><td>${co.nr_inregistrare || '—'}</td><td><strong>Reprezentant legal</strong></td><td>${co.reprezentant} (${co.functie_reprezentant})</td></tr></table>
<h3>II. SALARIAT</h3>
<table><tr><td><strong>Nume și prenume</strong></td><td>${emp.prenume || ''} ${emp.nume || ''}</td><td><strong>CNP</strong></td><td>${emp.cnp || '—'}</td></tr>
<tr><td><strong>Adresă domiciliu</strong></td><td colspan="3">${emp.adresa || '—'}</td></tr>
<tr><td><strong>Stare civilă</strong></td><td>${emp.stare_civila || '—'}</td><td><strong>Nr. marcă</strong></td><td>${emp.marca || '—'}</td></tr></table>
<h3>III. OBIECTUL CONTRACTULUI</h3>
<p>Angajatorul angajează salariatul în funcția de <span class="bold">${emp.functia || '—'}</span>, în cadrul departamentului <span class="bold">${emp.department_name || '—'}</span>.</p>
<h3>IV. DURATA CONTRACTULUI</h3>
<p>Tip contract: <span class="bold">${contract.tip || emp.tip_contract || '—'}</span></p>
<p>Data începerii activității: <span class="bold">${String(contract.data_start || emp.data_angajare || '').slice(0, 10) || '—'}</span></p>
${contract.data_sfarsit || emp.data_expirare_contract ? `<p>Data încetării (determinat): <span class="bold">${String(contract.data_sfarsit || emp.data_expirare_contract).slice(0, 10)}</span></p>` : ''}
<h3>V. LOCUL DE MUNCĂ</h3>
<p>Loc de muncă: sediu angajator / teren — conform specificului activității.</p>
<h3>VI. DURATA MUNCII</h3>
<p>Program de lucru: <span class="bold">${contract.norma_ore || emp.norma_ore_zi || 8} ore/zi</span></p>
<h3>VII. SALARIUL</h3>
<p>Salariu de bază brut lunar: <span class="bold">${contract.salariu_baza || emp.salariu_baza ? Number(contract.salariu_baza || emp.salariu_baza).toLocaleString('ro-RO') + ' RON' : '_____ RON'}</span></p>
<h3>VIII. CONCEDIU</h3>
<p>Durata concediului anual de odihnă: <span class="bold">${emp.zile_co_drept ?? 21} zile lucrătoare</span></p>
<h3>IX. ALTE CLAUZE</h3>
<p>Salariatul se obligă să respecte regulamentul intern, normele SSM și PSI ale angajatorului.</p>
<div class="signatures">
  <div><p><strong>ANGAJATOR</strong></p><p>${co.reprezentant}</p><p>Semnătură: ________________</p><p>Data: ${data.data_generare}</p></div>
  <div><p><strong>SALARIAT</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><p>Semnătură: ________________</p><p>Data: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
    return html
  }

  async function printOperationalContract(contract) {
    try {
      const response = await api.get(`/hr/employees/${employeeDetails.id}/cim`)
      const data = { ...response.data, contract, nr_cim: contract.numar_contract || response.data?.nr_cim, data_generare: new Date().toISOString().slice(0, 10) }
      const html = printCIM(data)
      await archiveGeneratedHtml({
        html,
        tip: 'contract',
        denumire: `CIM ${contract.numar_contract || employeeDetails.marca || employeeDetails.id}`,
        data_document: String(contract.data_contract || data.data_generare).slice(0, 10),
        source: `contract:${contract.id || ''}`
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Contractul nu a putut fi generat.')
    }
  }

  async function generateContractWord(contract) {
    try {
      await downloadRenderedHrWord('cim', {
        employee_id: employeeDetails.id,
        contract_id: contract.id
      }, `CIM_${contract.numar_contract || employeeDetails.marca || employeeDetails.id}.docx`)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul Word pentru contract nu a putut fi generat.')
    }
  }

  async function generateAmendmentWord(amendment, contract) {
    try {
      await downloadRenderedHrWord('act_aditional', {
        employee_id: employeeDetails.id,
        contract_id: contract?.id || amendment.contract_id,
        amendment_id: amendment.id
      }, `Act_aditional_${amendment.numar_act || amendment.id || employeeDetails.marca}.docx`)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul Word pentru actul adițional nu a putut fi generat.')
    }
  }

  async function archiveContractWord(contract) {
    try {
      await api.post('/hr/document-templates/cim/render-word/archive', {
        employee_id: employeeDetails.id,
        contract_id: contract.id,
        tip: 'contract',
        denumire: `CIM ${contract.numar_contract || employeeDetails.marca || employeeDetails.id}`,
        data_document: String(contract.data_contract || new Date().toISOString()).slice(0, 10),
        source: `word-contract:${contract.id || ''}`,
        requires_ack: true,
        kiosk_visible: true
      })
      await openEmployee(employeeDetails)
    } catch (err) {
      setError(err.response?.data?.error || 'Documentul Word nu a putut fi arhivat în dosar.')
    }
  }

  async function archiveAmendmentWord(amendment, contract) {
    try {
      const title = amendment.tip === 'incetare' ? 'Decizie încetare' : amendment.tip === 'suspendare' ? 'Act suspendare' : 'Act adițional'
      await api.post('/hr/document-templates/act_aditional/render-word/archive', {
        employee_id: employeeDetails.id,
        contract_id: contract?.id || amendment.contract_id,
        amendment_id: amendment.id,
        tip: amendment.tip === 'incetare' ? 'decizie_incetare' : 'act_aditional',
        denumire: `${title} ${amendment.numar_act || amendment.id || ''}`.trim(),
        data_document: String(amendment.data_act || new Date().toISOString()).slice(0, 10),
        source: `word-contract-amendment:${amendment.id || amendment.uuid || ''}`,
        requires_ack: true,
        kiosk_visible: true
      })
      await openEmployee(employeeDetails)
    } catch (err) {
      setError(err.response?.data?.error || 'Actul adițional Word nu a putut fi arhivat în dosar.')
    }
  }

  async function downloadRenderedHrWord(templateId, params, fallbackName) {
    const response = await api.get(`/hr/document-templates/${templateId}/render-word`, { params, responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    const disposition = response.headers?.['content-disposition'] || ''
    const match = disposition.match(/filename="?([^";]+)"?/i)
    link.href = url
    link.download = match?.[1] || fallbackName || `${templateId}.docx`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function printOperationalAmendment(amendment, contract) {
    try {
      const response = await api.get(`/hr/employees/${employeeDetails.id}/cim`)
      const data = { ...response.data, amendment, contract, numar: amendment.numar_act || `AA-${amendment.id || '____'}`, data: String(amendment.data_act || new Date().toISOString()).slice(0, 10) }
      const emp = data.angajat || employeeDetails || {}
      const co = data.company || {}
      const changeText = amendmentText(amendment)
      const title = amendment.tip === 'incetare' ? 'DECIZIE / ACT DE ÎNCETARE' : amendment.tip === 'suspendare' ? 'ACT ADIȚIONAL DE SUSPENDARE' : 'ACT ADIȚIONAL'
      const template = getHrTemplate('act_aditional')
      if (template?.template_html) {
        const htmlFromTemplate = renderHrTemplate('act_aditional', {
          ...data,
          titlu: title,
          modificare_html: changeText,
          angajat: emp,
          company: co,
          contract: contract || {},
          amendment: {
            ...amendment,
            numar_act: amendment.numar_act || `AA-${amendment.id || '____'}`,
            data_act: String(amendment.data_act || data.data || '').slice(0, 10),
            data_efect: String(amendment.data_efect || '').slice(0, 10)
          }
        })
        printGeneratedHtml(htmlFromTemplate, data)
        await archiveGeneratedHtml({
          html: htmlFromTemplate,
          tip: amendment.tip === 'incetare' ? 'decizie_incetare' : 'act_aditional',
          denumire: `${title} ${amendment.numar_act || amendment.id || ''}`.trim(),
          data_document: String(amendment.data_act || data.data).slice(0, 10),
          source: `contract-amendment:${amendment.id || amendment.uuid || ''}`
        })
        return
      }
      const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm;color:#000}
  h2{text-align:center;font-size:14pt;margin:8px 0}
  h3{font-size:12pt;margin:14px 0 5px}
  p,li{margin:5px 0;line-height:1.75}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  td,th{border:1px solid #555;padding:5px 8px;font-size:10pt}
  .bold{font-weight:bold}
  .sig{margin-top:48px;display:flex;justify-content:space-between}
  .sig div{text-align:center;min-width:180px}
  @media print{body{margin:1.5cm 2cm}}
</style></head><body>
<h2>${title}</h2>
<h2>la Contractul Individual de Muncă</h2>
<p style="text-align:center">Nr. <span class="bold">${amendment.numar_act || '____'}</span> / data <span class="bold">${String(amendment.data_act || '').slice(0, 10) || data.data}</span></p>
<hr>
<h3>I. Părțile</h3>
<p><span class="bold">${co.denumire || '______________________'}</span>, CUI ${co.cui || '____________'}, cu sediul în ${co.adresa || '______________________'}, reprezentată de <span class="bold">${co.reprezentant || '______________________'}</span>, în calitate de ${co.functie_reprezentant || 'Director General'}, denumită în continuare <strong>Angajator</strong>,</p>
<p>și salariatul/salariata <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span>, CNP <span class="bold">${emp.cnp || '_______________'}</span>, marca <span class="bold">${emp.marca || '—'}</span>, denumit(ă) în continuare <strong>Salariat</strong>.</p>
<h3>II. Contract de referință</h3>
<table>
  <tr><td><strong>Contract</strong></td><td>${contract?.numar_contract || '—'}</td><td><strong>Data contract</strong></td><td>${String(contract?.data_contract || '').slice(0, 10) || '—'}</td></tr>
  <tr><td><strong>Data început</strong></td><td>${String(contract?.data_start || contract?.data_incepere || '').slice(0, 10) || '—'}</td><td><strong>Status curent</strong></td><td>${contract?.status || 'activ'}</td></tr>
</table>
<h3>III. Obiectul actului</h3>
<p>Începând cu data de <span class="bold">${String(amendment.data_efect || '').slice(0, 10)}</span>, părțile convin următoarea modificare:</p>
${changeText}
<p>Celelalte clauze ale contractului individual de muncă rămân neschimbate.</p>
<p>Prezentul act adițional face parte integrantă din contractul individual de muncă și produce efecte de la data menționată mai sus.</p>
${amendment.observatii ? `<h3>IV. Observații / temei</h3><p>${amendment.observatii}</p>` : ''}
<div class="sig">
  <div><p><strong>ANGAJATOR</strong></p><p>${co.reprezentant || '______________________'}</p><p>${co.functie_reprezentant || 'Director General'}</p><br><p>Semnătură: ________________</p></div>
  <div><p><strong>SALARIAT</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: ________________</p></div>
</div>
</body></html>`
      printGeneratedHtml(html, data)
      await archiveGeneratedHtml({
        html,
        tip: amendment.tip === 'incetare' ? 'decizie_incetare' : 'act_aditional',
        denumire: `${title} ${amendment.numar_act || amendment.id || ''}`.trim(),
        data_document: String(amendment.data_act || data.data).slice(0, 10),
        source: `contract-amendment:${amendment.id || amendment.uuid || ''}`
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Actul adițional nu a putut fi generat.')
    }
  }

  async function archiveGeneratedHtml({ html, tip, denumire, data_document, source }) {
    if (!employeeDetails?.id || !html) return
    const response = await api.post(`/hr/employees/${employeeDetails.id}/files/generated`, { html, tip, denumire, data_document, source })
    window.dispatchEvent(new CustomEvent('hr-files-refresh', { detail: { employeeId: employeeDetails.id, item: response.data?.item } }))
  }

  function amendmentText(amendment) {
    const amount = amendment.salariu_baza ? Number(amendment.salariu_baza).toLocaleString('ro-RO') : ''
    const rows = []
    if (amendment.tip === 'salariu') rows.push(`<li>Salariul de bază brut lunar se modifică la <span class="bold">${amount} RON</span>.</li>`)
    if (amendment.tip === 'norma') rows.push(`<li>Norma de lucru se modifică la <span class="bold">${amendment.norma_ore} ore/zi</span>.</li>`)
    if (amendment.tip === 'functie') rows.push(`<li>Funcția se modifică în <span class="bold">${amendment.functia || '____________________'}</span>${amendment.functie_cor ? `, cod COR ${amendment.functie_cor}` : ''}.</li>`)
    if (amendment.tip === 'departament') rows.push(`<li>Locul organizatoric / departamentul se modifică conform deciziei interne și evidenței HR.</li>`)
    if (amendment.tip === 'suspendare') rows.push(`<li>Contractul se suspendă începând cu data indicată, conform temeiului menționat la observații.</li>`)
    if (amendment.tip === 'incetare') rows.push(`<li>Contractul individual de muncă încetează începând cu data indicată, conform temeiului menționat la observații.</li>`)
    if (!rows.length) rows.push(`<li>${amendment.observatii || 'Se completează prevederile contractului conform acordului părților.'}</li>`)
    return `<ol>${rows.join('')}</ol>`
  }

  async function loadAdeverinta(employeeId) {
    try {
      const response = await api.get(`/hr/employees/${employeeId}/adeverinta`, { params: { tip: adeverintaTip } })
      setAdeverintaData(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Eroare la generare adeverință.')
    }
  }

  function printAdeverinta(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const tipLabels = {
      venit: 'ADEVERINȚĂ DE VENIT',
      vechime: 'ADEVERINȚĂ DE VECHIME ÎN MUNCĂ',
      casa_sanatate: 'ADEVERINȚĂ ASIGURAT CASA DE SĂNĂTATE',
      concediu_medical: 'ADEVERINȚĂ CONCEDIU MEDICAL',
      functie: 'ADEVERINȚĂ FUNCȚIE',
      salariat: 'ADEVERINȚĂ DE SALARIAT',
    }
    const tipLabel = tipLabels[data.tip] || 'ADEVERINȚĂ'
    const extraText = {
      vechime: `<p>Numitul/Numita <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span> are o vechime în muncă de <span class="bold">${data.vechime?.ani || 0} ani și ${data.vechime?.luni || 0} luni</span>, calculată de la data angajării <span class="bold">${emp.data_angajare || '____________________'}</span>.</p>`,
      casa_sanatate: `<p>Prezenta adeverință atestă calitatea de salariat asigurat pentru casa de sănătate <span class="bold">${emp.casa_sanatate || '____________________'}</span>, cu CNP <span class="bold">${emp.cnp || '_______________'}</span>.</p>`,
      concediu_medical: `<p>Salariatul/a a beneficiat de <span class="bold">${data.zile_concediu_medical_12_luni || 0} zile</span> concediu medical în perioada ultimelor 12 luni.</p>`,
      functie: `<p>Salariatul/a ocupă funcția de <span class="bold">${emp.functia || '____________________'}</span> în departamentul <span class="bold">${emp.department_name || '____________________'}</span>.</p>`,
    }[data.tip] || ''
    const bodyHtml = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>${tipLabel}</title>
<style>
  body { font-family: Times New Roman, serif; font-size: 12pt; margin: 2cm; color: #000; }
  h2 { text-align: center; text-transform: uppercase; margin-bottom: 6px; }
  .nr { text-align: center; color: #555; margin-bottom: 24px; }
  p { margin: 6px 0; line-height: 1.8; }
  .bold { font-weight: bold; }
  .signature { margin-top: 48px; display: flex; justify-content: space-between; }
  .signature div { text-align: center; min-width: 180px; }
  @media print { body { margin: 1.5cm 2cm; } }
</style></head><body>
<h2>${co.denumire || 'Societatea'}</h2>
<p style="text-align:center">${co.adresa || ''} ${co.cui ? '· CUI: ' + co.cui : ''}</p>
<hr style="margin:16px 0">
<h2>${tipLabel}</h2>
<div class="nr">Nr. ${data.numar} / ${data.data}</div>
<p>Subsemnatul/a, <span class="bold">${co.reprezentant || '____________________'}</span>, în calitate de <span class="bold">${co.functie_reprezentant || 'Director General'}</span> al ${co.denumire || '____________________'},</p>
<p>certifică prin prezenta că <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span>, ${identityText(emp)}, CNP <span class="bold">${emp.cnp || '_______________'}</span>,</p>
<p>este ${String(emp.activ !== false ? 'angajat(ă)' : 'a fost angajat(ă)')} în cadrul societății noastre, în funcția de <span class="bold">${emp.functia || '____________________'}</span>,</p>
<p>cu contract individual de muncă tip <span class="bold">${emp.tip_contract || '____________________'}</span>, începând cu data de <span class="bold">${emp.data_angajare || '____________________'}</span>.</p>
${data.tip === 'venit' && emp.salariu_baza ? `<p>Salariul brut de bază este de <span class="bold">${emp.salariu_baza} RON</span>.</p>` : ''}
${extraText}
<p>Adeverința se eliberează la cererea persoanei în cauză, pentru a-i servi <span class="bold">la toate instituțiile unde va fi prezentată</span>.</p>
<div class="signature">
  <div><p>Director General</p><p>${co.reprezentant || '____________________'}</p><p>Semnătură: ________________</p></div>
  <div><p>Responsabil HR</p><p>____________________</p><p>Semnătură: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(bodyHtml, data)
  }

  function printFisaPost(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Fișa postului</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm;color:#000}h2{text-align:center;font-size:14pt;margin:8px 0}h3{font-size:12pt;margin:10px 0 4px;border-bottom:1px solid #999;padding-bottom:3px}p,li{margin:4px 0;line-height:1.7}table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border:1px solid #888;padding:4px 8px;font-size:10pt}.sig{margin-top:40px;display:flex;justify-content:space-between}.sig div{text-align:center;min-width:160px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>${co.denumire || 'SOCIETATEA'}</h2>
<h2>FIȘA POSTULUI</h2>
<p style="text-align:center;color:#555">Data: ${data.data || new Date().toISOString().slice(0,10)}</p>
<h3>I. Identificarea postului</h3>
<table>
  <tr><td width="40%"><strong>Denumirea postului</strong></td><td>${emp.functia || '______________________________'}</td></tr>
  <tr><td><strong>Titular post</strong></td><td>${emp.prenume || ''} ${emp.nume || ''}</td></tr>
  <tr><td><strong>Departament / Compartiment</strong></td><td>${emp.department_name || '______________________________'}</td></tr>
  <tr><td><strong>Subordonat față de</strong></td><td>Șeful departamentului / Director General</td></tr>
  <tr><td><strong>Normă de lucru</strong></td><td>${emp.norma_ore_zi || 8} ore/zi, 5 zile/săptămână</td></tr>
  <tr><td><strong>Tip contract</strong></td><td>${emp.tip_contract || 'nedeterminat'}</td></tr>
</table>
<h3>II. Cerințe pentru ocuparea postului</h3>
<table>
  <tr><td width="40%"><strong>Nivel studii</strong></td><td>${emp.nivel_studii || '______________________________'}</td></tr>
  <tr><td><strong>Experiență necesară</strong></td><td>Minim 1 an în domeniu</td></tr>
  <tr><td><strong>Calificări / Autorizații</strong></td><td>Conform specificațiilor postului</td></tr>
</table>
<h3>III. Atribuții principale</h3>
<ol>
  <li>Îndeplinirea sarcinilor specifice funcției conform instrucțiunilor primite.</li>
  <li>Respectarea regulamentului intern și a normelor de conduită.</li>
  <li>Participarea la training-uri obligatorii SSM și PSI.</li>
  <li>Raportarea incidentelor și neconformităților șefului ierarhic.</li>
  <li>Menținerea confidențialității datelor prelucrate.</li>
</ol>
<h3>IV. Responsabilități</h3>
<ul>
  <li>Răspunde de calitatea muncii prestate și de utilizarea corectă a echipamentelor.</li>
  <li>Răspunde de respectarea normelor SSM și PSI la locul de muncă.</li>
  <li>Răspunde de protecția datelor cu caracter personal conform GDPR.</li>
</ul>
<h3>V. Competențe necesare</h3>
<ul>
  <li>Capacitate de organizare și planificare</li>
  <li>Abilități de comunicare și lucru în echipă</li>
  <li>Cunoașterea legislației aplicabile domeniului</li>
</ul>
<div class="sig">
  <div><p><strong>ANGAJATOR</strong></p><p>${co.reprezentant || '______________________'}</p><p>${co.functie_reprezentant || 'Director General'}</p><br><p>Semnătură: ________________</p></div>
  <div><p><strong>AM LUAT LA CUNOȘTINȚĂ</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: ________________</p><p>Data: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printActAditional(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Act adițional CIM</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;font-size:13pt;margin:8px 0}p,li{margin:5px 0;line-height:1.8}.bold{font-weight:bold}.sig{margin-top:48px;display:flex;justify-content:space-between}.sig div{text-align:center;min-width:180px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>ACT ADIȚIONAL</h2>
<h2>la Contractul Individual de Muncă</h2>
<p style="text-align:center;color:#555">Nr. ____ / ${azi}</p>
<p>Între:</p>
<p><span class="bold">${co.denumire || '______________________'}</span>, CUI ${co.cui || '____________'}, cu sediul în ${co.adresa || '______________________'}, reprezentată de <span class="bold">${co.reprezentant || '______________________'}</span>, în calitate de ${co.functie_reprezentant || 'Director General'}, denumit în continuare <strong>Angajator</strong>,</p>
<p>și</p>
<p><span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span>, CNP <span class="bold">${emp.cnp || '_______________'}</span>, domiciliat(ă) în ${emp.adresa || '______________________'}, denumit(ă) în continuare <strong>Salariat</strong>,</p>
<p>s-a convenit modificarea Contractului Individual de Muncă după cum urmează:</p>
<p>1. Începând cu data de <span class="bold">____________________</span>, se modifică/completează CIM cu următoarele prevederi:</p>
<p style="margin-left:2em">□ Funcția: <span class="bold">____________________________________</span></p>
<p style="margin-left:2em">□ Salariu de bază brut: <span class="bold">____________ RON</span></p>
<p style="margin-left:2em">□ Departament: <span class="bold">____________________________________</span></p>
<p style="margin-left:2em">□ Altele: ________________________________________________________________</p>
<p>2. Celelalte prevederi ale CIM rămân neschimbate.</p>
<p>Prezentul act adițional face parte integrantă din CIM și produce efecte de la data semnării.</p>
<div class="sig">
  <div><p><strong>ANGAJATOR</strong></p><p>${co.repreztant || co.reprezentant || '______________________'}</p><br><p>Semnătură: ________________</p><p>Data: ${azi}</p></div>
  <div><p><strong>SALARIAT</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: ________________</p><p>Data: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printNotaLichidare(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const inventar = data.inventar || {}
    const inventoryRows = rows => (rows || []).map((item, index) => `<tr><td>${index + 1}</td><td>${item.tip_denumire || ''}</td><td>${item.marime || '-'}</td><td>${item.numar_serie || '-'}</td><td>${item.cantitate || 1}</td><td>${Number(item.valoare_inventar || 0).toFixed(2)} lei</td><td>□</td></tr>`).join('') || '<tr><td colspan="7">Nu există obiecte active de predat.</td></tr>'
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Notă de lichidare</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;font-size:13pt;margin:8px 0}p{margin:5px 0;line-height:1.7}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #888;padding:5px 8px;font-size:10pt}th{background:#f0f0f0;text-align:center}.sig{margin-top:40px;display:flex;justify-content:space-between}.sig div{text-align:center;min-width:150px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>${co.denumire || 'SOCIETATEA'}</h2>
<h2>NOTĂ DE LICHIDARE</h2>
<p style="text-align:center;color:#555">Nr. ____ / ${azi}</p>
<table>
  <tr><td width="40%"><strong>Salariat</strong></td><td>${emp.prenume || ''} ${emp.nume || ''}</td></tr>
  <tr><td><strong>CNP</strong></td><td>${emp.cnp || '_______________'}</td></tr>
  <tr><td><strong>Funcția</strong></td><td>${emp.functia || '______________________'}</td></tr>
  <tr><td><strong>Departament</strong></td><td>${emp.department_name || '______________________'}</td></tr>
  <tr><td><strong>Data angajării</strong></td><td>${emp.data_angajare || '______________________'}</td></tr>
  <tr><td><strong>Data încetării CIM</strong></td><td>______________________</td></tr>
  <tr><td><strong>Motiv încetare</strong></td><td>□ Demisie &nbsp;&nbsp; □ Concediere &nbsp;&nbsp; □ Acord părți &nbsp;&nbsp; □ Altele</td></tr>
</table>
<p><strong>Situație obligații salariat față de angajator:</strong></p>
<table>
  <tr><th>Nr.</th><th>Compartiment</th><th>Obiect predare</th><th>Vizat (Da/Nu)</th><th>Semnătura</th></tr>
  <tr><td>1</td><td>Gestionar / Magazioner</td><td>Echipamente / Materiale primite</td><td></td><td></td></tr>
  <tr><td>2</td><td>IT / Parc auto</td><td>Telefon / Laptop / Auto</td><td></td><td></td></tr>
  <tr><td>3</td><td>Contabilitate</td><td>Avansuri / Deconturi</td><td></td><td></td></tr>
  <tr><td>4</td><td>HR</td><td>Echipament protecție / Acces</td><td></td><td></td></tr>
  <tr><td>5</td><td>Șef departament</td><td>Documentații / Dosare</td><td></td><td></td></tr>
</table>
<p><strong>Gestionar — Echipamente de predat:</strong></p>
<table>
  <tr><th>Nr.</th><th>Obiect</th><th>Mărime</th><th>Nr. serie</th><th>Cant.</th><th>Valoare</th><th>Predat</th></tr>
  ${inventoryRows(inventar.echipamente_protectie)}
</table>
<p><strong>Gestionar — Scule și obiecte inventar de predat:</strong></p>
<table>
  <tr><th>Nr.</th><th>Obiect</th><th>Mărime</th><th>Nr. serie</th><th>Cant.</th><th>Valoare</th><th>Predat</th></tr>
  ${inventoryRows([...(inventar.scule_unelte || []), ...(inventar.alte_obiecte || [])])}
</table>
<p><strong>Total valoare în răspundere: ${Number(inventar.total_valoare || 0).toFixed(2)} lei</strong></p>
<p>Zile concediu de odihnă neefectuate: ______ zile &nbsp;&nbsp; Zile CO efectuate în plus: ______ zile</p>
<p>Sume de plătit salariatului: ____________ RON &nbsp;&nbsp; Sume reținute: ____________ RON</p>
<div class="sig">
  <div><p>Director General</p><p>${co.reprezentant || '______________'}</p><br><p>Semnătură: _____________</p></div>
  <div><p>Responsabil HR</p><p>______________</p><br><p>Semnătură: _____________</p></div>
  <div><p>Salariat</p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: _____________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printCerereAngajare(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Cerere angajare</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;margin:8px 0}p,li{margin:5px 0;line-height:1.7}table{width:100%;border-collapse:collapse;margin:8px 0}td{border:1px solid #bbb;padding:4px 8px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<p>Către,</p>
<p><strong>${co.denumire || '____________________'}</strong></p>
<p style="text-align:right">${azi}</p>
<h2>CERERE DE ANGAJARE</h2>
<p>Subsemnatul(a) <strong>${emp.prenume || '____________________'} ${emp.nume || '____________________'}</strong>, CNP <strong>${emp.cnp || '_______________'}</strong>, domiciliat(ă) în <strong>${emp.adresa || '____________________'}</strong>, telefon <strong>${emp.telefon || '____________________'}</strong>, email <strong>${emp.email || '____________________'}</strong>,</p>
<p>solicit angajarea în cadrul societății dumneavoastră pe postul de: <strong>${emp.functia || '____________________'}</strong></p>
<p>în departamentul: <strong>${emp.department_name || '____________________'}</strong></p>
<p>Declar că am luat cunoștință de condițiile postului și accept condițiile de angajare.</p>
<p>Atașez la prezenta cerere următoarele documente:</p>
<ul>
  <li>□ Curriculum Vitae</li>
  <li>□ Copie Buletin/Carte de identitate</li>
  <li>□ Cazier judiciar</li>
  <li>□ Adeverință medicală</li>
  <li>□ Copii diplome și certificate</li>
  <li>□ Fotografii tip buletin (2 buc.)</li>
  <li>□ Alte documente: ____________________</li>
</ul>
<br>
<p style="text-align:right">Semnătură: ________________</p>
<p style="text-align:right">${emp.prenume || ''} ${emp.nume || ''}</p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printDecizieConc(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Decizie concediere</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;font-size:13pt;margin:8px 0}p,li{margin:5px 0;line-height:1.8}.bold{font-weight:bold}.sig{margin-top:48px;display:flex;justify-content:space-between}.sig div{text-align:center;min-width:180px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>${co.denumire || 'SOCIETATEA'}</h2>
<h2>DECIZIE DE CONCEDIERE</h2>
<p style="text-align:center;color:#555">Nr. ____ / ${azi}</p>
<p>Subsemnatul(a), <span class="bold">${co.reprezentant || '______________________'}</span>, în calitate de ${co.functie_reprezentant || 'Director General'} al <span class="bold">${co.denumire || '____________________'}</span>,</p>
<p>Având în vedere:</p>
<ul>
  <li>Prevederile Codului Muncii (Legea nr. 53/2003, republicată), art. ______</li>
  <li>Motivul: □ Desființarea postului &nbsp;&nbsp; □ Necorespundere profesională &nbsp;&nbsp; □ Alte motive prevăzute de lege</li>
  <li>Referatul / Nota internă nr. ____ din ____________________</li>
</ul>
<p><strong>DISPUNE:</strong></p>
<p>Art. 1. Începând cu data de <span class="bold">____________________</span>, se încetează contractul individual de muncă al salariatului/ei <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span>, CNP <span class="bold">${emp.cnp || '_______________'}</span>, angajat(ă) în funcția de <span class="bold">${emp.functia || '______________________'}</span>, departamentul <span class="bold">${emp.department_name || '______________________'}</span>.</p>
<p>Art. 2. Temeiul legal: Codul Muncii, art. ______</p>
<p>Art. 3. Salariatul beneficiază de un preaviz de <span class="bold">______ zile lucrătoare</span>.</p>
<p>Art. 4. Prezenta decizie poate fi contestată la instanța judecătorească competentă în termen de 30 de zile de la comunicare.</p>
<p>Art. 5. Departamentul HR și Contabilitate vor lua măsurile necesare pentru aplicarea prezentei decizii.</p>
<div class="sig">
  <div><p><strong>DIRECTOR GENERAL</strong></p><p>${co.reprezentant || '______________________'}</p><br><p>Semnătură și ștampilă: ____________</p><p>Data: ${azi}</p></div>
  <div><p><strong>AM PRIMIT UN EXEMPLAR</strong></p><p>${emp.prenume || ''} ${emp.nume || ''}</p><br><p>Semnătură: ________________</p><p>Data: ________________</p></div>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printNotificarePrv(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Notificare preaviz</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;font-size:13pt;margin:8px 0}p,li{margin:5px 0;line-height:1.8}.bold{font-weight:bold}.sig{margin-top:48px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>${co.denumire || 'SOCIETATEA'}</h2>
<h2>NOTIFICARE PREAVIZ CONCEDIERE</h2>
<p style="text-align:center;color:#555">Nr. ____ / ${azi}</p>
<p>Stimată Doamnă / Stimate Domn,</p>
<p><span class="bold">${emp.prenume || '____________________'} ${emp.nume || '____________________'}</span></p>
<p>Prin prezenta vă notificăm că societatea <span class="bold">${co.denumire || '____________________'}</span> intenționează să înceteze contractul individual de muncă nr. <span class="bold">____________________</span> încheiat cu dumneavoastră, în temeiul art. ______ din Codul Muncii.</p>
<p>Motivul concedierii: <span class="bold">____________________</span></p>
<p>Durata preavizului este de <span class="bold">______ zile lucrătoare</span>, calculat de la data comunicării prezentei notificări.</p>
<p>Ultima zi de activitate va fi: <span class="bold">____________________</span></p>
<p>Pe durata preavizului vă veți prezenta la serviciu conform programului normal de lucru.</p>
<p>Aveți dreptul să vă adresați instanțelor judecătorești competente dacă considerați că această notificare contravine dispozițiilor legale.</p>
<div class="sig">
  <p style="margin-top:40px"><strong>${co.denumire || '____________________'}</strong></p>
  <p>${co.reprezentant || '______________________'}, ${co.functie_reprezentant || 'Director General'}</p>
  <p>Semnătură și ștampilă: ________________ &nbsp;&nbsp;&nbsp; Data: ${azi}</p>
  <br><br>
  <p><strong>Confirmare de primire:</strong></p>
  <p>Subsemnatul/a ${emp.prenume || ''} ${emp.nume || ''} confirm primirea prezentei notificări.</p>
  <p>Semnătură: ________________ &nbsp;&nbsp;&nbsp; Data: ________________</p>
</div>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printCerereConc(data, tip) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const tipLabels = { co: 'CONCEDIU DE ODIHNĂ', fara_plata: 'CONCEDIU FĂRĂ PLATĂ', fam: 'CONCEDIU PENTRU EVENIMENTE FAMILIALE' }
    const tipLabel = tipLabels[tip] || 'CONCEDIU'
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Cerere ${tipLabel}</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;margin:8px 0}p{margin:5px 0;line-height:1.8}.bold{font-weight:bold}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<p>Subsemnatul(a): <span class="bold">${emp.prenume || ''} ${emp.nume || ''}</span></p>
<p>Funcția: <span class="bold">${emp.functia || '______________________'}</span> &nbsp;&nbsp;&nbsp; Departament: <span class="bold">${emp.department_name || '______________________'}</span></p>
<br>
<h2>CERERE ${tipLabel}</h2>
<br>
<p>Vă rog să-mi aprobați ${tipLabel.toLowerCase()} în perioada:</p>
<p>De la: <span class="bold">____________________</span> &nbsp;&nbsp;&nbsp; Până la: <span class="bold">____________________</span></p>
<p>Număr zile lucrătoare: <span class="bold">______</span></p>
${tip === 'co' ? `<p>Sold zile CO disponibile: <span class="bold">${emp.zile_co_drept || '__'} zile</span></p>` : ''}
${tip === 'fam' ? `<p>Motivul concediului: □ Naștere copil &nbsp; □ Căsătorie &nbsp; □ Deces rudă &nbsp; □ Altele: ____________________</p>` : ''}
${tip === 'fara_plata' ? `<p>Motivul solicitării: ____________________</p>` : ''}
<p>Persoana care mă înlocuiește: <span class="bold">____________________</span></p>
<br>
<p style="text-align:right">${azi}</p>
<p style="text-align:right">Semnătură: ________________</p>
<p style="text-align:right">${emp.prenume || ''} ${emp.nume || ''}</p>
<br><br>
<p><strong>AVIZ ȘEF DEPARTAMENT:</strong> □ Aprobat &nbsp;&nbsp; □ Respins &nbsp;&nbsp; Data: ________________ &nbsp;&nbsp; Semnătură: ________________</p>
<p><strong>DECIZIE HR:</strong> □ Aprobat &nbsp;&nbsp; □ Respins &nbsp;&nbsp; Data: ________________ &nbsp;&nbsp; Semnătură: ________________</p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printDeclDeduceri(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Declarație deduceri</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;margin:8px 0}p,li{margin:5px 0;line-height:1.8}table{width:100%;border-collapse:collapse;margin:10px 0}td{border:1px solid #bbb;padding:4px 8px}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<p>Angajator: <strong>${co.denumire || '____________________'}</strong> &nbsp;&nbsp; CUI: ${co.cui || '____________'}</p>
<br>
<h2>DECLARAȚIE</h2>
<h2>privind deducerile personale pentru impozit pe venit din salarii</h2>
<br>
<p>Subsemnatul(a) <strong>${emp.prenume || ''} ${emp.nume || ''}</strong>, CNP <strong>${emp.cnp || '_______________'}</strong>,</p>
<p>angajat(ă) în funcția de <strong>${emp.functia || '______________________'}</strong>, declar pe propria răspundere că:</p>
<p>1. Aceasta este/nu este funcția de bază: □ DA &nbsp;&nbsp; □ NU</p>
<p>2. Număr persoane în întreținere: <strong>${emp.nr_copii_intretinere || '____'}</strong></p>
<table>
  <tr><td><strong>Nr. crt.</strong></td><td><strong>Nume și prenume persoană în întreținere</strong></td><td><strong>CNP</strong></td><td><strong>Grad rudenie</strong></td></tr>
  <tr><td>1</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  <tr><td>2</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  <tr><td>3</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</table>
<p>3. Deducere personală lunară solicitată: <strong>${emp.deducere_personala ? emp.deducere_personala + ' RON' : '______ RON'}</strong></p>
<p>Mă angajez să comunic orice modificare a datelor de mai sus în termen de 15 zile.</p>
<p>Declar că toate informațiile de mai sus sunt corecte și complete.</p>
<p style="margin-top:32px;text-align:right">Data: ${azi} &nbsp;&nbsp;&nbsp;&nbsp; Semnătură: ________________</p>
<p style="text-align:right">${emp.prenume || ''} ${emp.nume || ''}</p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printNotaGDPR(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Notă GDPR</title>
<style>body{font-family:Arial,sans-serif;font-size:10pt;margin:2cm;line-height:1.6}h2{text-align:center;font-size:13pt}h3{font-size:11pt;margin:10px 0 4px;color:#333}p,li{margin:4px 0}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<h2>NOTĂ DE INFORMARE</h2>
<h2>privind prelucrarea datelor cu caracter personal</h2>
<p style="text-align:center;color:#666">conform Regulamentului (UE) 2016/679 — GDPR</p>
<h3>1. Identitatea operatorului</h3>
<p><strong>${co.denumire || '____________________'}</strong>, CUI: ${co.cui || '____________'}, sediu: ${co.adresa || '______________________'}, denumit în continuare <strong>Operator</strong>.</p>
<h3>2. Datele prelucrate</h3>
<p>Prelucrăm următoarele categorii de date: date de identificare (nume, CNP, CI), date de contact, date de angajare, date financiare (salariu, IBAN), date biometrice (fotografie), date privind sănătatea (adeverință medicală).</p>
<h3>3. Scopul prelucrării</h3>
<ul>
  <li>Executarea contractului individual de muncă</li>
  <li>Respectarea obligațiilor legale (REGES, ITM, ANAF)</li>
  <li>Calculul și plata salariilor</li>
  <li>Gestionarea concediilor și absențelor</li>
  <li>Securitatea muncii (SSM/PSI)</li>
</ul>
<h3>4. Temeiul legal</h3>
<p>Art. 6(1)(b) GDPR — executarea contractului; Art. 6(1)(c) — obligație legală; Art. 6(1)(f) — interese legitime.</p>
<h3>5. Destinatarii datelor</h3>
<p>Date transmise către: ITM, ANAF, casele de asigurări, bănci (pentru plata salariului), contabili externi. Nu transmitem date în afara UE.</p>
<h3>6. Durata stocării</h3>
<p>Datele sunt păstrate pe durata contractului și minim 50 de ani după încetare, conform prevederilor legale privind arhivarea documentelor de muncă.</p>
<h3>7. Drepturile dumneavoastră</h3>
<p>Aveți dreptul de: acces, rectificare, ștergere (în limitele legii), restricționare, portabilitate, opoziție. Reclamații: Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP).</p>
<br>
<p><strong>Confirm că am primit și înțeles prezenta notă de informare:</strong></p>
<p>Nume și prenume: <strong>${emp.prenume || ''} ${emp.nume || ''}</strong></p>
<p>Semnătură: ________________ &nbsp;&nbsp;&nbsp;&nbsp; Data: ${azi}</p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  function printDeclFunctieBaza(data) {
    if (!data) return
    const emp = data.angajat || {}
    const co = data.company || {}
    const azi = new Date().toISOString().slice(0, 10)
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Declarație funcție de bază</title>
<style>body{font-family:Times New Roman,serif;font-size:11pt;margin:2cm}h2{text-align:center;margin:8px 0}p,li{margin:6px 0;line-height:1.8}@media print{body{margin:1.5cm 2cm}}</style></head><body>
<p>Angajator: <strong>${co.denumire || '____________________'}</strong></p>
<br>
<h2>DECLARAȚIE</h2>
<h2>privind funcția/locul de muncă de bază</h2>
<br>
<p>Subsemnatul(a) <strong>${emp.prenume || ''} ${emp.nume || ''}</strong>, CNP <strong>${emp.cnp || '_______________'}</strong>, domiciliat(ă) în ${emp.adresa || '______________________'},</p>
<p>în calitate de salariat al/a ${co.denumire || '____________________'}, angajat(ă) în funcția de <strong>${emp.functia || '______________________'}</strong>, declar pe proprie răspundere că:</p>
<br>
<p>□ <strong>DA</strong> — Prezentul loc de muncă reprezintă <strong>funcția de bază</strong> unde îmi desfășor activitatea de muncă și unde solicit acordarea deducerilor personale la calculul impozitului pe venit.</p>
<br>
<p>□ <strong>NU</strong> — Prezentul loc de muncă nu reprezintă funcția de bază. Funcția de bază o dețin la: ____________________</p>
<br>
<p>Mă angajez să comunic orice modificare a situației de mai sus în termen de 5 zile lucrătoare.</p>
<p>Declar că informațiile furnizate sunt corecte și complete, cunoscând că falsul în declarații este infracțiune pedepsită de lege.</p>
<p style="margin-top:40px;text-align:right">Data: <strong>${azi}</strong></p>
<p style="text-align:right">Semnătură: ________________</p>
<p style="text-align:right"><strong>${emp.prenume || ''} ${emp.nume || ''}</strong></p>
</body></html>`
    printGeneratedHtml(html, data)
  }

  return {
    identityText,
    printEmployeeProfile,
    printCIM,
    printOperationalContract,
    generateContractWord,
    generateAmendmentWord,
    archiveContractWord,
    archiveAmendmentWord,
    printOperationalAmendment,
    loadAdeverinta,
    printAdeverinta,
    printFisaPost,
    printActAditional,
    printNotaLichidare,
    printCerereAngajare,
    printDecizieConc,
    printNotificarePrv,
    printCerereConc,
    printDeclDeduceri,
    printNotaGDPR,
    printDeclFunctieBaza,
  }
}
