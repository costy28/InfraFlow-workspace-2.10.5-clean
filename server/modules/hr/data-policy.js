const PERSONAL_FIELDS = [
  "cnp", "adresa", "stare_civila", "nr_copii_intretinere", "iban", "deducere_personala",
  "act_identitate_tip", "act_identitate_serie", "act_identitate_numar", "act_identitate_eliberat_de",
  "act_identitate_data_eliberare", "act_identitate_valabil_pana", "data_nasterii"
];
const MEDICAL_FIELDS = ["casa_sanatate", "apt_medical_expira", "adeverinta_medicala"];
const CONTACT_FIELDS = ["email", "telefon"];

function sanitizeEmployee(employee, access = {}) {
  const result = { ...employee };
  const own = Boolean(access.own);
  if (!own && !access.personal) PERSONAL_FIELDS.forEach((field) => delete result[field]);
  if (!own && !access.medical) MEDICAL_FIELDS.forEach((field) => delete result[field]);
  if (!own && !access.contact) CONTACT_FIELDS.forEach((field) => delete result[field]);
  if (!own && !access.salary) delete result.salariu_baza;
  return result;
}

module.exports = { sanitizeEmployee, PERSONAL_FIELDS, MEDICAL_FIELDS, CONTACT_FIELDS };
