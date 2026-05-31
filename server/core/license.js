const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const PUBLIC_KEY_PATH = path.join(__dirname, 'infraflow-public.pem')

function verificaLicenta(licentaJson) {
  try {
    if (!fs.existsSync(PUBLIC_KEY_PATH)) {
      console.warn('[LICENSE] infraflow-public.pem lipsă — mod DEMO activ')
      return { valida: false, eroare: 'Cheie publică lipsă' }
    }

    const licenta = JSON.parse(licentaJson)
    const { semnatura, payload_hash, ...payload } = licenta

    // Verifică semnătura RSA
    const payloadStr = JSON.stringify(payload)
    const verify = crypto.createVerify('SHA256')
    verify.update(payloadStr)
    const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8')
    const semnaturaValida = verify.verify(publicKey, semnatura, 'base64')

    if (!semnaturaValida) {
      return { valida: false, eroare: 'Semnătură licență invalidă' }
    }

    // Verifică expirarea
    const acum = new Date()
    const expira = new Date(licenta.valabilitate.expira_la)

    if (acum > expira) {
      const gratie = new Date(expira)
      gratie.setDate(gratie.getDate() + 14)
      if (acum > gratie) {
        return { valida: false, eroare: 'Licență expirată', expirata: true }
      }
      const zileRamase = Math.ceil((gratie - acum) / (1000 * 60 * 60 * 24))
      return { valida: true, in_gratie: true, zile_gratie: zileRamase, licenta }
    }

    const zileRamase = Math.ceil((expira - acum) / (1000 * 60 * 60 * 24))
    return { valida: true, licenta, zile_pana_expirare: zileRamase }

  } catch (e) {
    return { valida: false, eroare: 'Format licență invalid: ' + e.message }
  }
}

function modulPermis(licenta, modul) {
  if (!licenta) return false
  const toate = [...(licenta.module || []), ...(licenta.addons || [])]
  return toate.includes(modul)
}

function incarcaLicenta() {
  const cai = [
    path.join(process.cwd(), 'licenta.iflic'),
    path.join(process.cwd(), 'server', 'licenta.iflic'),
    path.join(__dirname, '..', '..', 'licenta.iflic')
  ]
  for (const cale of cai) {
    if (fs.existsSync(cale)) {
      const json = fs.readFileSync(cale, 'utf8')
      return verificaLicenta(json)
    }
  }
  // Fără licență → modul demo/trial
  return {
    valida: true,
    demo: true,
    licenta: {
      licenseId: 'DEMO',
      client: { nume: 'Demo', cui: '' },
      pachet: 'TRIAL',
      module: ['core', 'inventory', 'production', 'reports', 'system'],
      addons: [],
      limite: { max_utilizatori: 3, max_dispozitive: 3 },
      valabilitate: { tip: 'trial' }
    }
  }
}

module.exports = { verificaLicenta, modulPermis, incarcaLicenta }
