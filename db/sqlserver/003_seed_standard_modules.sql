/*
  InfraFlow 1.0 - seed module, roluri si permisiuni standard
*/

set xact_abort on;
begin transaction;

merge core.modules as target
using (values
  (N'production', N'Productie', N'#0f766e', N'factory', 1, 1),
  (N'technical', N'Tehnic', N'#2563eb', N'ruler', 1, 1),
  (N'accounting', N'Contabilitate', N'#7c3aed', N'calculator', 1, 1),
  (N'mechanization', N'Mecanizare', N'#b45309', N'truck', 1, 1),
  (N'concrete', N'Betoane', N'#64748b', N'blocks', 0, 1),
  (N'paving', N'Asternere asfalt', N'#475569', N'road', 0, 1),
  (N'traffic_safety', N'Siguranta circulatiei', N'#ca8a04', N'cone', 0, 1),
  (N'sewerage', N'Canalizare', N'#0891b2', N'waves', 0, 1),
  (N'inventory', N'Gestiune', N'#3f6212', N'warehouse', 1, 1),
  (N'procurement', N'Achizitii', N'#b91c1c', N'shopping-cart', 1, 1),
  (N'system', N'Sistem', N'#111827', N'settings', 1, 0)
) as source(module_key, name, color, icon, active_by_default, commercial_module)
on target.module_key = source.module_key
when matched then update set
  name = source.name,
  color = source.color,
  icon = source.icon,
  active_by_default = source.active_by_default,
  commercial_module = source.commercial_module
when not matched then insert (module_key, name, color, icon, active_by_default, commercial_module)
values (source.module_key, source.name, source.color, source.icon, source.active_by_default, source.commercial_module);

merge core.roles as target
using (values
  (N'superadmin', N'Superadmin', 100, 1),
  (N'admin', N'Admin', 90, 1),
  (N'manager', N'Manager', 70, 1),
  (N'inventory', N'Gestiune', 50, 1),
  (N'procurement', N'Achizitii', 50, 1),
  (N'technical', N'Tehnic', 50, 1),
  (N'mechanization', N'Mecanizare', 50, 1),
  (N'accounting', N'Contabilitate', 50, 1),
  (N'department', N'Departament', 30, 1),
  (N'operator', N'Operator', 30, 1),
  (N'viewer', N'Viewer', 10, 1)
) as source(role_key, name, level_no, system_role)
on target.role_key = source.role_key
when matched then update set name = source.name, level_no = source.level_no, system_role = source.system_role
when not matched then insert (role_key, name, level_no, system_role)
values (source.role_key, source.name, source.level_no, source.system_role);

merge workflow.templates as target
using (values
  (null, N'material', N'Solicitare materiale', N'inventory'),
  (null, N'asphalt', N'Solicitare asfalt', N'production'),
  (null, N'fleet', N'Solicitare utilaj/autovehicul', N'mechanization'),
  (null, N'procurement', N'Comanda aprovizionare', N'procurement'),
  (null, N'work_situation', N'Situatie lucrari', N'technical'),
  (null, N'nonconformity', N'Neconformitate', N'technical')
) as source(company_id, request_type, name, module_key)
on target.company_id is null and target.request_type = source.request_type
when matched then update set name = source.name, module_key = source.module_key, active = 1
when not matched then insert (company_id, request_type, name, module_key)
values (source.company_id, source.request_type, source.name, source.module_key);

if not exists (select 1 from core.schema_migrations where version = N'003_seed_standard_modules')
  insert into core.schema_migrations (version, description)
  values (N'003_seed_standard_modules', N'InfraFlow 1.0 module, roluri si workflow-uri standard');

commit transaction;

