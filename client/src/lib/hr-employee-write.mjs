const groups = {
  'users:manage': ['user_id'],
  'hr:personal_sensitive': ['cnp', 'adresa', 'stare_civila', 'nr_copii_intretinere', 'iban', 'deducere_personala', 'act_identitate_tip', 'act_identitate_serie', 'act_identitate_numar', 'act_identitate_eliberat_de', 'act_identitate_data_eliberare', 'act_identitate_valabil_pana', 'data_nasterii', 'photo_url'],
  'hr:medical_view': ['casa_sanatate', 'apt_medical_expira', 'adeverinta_medicala'],
  'hr:salary_view': ['salariu_baza', 'cost_ora'],
}
export function canWriteEmployeeField(field, hasPermission) {
  return Object.entries(groups).every(([permission, fields]) => !fields.includes(field) || hasPermission(permission))
}
export function employeeWritePayload(body, hasPermission) {
  return Object.fromEntries(Object.entries(body).filter(([field]) => canWriteEmployeeField(field, hasPermission)))
}
