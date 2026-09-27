class BillingProvider {
  validateConnection() { return this.unsupported('validateConnection') }
  createProforma() { return this.unsupported('createProforma') }
  createInvoice() { return this.unsupported('createInvoice') }
  getDocumentStatus() { return this.unsupported('getDocumentStatus') }
  unsupported(operation) {
    return { ok: false, supported: false, code: 'CRM_BILLING_PROVIDER_NOT_CONFIGURED', operation, message: 'Nu este configurat un provider de facturare pentru CRM.' }
  }
}

module.exports = { BillingProvider }
