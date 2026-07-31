/*
  InfraFlow - etichete comerciale generice pentru module si workflow-uri
  Pastreaza cheile istorice pentru compatibilitate, dar schimba numele afisate.
*/

set xact_abort on;
begin transaction;

if object_id(N'core.modules', N'U') is not null
begin
  update core.modules set name = N'Producție / Operațiuni' where module_key = N'production';
  update core.modules set name = N'Parc & Resurse' where module_key = N'mechanization';
  update core.modules set name = N'Beton / Prefabricate' where module_key = N'concrete';
  update core.modules set name = N'Lucrări / Execuție' where module_key = N'paving';
end;

if object_id(N'workflow.templates', N'U') is not null
begin
  update workflow.templates set name = N'Solicitare output operațional' where request_type = N'asphalt';
  update workflow.templates set name = N'Solicitare resursă mobilă' where request_type = N'fleet';
end;

if object_id(N'core.schema_migrations', N'U') is not null
  and not exists (select 1 from core.schema_migrations where version = N'069_commercial_generic_module_labels')
begin
  insert into core.schema_migrations (version, description)
  values (N'069_commercial_generic_module_labels', N'Etichete comerciale generice pentru module si workflow-uri standard');
end;

commit transaction;
