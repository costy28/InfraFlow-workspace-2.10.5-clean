// Synthetic schema: actual SQL statements and SQL Server, mocked app-state/auth.
const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { splitSqlBatches } = require('../../core/migrations')
function createSqlFixture() {
  const database = `INFRAFLOW_TEST_HR_${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  if (!/^INFRAFLOW_TEST_HR_[A-F0-9]{12}$/.test(database)) throw new Error('Nume bază test invalid')
  function run(databaseName, query, options = {}) {
    const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Data;
      $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=${databaseName};Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
      try { $c.Open(); $q=$c.CreateCommand(); $q.CommandTimeout=15;
        $q.CommandText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_SQL));
        $p=$q.Parameters.Add('@json',[Data.SqlDbType]::NVarChar,-1); $p.Value=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_JSON));
        $r=$q.ExecuteReader(); $b=New-Object Text.StringBuilder;
        while($r.Read()){[void]$b.Append([string]$r.GetValue(0))}; $r.Close(); [Console]::Write($b.ToString())
      } finally {$c.Dispose()}`
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 20000, env: { ...process.env, TEST_SQL: Buffer.from(query).toString('base64'), TEST_JSON: Buffer.from(options.jsonInput || '{}').toString('base64') } })
  }
  run('master', `CREATE DATABASE [${database}]`)
  run(database, `EXEC(N'CREATE SCHEMA core');`)
  run(database, `EXEC(N'CREATE SCHEMA hr');`)
  run(database, `
    CREATE TABLE dbo.app_state(id int PRIMARY KEY,data nvarchar(max),updated_at datetime2 DEFAULT sysdatetime());
    INSERT dbo.app_state(id,data) VALUES(1,N'{"hr":{"evaluations":[{"employee_id":2,"evaluator_id":"legacy","evaluator_name":"Evaluator vechi","data_evaluare":"2026-09-30","tip":"anuala","calificativ":"B","punctaj":85,"observatii":"Import app state","status":"finalizata"},{"employee_id":999,"data_evaluare":"2026-09-30"}]}}');
    CREATE TABLE core.departments(id int PRIMARY KEY,cod nvarchar(80),denumire nvarchar(100),activ bit);
    INSERT core.departments VALUES(1,'D1','Unu',1),(2,'D2','Doi',1);
    CREATE TABLE core.users(id nvarchar(80) PRIMARY KEY,active bit);
    INSERT core.users VALUES('u1',1),('u2',1);
    CREATE TABLE hr.employees(id int PRIMARY KEY,user_id nvarchar(80),nume nvarchar(80),prenume nvarchar(80),activ bit,department_id int,department_cod nvarchar(80),data_angajare date,cnp nvarchar(80),email nvarchar(200),updated_at datetime2);
    INSERT hr.employees VALUES(1,'u1','Propriu','',1,1,'D1','2026-01-01','secret1','propriu@example.test',NULL),(2,'u2','Altul','',1,1,'D1','2026-01-01','secret2','altul@example.test',NULL);
    ALTER TABLE hr.employees ADD functia nvarchar(100) NULL,act_identitate_tip nvarchar(30) NULL,act_identitate_serie nvarchar(5) NULL,act_identitate_numar nvarchar(10) NULL,zile_co_drept int NULL;
    UPDATE hr.employees SET functia=N'Operator',act_identitate_tip=N'CI',act_identitate_serie=N'NT',act_identitate_numar=CASE WHEN id=1 THEN N'111111' ELSE N'222222' END,zile_co_drept=21;
    CREATE TABLE hr.contracts(id int PRIMARY KEY,employee_id int,salariu_baza decimal(15,2),status nvarchar(80),data_start date);
    INSERT hr.contracts VALUES(1,1,1000,'activ','2026-01-01'),(2,2,2000,'activ','2026-01-01');
    CREATE TABLE hr.leave_requests(id int IDENTITY PRIMARY KEY,uuid nvarchar(80),employee_id int,tip nvarchar(40),data_start date,data_sfarsit date,zile decimal(6,2),motiv nvarchar(max),status nvarchar(30) DEFAULT N'cerut',created_at datetime2 DEFAULT sysdatetime());
    INSERT hr.leave_requests(employee_id,tip,data_start,data_sfarsit,zile,status) VALUES
      (1,'CM','2026-09-01','2026-09-03',3,'aprobat'),
      (2,'CM','2026-09-10','2026-09-13',4,'aprobata'),
      (2,'CO','2026-10-02','2026-10-02',1,'aprobat');
    CREATE TABLE hr.medical_leave_certificates(id bigint IDENTITY PRIMARY KEY,uuid uniqueidentifier NOT NULL UNIQUE,leave_request_uuid nvarchar(80) NOT NULL UNIQUE,employee_id int NOT NULL,serie nvarchar(20) NOT NULL,numar nvarchar(30) NOT NULL,tip_certificat nvarchar(20) NOT NULL,data_acordarii date NOT NULL,data_start date NOT NULL,data_sfarsit date NOT NULL,zile_calendaristice int NOT NULL,cod_indemnizatie nvarchar(10) NOT NULL,cod_diagnostic nvarchar(30),medic_nume nvarchar(200) NOT NULL,cod_parafa nvarchar(50) NOT NULL,unitate_emitenta nvarchar(250) NOT NULL,file_name nvarchar(255) NOT NULL,stored_name nvarchar(255) NOT NULL,mime_type nvarchar(100) NOT NULL,file_size bigint NOT NULL,status_verificare nvarchar(20) NOT NULL DEFAULT N'in_verificare',verificat_de uniqueidentifier,verificat_la datetime2,motiv_respingere nvarchar(500),created_by uniqueidentifier,created_at datetime2 NOT NULL DEFAULT sysdatetime(),updated_at datetime2);
    CREATE TABLE hr.tures(id int PRIMARY KEY,ore_normale decimal(4,2));
    INSERT hr.tures VALUES(1,8);
    CREATE TABLE hr.schedules(id int IDENTITY PRIMARY KEY,employee_id int,data date,tura_id int);
    INSERT hr.schedules(employee_id,data,tura_id) VALUES(1,'2026-10-01',1);
    CREATE TABLE hr.time_sheets(id int IDENTITY PRIMARY KEY,employee_id int,data date,ore_lucrate decimal(5,2),tip nvarchar(40),validat bit,ore_suplimentare_s1 decimal(5,2),ore_suplimentare_s2 decimal(5,2),ore_noapte decimal(5,2),overtime_status nvarchar(20),observatii nvarchar(max));
    INSERT hr.time_sheets(employee_id,data,ore_lucrate,tip,validat,ore_suplimentare_s1,ore_suplimentare_s2,ore_noapte,overtime_status,observatii) VALUES
      (1,'2026-10-01',10,N'lucru',1,0,0,2,N'propus',N'Tura extinsă'),
      (1,'2026-10-02',0,N'concediu_odihna',1,0,0,0,NULL,NULL),
      (2,'2026-10-01',8,N'lucru',1,0,0,0,NULL,NULL),
      (2,'2026-10-03',8,N'lucru',1,0,0,0,NULL,NULL);
    CREATE TABLE hr.timesheet_departments(id int IDENTITY PRIMARY KEY,luna char(7),department_cod nvarchar(80),status nvarchar(30),completat_la datetime2,completat_de nvarchar(80),updated_at datetime2);
    INSERT hr.timesheet_departments(luna,department_cod,status,completat_la,completat_de) VALUES('2026-10','D1','finalizat','2026-10-04','u1');
    CREATE TABLE hr.department_transfers(id int IDENTITY PRIMARY KEY,uuid nvarchar(80),employee_id int,dept_vechi nvarchar(80),dept_nou nvarchar(80),data_transfer date,motiv nvarchar(max),aprobat_de nvarchar(80));
    CREATE TABLE hr.reges_exports(id int PRIMARY KEY,uuid nvarchar(80),tip nvarchar(80),status nvarchar(80),generat_de nvarchar(80),mesaj nvarchar(max),created_at datetime2,fisier_path nvarchar(max));
    INSERT hr.reges_exports VALUES(1,'export-test','registru','generat','u1','Export intern','2026-10-11',N'C:\\private\\registry.xml');
    CREATE TABLE hr.training(id int IDENTITY PRIMARY KEY,denumire nvarchar(200) NOT NULL,tip nvarchar(80),furnizor nvarchar(200),data_start date,data_sfarsit date,valabil_pana_la date,cost_total decimal(15,2),created_at datetime2 DEFAULT sysdatetime(),updated_at datetime2);
    INSERT hr.training(denumire,tip) VALUES('SSM test','SSM');
    CREATE TABLE hr.training_employees(training_id int NOT NULL REFERENCES hr.training(id),employee_id int NOT NULL REFERENCES hr.employees(id),status nvarchar(30),CONSTRAINT uq_test_training_employee UNIQUE(training_id,employee_id));
    CREATE TABLE hr.authorizations(id int IDENTITY PRIMARY KEY,employee_id int,tip nvarchar(80),denumire nvarchar(200),numar_document nvarchar(100),emitent nvarchar(200),data_emitere date,data_expirare date,fisier_path nvarchar(500),alertat_la datetime2,activ bit,status nvarchar(30),created_at datetime2,updated_at datetime2);
    INSERT hr.authorizations(employee_id,tip,denumire,data_expirare,activ,status,created_at) VALUES(1,N'SSM',N'Autorizare test','2027-10-12',1,N'activ',sysdatetime());
  `)
  const evaluationMigration = fs.readFileSync(path.resolve(__dirname, '../../../db/migrations/077_hr_evaluations.sql'), 'utf8')
  for (let pass = 0; pass < 2; pass += 1) splitSqlBatches(evaluationMigration).forEach(batch => run(database, `${batch}\nSELECT 1;`))
  console.log(`Bază SQL sintetică păstrată: ${database}`)
  return (query, options) => run(database, query, options)
}
module.exports = { createSqlFixture }
