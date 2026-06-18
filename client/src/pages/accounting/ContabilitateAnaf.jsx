import AnafPage from '../modules/AnafPage'
import { AccountingShell } from './accounting-shared'

export default function ContabilitateAnaf() {
  return (
    <AccountingShell active="anaf" title="ANAF / e-Factura" subtitle="Cautare CIF, parteneri si documente fiscale in zona contabila.">
      <AnafPage />
    </AccountingShell>
  )
}
