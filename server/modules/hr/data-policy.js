const PERSONAL_FIELDS = [
  "cnp", "adresa", "stare_civila", "nr_copii_intretinere", "iban", "deducere_personala",
  "act_identitate_tip", "act_identitate_serie", "act_identitate_numar", "act_identitate_eliberat_de",
  "act_identitate_data_eliberare", "act_identitate_valabil_pana", "data_nasterii", "photo_url"
];
const MEDICAL_FIELDS = ["casa_sanatate", "apt_medical_expira", "adeverinta_medicala"];
const CONTACT_FIELDS = ["email", "telefon"];
const SALARY_FIELDS = ["salariu_baza", "cost_ora"];

function sanitizeContract(contract, access = {}) {
  const result = { ...contract };
  if (!access.own && !access.salary) SALARY_FIELDS.forEach(field => delete result[field]);
  return result;
}

const MEDICAL_LEAVE_FIELDS = ['medical_certificate_uuid', 'certificat_serie', 'certificat_numar', 'zile_calendaristice', 'cod_indemnizatie', 'cod_diagnostic', 'medic_nume', 'cod_parafa', 'unitate_emitenta', 'medical_rejection_reason'];

function sanitizeLeave(leave, access = {}) {
  const result = { ...leave };
  if (!access.own && !access.medical) {
    MEDICAL_LEAVE_FIELDS.forEach(field => delete result[field]);
    if (String(leave.tip || '').toUpperCase() === 'CM') delete result.motiv;
  }
  return result;
}

function sanitizeEmployee(employee, access = {}) {
  const result = { ...employee };
  const own = Boolean(access.own);
  if (!own && !access.personal) PERSONAL_FIELDS.forEach((field) => delete result[field]);
  if (!own && !access.medical) MEDICAL_FIELDS.forEach((field) => delete result[field]);
  if (!own && !access.contact) CONTACT_FIELDS.forEach((field) => delete result[field]);
  if (!own && !access.salary) SALARY_FIELDS.forEach(field => delete result[field]);
  return result;
}

function employeeWritePermissions(body) {
  const rights = [];
  if (Object.prototype.hasOwnProperty.call(body, 'user_id')) rights.push('users:manage');
  if (PERSONAL_FIELDS.some(field => Object.prototype.hasOwnProperty.call(body, field))) rights.push('hr:personal_sensitive');
  if (MEDICAL_FIELDS.some(field => Object.prototype.hasOwnProperty.call(body, field))) rights.push('hr:medical_view');
  if (SALARY_FIELDS.some(field => Object.prototype.hasOwnProperty.call(body, field))) rights.push('hr:salary_view');
  return rights;
}

module.exports = { sanitizeEmployee, sanitizeContract, sanitizeLeave, employeeWritePermissions, PERSONAL_FIELDS, MEDICAL_FIELDS, CONTACT_FIELDS };
