IF SCHEMA_ID(N'documents') IS NULL
  EXEC(N'CREATE SCHEMA documents');
GO

IF OBJECT_ID(N'documents.document_template_files', N'U') IS NULL
BEGIN
  CREATE TABLE documents.document_template_files (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE DEFAULT NEWID(),
    template_id NVARCHAR(50) NOT NULL,
    file_path NVARCHAR(500) NOT NULL,
    file_name NVARCHAR(255) NOT NULL,
    file_size INT NULL,
    file_ext NVARCHAR(20) NULL,
    uploaded_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
END;
GO

IF OBJECT_ID(N'documents.document_types', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'documents.document_types', N'categorie') IS NULL
    ALTER TABLE documents.document_types ADD categorie NVARCHAR(80) NULL;

  IF COL_LENGTH(N'documents.document_types', N'descriere') IS NULL
    ALTER TABLE documents.document_types ADD descriere NVARCHAR(500) NULL;

  IF COL_LENGTH(N'documents.document_types', N'tip_document') IS NULL
    ALTER TABLE documents.document_types ADD tip_document NVARCHAR(50) NULL;

  IF COL_LENGTH(N'documents.document_types', N'template_format') IS NULL
    ALTER TABLE documents.document_types ADD template_format NVARCHAR(20) NULL;

  IF COL_LENGTH(N'documents.document_types', N'fisier_model_path') IS NULL
    ALTER TABLE documents.document_types ADD fisier_model_path NVARCHAR(500) NULL;

  IF COL_LENGTH(N'documents.document_types', N'fisier_model_name') IS NULL
    ALTER TABLE documents.document_types ADD fisier_model_name NVARCHAR(255) NULL;

  IF COL_LENGTH(N'documents.document_types', N'fisier_model_size') IS NULL
    ALTER TABLE documents.document_types ADD fisier_model_size INT NULL;

  IF COL_LENGTH(N'documents.document_types', N'uploaded_at') IS NULL
    ALTER TABLE documents.document_types ADD uploaded_at DATETIME2 NULL;
END;
GO
