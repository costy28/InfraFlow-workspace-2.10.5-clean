const xlsx = require('xlsx')

function parseDevizExcel(filePath) {
  const workbook = xlsx.readFile(filePath)
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
  const headerRow = findHeaderRow(rows)
  const articles = []
  const errors = []

  if (headerRow === -1) {
    return { articles, errors: [{ rand: 0, motiv: 'Nu a fost gasit randul de header' }] }
  }

  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index]
    if (isEmptyRow(row) || rowContainsTotal(row)) continue

    try {
      const codArticol = cleanText(row[1])
      const denumire = cleanText(row[2])

      if (!codArticol || !denumire) {
        errors.push({ rand: index + 1, motiv: 'Lipsesc codul articolului sau denumirea' })
        continue
      }

      articles.push({
        nr_crt: cleanText(row[0]),
        cod_articol: codArticol,
        simbol: codArticol,
        denumire,
        um: cleanText(row[3]),
        cantitate_deviz: parseNumber(row[4]),
        pret_mat: parseNumber(row[5]),
        pret_man: parseNumber(row[6]),
        pret_util: parseNumber(row[7]),
        pret_unitar: parseNumber(row[8]),
        valoare_totala: parseNumber(row[9]),
        sort_order: articles.length + 1
      })
    } catch (error) {
      errors.push({ rand: index + 1, motiv: error.message || 'Randul nu a putut fi parsat' })
    }
  }

  return { articles, errors }
}

function parseSituatieExcel(filePath) {
  const workbook = xlsx.readFile(filePath)
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
  const headerRow = findHeaderRow(rows)
  const situatie = extractSituatieMetadata(rows)
  const items = []
  const errors = []

  if (headerRow === -1) {
    return { situatie, items, errors: [{ rand: 0, motiv: 'Nu a fost gasit randul de header' }] }
  }

  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index]
    if (isEmptyRow(row) || rowContainsTotal(row)) continue

    try {
      const codArticol = cleanText(row[1])

      if (!codArticol) {
        errors.push({ rand: index + 1, motiv: 'Lipseste codul articolului' })
        continue
      }

      items.push({
        cod_articol: codArticol,
        cant_realizata: parseNumber(row[5]),
        cant_renuntata: 0,
        valoare_realizata: parseNumber(row[7]),
        valoare_renuntata: parseNumber(row[8])
      })
    } catch (error) {
      errors.push({ rand: index + 1, motiv: error.message || 'Randul nu a putut fi parsat' })
    }
  }

  situatie.total_fara_tva = roundMoney(items.reduce((sum, item) => sum + (item.valoare_realizata || 0), 0))
  situatie.tva = roundMoney(situatie.total_fara_tva * 0.19)
  situatie.total_cu_tva = roundMoney(situatie.total_fara_tva + situatie.tva)

  return { situatie, items, errors }
}

function generateCantitatiExcel(articles, realizari, perioada) {
  const today = new Date().toISOString().slice(0, 10)
  const rows = [
    ['Export cantități realizate InfraFlow'],
    [`Perioada: ${perioada.de_la} - ${perioada.pana_la}`],
    [],
    ['Nr', 'Simbol', 'Denumire', 'UM', 'Cantitate realizată', 'Obs']
  ]

  articles.forEach((article, index) => {
    const codArticol = article.cod_articol || article.simbol || ''
    rows.push([
      index + 1,
      codArticol,
      article.denumire || '',
      article.um || '',
      Number(realizari[codArticol] || 0),
      `Export InfraFlow ${today}`
    ])
  })

  const workbook = xlsx.utils.book_new()
  const worksheet = xlsx.utils.aoa_to_sheet(rows)
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Cantitati')
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

function findHeaderRow(rows) {
  return rows.findIndex(row => row.some(cell => {
    const value = normalizeText(cell)
    return value.includes('simbol') || value.includes('nr.crt') || value.includes('nr crt')
  }))
}

function extractSituatieMetadata(rows) {
  const situatie = {
    nr_situatie: '',
    data_situatie: ''
  }

  rows.slice(0, 5).forEach(row => {
    row.forEach((cell, index) => {
      const value = normalizeText(cell)
      const next = cleanText(row[index + 1])

      if (!situatie.nr_situatie && (value.includes('nr_situatie') || value.includes('nr situatie') || value.includes('situatie nr'))) {
        situatie.nr_situatie = next || cleanText(cell).replace(/.*(?:nr\.?|numar)\s*/i, '').trim()
      }

      if (!situatie.data_situatie && (value.includes('data situatie') || value === 'data')) {
        situatie.data_situatie = parseDateValue(next || cell)
      }
    })
  })

  return situatie
}

function isEmptyRow(row) {
  return !row || row.every(cell => cleanText(cell) === '')
}

function rowContainsTotal(row) {
  return row.some(cell => normalizeText(cell).includes('total'))
}

function cleanText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeText(value) {
  return cleanText(value).toLowerCase()
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const normalized = String(value)
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')

  if (!normalized || normalized === '-' || normalized === '.') return 0
  const number = Number(normalized)
  if (!Number.isFinite(number)) throw new Error(`Valoare numerica invalida: ${value}`)
  return number
}

function parseDateValue(value) {
  const text = cleanText(value)
  if (!text) return ''

  const match = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (match) {
    const day = match[1].padStart(2, '0')
    const month = match[2].padStart(2, '0')
    return `${match[3]}-${month}-${day}`
  }

  const direct = new Date(text)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10)

  return text
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

module.exports = { parseDevizExcel, parseSituatieExcel, generateCantitatiExcel }
