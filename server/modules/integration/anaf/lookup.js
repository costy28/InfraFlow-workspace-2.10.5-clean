async function lookupFirmaByCui(cui) {
  const cuiCurat = String(cui).replace(/[^0-9]/g, '')
  const url = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      cui: Number(cuiCurat),
      data: new Date().toISOString().split('T')[0]
    }]),
    signal: AbortSignal.timeout(8000)
  })
  const data = await res.json()
  if (!data.found?.length) {
    return { gasit: false, eroare: 'CUI negăsit la ANAF' }
  }
  const f = data.found[0]
  return {
    gasit: true,
    cui: f.date_generale.cui,
    denumire: f.date_generale.denumire,
    adresa: f.date_generale.adresa,
    nr_reg_com: f.date_generale.nrRegCom,
    telefon: f.date_generale.telefon,
    cod_postal: f.date_generale.codPostal,
    cod_caen: f.date_generale.cod_CAEN,
    platitor_tva: f.inregistrare_scop_Tva?.scpTVA || false,
    activ: f.date_generale.stare_inregistrare === 'INREGISTRAT'
  }
}

module.exports = { lookupFirmaByCui }
