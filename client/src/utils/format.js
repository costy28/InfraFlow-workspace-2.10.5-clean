export function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export function formatDateTime(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatMoney(value, currency = 'RON') {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

export function formatTone(value) {
  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 3 }).format(Number(value || 0))} tone`
}

export function formatPercent(value) {
  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(Number(value || 0))}%`
}

export function timeAgo(value) {
  if (!value) return '-'
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return 'acum'
  if (diffMinutes < 60) return `acum ${diffMinutes} ${diffMinutes === 1 ? 'minut' : 'minute'}`
  if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`
  if (diffDays === 1) return 'ieri'
  if (diffDays < 7) return `acum ${diffDays} zile`
  return formatDate(value)
}
