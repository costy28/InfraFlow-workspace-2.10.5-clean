import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

const variableGroups = [
  {
    label: 'FIRMĂ',
    items: [
      ['firma', 'Denumire societate'],
      ['cui', 'CUI societate'],
      ['adresa', 'Adresă sediu'],
      ['telefon', 'Telefon'],
      ['data_document', 'Data curentă'],
    ],
  },
  {
    label: 'ANGAJAT',
    items: [
      ['angajat_nume', 'Nume și prenume'],
      ['angajat_marca', 'Marca angajat'],
      ['angajat_functie', 'Funcția'],
      ['angajat_departament', 'Departament'],
      ['data_angajare', 'Data angajării'],
      ['salariu_net', 'Salariu net'],
      ['nr_zile_co', 'Zile CO rămase'],
    ],
  },
  {
    label: 'DOCUMENT',
    items: [
      ['nr_document', 'Numărul documentului'],
      ['data_emitere', 'Data emiterii'],
      ['valabil_pana', 'Valabilitate'],
    ],
  },
  {
    label: 'SEMNĂTURI',
    items: [
      ['semnatura_director', 'Bloc semnătură director'],
      ['semnatura_hr', 'Bloc semnătură HR'],
      ['stampila', 'Spațiu ștampilă'],
    ],
  },
]

const previewValues = {
  firma: 'SC PUBLISERV SA',
  cui: 'RO9126534',
  adresa: 'Str. Muncii nr. 3, Piatra Neamț, Neamț',
  telefon: '0233 000 000',
  data_document: '01.06.2026',
  angajat_nume: 'Ion Popescu',
  angajat_marca: '150',
  angajat_functie: 'Inspector de specialitate',
  angajat_departament: 'Resurse Umane',
  data_angajare: '15.01.2020',
  salariu_net: '4.500 lei',
  nr_zile_co: '18',
  nr_document: 'DOC-2026-0001',
  data_emitere: '01.06.2026',
  valabil_pana: '31.12.2026',
  semnatura_director: 'Director General\nMOVILA PETCU VICTOR',
  semnatura_hr: 'Resurse Umane\nION POPESCU',
  stampila: '[Spațiu ștampilă]',
}

let formatsRegistered = false

function registerEditorFormats(Quill) {
  if (formatsRegistered) return
  const Inline = Quill.import('blots/inline')
  class VariableBlot extends Inline {
    static create(value) {
      const node = super.create()
      node.dataset.variable = String(value || '')
      return node
    }

    static formats(node) {
      return node.dataset.variable || ''
    }
  }
  VariableBlot.blotName = 'variable'
  VariableBlot.tagName = 'span'
  VariableBlot.className = 'ql-variable-token'

  const BlockEmbed = Quill.import('blots/block/embed')
  class TableBlot extends BlockEmbed {
    static create() {
      const node = super.create()
      node.innerHTML = '<tbody><tr><td contenteditable="true">Coloana 1</td><td contenteditable="true">Coloana 2</td></tr><tr><td contenteditable="true">&nbsp;</td><td contenteditable="true">&nbsp;</td></tr></tbody>'
      return node
    }

    static value() {
      return true
    }
  }
  TableBlot.blotName = 'templateTable'
  TableBlot.tagName = 'table'
  TableBlot.className = 'ql-template-table'
  Quill.register(VariableBlot)
  Quill.register(TableBlot)
  formatsRegistered = true
}

function renderPreview(html) {
  return String(html || '<p>Document fără conținut.</p>').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => (
    String(previewValues[key] ?? `[${key}]`).replaceAll('\n', '<br>')
  ))
}

export default function DocumentTemplateEditor({ value, onChange }) {
  const editorRef = useRef(null)
  const toolbarRef = useRef(null)
  const quillRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const [selectedVariable, setSelectedVariable] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const Quill = window.Quill
    if (!Quill || !editorRef.current || !toolbarRef.current) return
    registerEditorFormats(Quill)
    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: {
          container: toolbarRef.current,
          handlers: {
            table() {
              const range = quill.getSelection(true) || { index: Math.max(0, quill.getLength() - 1) }
              quill.insertEmbed(range.index, 'templateTable', true, 'user')
              quill.insertText(range.index + 1, '\n', 'user')
              quill.setSelection(range.index + 2, 0, 'silent')
            },
          },
        },
      },
    })
    quillRef.current = quill
    quill.clipboard.dangerouslyPasteHTML(String(value || ''), 'silent')

    function decorateVariables() {
      const text = quill.getText()
      const matches = [...text.matchAll(/\{\{[a-zA-Z0-9_.-]+\}\}/g)]
      matches.forEach(match => quill.formatText(match.index, match[0].length, 'variable', match[0].slice(2, -2), 'silent'))
    }

    function handleChange(_delta, _oldDelta, source) {
      if (source === 'user') decorateVariables()
      onChangeRef.current(quill.root.innerHTML)
    }
    decorateVariables()
    quill.on('text-change', handleChange)
    return () => {
      quill.off('text-change', handleChange)
      quillRef.current = null
    }
    // Editorul se recreează doar când modalul este deschis pentru alt template.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function insertVariable() {
    if (!selectedVariable || !quillRef.current) return
    const quill = quillRef.current
    const range = quill.getSelection(true) || { index: Math.max(0, quill.getLength() - 1) }
    const token = `{{${selectedVariable}}}`
    quill.insertText(range.index, token, 'variable', selectedVariable, 'user')
    quill.setSelection(range.index + token.length, 0, 'silent')
    setSelectedVariable('')
  }

  function openPreview() {
    setPreviewHtml(renderPreview(quillRef.current?.root.innerHTML || value))
    setPreviewOpen(true)
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div ref={toolbarRef} className="flex flex-wrap rounded-md border border-slate-200 bg-white">
          <span className="ql-formats">
            <button className="ql-bold" type="button" />
            <button className="ql-italic" type="button" />
            <button className="ql-underline" type="button" />
          </span>
          <span className="ql-formats">
            <select className="ql-header" defaultValue="">
              <option value="1">H1</option>
              <option value="2">H2</option>
              <option value="">Normal</option>
            </select>
          </span>
          <span className="ql-formats">
            <button className="ql-list" value="ordered" type="button" />
            <button className="ql-list" value="bullet" type="button" />
            <select className="ql-align" defaultValue="" />
            <button className="ql-table" type="button">▦</button>
          </span>
        </div>
        <select className="h-9 min-w-56 rounded-md border border-amber-300 bg-amber-50 px-2 text-sm" value={selectedVariable} onChange={event => setSelectedVariable(event.target.value)}>
          <option value="">+ Inserează variabilă</option>
          {variableGroups.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map(([key, description]) => <option key={key} value={key}>{`{{${key}}} — ${description}`}</option>)}
            </optgroup>
          ))}
        </select>
        <Button type="button" size="sm" variant="secondary" disabled={!selectedVariable} onClick={insertVariable}>Inserează</Button>
        <Button type="button" size="sm" variant="secondary" onClick={openPreview}>👁️ Previzualizare</Button>
      </div>
      <div className="document-template-editor overflow-hidden rounded-md border border-slate-300 bg-white">
        <div ref={editorRef} />
      </div>
      {!window.Quill ? <p className="text-xs text-rose-600">Editorul vizual nu s-a încărcat. Verifică accesul la CDN Quill.</p> : null}

      <Modal open={previewOpen} title="Previzualizare template" onClose={() => setPreviewOpen(false)} size="xl">
        <div className="min-h-96 rounded-md border border-slate-200 bg-white p-8 text-sm leading-6 shadow-inner" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </Modal>
    </div>
  )
}
