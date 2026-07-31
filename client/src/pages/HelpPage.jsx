import { useState } from 'react'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'

const sections = [
  {
    title: '📦 PRODUCȚIE / OPERAȚIUNI',
    items: [
      ['Cum înregistrezi un consum operațional?', ['Deschide Producție / Operațiuni.', 'Alege tabul Consumuri.', 'Apasă Adaugă consum nou și completează rețeta, cantitatea și lucrarea.']],
      ['Cum creezi o rețetă nouă?', ['Deschide tabul Rețete.', 'Apasă Adaugă nou.', 'Completează componentele și salvează.']],
      ['Cum gestionezi planurile de producție?', ['Intră în tabul Planuri.', 'Alege perioada.', 'Adaugă sau actualizează cantitățile planificate.']],
    ],
  },
  {
    title: '📦 STOCURI',
    items: [
      ['Cum funcționează stocurile per departament?', ['Gestionarul vede stocul central.', 'Departamentele văd doar stocul propriu.', 'Transferurile mută material din central către departament.']],
      ['Cum faci un transfer de materiale?', ['Intră în Stocuri, tab Transferuri.', 'Alege materialul, cantitatea și departamentul destinatar.', 'Salvează transferul.']],
      ['Cum înregistrezi o intrare de stoc?', ['Intră în Mișcări stoc.', 'Alege tip intrare.', 'Completează materialul, cantitatea și motivul.']],
    ],
  },
  {
    title: '🚗 PARC & RESURSE',
    items: [
      ['Cum adaugi o resursă nouă?', ['Deschide Parc & Resurse.', 'Apasă Resursă nouă.', 'Completează datele și salvează.']],
      ['Cum înregistrezi o solicitare de resursă?', ['Intră în tabul Solicitări.', 'Apasă Solicitare nouă.', 'Alege resursa, punctul de lucru și perioada.']],
      ['Cum faci raportul zilnic?', ['Intră în Raport zilnic.', 'Alege resursa și data.', 'Completează orele, kilometrii/indicatorii și combustibilul dacă se aplică.']],
    ],
  },
  {
    title: '👥 HR',
    items: [
      ['Cum adaugi un angajat?', ['Intră în HR, tab Angajați.', 'Apasă Angajat nou.', 'Completează CNP, nume, marcă, funcție și departament.']],
      ['Cum completezi pontajul?', ['Intră în HR, tab Pontaj.', 'Alege luna și departamentul.', 'Completează zilele, apoi marchează pontajul ca finalizat.']],
      ['Cum trimiți reminder pentru pontaj?', ['Intră în Overview pontaje.', 'Setează termenul limită.', 'Apasă Trimite reminder nedefinalizați.']],
    ],
  },
  {
    title: '❄️ DESZĂPEZIRE',
    items: [
      ['Cum configurezi sezonul?', ['Intră în Deszăpezire, tab Configurare.', 'Creează sezonul și importă sectoarele.', 'Verifică rețetele de material.']],
      ['Cum completezi jurnalul zilnic?', ['Intră în Jurnal zilnic.', 'Apasă Jurnal nou.', 'Completează vremea, intervențiile, stocurile și observațiile.']],
      ['Cum generezi raportul lunar?', ['Intră în Raport lunar.', 'Alege sezonul și luna.', 'Apasă Generează raport.']],
    ],
  },
  {
    title: '📋 DOCUMENTE',
    items: [
      ['Cum lansezi un document în circuit?', ['Intră în Documente.', 'Creează documentul ca draft.', 'Apasă Lansează în circuit.']],
      ['Cum aprobi/respingi un document?', ['Deschide Inbox.', 'Alege documentul.', 'Apasă Aprobă sau Respinge și completează comentariul dacă este necesar.']],
    ],
  },
  {
    title: '💬 MESAJE',
    items: [
      ['Cum trimiți un mesaj în canal?', ['Intră în Mesaje.', 'Alege canalul.', 'Scrie mesajul și apasă Trimite.']],
      ['Cum creezi o conversație directă?', ['Apasă canal nou.', 'Alege utilizatorii.', 'Trimite primul mesaj.']],
    ],
  },
  {
    title: '🎫 SESIZĂRI',
    items: [
      ['Cum creezi o sesizare?', ['Intră în Sesizări.', 'Apasă Sesizare nouă.', 'Completează tipul, prioritatea, titlul și descrierea.']],
      ['Cum atașezi documente?', ['În formularul sesizării apasă Atașează documente/poze.', 'Alege fișierele.', 'Salvează sesizarea sau comentariul.']],
    ],
  },
  {
    title: '⚙️ SETĂRI',
    items: [
      ['Cum adaugi un utilizator nou?', ['Intră în Setări, tab Utilizatori.', 'Apasă Utilizator nou.', 'Completează numele, username-ul, parola, rolul și departamentul.']],
      ['Cum activezi/dezactivezi module?', ['Intră în Setări, tab Module.', 'Pornește sau oprește modulele dorite.', 'Apasă Salvează module.']],
      ['Cum configurez emailul?', ['Intră în Setări, tab General.', 'Completează serverul SMTP, portul, utilizatorul și parola.', 'Testează configurarea, apoi salvează.']],
    ],
  },
]

export default function HelpPage() {
  const [open, setOpen] = useState('📦 PRODUCȚIE')

  return (
    <div className="grid gap-4">
      <PageHeader title="Ghid de utilizare InfraFlow" subtitle="Pași simpli pentru operațiunile uzuale din fiecare modul." />
      {sections.map(section => (
        <Card key={section.title}>
          <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === section.title ? '' : section.title)}>
            <span className="text-lg font-semibold text-slate-900">{section.title}</span>
            <span className="text-slate-400">{open === section.title ? '−' : '+'}</span>
          </button>
          {open === section.title ? (
            <div className="mt-4 grid gap-3">
              {section.items.map(([question, steps]) => (
                <div key={question} className="rounded-lg border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">{question}</div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                    {steps.map(step => <li key={step}>{step}</li>)}
                  </ol>
                  <div className="mt-3 rounded border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">Screenshot de adăugat ulterior.</div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  )
}
