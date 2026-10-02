const crypto = require('crypto')
const fs = require('fs')

function secretFromEnvironment(env, name) {
  const filePath = String(env[`${name}_FILE`] || '').trim()
  if (filePath) {
    try { return fs.readFileSync(filePath, 'utf8').trim() } catch { return '' }
  }
  return String(env[name] || '').trim()
}

function configuredCentralUpdate(env = process.env) {
  const catalogUrl = String(env.INFRAFLOW_UPDATE_CATALOG_URL || '').trim()
  const clientToken = secretFromEnvironment(env, 'INFRAFLOW_UPDATE_CLIENT_TOKEN')
  if (!catalogUrl) return { configured: false }
  let catalog
  try { catalog = new URL(catalogUrl) } catch { throw new Error('URL catalog central invalid.') }
  if (catalog.protocol !== 'https:') throw new Error('Catalogul central trebuie accesat prin HTTPS.')
  return { configured: true, catalogUrl: catalog.toString(), clientToken }
}

async function downloadAuthorizedArtifact({ catalogUrl, clientToken, version, componentId = 'core', platform, artifact, fetchImpl = fetch }) {
  if (!clientToken) throw new Error('Credențiala instalației pentru update nu este configurată.')
  const catalog = new URL(catalogUrl)
  const ticketEndpoint = new URL('/tickets', catalog.origin)
  const ticketResponse = await fetchImpl(ticketEndpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ version, component_id: componentId, platform }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!ticketResponse.ok) throw new Error('Licența nu a autorizat descărcarea acestei componente.')
  const ticket = await ticketResponse.json()
  if (ticket.authorization_scheme !== 'UpdateTicket' || !ticket.ticket || !ticket.download_path) throw new Error('Răspuns ticket invalid.')

  const artifactUrl = new URL(String(artifact?.url || ''))
  const downloadUrl = new URL(String(ticket.download_path), ticketEndpoint.origin)
  if (artifactUrl.protocol !== 'https:' || downloadUrl.origin !== artifactUrl.origin || downloadUrl.pathname !== artifactUrl.pathname) {
    throw new Error('Ticket-ul nu corespunde artefactului semnat.')
  }
  const archiveResponse = await fetchImpl(downloadUrl, {
    redirect: 'error',
    headers: { Authorization: `UpdateTicket ${ticket.ticket}` },
    signal: AbortSignal.timeout(120_000)
  })
  if (!archiveResponse.ok) throw new Error('Pachetul autorizat nu a putut fi descărcat.')
  const archive = Buffer.from(await archiveResponse.arrayBuffer())
  if (artifact.size_bytes && archive.length !== Number(artifact.size_bytes)) throw new Error('Dimensiunea pachetului descărcat nu corespunde catalogului.')
  const hash = crypto.createHash('sha256').update(archive).digest('hex')
  if (!/^[a-f0-9]{64}$/i.test(String(artifact.sha256 || '')) || hash !== String(artifact.sha256).toLowerCase()) {
    throw new Error('SHA-256 al pachetului descărcat nu corespunde catalogului.')
  }
  return { archive, version, componentId, platform, expiresAt: ticket.expires_at || null }
}

module.exports = { configuredCentralUpdate, downloadAuthorizedArtifact, secretFromEnvironment }
