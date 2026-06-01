IF COL_LENGTH(N'hr.echipamente_tipuri', N'categorie') IS NULL
  ALTER TABLE hr.echipamente_tipuri ADD categorie NVARCHAR(30) NOT NULL CONSTRAINT DF_hr_echipamente_tipuri_categorie DEFAULT N'protectie'
IF COL_LENGTH(N'hr.echipamente_tipuri', N'are_marime') IS NULL
  ALTER TABLE hr.echipamente_tipuri ADD are_marime BIT NOT NULL CONSTRAINT DF_hr_echipamente_tipuri_are_marime DEFAULT 1
IF COL_LENGTH(N'hr.echipamente_tipuri', N'are_serie') IS NULL
  ALTER TABLE hr.echipamente_tipuri ADD are_serie BIT NOT NULL CONSTRAINT DF_hr_echipamente_tipuri_are_serie DEFAULT 0
IF COL_LENGTH(N'hr.echipamente_tipuri', N'are_expirare') IS NULL
  ALTER TABLE hr.echipamente_tipuri ADD are_expirare BIT NOT NULL CONSTRAINT DF_hr_echipamente_tipuri_are_expirare DEFAULT 1
IF COL_LENGTH(N'hr.echipamente_tipuri', N'valoare_inventar') IS NULL
  ALTER TABLE hr.echipamente_tipuri ADD valoare_inventar DECIMAL(15,2) NOT NULL CONSTRAINT DF_hr_echipamente_tipuri_valoare DEFAULT 0
IF COL_LENGTH(N'hr.echipamente_tipuri', N'cod_articol') IS NULL
  ALTER TABLE hr.echipamente_tipuri ADD cod_articol NVARCHAR(100) NULL
IF COL_LENGTH(N'hr.echipamente_tipuri', N'furnizor_id') IS NULL
  ALTER TABLE hr.echipamente_tipuri ADD furnizor_id UNIQUEIDENTIFIER NULL

IF COL_LENGTH(N'hr.echipamente_dotari', N'numar_serie') IS NULL
  ALTER TABLE hr.echipamente_dotari ADD numar_serie NVARCHAR(100) NULL
IF COL_LENGTH(N'hr.echipamente_dotari', N'valoare_inventar') IS NULL
  ALTER TABLE hr.echipamente_dotari ADD valoare_inventar DECIMAL(15,2) NOT NULL CONSTRAINT DF_hr_echipamente_dotari_valoare DEFAULT 0
IF COL_LENGTH(N'hr.echipamente_dotari', N'predat_la_lichidare') IS NULL
  ALTER TABLE hr.echipamente_dotari ADD predat_la_lichidare BIT NOT NULL CONSTRAINT DF_hr_echipamente_dotari_predat DEFAULT 0
IF COL_LENGTH(N'hr.echipamente_dotari', N'predat_la') IS NULL
  ALTER TABLE hr.echipamente_dotari ADD predat_la DATETIME2 NULL
IF COL_LENGTH(N'hr.echipamente_dotari', N'predat_de') IS NULL
  ALTER TABLE hr.echipamente_dotari ADD predat_de UNIQUEIDENTIFIER NULL

DECLARE @seed TABLE (
  denumire NVARCHAR(100), categorie NVARCHAR(30), tip_marimi NVARCHAR(20),
  durata_luni INT, are_marime BIT, are_serie BIT, are_expirare BIT
)
INSERT INTO @seed VALUES
  (N'Ochelari protectie', N'SSM', N'text', 12, 0, 0, 1),
  (N'Pelerina ploaie', N'protectie', N'text', 24, 1, 0, 1),
  (N'Casca protectie', N'SSM', N'text', 36, 1, 0, 1),
  (N'Centura siguranta', N'SSM', N'text', 0, 0, 1, 0),
  (N'Manusi protectie', N'protectie', N'text', 6, 1, 0, 1),
  (N'Antifoane', N'SSM', N'text', 3, 0, 0, 1),
  (N'Masca praf', N'SSM', N'text', 1, 0, 0, 1),
  (N'Stingator', N'inventar', N'text', 0, 0, 1, 0),
  (N'Trusa prim ajutor', N'inventar', N'text', 12, 0, 0, 1)

INSERT INTO hr.echipamente_tipuri (denumire, categorie, tip_marimi, durata_luni, are_marime, are_serie, are_expirare, activ)
SELECT s.denumire, s.categorie, s.tip_marimi, s.durata_luni, s.are_marime, s.are_serie, s.are_expirare, 1
FROM @seed s
WHERE NOT EXISTS (SELECT 1 FROM hr.echipamente_tipuri t WHERE t.denumire=s.denumire)

INSERT INTO hr.echipamente_marimi (tip_id, marime, ordine)
SELECT t.id, m.marime, m.ordine
FROM hr.echipamente_tipuri t
CROSS APPLY (VALUES (N'S',1),(N'M',2),(N'L',3),(N'XL',4)) m(marime, ordine)
WHERE t.denumire IN (N'Pelerina ploaie', N'Manusi protectie')
  AND NOT EXISTS (SELECT 1 FROM hr.echipamente_marimi x WHERE x.tip_id=t.id AND x.marime=m.marime)

INSERT INTO hr.echipamente_marimi (tip_id, marime, ordine)
SELECT t.id, m.marime, m.ordine
FROM hr.echipamente_tipuri t
CROSS APPLY (VALUES (N'S',1),(N'M',2),(N'L',3)) m(marime, ordine)
WHERE t.denumire=N'Casca protectie'
  AND NOT EXISTS (SELECT 1 FROM hr.echipamente_marimi x WHERE x.tip_id=t.id AND x.marime=m.marime)
