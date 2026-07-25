const nodemailer = require('nodemailer')
const { readDb } = require('../../core/db')
const { decryptSettingSecret } = require('../../core/settings-crypto')

function getEmailSettings(db = readDb()) {
  const settings = db?.settings || {}
  return {
    smtp_host: settings.smtp_host || settings.smtpHost || '',
    smtp_port: Number(settings.smtp_port || settings.smtpPort || 587),
    smtp_user: settings.smtp_user || settings.smtpUser || '',
    smtp_password_encrypted: settings.smtp_password_encrypted || settings.smtpPasswordEncrypted || '',
    smtp_name: settings.smtp_name || settings.smtpName || settings.companyName || 'InfraFlow'
  }
}

function providerFromHost(host = '') {
  const normalized = String(host).toLowerCase()
  if (normalized.includes('gmail')) return 'gmail'
  if (normalized.includes('office365') || normalized.includes('outlook') || normalized.includes('microsoft')) return 'office365'
  if (normalized.includes('smtp2go')) return 'smtp2go'
  return 'smtp'
}

function describeSmtpError(error, settings = {}) {
  if (error?.smtpDiagnostic) return error.smtpDiagnostic
  const provider = providerFromHost(settings.smtp_host)
  const raw = String(error?.message || error || '')
  const code = String(error?.code || error?.responseCode || '').toUpperCase()
  const lower = `${raw} ${code}`.toLowerCase()
  const tips = []
  let message = 'Emailul nu a putut fi trimis. Verifică serverul SMTP, utilizatorul și parola.'
  let diagnosticCode = 'SMTP_SEND_FAILED'
  let status = 422

  if (lower.includes('configurarea smtp este incompleta')) {
    message = 'Configurarea SMTP este incompletă. Completează serverul, portul, utilizatorul și parola SMTP.'
    diagnosticCode = 'SMTP_CONFIG_INCOMPLETE'
    tips.push('După completarea parolei, apasă Salvează și apoi Testează configurarea.')
  } else if (lower.includes('parola smtp salvata nu poate fi citita')) {
    message = 'Parola SMTP salvată nu poate fi citită. Reintrodu parola în Setări și salvează configurarea.'
    diagnosticCode = 'SMTP_SECRET_UNREADABLE'
    tips.push('Acest mesaj apare de obicei după schimbarea cheii APP_KEY sau după migrarea datelor.')
  } else if (
    lower.includes('535') ||
    lower.includes('5.7.8') ||
    lower.includes('badcredentials') ||
    lower.includes('username and password not accepted') ||
    lower.includes('invalid login') ||
    code === 'EAUTH'
  ) {
    message = provider === 'gmail'
      ? 'Gmail a respins autentificarea SMTP. Folosește o parolă de aplicație, nu parola normală a contului.'
      : 'Serverul SMTP a respins utilizatorul sau parola.'
    diagnosticCode = 'SMTP_AUTH_FAILED'
    tips.push('Verifică dacă utilizatorul SMTP este adresa completă de email.')
    if (provider === 'gmail') {
      tips.push('În contul Google activează 2-Step Verification, apoi generează App Password pentru Mail.')
      tips.push('Pentru Gmail folosește smtp.gmail.com cu port 587.')
    } else if (provider === 'office365') {
      tips.push('Pentru Microsoft 365 folosește smtp.office365.com, port 587 și verifică dacă SMTP AUTH este permis pentru căsuță.')
    }
  } else if (
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('econnection') ||
    lower.includes('esocket') ||
    lower.includes('timeout')
  ) {
    message = 'Nu mă pot conecta la serverul SMTP. Verifică adresa serverului, portul și conexiunea la internet.'
    diagnosticCode = 'SMTP_CONNECTION_FAILED'
    status = 502
    tips.push('Porturi uzuale: 587 pentru STARTTLS, 465 pentru SSL, 2525 pentru SMTP2GO.')
    tips.push('Verifică dacă antivirusul/firewall-ul nu blochează conexiunile SMTP ieșite.')
  } else if (
    lower.includes('certificate') ||
    lower.includes('self signed') ||
    lower.includes('tls') ||
    lower.includes('ssl')
  ) {
    message = 'Conexiunea SMTP a eșuat la verificarea SSL/TLS. Verifică portul și modul de securizare cerut de provider.'
    diagnosticCode = 'SMTP_TLS_FAILED'
    status = 502
    tips.push('Folosește 587 pentru STARTTLS sau 465 pentru SSL implicit, în funcție de provider.')
  }

  return {
    error: message,
    code: diagnosticCode,
    provider,
    status,
    details: raw,
    tips
  }
}

function throwFriendlySmtpError(error, settings) {
  const diagnostic = describeSmtpError(error, settings)
  const friendly = new Error(diagnostic.error)
  friendly.code = diagnostic.code
  friendly.status = diagnostic.status
  friendly.smtpDiagnostic = diagnostic
  throw friendly
}

async function sendEmail({ to, cc, bcc, subject, body, attachments }, dbInput) {
  const settings = getEmailSettings(dbInput)
  if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_password_encrypted) {
    throwFriendlySmtpError(new Error('Configurarea SMTP este incompleta.'), settings)
  }
  let smtpPassword = ''
  try {
    smtpPassword = decryptSettingSecret(settings.smtp_password_encrypted)
  } catch {
    throwFriendlySmtpError(new Error('Parola SMTP salvata nu poate fi citita. Reintrodu parola in Setari > Integrari > Email notificari si salveaza configurarea.'), settings)
  }
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: {
      user: settings.smtp_user,
      pass: smtpPassword
    }
  })
  try {
    await transporter.sendMail({
      from: `"${settings.smtp_name}" <${settings.smtp_user}>`,
      to,
      cc,
      bcc,
      subject,
      html: body,
      attachments
    })
  } catch (error) {
    throwFriendlySmtpError(error, settings)
  }
}

module.exports = { sendEmail, getEmailSettings, describeSmtpError }
