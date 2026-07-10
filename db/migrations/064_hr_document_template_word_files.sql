IF OBJECT_ID(N'hr.document_templates', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'hr.document_templates', N'word_template_file') IS NULL
    ALTER TABLE hr.document_templates ADD word_template_file NVARCHAR(500) NULL;

  IF COL_LENGTH(N'hr.document_templates', N'word_template_original_name') IS NULL
    ALTER TABLE hr.document_templates ADD word_template_original_name NVARCHAR(255) NULL;

  IF COL_LENGTH(N'hr.document_templates', N'word_template_size') IS NULL
    ALTER TABLE hr.document_templates ADD word_template_size BIGINT NULL;

  IF COL_LENGTH(N'hr.document_templates', N'word_template_uploaded_at') IS NULL
    ALTER TABLE hr.document_templates ADD word_template_uploaded_at DATETIME2 NULL;

  IF COL_LENGTH(N'hr.document_templates', N'word_template_uploaded_by') IS NULL
    ALTER TABLE hr.document_templates ADD word_template_uploaded_by UNIQUEIDENTIFIER NULL;
END;
