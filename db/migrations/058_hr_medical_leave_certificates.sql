IF OBJECT_ID(N'hr.medical_leave_certificates', N'U') IS NULL
BEGIN
  CREATE TABLE hr.medical_leave_certificates (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_hr_medical_leave_certificates PRIMARY KEY,
    uuid UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_hr_medical_leave_certificates_uuid UNIQUE,
    leave_request_uuid CHAR(36) NOT NULL CONSTRAINT uq_hr_medical_leave_leave UNIQUE,
    employee_id INT NOT NULL,
    serie NVARCHAR(20) NOT NULL,
    numar NVARCHAR(30) NOT NULL,
    tip_certificat NVARCHAR(20) NOT NULL CONSTRAINT df_hr_medical_leave_tip DEFAULT N'initial',
    data_acordarii DATE NOT NULL,
    data_start DATE NOT NULL,
    data_sfarsit DATE NOT NULL,
    zile_calendaristice INT NOT NULL,
    cod_indemnizatie NVARCHAR(10) NOT NULL,
    cod_diagnostic NVARCHAR(30) NULL,
    medic_nume NVARCHAR(200) NOT NULL,
    cod_parafa NVARCHAR(50) NOT NULL,
    unitate_emitenta NVARCHAR(250) NOT NULL,
    file_name NVARCHAR(255) NOT NULL,
    stored_name NVARCHAR(255) NOT NULL,
    mime_type NVARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    status_verificare NVARCHAR(20) NOT NULL CONSTRAINT df_hr_medical_leave_status DEFAULT N'in_verificare',
    verificat_de UNIQUEIDENTIFIER NULL,
    verificat_la DATETIME2 NULL,
    motiv_respingere NVARCHAR(500) NULL,
    created_by UNIQUEIDENTIFIER NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_hr_medical_leave_created DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NULL,
    CONSTRAINT fk_hr_medical_leave_employee FOREIGN KEY(employee_id) REFERENCES hr.employees(id),
    CONSTRAINT fk_hr_medical_leave_request FOREIGN KEY(leave_request_uuid) REFERENCES hr.leave_requests(uuid),
    CONSTRAINT ck_hr_medical_leave_dates CHECK(data_sfarsit >= data_start),
    CONSTRAINT ck_hr_medical_leave_status CHECK(status_verificare IN (N'in_verificare',N'verificat',N'respinsa'))
  );
  CREATE INDEX ix_hr_medical_leave_employee ON hr.medical_leave_certificates(employee_id, created_at DESC);
END;
