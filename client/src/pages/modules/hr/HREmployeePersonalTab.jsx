import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Badge from '../../../components/ui/Badge'

const identityTypeOptions = [
  { value: 'CI', label: 'CI' },
  { value: 'BI', label: 'BI' },
  { value: 'pasaport', label: 'Pașaport' },
  { value: 'permis_sedere', label: 'Permis ședere' },
]

const civilStatusOptions = [
  { value: '', label: 'Necunoscută' },
  { value: 'necasatorit', label: 'Necăsătorit(ă)' },
  { value: 'casatorit', label: 'Căsătorit(ă)' },
  { value: 'divortat', label: 'Divorțat(ă)' },
  { value: 'vaduv', label: 'Văduv(ă)' },
]

const educationOptions = [
  { value: '', label: 'Alege nivel' },
  { value: 'primar', label: 'Primar' },
  { value: 'gimnazial', label: 'Gimnazial' },
  { value: 'liceal', label: 'Liceal' },
  { value: 'postliceal', label: 'Postliceal' },
  { value: 'superior', label: 'Superior' },
]

const adeverintaOptions = [
  { value: 'salariat', label: 'Adeverință salariat' },
  { value: 'venit', label: 'Adeverință venit' },
  { value: 'vechime', label: 'Adeverință vechime' },
  { value: 'casa_sanatate', label: 'Adeverință casă sănătate' },
  { value: 'concediu_medical', label: 'Adeverință concediu medical' },
  { value: 'functie', label: 'Adeverință funcție' },
]

export default function HREmployeePersonalTab({
  adeverintaData,
  adeverintaTip,
  alertTone,
  coBalance,
  daysUntil,
  departments,
  editForm,
  editMode,
  employee,
  identityText,
  linkableUsers,
  onAdeverintaTipChange,
  onEditFormChange,
  onLoadAdeverinta,
  onPrintAdeverinta,
}) {
  if (editMode) {
    return (
      <HREmployeePersonalEditForm
        departments={departments}
        editForm={editForm}
        employee={employee}
        linkableUsers={linkableUsers}
        onEditFormChange={onEditFormChange}
      />
    )
  }

  return (
    <HREmployeePersonalSummary
      adeverintaData={adeverintaData}
      adeverintaTip={adeverintaTip}
      alertTone={alertTone}
      coBalance={coBalance}
      daysUntil={daysUntil}
      employee={employee}
      identityText={identityText}
      onAdeverintaTipChange={onAdeverintaTipChange}
      onLoadAdeverinta={onLoadAdeverinta}
      onPrintAdeverinta={onPrintAdeverinta}
    />
  )
}

