import Input from '../../../components/forms/Input'
import Select from '../../../components/forms/Select'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const TEMPLATE_TYPE_OPTIONS = [
  { value: 'contract', label: 'Contract' },
  { value: 'act_aditional', label: 'Act adițional' },
  { value: 'decizie', label: 'Decizie' },
  { value: 'adeverinta', label: 'Adeverință' },
  { value: 'altul', label: 'Altul' },
]

const SIGNATURE_TABLE_SNIPPET = '<table style="width:100%;border-collapse:collapse" border="1"><tbody><tr><td>Semnătură angajator</td><td>Semnătură salariat</td></tr><tr><td><br><br></td><td><br><br></td></tr></tbody></table><p></p>'

export default function HRDocumentTemplateModal({
  template,
  advancedMode,
  editorRef,
  variables,
  wordUploading,
  onChange,
  onClose,
  onSubmit,
  onDownloadWord,
  onChooseWord,
  onInsertSnippet,
  onApplyCommand,
  onToggleAdvancedMode,
  onSyncVisualEditor,
}) {
  const title = template ? `Șablon HR — ${template.denumire}` : 'Șablon HR'

  function updateField(field, value) {
    onChange(current => ({ ...(current || {}), [field]: value }))
  }

  function preventEditorBlur(event, action) {
    event.preventDefault()
    action()
  }

  return (
    <Modal open={Boolean(template)} title={title} onClose={onClose} size="lg">
      {template ? (
        <form className="grid gap-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Denumire"
              value={template.denumire || ''}
              onChange={event => updateField('denumire', event.target.value)}
              required
            />
            <Select
              label="Tip"
              value={template.tip || 'altul'}
              onChange={event => updateField('tip', event.target.value)}
              options={TEMPLATE_TYPE_OPTIONS}
            />
          </div>
          <Input
            label="Descriere"
            value={template.descriere || ''}
            onChange={event => updateField('descriere', event.target.value)}
          />
          <div className={`rounded-lg border px-3 py-2 text-sm ${template.word_template_file ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong>{template.word_template_file ? 'Șablon Word atașat' : 'Nu există șablon Word atașat'}</strong>
                <div className="text-xs">{template.word_template_file ? (template.word_template_original_name || 'document .docx') : 'Poți încărca CIM-ul/actul real din Word și păstra editorul vizual ca fallback.'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {template.word_template_file ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => onDownloadWord(template)}>Descarcă Word</Button>
                ) : null}
                <Button type="button" size="sm" variant="secondary" loading={wordUploading === template.id} onClick={() => onChooseWord(template)}>
                  {template.word_template_file ? 'Înlocuiește Word' : 'Încarcă Word'}
                </Button>
              </div>
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Variabile</div>
            <div className="flex max-h-24 flex-wrap gap-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
              {(variables || []).map(variable => (
                <button
                  key={variable}
                  type="button"
                  className="rounded bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-primary-50 hover:text-primary-700"
                  onMouseDown={event => preventEditorBlur(event, () => onInsertSnippet(`{{${variable}}}`))}
                >{`{{${variable}}}`}</button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-700">Conținut șablon — editor vizual</div>
                <div className="text-xs text-slate-500">Editează ca într-un document. Variabilele se păstrează între acolade și se completează automat la generare.</div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="secondary" onMouseDown={event => preventEditorBlur(event, () => onApplyCommand('bold'))}>Bold</Button>
                <Button type="button" size="sm" variant="secondary" onMouseDown={event => preventEditorBlur(event, () => onApplyCommand('formatBlock', 'h2'))}>Titlu</Button>
                <Button type="button" size="sm" variant="secondary" onMouseDown={event => preventEditorBlur(event, () => onApplyCommand('insertUnorderedList'))}>Listă</Button>
                <Button type="button" size="sm" variant="secondary" onMouseDown={event => preventEditorBlur(event, () => onInsertSnippet(SIGNATURE_TABLE_SNIPPET))}>Tabel semnături</Button>
                <Button type="button" size="sm" variant="secondary" onClick={onToggleAdvancedMode}>{advancedMode ? 'Ascunde HTML' : 'HTML avansat'}</Button>
              </div>
            </div>
            <div
              ref={editorRef}
              className="min-h-[420px] rounded bg-white px-8 py-6 text-sm leading-7 text-slate-900 shadow-inner ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-primary-200 [&_h2]:mb-3 [&_h2]:text-center [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-bold [&_p]:mb-2 [&_table]:my-3 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2"
              contentEditable
              suppressContentEditableWarning
              onBlur={onSyncVisualEditor}
              dangerouslySetInnerHTML={{ __html: template.template_html || '<p>Scrie aici conținutul documentului...</p>' }}
            />
          </div>
          {advancedMode ? (
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Cod HTML șablon — mod avansat
              <textarea
                className="min-h-[260px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={template.template_html || ''}
                onChange={event => updateField('template_html', event.target.value)}
                required
              />
            </label>
          ) : null}
          <div className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">
            Pentru HR nu mai este necesară editarea HTML. Dacă documentul vine din Word, copiază textul din Word și lipește-l în editorul vizual, apoi inserează variabilele unde trebuie.
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Renunță</Button>
            <Button type="submit">Salvează șablon</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  )
}
