const integrationPorts = Object.freeze({
  inventory: Object.freeze({ name: 'inventory', purpose: 'rezervare și verificare disponibilitate', implemented: false }),
  procurement: Object.freeze({ name: 'procurement', purpose: 'necesar de aprovizionare din comandă confirmată', implemented: false }),
  accounting: Object.freeze({ name: 'accounting', purpose: 'legare opțională de terț și document contabil', implemented: false }),
  documents: Object.freeze({ name: 'documents', purpose: 'dosar documentar pentru ofertă și comandă', implemented: false }),
  tasks: Object.freeze({ name: 'tasks', purpose: 'follow-up și acțiuni viitoare', implemented: false }),
  workflow: Object.freeze({ name: 'workflow', purpose: 'lansare controlată în circuit', implemented: false }),
  billing: Object.freeze({ name: 'billing', purpose: 'proformă/factură prin provider extern', implemented: false })
})

function unavailablePort(port) {
  return Object.freeze({
    ...integrationPorts[port],
    invoke() {
      const error = new Error(`Portul CRM ${port} nu este implementat în Sprintul 1.`)
      error.code = 'CRM_PORT_NOT_IMPLEMENTED'
      error.status = 501
      throw error
    }
  })
}

module.exports = { integrationPorts, unavailablePort }
