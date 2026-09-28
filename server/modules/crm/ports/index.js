const { checkAvailability } = require('./inventory')
const { createRequirementsFromCrmOrder } = require('../../procurement/crm-port')
const { createProforma, createInvoiceDraft } = require('./billing')

const integrationPorts = Object.freeze({
  inventory: Object.freeze({ name: 'inventory', purpose: 'verificare informativă a disponibilității, fără rezervare automată', implemented: true, invoke: checkAvailability }),
  procurement: Object.freeze({ name: 'procurement', purpose: 'necesar de aprovizionare din deficit confirmat, fără comandă automată către furnizor', implemented: true, invoke: createRequirementsFromCrmOrder }),
  accounting: Object.freeze({ name: 'accounting', purpose: 'factură draft internă, legată de terțul contabil al clientului', implemented: true }),
  documents: Object.freeze({ name: 'documents', purpose: 'dosar documentar pentru ofertă și comandă', implemented: false }),
  tasks: Object.freeze({ name: 'tasks', purpose: 'follow-up și acțiuni viitoare', implemented: false }),
  workflow: Object.freeze({ name: 'workflow', purpose: 'lansare controlată în circuit', implemented: false }),
  billing: Object.freeze({ name: 'billing', purpose: 'proformă internă și factură draft în Contabilitate, fără validare sau e-Factura automată', implemented: true, createProforma, createInvoiceDraft })
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

module.exports = { integrationPorts, unavailablePort, inventoryPort: integrationPorts.inventory, procurementPort: integrationPorts.procurement, billingPort: integrationPorts.billing }
