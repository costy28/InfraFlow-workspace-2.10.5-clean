import ControllingPage from '../modules/ControllingPage'
import { AccountingShell } from './accounting-shared'

export default function ContabilitateControlling() {
  return (
    <AccountingShell active="controlling" title="Controlling" subtitle="Centre de cost, bugete si analiza cheltuielilor in zona financiar-contabila.">
      <ControllingPage />
    </AccountingShell>
  )
}
