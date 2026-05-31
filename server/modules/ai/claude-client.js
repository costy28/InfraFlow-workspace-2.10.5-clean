const Anthropic = require('@anthropic-ai/sdk')

// Creează clientul cu cheia din parametru (nu din .env global)
function getClient(apiKey) {
  return new Anthropic({ apiKey })
}

async function generateSQL(intrebare, schema, userContext, apiKey) {
  const client = getClient(apiKey)
  const response = await client.messages.create({
    model: userContext.model || 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `Ești un asistent pentru sistemul InfraFlow al companiei
${userContext.companyName || 'companiei'}.
Schema bazei de date disponibile:
${schema}

Utilizatorul are rolul: ${userContext.rol || 'operator'}

REGULI STRICTE:
1. Generează DOAR query SQL valid pentru SQL Server (MSSQL)
2. Filtrează ÎNTOTDEAUNA datele — nu returna date sensibile inutile
3. Nu genera NICIODATĂ: INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, EXEC
4. Limitează rezultatele la maxim 100 rânduri (adaugă TOP 100)
5. Returnează DOAR JSON valid, fără text suplimentar, fără markdown

Format răspuns JSON:
{ "sql": "SELECT TOP 100 ...", "explicatie": "Ce face query-ul în română" }`,
    messages: [{ role: 'user', content: intrebare }]
  })

  const text = response.content[0].text
  try {
    return JSON.parse(text)
  } catch {
    // Încearcă să extragă JSON din răspuns
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Răspuns invalid de la AI: ' + text.slice(0, 100))
  }
}

async function formatResponse(intrebare, date, userContext, apiKey) {
  const client = getClient(apiKey)
  const response = await client.messages.create({
    model: userContext.model || 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `Ești asistentul InfraFlow pentru ${userContext.companyName || 'companie'}.
Răspunde în română, concis și clar.
Dacă datele sunt tabelare (array cu obiecte), formatează ca listă scurtă.
Dacă sunt puține valori, răspunde în propoziții simple.
Sugerează maxim 2 acțiuni posibile la final, pe rândul "💡 Sugestii: ..."
Nu repeta întrebarea. Nu folosi markdown complex.`,
    messages: [{
      role: 'user',
      content: `Întrebarea: ${intrebare}\nDatele: ${JSON.stringify(date).slice(0, 2000)}`
    }]
  })
  return response.content[0].text
}

async function answerHelp(intrebare, apiKey) {
  const client = getClient(apiKey)
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `Ești expertul în aplicația InfraFlow ERP pentru servicii publice românești.
Explică în română, pas cu pas, cum se face acțiunea cerută.
Fii concis. Dacă nu știi exact, spune că utilizatorul poate contacta suportul.`,
    messages: [{ role: 'user', content: intrebare }]
  })
  return response.content[0].text
}

function validateSQL(sql) {
  const forbidden = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP',
    'TRUNCATE', 'ALTER', 'CREATE', 'EXEC',
    'EXECUTE', 'OPENROWSET', 'BULK', 'MERGE'
  ]
  const upperSQL = sql.toUpperCase()
  for (const kw of forbidden) {
    // Verifică că cuvântul e întreg (nu parte din alt cuvânt)
    const regex = new RegExp(`\\b${kw}\\b`)
    if (regex.test(upperSQL)) {
      throw new Error(`Operație interzisă detectată în SQL: ${kw}`)
    }
  }
  return true
}

async function testConnection(apiKey) {
  const start = Date.now()
  const client = getClient(apiKey)
  await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'test' }]
  })
  return { ok: true, latenta_ms: Date.now() - start }
}

module.exports = {
  generateSQL, formatResponse,
  answerHelp, validateSQL, testConnection
}
