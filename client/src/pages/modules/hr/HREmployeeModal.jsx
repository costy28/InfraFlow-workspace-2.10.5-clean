import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Badge from '../../../components/ui/Badge'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

function infoCnp(cnp) {
  const value = String(cnp || '').replace(/[^0-9]/g, '')
  if (!/^\d{13}$/.test(value)) return null
  const s = Number(value[0])
  const century = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000, 7: 2000, 8: 2000, 9: 1900 }[s]
  const year = century + Number(value.slice(1, 3))
  const month = Number(value.slice(3, 5))
  const day = Number(value.slice(5, 7))
  const birth = new Date(year, month - 1, day)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null
  let age = new Date().getFullYear() - year
  const now = new Date()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1
  return { sex: s % 2 ? 'M' : 'F', data_nasterii: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, varsta: age }
}

export default function HREmployeeModal({ open, form, departments, onClose, onSubmit, onChange }) {
  const employeeForm = form || {}
  const cnpInfo = infoCnp(employeeForm.cnp)
  const setEmployeeForm = next => onChange(next)
  const patchEmployeeForm = patch => onChange({ ...employeeForm, ...patch })

  return (
    <Modal open={open} title="Angajat nou" onClose={onClose} size="lg">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Input label="CNP" value={employeeForm.cnp} onChange={event => patchEmployeeForm({ cnp: event.target.value })} required />
        {cnpInfo ? (
          <div className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-800">
            Sex: {cnpInfo.sex} · Data nașterii: {cnpInfo.data_nasterii} · Vârsta: {cnpInfo.varsta}
          </div>
        ) : null}
        <div className="grid gap-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-3 text-xs font-semibold uppercase text-slate-500">📋 Date personale</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Nume" value={employeeForm.nume} onChange={event => patchEmployeeForm({ nume: event.target.value })} required />
              <Input label="Prenume" value={employeeForm.prenume} onChange={event => patchEmployeeForm({ prenume: event.target.value })} required />
              <Input label="Email intern" type="email" value={employeeForm.email} onChange={event => patchEmployeeForm({ email: event.target.value })} />
              <Input label="Telefon" value={employeeForm.telefon} onChange={event => patchEmployeeForm({ telefon: event.target.value })} />
              <Input label="Adresă" value={employeeForm.adresa} onChange={event => patchEmployeeForm({ adresa: event.target.value })} />
              <Select label="Stare civilă" value={employeeForm.stare_civila} onChange={event => patchEmployeeForm({ stare_civila: event.target.value })} options={[
                { value: '', label: 'Alege stare civilă' },
                { value: 'necasatorit', label: 'Necăsătorit(ă)' },
                { value: 'casatorit', label: 'Căsătorit(ă)' },
                { value: 'divortat', label: 'Divorțat(ă)' },
                { value: 'vaduv', label: 'Văduv(ă)' },
              ]} />
              <Input label="Copii în întreținere" type="number" value={employeeForm.nr_copii_intretinere} onChange={event => patchEmployeeForm({ nr_copii_intretinere: Number(event.target.value) })} />
              <Input label="Casa de sănătate" value={employeeForm.casa_sanatate} onChange={event => patchEmployeeForm({ casa_sanatate: event.target.value })} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Select label="Tip act" value={employeeForm.act_identitate_tip} onChange={event => patchEmployeeForm({ act_identitate_tip: event.target.value })} options={[
                { value: 'CI', label: 'CI' },
                { value: 'BI', label: 'BI' },
                { value: 'pasaport', label: 'Pașaport' },
                { value: 'permis_sedere', label: 'Permis ședere' },
              ]} />
              <Input label="Serie" maxLength={5} placeholder="NT" value={employeeForm.act_identitate_serie} onChange={event => patchEmployeeForm({ act_identitate_serie: event.target.value.toUpperCase().slice(0, 5) })} />
              <Input label="Număr" maxLength={10} placeholder="123456" value={employeeForm.act_identitate_numar} onChange={event => patchEmployeeForm({ act_identitate_numar: event.target.value.slice(0, 10) })} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Input label="Eliberat de" value={employeeForm.act_identitate_eliberat_de} onChange={event => patchEmployeeForm({ act_identitate_eliberat_de: event.target.value })} />
              <Input label="Data eliberării" type="date" value={employeeForm.act_identitate_data_eliberare} onChange={event => patchEmployeeForm({ act_identitate_data_eliberare: event.target.value })} />
            </div>
            <Input className="mt-3" label="Valabil până" type="date" value={employeeForm.act_identitate_valabil_pana} onChange={event => patchEmployeeForm({ act_identitate_valabil_pana: event.target.value })} />
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-3 text-xs font-semibold uppercase text-slate-500">💼 Date angajare</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Nr. marcă" value={employeeForm.marca} onChange={event => patchEmployeeForm({ marca: event.target.value })} required />
              <Input label="Funcția / Meseria" value={employeeForm.functia} onChange={event => patchEmployeeForm({ functia: event.target.value })} />
              <Input label="Cod COR" value={employeeForm.functie_cor} onChange={event => patchEmployeeForm({ functie_cor: event.target.value })} />
              <Select label="Nivel studii" value={employeeForm.nivel_studii} onChange={event => patchEmployeeForm({ nivel_studii: event.target.value })} options={[
                { value: '', label: 'Alege nivel' },
                { value: 'primar', label: 'Primar' },
                { value: 'gimnazial', label: 'Gimnazial' },
                { value: 'liceal', label: 'Liceal' },
                { value: 'postliceal', label: 'Postliceal' },
                { value: 'superior', label: 'Superior' },
              ]} />
              <Select label="Departament" value={employeeForm.department_id} onChange={event => patchEmployeeForm({ department_id: event.target.value })} options={[{ value: '', label: 'Alege departament' }, ...departments]} />
              <Select label="Tip contract" value={employeeForm.tip_contract} onChange={event => patchEmployeeForm({ tip_contract: event.target.value })} options={[
                { value: 'CIM_nedeterminat', label: 'CIM nedeterminat' },
                { value: 'CIM_determinat', label: 'CIM determinat' },
                { value: 'PFA', label: 'PFA' },
                { value: 'colaborare', label: 'Colaborare' },
              ]} />
              <Input label="Data angajării" type="date" value={employeeForm.data_angajare} onChange={event => patchEmployeeForm({ data_angajare: event.target.value })} />
              <Input label="Expiră contract" type="date" value={employeeForm.data_expirare_contract} onChange={event => patchEmployeeForm({ data_expirare_contract: event.target.value })} />
              <Input label="Normă ore/zi" type="number" value={employeeForm.norma_ore_zi} onChange={event => patchEmployeeForm({ norma_ore_zi: Number(event.target.value) })} />
              <Input label="Zile CO / an" type="number" value={employeeForm.zile_co_drept} onChange={event => patchEmployeeForm({ zile_co_drept: Number(event.target.value) })} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">💰 Date financiare <Badge tone="warning" size="sm">Confidențial</Badge></div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="IBAN" value={employeeForm.iban} onChange={event => patchEmployeeForm({ iban: event.target.value })} />
              <Input label="Deducere personală" type="number" value={employeeForm.deducere_personala} onChange={event => patchEmployeeForm({ deducere_personala: event.target.value })} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-3 text-xs font-semibold uppercase text-slate-500">📄 Documente & Expirări</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Categorii permis" value={employeeForm.permis_conducere_categorii} onChange={event => patchEmployeeForm({ permis_conducere_categorii: event.target.value })} />
              <Input label="Permis expiră" type="date" value={employeeForm.permis_conducere_expira} onChange={event => patchEmployeeForm({ permis_conducere_expira: event.target.value, data_expirare_permis: event.target.value })} />
              <Input label="Apt medical expiră" type="date" value={employeeForm.apt_medical_expira} onChange={event => patchEmployeeForm({ apt_medical_expira: event.target.value, adeverinta_medicala: event.target.value })} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-3 text-xs font-semibold uppercase text-slate-500">✅ GDPR</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={employeeForm.acord_gdpr} onChange={event => patchEmployeeForm({ acord_gdpr: event.target.checked, data_acord_gdpr: event.target.checked ? (employeeForm.data_acord_gdpr || new Date().toISOString().slice(0,10)) : '' })} />
                Acord GDPR
              </label>
              <Input label="Data acord GDPR" type="date" value={employeeForm.data_acord_gdpr} onChange={event => patchEmployeeForm({ data_acord_gdpr: event.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={employeeForm.activ} onChange={event => setEmployeeForm({ ...employeeForm, activ: event.target.checked })} /> Activ</label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Renunță</Button>
          <Button type="submit">Salvează</Button>
        </div>
      </form>
    </Modal>
  )
}
