function calcVarsta(dataNasterii) {
  const birth = new Date(dataNasterii)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  const beforeBirthday = now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  if (beforeBirthday) years -= 1
  return years
}

function infoCNP(cnpInput) {
  const cnp = String(cnpInput || '').replace(/[^0-9]/g, '')
  if (!/^\d{13}$/.test(cnp)) return { valid: false, eroare: 'CNP-ul trebuie sa aiba 13 cifre.' }

  const sexCentury = Number(cnp[0])
  const centuryMap = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000, 7: 2000, 8: 2000, 9: 1900 }
  const century = centuryMap[sexCentury]
  if (!century) return { valid: false, eroare: 'Prima cifra din CNP este invalida.' }

  const year = century + Number(cnp.slice(1, 3))
  const month = Number(cnp.slice(3, 5))
  const day = Number(cnp.slice(5, 7))
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { valid: false, eroare: 'Data nasterii din CNP este invalida.' }
  }

  const weights = '279146358279'.split('').map(Number)
  const sum = weights.reduce((total, weight, index) => total + weight * Number(cnp[index]), 0)
  const control = sum % 11 === 10 ? 1 : sum % 11
  if (control !== Number(cnp[12])) return { valid: false, eroare: 'Cifra de control CNP este invalida.' }

  const dataNasterii = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return {
    valid: true,
    cnp,
    sex: sexCentury % 2 === 1 ? 'M' : 'F',
    data_nasterii: dataNasterii,
    varsta: calcVarsta(dataNasterii)
  }
}

function valideazaCNP(cnp) {
  return infoCNP(cnp)
}

module.exports = { valideazaCNP, infoCNP }
