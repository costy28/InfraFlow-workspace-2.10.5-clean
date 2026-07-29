import api from '../api/client'

function normalizeApiEndpoint(endpoint) {
  return String(endpoint || '').replace(/^\/api(?=\/)/, '')
}

function filenameFromDisposition(disposition) {
  const header = String(disposition || '')
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/"/g, '').trim())
    } catch {
      return utf8Match[1].replace(/"/g, '').trim()
    }
  }
  const asciiMatch = /filename="?([^";]+)"?/i.exec(header)
  return asciiMatch?.[1]?.trim() || ''
}

function safeFilename(filename, fallback = 'download') {
  return String(filename || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
    .trim() || fallback
}

function createBlob(response) {
  const type = response.headers?.['content-type'] || 'application/octet-stream'
  return response.data instanceof Blob ? response.data : new Blob([response.data], { type })
}

function scheduleRevoke(objectUrl, delay = 60_000) {
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), delay)
}

function triggerDownload(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = safeFilename(filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  scheduleRevoke(objectUrl, 5_000)
}

async function normalizeDownloadError(err) {
  const data = err.response?.data
  if (data instanceof Blob) {
    const text = await data.text().catch(() => '')
    if (text) {
      try {
        const parsed = JSON.parse(text)
        if (parsed?.error) {
          const wrapped = new Error(parsed.error)
          wrapped.response = err.response
          return wrapped
        }
      } catch {
        const wrapped = new Error(text.slice(0, 250))
        wrapped.response = err.response
        return wrapped
      }
    }
  }
  return err
}

export async function downloadApiFile(endpoint, fallbackFilename = 'download') {
  try {
    const response = await api.get(normalizeApiEndpoint(endpoint), { responseType: 'blob' })
    const blob = createBlob(response)
    const filename = filenameFromDisposition(response.headers?.['content-disposition']) || fallbackFilename
    triggerDownload(blob, filename)
  } catch (err) {
    throw await normalizeDownloadError(err)
  }
}

export async function openApiFile(endpoint, fallbackFilename = 'document.html') {
  const previewWindow = window.open('about:blank', '_blank')
  if (previewWindow) {
    try {
      previewWindow.opener = null
      previewWindow.document.write('<!doctype html><title>InfraFlow</title><body style="font-family:Arial,sans-serif;padding:24px;color:#1e293b">Se încarcă documentul...</body>')
      previewWindow.document.close()
    } catch {
      // Unele browsere restricționează accesul imediat la fereastra nouă.
    }
  }

  try {
    const response = await api.get(normalizeApiEndpoint(endpoint), { responseType: 'blob' })
    const blob = createBlob(response)
    const objectUrl = window.URL.createObjectURL(blob)
    if (previewWindow && !previewWindow.closed) {
      previewWindow.location.href = objectUrl
      scheduleRevoke(objectUrl)
      return
    }
    const filename = filenameFromDisposition(response.headers?.['content-disposition']) || fallbackFilename
    triggerDownload(blob, filename)
  } catch (err) {
    if (previewWindow && !previewWindow.closed) previewWindow.close()
    throw await normalizeDownloadError(err)
  }
}