function HREmployeePersonalEditForm({ departments, editForm, employee, linkableUsers, onEditFormChange }) {
  const patchForm = values => onEditFormChange({ ...editForm, ...values })

  return (
    <div className="grid gap-4">
      {(employee.sursa === 'autominder' || employee.sursa_autominder) && !employee.cnp && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          ⚠️ Angajat importat din <strong>Autominder</strong>. Completează datele HR lipsă (CNP, IBAN, contract etc.) pentru a activa toate funcționalitățile.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-3 text-xs font-semibold uppercase text-slate-500">📋 Date personale</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nume" value={editForm.nume || ''} onChange={event => patchForm({ nume: event.target.value })} />
          <Input label="Prenume" value={editForm.prenume || ''} onChange={event => patchForm({ prenume: event.target.value })} />
          <Input
            label="CNP *"
            maxLength={13}
            value={editForm.cnp || ''}
            onChange={event => patchForm({ cnp: event.target.value })}
            className={!editForm.cnp ? 'border-yellow-400 bg-yellow-50' : ''}
            placeholder={!editForm.cnp ? 'Completează CNP (obligatoriu)' : ''}
          />
          <Input label="Nr. marcă" value={editForm.marca || ''} onChange={event => patchForm({ marca: event.target.value })} />
          <Input
            label="Email"
            type="email"
            value={editForm.email || ''}
            onChange={event => patchForm({ email: event.target.value })}
            className={!editForm.email ? 'border-yellow-300 bg-yellow-50' : ''}
            placeholder={!editForm.email ? 'Completează email' : ''}
          />
          <Input
            label="Telefon"
            value={editForm.telefon || ''}
            onChange={event => patchForm({ telefon: event.target.value })}
            className={!editForm.telefon ? 'border-yellow-300 bg-yellow-50' : ''}
            placeholder={!editForm.telefon ? 'Completează telefon' : ''}
          />
          <Input label="Adresă" value={editForm.adresa || ''} onChange={event => patchForm({ adresa: event.target.value })} />
          <Select label="Stare civilă" value={editForm.stare_civila || ''} onChange={event => patchForm({ stare_civila: event.target.value })} options={civilStatusOptions} />
          <Input label="Copii în întreținere" type="number" value={editForm.nr_copii_intretinere ?? 0} onChange={event => patchForm({ nr_copii_intretinere: Number(event.target.value) })} />
          <Input label="Casa de sănătate" value={editForm.casa_sanatate || ''} onChange={event => patchForm({ casa_sanatate: event.target.value })} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Select label="Tip act" value={editForm.act_identitate_tip || 'CI'} onChange={event => patchForm({ act_identitate_tip: event.target.value })} options={identityTypeOptions} />
          <Input label="Serie" maxLength={5} placeholder="NT" value={editForm.act_identitate_serie || ''} onChange={event => patchForm({ act_identitate_serie: event.target.value.toUpperCase().slice(0, 5) })} />
          <Input label="Număr" maxLength={10} placeholder="123456" value={editForm.act_identitate_numar || ''} onChange={event => patchForm({ act_identitate_numar: event.target.value.slice(0, 10) })} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Eliberat de" value={editForm.act_identitate_eliberat_de || ''} onChange={event => patchForm({ act_identitate_eliberat_de: event.target.value })} />
          <Input label="Data eliberării" type="date" value={editForm.act_identitate_data_eliberare || ''} onChange={event => patchForm({ act_identitate_data_eliberare: event.target.value })} />
        </div>
        <Input className="mt-3" label="Valabil până" type="date" value={editForm.act_identitate_valabil_pana || ''} onChange={event => patchForm({ act_identitate_valabil_pana: event.target.value })} />
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-3 text-xs font-semibold uppercase text-slate-500">💼 Date angajare</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Funcția" value={editForm.functia || ''} onChange={event => patchForm({ functia: event.target.value })} />
          <Input label="Cod COR" value={editForm.functie_cor || ''} onChange={event => patchForm({ functie_cor: event.target.value })} />
          <Select label="Departament" value={String(editForm.department_id || '')} onChange={event => patchForm({ department_id: event.target.value })} options={[{ value: '', label: 'Alege departament' }, ...departments]} />
          <Select label="Cont aplicatie / Kiosk" value={String(editForm.user_id || '')} onChange={event => patchForm({ user_id: event.target.value })} options={[{ value: '', label: 'Fara cont asociat' }, ...linkableUsers.map(account => ({ value: String(account.id), label: `${account.name || account.username} (${account.username})` }))]} />
          <Select label="Nivel studii" value={editForm.nivel_studii || ''} onChange={event => patchForm({ nivel_studii: event.target.value })} options={educationOptions} />
          <Input label="Normă ore/zi" type="number" value={editForm.norma_ore_zi ?? 8} onChange={event => patchForm({ norma_ore_zi: Number(event.target.value) })} />
          <Input label="Zile CO / an" type="number" value={editForm.zile_co_drept ?? 21} onChange={event => patchForm({ zile_co_drept: Number(event.target.value) })} />
          <Input label="Expiră contract" type="date" value={editForm.data_expirare_contract || ''} onChange={event => patchForm({ data_expirare_contract: event.target.value })} />
        </div>
        {String(editForm.department_id || '') !== String(employee.department_id || '') ? (
          <div className="mt-3 grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-2">
            <Input label="Data transferului" type="date" value={editForm.department_transfer_date || ''} onChange={event => patchForm({ department_transfer_date: event.target.value })} required />
            <Input label="Motiv transfer" value={editForm.department_transfer_reason || ''} onChange={event => patchForm({ department_transfer_reason: event.target.value })} placeholder="Transfer intern, reorganizare..." required />
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">💰 Date financiare <Badge tone="warning" size="sm">Confidențial</Badge></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="IBAN"
            value={editForm.iban || ''}
            onChange={event => patchForm({ iban: event.target.value })}
            className={!editForm.iban ? 'border-yellow-300 bg-yellow-50' : ''}
            placeholder={!editForm.iban ? 'RO49AAAA1B31007593840000' : ''}
          />
          <Input label="Salariu bază (RON)" type="number" value={editForm.salariu_baza || ''} onChange={event => patchForm({ salariu_baza: event.target.value })} />
          <Input label="Deducere personală" type="number" value={editForm.deducere_personala || ''} onChange={event => patchForm({ deducere_personala: event.target.value })} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-3 text-xs font-semibold uppercase text-slate-500">📄 Documente & Expirări</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Categorii permis" value={editForm.permis_conducere_categorii || ''} onChange={event => patchForm({ permis_conducere_categorii: event.target.value })} />
          <Input label="Permis expiră" type="date" value={editForm.permis_conducere_expira || editForm.data_expirare_permis || ''} onChange={event => patchForm({ permis_conducere_expira: event.target.value, data_expirare_permis: event.target.value })} />
          <Input label="Expiră ISCIR" type="date" value={editForm.data_expirare_iscir || ''} onChange={event => patchForm({ data_expirare_iscir: event.target.value })} />
          <Input label="Apt medical expiră" type="date" value={editForm.apt_medical_expira || editForm.adeverinta_medicala || ''} onChange={event => patchForm({ apt_medical_expira: event.target.value, adeverinta_medicala: event.target.value })} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-3 text-xs font-semibold uppercase text-slate-500">✅ GDPR</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(editForm.acord_gdpr)} onChange={event => patchForm({ acord_gdpr: event.target.checked, data_acord_gdpr: event.target.checked ? (editForm.data_acord_gdpr || new Date().toISOString().slice(0,10)) : '' })} />
            Acord GDPR
          </label>
          <Input label="Data acord GDPR" type="date" value={editForm.data_acord_gdpr || ''} onChange={event => patchForm({ data_acord_gdpr: event.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editForm.activ !== false} onChange={event => patchForm({ activ: event.target.checked })} />
            Angajat activ
          </label>
        </div>
      </div>
    </div>
  )
}

function HREmployeePersonalSummary({
  adeverintaData,
  adeverintaTip,
  alertTone,
  coBalance,
  daysUntil,
  employee,
  identityText,
  onAdeverintaTipChange,
  onLoadAdeverinta,
  onPrintAdeverinta,
}) {
  const requiredDocuments = [
    { label: 'Permis conducere', date: employee.permis_conducere_expira || employee.data_expirare_permis },
    { label: 'ISCIR', date: employee.data_expirare_iscir },
    { label: 'Apt medical', date: employee.apt_medical_expira || employee.adeverinta_medicala },
  ]

  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <div className="rounded-lg bg-slate-50 p-3">
        <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Date personale</div>
        <div>Data nașterii: {employee.data_nasterii || '-'}</div>
        <div>Sex: {employee.sex || '-'}</div>
        <div>Stare civilă: {employee.stare_civila || '-'}</div>
        <div>Copii întreținere: {employee.nr_copii_intretinere ?? 0}</div>
        <div>Casa sănătate: {employee.casa_sanatate || '-'}</div>
        <div>Act identitate: {identityText(employee)}</div>
        <div>Valabil act: {employee.act_identitate_valabil_pana || '-'}</div>
        <div>Adresă: {employee.adresa || '-'}</div>
      </div>

      <div className="rounded-lg bg-slate-50 p-3">
        <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Contract &amp; CO</div>
        <div>Tip: {employee.tip_contract || '-'}</div>
        <div>Data angajare: {employee.data_angajare || '-'}</div>
        <div>Cod COR: {employee.functie_cor || '-'}</div>
        <div>Normă: {employee.norma_ore_zi || 8} ore/zi</div>
        <div>Expiră contract: {employee.data_expirare_contract || '—'}</div>
        <div className="mt-2 font-semibold text-primary-700">
          CO {new Date().getFullYear()}: {coBalance ? `${coBalance.zile_ramase} zile rămase` : `${employee.zile_co_drept ?? 21} / an`}
        </div>
        {coBalance ? (
          <div className="mt-1">
            <div className="mb-1 text-xs text-slate-500">{coBalance.zile_efectuate} efectuate din {coBalance.zile_drept} totale</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-primary-500 transition-all" style={{ width: `${Math.min(100, Math.round(coBalance.zile_efectuate / Math.max(1, coBalance.zile_drept) * 100))}%` }} />
            </div>
          </div>
        ) : null}
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onLoadAdeverinta(employee.id)}>📄 Generează adeverință</Button>
        </div>
        {adeverintaData && String(adeverintaData.angajat?.id) === String(employee.id) ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Select label="" value={adeverintaTip} onChange={event => onAdeverintaTipChange(event.target.value)} options={adeverintaOptions} />
            <Button size="sm" onClick={() => onPrintAdeverinta(adeverintaData)}>🖨️ Print</Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg bg-slate-50 p-3">
        <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Documente obligatorii</div>
        {requiredDocuments.map(document => {
          const days = daysUntil(document.date)
          const tone = alertTone(days)
          return (
            <div key={document.label} className={`flex items-center justify-between ${tone === 'danger' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : ''}`}>
              <span>{document.label}:</span>
              <span>{document.date || '—'}{tone ? (days < 0 ? ' ⛔' : ' ⚠️') : ''}</span>
            </div>
          )
        })}
      </div>

      <div className="rounded-lg bg-slate-50 p-3">
        <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Statistici pontaj</div>
        <div>Zile pontate: {employee.statistici_pontaj?.zile_pontate ?? 0}</div>
        <div>Ore total: {employee.statistici_pontaj?.ore_total ?? 0}</div>
        <div>Autorizații: {(employee.autorizatii || []).length}</div>
        <div>Contracte active: {(employee.contracte_active || []).length}</div>
      </div>
    </div>
  )
}
