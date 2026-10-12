IF SCHEMA_ID(N'hr') IS NULL EXEC(N'CREATE SCHEMA hr');
GO

IF OBJECT_ID(N'hr.evaluations', N'U') IS NULL
BEGIN
  CREATE TABLE hr.evaluations (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_hr_evaluations PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_hr_evaluations_uuid DEFAULT NEWID(),
    employee_id INT NOT NULL,
    evaluator_id NVARCHAR(80) NOT NULL,
    evaluator_name NVARCHAR(180) NOT NULL,
    data_evaluare DATE NOT NULL,
    tip NVARCHAR(30) NOT NULL CONSTRAINT df_hr_evaluations_tip DEFAULT N'periodica',
    calificativ NVARCHAR(10) NULL,
    punctaj DECIMAL(5,2) NULL,
    observatii NVARCHAR(MAX) NULL,
    obiective NVARCHAR(MAX) NULL,
    recomandari NVARCHAR(MAX) NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT df_hr_evaluations_status DEFAULT N'finalizata',
    created_at DATETIME2(0) NOT NULL CONSTRAINT df_hr_evaluations_created_at DEFAULT SYSDATETIME(),
    updated_at DATETIME2(0) NULL,
    CONSTRAINT uq_hr_evaluations_uuid UNIQUE(uuid),
    CONSTRAINT fk_hr_evaluations_employee FOREIGN KEY(employee_id) REFERENCES hr.employees(id),
    CONSTRAINT ck_hr_evaluations_tip CHECK(tip IN (N'periodica', N'proba', N'anuala', N'speciala')),
    CONSTRAINT ck_hr_evaluations_calificativ CHECK(calificativ IS NULL OR calificativ IN (N'FB', N'B', N'S', N'NS')),
    CONSTRAINT ck_hr_evaluations_punctaj CHECK(punctaj IS NULL OR (punctaj >= 0 AND punctaj <= 100)),
    CONSTRAINT ck_hr_evaluations_status CHECK(status IN (N'draft', N'finalizata', N'anulata'))
  );
END;
GO

/* Instalațiile relaționale vechi păstrau evaluările numai în dbo.app_state.
   Importul rulează o singură dată, doar într-un tabel nou/gol, și păstrează
   numai evaluările care indică un angajat relațional existent. */
IF OBJECT_ID(N'dbo.app_state', N'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM hr.evaluations)
BEGIN
  INSERT INTO hr.evaluations (
    uuid, employee_id, evaluator_id, evaluator_name, data_evaluare, tip,
    calificativ, punctaj, observatii, obiective, recomandari, status,
    created_at, updated_at
  )
  SELECT
    NEWID(), e.id,
    COALESCE(NULLIF(LEFT(j.evaluator_id,80),N''),N'sistem'),
    COALESCE(NULLIF(LEFT(j.evaluator_name,180),N''),N'Evaluator importat'),
    COALESCE(TRY_CONVERT(date,j.data_evaluare),CAST(GETDATE() AS date)),
    CASE WHEN j.tip IN (N'periodica',N'proba',N'anuala',N'speciala') THEN j.tip ELSE N'periodica' END,
    CASE WHEN j.calificativ IN (N'FB',N'B',N'S',N'NS') THEN j.calificativ ELSE NULL END,
    CASE WHEN TRY_CONVERT(decimal(5,2),j.punctaj) BETWEEN 0 AND 100 THEN TRY_CONVERT(decimal(5,2),j.punctaj) ELSE NULL END,
    NULLIF(j.observatii,N''), NULLIF(j.obiective,N''), NULLIF(j.recomandari,N''),
    CASE WHEN j.status IN (N'draft',N'finalizata',N'anulata') THEN j.status ELSE N'finalizata' END,
    COALESCE(TRY_CONVERT(datetime2(0),j.created_at),SYSDATETIME()),
    TRY_CONVERT(datetime2(0),j.updated_at)
  FROM dbo.app_state s
  CROSS APPLY OPENJSON(CASE WHEN ISJSON(s.data)=1 THEN s.data ELSE N'{}' END,N'$.hr.evaluations')
  WITH (
    employee_id NVARCHAR(40) N'$.employee_id', evaluator_id NVARCHAR(200) N'$.evaluator_id',
    evaluator_name NVARCHAR(400) N'$.evaluator_name', data_evaluare NVARCHAR(50) N'$.data_evaluare',
    tip NVARCHAR(80) N'$.tip', calificativ NVARCHAR(30) N'$.calificativ', punctaj NVARCHAR(50) N'$.punctaj',
    observatii NVARCHAR(MAX) N'$.observatii', obiective NVARCHAR(MAX) N'$.obiective',
    recomandari NVARCHAR(MAX) N'$.recomandari', status NVARCHAR(80) N'$.status',
    created_at NVARCHAR(80) N'$.created_at', updated_at NVARCHAR(80) N'$.updated_at'
  ) j
  INNER JOIN hr.employees e ON e.id=TRY_CONVERT(int,j.employee_id)
  WHERE s.id=1;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'ix_hr_evaluations_employee_date' AND object_id=OBJECT_ID(N'hr.evaluations'))
  CREATE INDEX ix_hr_evaluations_employee_date ON hr.evaluations(employee_id, data_evaluare DESC);
GO
