IF SCHEMA_ID(N'hr') IS NULL EXEC(N'CREATE SCHEMA hr');

IF OBJECT_ID(N'hr.document_templates', N'U') IS NULL
BEGIN
  CREATE TABLE hr.document_templates (
    id NVARCHAR(50) NOT NULL CONSTRAINT PK_hr_document_templates PRIMARY KEY,
    denumire NVARCHAR(200) NOT NULL,
    tip NVARCHAR(50) NOT NULL CONSTRAINT DF_hr_document_templates_tip DEFAULT N'altul',
    descriere NVARCHAR(500) NULL,
    template_html NVARCHAR(MAX) NOT NULL,
    activ BIT NOT NULL CONSTRAINT DF_hr_document_templates_activ DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_hr_document_templates_created_at DEFAULT SYSDATETIME(),
    created_by UNIQUEIDENTIFIER NULL,
    updated_at DATETIME2 NULL,
    updated_by UNIQUEIDENTIFIER NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM hr.document_templates WHERE id = N'cim')
BEGIN
  INSERT INTO hr.document_templates (id, denumire, tip, descriere, template_html)
  VALUES (
    N'cim',
    N'Contract individual de munca',
    N'contract',
    N'Sablon CIM folosit la generarea contractului din fisa angajatului.',
    N'<h2 style="text-align:center">CONTRACT INDIVIDUAL DE MUNCĂ</h2>
<p style="text-align:center">Nr. <strong>{{nr_cim}}</strong> / data <strong>{{data_generare}}</strong></p>
<h3>I. Angajator</h3>
<p><strong>{{company.denumire}}</strong>, CUI {{company.cui}}, sediul {{company.adresa}}, reprezentată de {{company.reprezentant}}.</p>
<h3>II. Salariat</h3>
<p>{{angajat.prenume}} {{angajat.nume}}, CNP {{angajat.cnp}}, marca {{angajat.marca}}, domiciliu {{angajat.adresa}}.</p>
<h3>III. Obiectul contractului</h3>
<p>Salariatul este angajat în funcția de <strong>{{contract.functia}}</strong>, în cadrul departamentului <strong>{{angajat.department_name}}</strong>.</p>
<h3>IV. Durata și locul muncii</h3>
<p>Data începerii activității: <strong>{{contract.data_start}}</strong>. Tip contract: <strong>{{contract.tip}}</strong>.</p>
<h3>V. Durata muncii</h3>
<p>Program de lucru: <strong>{{contract.norma_ore}}</strong> ore/zi.</p>
<h3>VI. Salariul</h3>
<p>Salariu de bază brut lunar: <strong>{{contract.salariu_baza}}</strong> RON.</p>
<h3>VII. Concediu</h3>
<p>Durata concediului anual de odihnă: <strong>{{angajat.zile_co_drept}}</strong> zile lucrătoare.</p>
<div style="margin-top:60px;display:flex;justify-content:space-between"><div><strong>ANGAJATOR</strong><br>{{company.reprezentant}}<br><br>Semnătură: ____________</div><div><strong>SALARIAT</strong><br>{{angajat.prenume}} {{angajat.nume}}<br><br>Semnătură: ____________</div></div>'
  );
END;

IF NOT EXISTS (SELECT 1 FROM hr.document_templates WHERE id = N'act_aditional')
BEGIN
  INSERT INTO hr.document_templates (id, denumire, tip, descriere, template_html)
  VALUES (
    N'act_aditional',
    N'Act aditional CIM',
    N'act_aditional',
    N'Sablon pentru acte aditionale generate din contractele HR.',
    N'<h2 style="text-align:center">{{titlu}}</h2>
<h3 style="text-align:center">la Contractul Individual de Muncă</h3>
<p style="text-align:center">Nr. <strong>{{amendment.numar_act}}</strong> / data <strong>{{amendment.data_act}}</strong></p>
<p>Angajatorul <strong>{{company.denumire}}</strong> și salariatul <strong>{{angajat.prenume}} {{angajat.nume}}</strong>, CNP {{angajat.cnp}}, convin următoarea modificare cu efect de la <strong>{{amendment.data_efect}}</strong>:</p>
<div>{{modificare_html}}</div>
<p>Celelalte clauze ale contractului individual de muncă rămân neschimbate.</p>
<div style="margin-top:60px;display:flex;justify-content:space-between"><div><strong>ANGAJATOR</strong><br>{{company.reprezentant}}<br><br>Semnătură: ____________</div><div><strong>SALARIAT</strong><br>{{angajat.prenume}} {{angajat.nume}}<br><br>Semnătură: ____________</div></div>'
  );
END;
