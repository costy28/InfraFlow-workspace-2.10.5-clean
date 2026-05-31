const permissionGroups = {
  dashboard: ["dashboard:view"],
  dailyReport: ["daily_report:view", "daily_report:print", "daily_report:export", "period_report:view", "period_report:print", "period_report:export"],
  accountingReport: ["accounting_report:view", "accounting_report:print", "accounting_report:export"],
  consumptions: ["consumptions:view", "consumptions:create", "consumptions:cancel", "consumptions:export"],
  recipes: ["recipes:view", "recipes:manage"],
  materials: ["materials:view", "materials:edit"],
  departmentRequests: ["department_requests:view", "department_requests:create", "department_requests:manage", "department_requests:plan"],
  stockOperations: ["stock_operations:view", "stock_operations:create", "stock_operations:cancel", "stock_operations:export"],
  gestiune: ["gestiune:view", "gestiune:nir", "gestiune:bon_consum", "gestiune:inventar", "gestiune:manage", "gestiune:reports"],
  inventoryModern: ["inventory:view", "inventory:entries", "inventory:exits", "inventory:transfers", "inventory:reports"],
  procurementModern: ["procurement:view", "procurement:receive"],
  referate: ["referate:view", "referate:create", "referate:achizitii", "referate:gestionar", "referate:secretariat", "referate:cfp", "referate:contabil_sef", "referate:dir_adjunct", "referate:dir_general", "referate:receptie"],
  deliveries: ["deliveries:view", "deliveries:create", "deliveries:cancel"],
  procurementOrders: ["procurement_orders:view", "procurement_orders:create", "procurement_orders:receive", "procurement_orders:close"],
  mechanization: ["mechanization:view", "mechanization:manage", "mechanization:request", "mechanization:approve"],
  fleet: ["fleet:trip_log_view", "fleet:trip_log_create", "fleet:trip_log_close", "fleet:trip_log_edit", "fleet:fc_view", "fleet:fc_create", "fleet:fc_edit", "fleet:fc_complete", "fleet:faz_generate"],
  technical: ["technical:view", "technical:worklog", "technical:sales", "technical:export"],
  costAccounting: ["cost_accounting:view", "cost_accounting:manage", "cost_accounting:import", "cost_accounting:export"],
  ledger: ["ledger:view", "ledger:export"],
  planning: ["planning:view", "planning:manage"],
  users: ["users:manage"],
  settings: ["settings:manage"],
  audit: ["audit:view", "audit:manage"],
  messaging: ["messaging:view", "messaging:send", "messaging:files", "messaging:admin"],
  tickets: ["tickets:create", "tickets:view_own", "tickets:view_dept", "tickets:view_all", "tickets:assign", "tickets:resolve", "tickets:admin"],
  documents: ["documents:create", "documents:view_own", "documents:view_dept", "documents:view_all", "documents:approve", "documents:sign", "documents:share", "documents:archive", "documents:templates", "documents:admin"],
  field: ["field:view", "field:journal_create", "field:journal_submit", "field:journal_approve", "field:photo_upload", "field:issue_report", "field:issue_resolve", "field:progress_view", "field:sign_request"],
  integration: ["integration:intersoft_view", "integration:intersoft_import", "integration:intersoft_export"],
  controlling: ["controlling:view", "controlling:view_all", "controlling:entry_create", "controlling:entry_validate", "controlling:budget_manage", "controlling:cost_centers", "controlling:reports", "controlling:nexus_export"],
  hr: ["hr:view", "hr:view_own", "hr:leave_own", "hr:manage", "hr:employees_manage", "hr:timesheet", "hr:timesheet_dept", "hr:timesheets_view", "hr:timesheets_manage", "hr:timesheet_approve", "hr:timesheets_validate", "hr:leave_manage", "hr:authorizations_manage", "hr:contracts_manage", "hr:reports", "hr:reges_export", "hr:salary_view", "hr:training"],
  sanitation: ["sanitation:view", "sanitation:collect", "sanitation:manage", "sanitation:report", "sanitation:contracts"],
  traffic_safety: ["traffic_safety:view", "traffic_safety:inspect", "traffic_safety:work_order", "traffic_safety:manage", "traffic_safety:report"],
  environment: ["environment:view", "environment:manage", "environment:permits", "environment:incidents", "environment:report"],
  legal: ["legal:view", "legal:manage", "legal:litigation", "legal:opinions", "legal:contracts"],
  archive: ["archive:view", "archive:manage", "archive:request", "archive:admin"],
  secretariat: ["secretariat:view", "secretariat:registry", "secretariat:assign", "secretariat:appointments", "secretariat:admin"],
  ai: ["ai:use", "ai:data_query", "ai:help", "ai:admin"],
  snow_removal: [
    "snow_removal:view",
    "snow_removal:duty_log",
    "snow_removal:route_sheet",
    "snow_removal:gps_import",
    "snow_removal:approve",
    "snow_removal:report",
    "snow_removal:config"
  ],
  asternere: ["asternere:view", "asternere:rapoarte", "asternere:manage"],
  anaf: ["anaf:view", "anaf:manage", "anaf:efactura"],
  system: ["system:view", "system:update", "system:admin"]
};

const allPermissions = Object.values(permissionGroups).flat();

const permissionGroupLabels = {
  dashboard: "Dashboard",
  dailyReport: "Rapoarte productie",
  accountingReport: "Raport contabil",
  consumptions: "Productie asfalt",
  recipes: "Retete",
  materials: "Stocuri materiale",
  departmentRequests: "Solicitari departamente",
  stockOperations: "Miscari stoc",
  gestiune: "Gestiune",
  inventoryModern: "Gestiune materiale",
  procurementModern: "Achizitii materiale",
  referate: "Referate aprovizionare si servicii",
  deliveries: "Aprovizionari simple",
  procurementOrders: "Comenzi aprovizionare",
  mechanization: "Mecanizare",
  fleet: "Foi parcurs si FAZ",
  technical: "Departament tehnic",
  costAccounting: "Contabilitate costuri",
  ledger: "Fisa stoc",
  planning: "Planificare",
  users: "Utilizatori",
  settings: "Setari",
  audit: "Audit",
  messaging: "Chat intern",
  tickets: "Sesizari si idei",
  documents: "Documente in circuit",
  field: "Teren si santiere",
  integration: "Integrare Intersoft",
  controlling: "Controlling",
  hr: "Resurse umane",
  sanitation: "Salubrizare",
  traffic_safety: "Siguranta circulatiei",
  environment: "Mediu",
  legal: "Juridic",
  archive: "Arhiva",
  secretariat: "Secretariat",
  ai: "Asistent AI",
  snow_removal: "Deszapezire",
  asternere: "Asternere asfalt",
  anaf: "ANAF / e-Factură",
  system: "Sistem"
};

const permissionLabels = {
  "dashboard:view": "Vede dashboard",
  "daily_report:view": "Vede raport zi",
  "daily_report:print": "Printeaza raport zi",
  "daily_report:export": "Exporta raport zi",
  "period_report:view": "Vede raport perioada",
  "period_report:print": "Printeaza raport perioada",
  "period_report:export": "Exporta raport perioada",
  "accounting_report:view": "Vede raport contabil",
  "accounting_report:print": "Printeaza raport contabil",
  "accounting_report:export": "Exporta raport contabil",
  "consumptions:view": "Vede consumuri",
  "consumptions:create": "Introduce consumuri",
  "consumptions:cancel": "Anuleaza consumuri",
  "consumptions:export": "Exporta consumuri",
  "recipes:view": "Vede retete",
  "recipes:manage": "Administreaza retete",
  "materials:view": "Vede stocuri",
  "materials:edit": "Modifica stocuri/materiale",
  "department_requests:view": "Vede solicitari",
  "department_requests:create": "Creeaza solicitari",
  "department_requests:manage": "Aproba/respinge solicitari",
  "department_requests:plan": "Transforma solicitari in plan",
  "stock_operations:view": "Vede miscari stoc",
  "stock_operations:create": "Creeaza miscari stoc",
  "stock_operations:cancel": "Anuleaza miscari stoc",
  "stock_operations:export": "Exporta miscari stoc",
  "gestiune:view": "Gestiune - vizualizare",
  "gestiune:nir": "Gestiune - receptie NIR",
  "gestiune:bon_consum": "Gestiune - bon consum",
  "gestiune:inventar": "Gestiune - inventar",
  "gestiune:manage": "Gestiune - administrare",
  "gestiune:reports": "Gestiune - rapoarte",
  "inventory:view": "Vede gestiunea",
  "inventory:entries": "Inregistreaza intrari in gestiune",
  "inventory:exits": "Inregistreaza iesiri din gestiune",
  "inventory:transfers": "Transfera materiale intre departamente",
  "inventory:reports": "Genereaza rapoarte de gestiune",
  "procurement:view": "Vede achizitii",
  "procurement:receive": "Receptioneaza achizitii",
  "referate:view": "Vede referate",
  "referate:create": "Creeaza referate",
  "referate:achizitii": "Avizeaza referate la Achizitii",
  "referate:gestionar": "Avizeaza referate ca Gestionar",
  "referate:secretariat": "Inregistreaza si transmite referate la Secretariat",
  "referate:cfp": "Acorda control financiar preventiv",
  "referate:contabil_sef": "Avizeaza referate ca Contabil Sef",
  "referate:dir_adjunct": "Avizeaza referate ca Director Adjunct",
  "referate:dir_general": "Aproba referate ca Director General",
  "referate:receptie": "Inregistreaza receptia facturii pe referat",
  "deliveries:view": "Vede aprovizionari",
  "deliveries:create": "Creeaza aprovizionari",
  "deliveries:cancel": "Anuleaza aprovizionari",
  "procurement_orders:view": "Vede comenzi",
  "procurement_orders:create": "Creeaza comenzi",
  "procurement_orders:receive": "Receptioneaza pe comenzi",
  "procurement_orders:close": "Inchide comenzi",
  "mechanization:view": "Vede mecanizare",
  "mechanization:manage": "Administreaza parc auto/utilaje",
  "mechanization:request": "Creeaza solicitari mecanizare",
  "mechanization:approve": "Aproba/planifica solicitari mecanizare",
  "fleet:trip_log_view": "Vede foi de parcurs",
  "fleet:trip_log_create": "Creeaza foi de parcurs",
  "fleet:trip_log_close": "Inchide foi de parcurs",
  "fleet:trip_log_edit": "Editeaza verso foi de parcurs",
  "fleet:fc_view": "Vede fise consum utilaje",
  "fleet:fc_create": "Creeaza fise consum utilaje",
  "fleet:fc_edit": "Editeaza fise consum utilaje",
  "fleet:fc_complete": "Marcheaza fise consum completate",
  "fleet:faz_generate": "Genereaza FAZ lunar",
  "technical:view": "Vede raport tehnic",
  "technical:worklog": "Pontaj utilaj/lucrare",
  "technical:sales": "Vanzari asfalt",
  "technical:export": "Exporta raport tehnic",
  "cost_accounting:view": "Vede costuri",
  "cost_accounting:manage": "Administreaza centre cost",
  "cost_accounting:import": "Importa cheltuieli",
  "cost_accounting:export": "Exporta costuri",
  "ledger:view": "Vede fisa stoc",
  "ledger:export": "Exporta fisa stoc",
  "planning:view": "Vede planificare",
  "planning:manage": "Administreaza planificare",
  "users:manage": "Administreaza utilizatori",
  "settings:manage": "Administreaza setari/licenta",
  "audit:view": "Vede audit",
  "audit:manage": "Curata audit",
  "messaging:view": "Vede canale chat",
  "messaging:send": "Trimite mesaje chat",
  "messaging:files": "Ataseaza fisiere in chat",
  "messaging:admin": "Administreaza canale chat",
  "tickets:create": "Creeaza sesizari si idei",
  "tickets:view_own": "Vede sesizarile proprii",
  "tickets:view_dept": "Vede sesizarile departamentului",
  "tickets:view_all": "Vede toate sesizarile",
  "tickets:assign": "Asigneaza sesizari",
  "tickets:resolve": "Rezolva sesizari",
  "tickets:admin": "Administreaza sesizari si rapoarte",
  "documents:create": "Creeaza documente",
  "documents:view_own": "Vede documentele proprii",
  "documents:view_dept": "Vede documentele departamentului",
  "documents:view_all": "Vede toate documentele",
  "documents:approve": "Aproba sau avizeaza documente",
  "documents:sign": "Semneaza documente",
  "documents:share": "Partajeaza documente",
  "documents:archive": "Arhiveaza documente",
  "documents:templates": "Administreaza sabloane documente",
  "documents:admin": "Administreaza circuitul documentelor",
  "field:view": "Vede jurnale de santier",
  "field:journal_create": "Creeaza si editeaza jurnale",
  "field:journal_submit": "Trimite jurnale spre aprobare",
  "field:journal_approve": "Aproba jurnale de santier",
  "field:photo_upload": "Incarca fotografii din teren",
  "field:issue_report": "Raporteaza probleme din teren",
  "field:issue_resolve": "Rezolva probleme din teren",
  "field:progress_view": "Vede progresul proiectelor",
  "field:sign_request": "Genereaza link de semnare",
  "integration:intersoft_view": "Vizualizare integrare Intersoft",
  "integration:intersoft_import": "Import devize și situații din Intersoft",
  "integration:intersoft_export": "Export cantități realizate spre Intersoft",
  "controlling:view": "Vede propriul centru de cost",
  "controlling:view_all": "Vede toate centrele de cost",
  "controlling:entry_create": "Adauga cheltuieli manuale",
  "controlling:entry_validate": "Valideaza cheltuieli",
  "controlling:budget_manage": "Gestioneaza bugete",
  "controlling:cost_centers": "Gestioneaza centre si subcentre",
  "controlling:reports": "Genereaza rapoarte controlling",
  "controlling:nexus_export": "Exporta spre Nexus",
  "hr:view": "Vede angajati si pontaje",
  "hr:view_own": "HR — date proprii (Kiosk)",
  "hr:leave_own": "Concedii — cerere proprie (Kiosk)",
  "hr:manage": "Administreaza angajati si contracte",
  "hr:employees_manage": "Administreaza angajati",
  "hr:timesheet": "Completeaza pontaje",
  "hr:timesheet_dept": "Completeaza pontaj departament propriu",
  "hr:timesheets_view": "Vede pontaje",
  "hr:timesheets_manage": "Administreaza pontaje",
  "hr:timesheet_approve": "Valideaza pontaje",
  "hr:timesheets_validate": "Valideaza pontaje",
  "hr:leave_manage": "Administreaza concedii",
  "hr:authorizations_manage": "Administreaza autorizatii HR",
  "hr:contracts_manage": "Administreaza contracte HR",
  "hr:reports": "Genereaza rapoarte HR",
  "hr:reges_export": "Exporta REGES/ReviSal",
  "hr:salary_view": "Vede salarii",
  "hr:training": "Administreaza formari profesionale",
  "sanitation:view": "Vede modulul salubrizare",
  "sanitation:collect": "Inregistreaza colectari",
  "sanitation:manage": "Administreaza zone si rute",
  "sanitation:report": "Genereaza rapoarte salubrizare",
  "sanitation:contracts": "Administreaza contracte salubrizare",
  "traffic_safety:view": "Vede inventarul de siguranta circulatiei",
  "traffic_safety:inspect": "Inregistreaza inspectii",
  "traffic_safety:work_order": "Gestioneaza ordine de lucru",
  "traffic_safety:manage": "Administreaza indicatoare, marcaje si mobilier",
  "traffic_safety:report": "Genereaza rapoarte siguranta circulatiei",
  "environment:view": "Vede autorizatii si monitorizare mediu",
  "environment:manage": "Administreaza documente si incidente de mediu",
  "environment:permits": "Administreaza autorizatii de mediu",
  "environment:incidents": "Gestioneaza incidente de mediu",
  "environment:report": "Genereaza rapoarte de mediu",
  "legal:view": "Vede contracte si litigii",
  "legal:manage": "Administreaza contracte, litigii si opinii juridice",
  "legal:litigation": "Gestioneaza dosare si termene juridice",
  "legal:opinions": "Gestioneaza opinii juridice",
  "legal:contracts": "Gestioneaza contracte juridice",
  "archive:view": "Vede arhiva",
  "archive:manage": "Administreaza documente de arhiva",
  "archive:request": "Solicita documente din arhiva",
  "archive:admin": "Administreaza configurarea arhivei",
  "secretariat:view": "Vede registrul secretariat",
  "secretariat:registry": "Administreaza registrul de corespondenta",
  "secretariat:assign": "Repartizeaza corespondenta",
  "secretariat:appointments": "Administreaza programari si sedinte",
  "secretariat:admin": "Administreaza modulul secretariat",
  "ai:use": "Folosire asistent AI",
  "ai:data_query": "Interogare date prin AI",
  "ai:help": "Help și documentație AI",
  "ai:admin": "Administrare modul AI",
  "snow_removal:view": "Vizualizare deszăpezire",
  "snow_removal:duty_log": "Completare jurnal zilnic",
  "snow_removal:route_sheet": "Completare fișe traseu FAZ",
  "snow_removal:gps_import": "Import date GPS",
  "snow_removal:approve": "Aprobare jurnale",
  "snow_removal:report": "Generare rapoarte lunare",
  "snow_removal:config": "Configurare sezoane și sectoare",
  "asternere:view": "Asternere — vizualizare lucrări",
  "asternere:rapoarte": "Asternere — rapoarte zilnice",
  "asternere:manage": "Asternere — administrare lucrări",
  "anaf:view": "ANAF — vizualizare facturi",
  "anaf:manage": "ANAF — creare și editare facturi",
  "anaf:efactura": "ANAF — trimitere e-Factură SPV",
  "system:view": "Vede sistem/diagnostic",
  "system:update": "Instaleaza update-uri aplicatie",
  "system:admin": "Administrare sistem"
};

const roleInfo = {
  superadmin: {
    name: "Superadmin",
    description: "Control complet: licenta, setari sensibile, backup/restore, utilizatori si toate modulele."
  },
  admin: {
    name: "Admin",
    description: "Administrare utilizatori si operare completa, fara zona sensibila de licenta si backup."
  },
  manager: {
    name: "Sef statie",
    description: "Coordoneaza productia, planificarea, solicitarile si rapoartele."
  },
  inventory: {
    name: "Gestiune",
    description: "Gestioneaza stocuri, intrari, iesiri catre departamente, fise si rapoarte."
  },
  hr: {
    name: "HR",
    description: "Administreaza angajati, pontaje, concedii, autorizatii si rapoarte HR."
  },
  procurement: {
    name: "Achizitii",
    description: "Vede necesarul de aprovizionare si introduce intrari de materiale."
  },
  mechanization: {
    name: "Mecanizare",
    description: "Administreaza parcul auto/utilajele si aproba solicitarile pe intervale orare."
  },
  technical: {
    name: "Departament tehnic",
    description: "Urmareste ore lucrate pe utilaje/lucrari si rapoarte de productie, vanzare si ramas asfalt."
  },
  accounting: {
    name: "Contabilitate",
    description: "Consulta rapoarte, centre de cost, cheltuieli importate si costuri pe ora."
  },
  operator: {
    name: "Operator statie",
    description: "Introduce consumuri si consulta informatiile necesare productiei."
  },
  department: {
    name: "Departament",
    description: "Trimite solicitari de asfalt/materiale si consulta planificarea proprie."
  },
  viewer: {
    name: "Viewer",
    description: "Acces doar de citire, fara modificari."
  }
};

const rolePermissions = {
  superadmin: allPermissions,
  admin: allPermissions.filter((permission) => !["settings:manage", "audit:manage", "system:view"].includes(permission)),
  manager: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    ...permissionGroups.consumptions,
    "recipes:view",
    ...permissionGroups.planning,
    ...permissionGroups.departmentRequests,
    "materials:view",
    "stock_operations:view",
    "stock_operations:export",
    "deliveries:view",
    "procurement_orders:view",
    "referate:view",
    "referate:dir_adjunct",
    "referate:dir_general",
    "mechanization:view",
    "mechanization:approve",
    ...permissionGroups.technical,
    "cost_accounting:view",
    "cost_accounting:export",
    ...permissionGroups.ledger,
    "audit:view"
  ],
  inventory: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    "recipes:view",
    "department_requests:view",
    ...permissionGroups.gestiune,
    ...permissionGroups.materials,
    ...permissionGroups.stockOperations,
    ...permissionGroups.inventoryModern,
    ...permissionGroups.deliveries,
    ...permissionGroups.procurementOrders,
    ...permissionGroups.procurementModern,
    "referate:view",
    "referate:gestionar",
    "referate:receptie",
    "mechanization:view",
    ...permissionGroups.ledger,
    "consumptions:view",
    "consumptions:export",
    "messaging:view",
    "messaging:send",
    "tickets:create",
    "tickets:view_own",
    "audit:view"
  ],
  hr: [
    "hr:view",
    "hr:employees_manage",
    "hr:manage",
    "hr:timesheets_view",
    "hr:timesheet",
    "hr:timesheet_dept",
    "hr:timesheets_manage",
    "hr:timesheet_approve",
    "hr:timesheets_validate",
    "hr:leave_manage",
    "hr:authorizations_manage",
    "hr:contracts_manage",
    "hr:reports",
    "hr:reges_export",
    "hr:salary_view",
    "hr:training",
    "documents:view_own",
    "documents:view_dept",
    "documents:create",
    "messaging:view",
    "messaging:send",
    "tickets:create",
    "tickets:view_own",
    "secretariat:view",
    "secretariat:registry",
    "referate:view",
    "referate:secretariat"
  ],
  procurement: [
    ...permissionGroups.dashboard,
    "daily_report:view",
    "period_report:view",
    "accounting_report:view",
    "accounting_report:export",
    "recipes:view",
    "materials:view",
    "department_requests:view",
    "stock_operations:view",
    "stock_operations:export",
    ...permissionGroups.deliveries,
    ...permissionGroups.procurementOrders,
    ...permissionGroups.referate,
    ...permissionGroups.ledger,
    "planning:view"
  ],
  mechanization: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    ...permissionGroups.mechanization,
    ...permissionGroups.fleet,
    "technical:worklog",
    "planning:view",
    "audit:view"
  ],
  technical: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    "mechanization:view",
    ...permissionGroups.technical,
    "planning:view",
    "consumptions:view",
    "consumptions:export",
    "recipes:view",
    "materials:view"
  ],
  accounting: [
    ...permissionGroups.dashboard,
    ...permissionGroups.dailyReport,
    ...permissionGroups.accountingReport,
    ...permissionGroups.costAccounting,
    "technical:view",
    "technical:export",
    "mechanization:view",
    "recipes:view",
    "materials:view",
    "consumptions:view",
    "consumptions:export",
    "stock_operations:view",
    "stock_operations:export",
    "deliveries:view",
    ...permissionGroups.ledger,
    "planning:view",
    "department_requests:view",
    "referate:view",
    "referate:cfp",
    "referate:contabil_sef"
  ],
  operator: [
    ...permissionGroups.dashboard,
    "consumptions:view",
    "consumptions:create",
    "department_requests:view",
    "department_requests:create",
    "recipes:view",
    "materials:view"
  ],
  department: [
    ...permissionGroups.dashboard,
    "department_requests:view",
    "department_requests:create",
    "mechanization:view",
    "mechanization:request",
    "technical:view",
    "technical:worklog",
    "recipes:view",
    "materials:view",
    "planning:view",
    "referate:view",
    "referate:create"
  ],
  viewer: [
    ...permissionGroups.dashboard,
    "accounting_report:view",
    "department_requests:view",
    "consumptions:view",
    "recipes:view",
    "materials:view",
    "stock_operations:view",
    "deliveries:view",
    "procurement_orders:view",
    "referate:view",
    "mechanization:view",
    "technical:view",
    "cost_accounting:view",
    "ledger:view",
    "planning:view"
  ]
};

// ─── Roluri default (seed la prima pornire sau dacă lipsesc) ──────────────────

const DEFAULT_CUSTOM_ROLES = [
  {
    id: 'sofer',
    name: 'Șofer',
    description: 'Primește și completează foi de parcurs. Acces la Kiosk și PWA /sofer.',
    tip: 'default',
    permissions: [
      'fleet:trip_log_view', 'fleet:trip_log_create', 'fleet:trip_log_close',
      'hr:view_own', 'hr:timesheet', 'hr:leave_own',
      'dashboard:view', 'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own',
    ],
  },
  {
    id: 'mecanic-utilaj',
    name: 'Mecanic / Operator utilaj',
    description: 'Introduce bonuri de lucru, alimentări și intervenții. Acces la Kiosk.',
    tip: 'default',
    permissions: [
      'mechanization:view', 'mechanization:request',
      'fleet:trip_log_view', 'fleet:trip_log_create', 'fleet:trip_log_close',
      'fleet:fc_view', 'fleet:fc_create', 'fleet:fc_complete',
      'hr:view_own', 'hr:timesheet', 'hr:leave_own',
      'technical:worklog', 'dashboard:view',
      'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own',
    ],
  },
  {
    id: 'gestionar',
    name: 'Gestionar',
    description: 'Gestiune completă: NIR, bon consum, inventar, furnizori, raport valoric.',
    tip: 'default',
    permissions: [
      'dashboard:view',
      'gestiune:view', 'gestiune:nir', 'gestiune:bon_consum',
      'gestiune:inventar', 'gestiune:manage', 'gestiune:reports',
      'inventory:view', 'inventory:entries', 'inventory:exits',
      'inventory:transfers', 'inventory:reports',
      'materials:view', 'materials:edit',
      'stock_operations:view', 'stock_operations:create', 'stock_operations:cancel', 'stock_operations:export',
      'deliveries:view', 'deliveries:create', 'deliveries:cancel',
      'procurement_orders:view', 'procurement_orders:create', 'procurement_orders:receive', 'procurement_orders:close',
      'hr:view_own', 'hr:timesheet', 'hr:leave_own',
      'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own',
    ],
  },
  {
    id: 'magaziner',
    name: 'Magaziner',
    description: 'Operațiuni zilnice gestiune: recepție NIR și eliberare bon consum.',
    tip: 'default',
    permissions: [
      'dashboard:view',
      'gestiune:view', 'gestiune:nir', 'gestiune:bon_consum',
      'inventory:view', 'inventory:entries', 'inventory:exits',
      'materials:view',
      'stock_operations:view', 'stock_operations:create',
      'deliveries:view', 'deliveries:create',
      'hr:view_own', 'hr:timesheet', 'hr:leave_own',
      'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own',
    ],
  },
  {
    id: 'hr-manager',
    name: 'HR Manager',
    description: 'Administrare completă HR: angajați, pontaj, concedii, autorizații, rapoarte.',
    tip: 'default',
    permissions: [
      'dashboard:view',
      'hr:view', 'hr:manage', 'hr:employees_manage',
      'hr:timesheet', 'hr:timesheets_view', 'hr:timesheets_manage',
      'hr:timesheet_approve', 'hr:timesheets_validate',
      'hr:leave_manage', 'hr:authorizations_manage', 'hr:contracts_manage',
      'hr:reports', 'hr:reges_export', 'hr:salary_view', 'hr:training',
      'documents:view_own', 'documents:view_dept', 'documents:create',
      'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own',
    ],
  },
  {
    id: 'contabil',
    name: 'Contabil',
    description: 'Controlling, rapoarte financiare, export date.',
    tip: 'default',
    permissions: [
      'dashboard:view',
      'controlling:view', 'controlling:view_all', 'controlling:entry_create',
      'controlling:entry_validate', 'controlling:budget_manage',
      'controlling:cost_centers', 'controlling:reports', 'controlling:nexus_export',
      'cost_accounting:view', 'cost_accounting:manage', 'cost_accounting:import', 'cost_accounting:export',
      'accounting_report:view', 'accounting_report:print', 'accounting_report:export',
      'ledger:view', 'ledger:export',
      'mechanization:view', 'technical:view', 'technical:export',
      'materials:view', 'stock_operations:view', 'stock_operations:export',
      'consumptions:view', 'consumptions:export',
      'hr:view_own', 'hr:timesheet', 'hr:leave_own',
      'messaging:view', 'messaging:send',
    ],
  },
  {
    id: 'sef-departament',
    name: 'Șef Departament',
    description: 'Departamentul propriu, solicitări personal/utilaje, pontaj echipă.',
    tip: 'default',
    permissions: [
      'dashboard:view',
      'department_requests:view', 'department_requests:create', 'department_requests:manage',
      'mechanization:view', 'mechanization:request',
      'technical:view', 'technical:worklog',
      'materials:view', 'planning:view',
      'hr:timesheets_view', 'hr:timesheet', 'hr:timesheet_dept', 'hr:view_own', 'hr:leave_own',
      'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own', 'tickets:view_dept',
    ],
  },
  {
    id: 'angajat',
    name: 'Angajat',
    description: 'Kiosk self-service: pontaj propriu, cereri concediu, autorizații.',
    tip: 'default',
    permissions: [
      'dashboard:view',
      'hr:view_own', 'hr:timesheet', 'hr:leave_own',
      'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own',
    ],
  },
  {
    id: 'dispecer',
    name: 'Dispecer',
    description: 'Planificare utilaje, solicitări, flotă read-only.',
    tip: 'default',
    permissions: [
      'dashboard:view',
      'planning:view', 'planning:manage',
      'fleet:trip_log_view', 'fleet:fc_view',
      'mechanization:view', 'mechanization:request',
      'department_requests:view', 'department_requests:manage',
      'hr:view_own', 'hr:timesheet', 'hr:leave_own',
      'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own',
    ],
  },
  {
    id: 'operator-statie',
    name: 'Operator Stație',
    description: 'Producție asfalt, consum zilnic, stocuri view.',
    tip: 'default',
    permissions: [
      'dashboard:view',
      'consumptions:view', 'consumptions:create',
      'daily_report:view',
      'recipes:view', 'materials:view',
      'department_requests:view', 'department_requests:create',
      'hr:view_own', 'hr:timesheet', 'hr:leave_own',
      'messaging:view', 'messaging:send',
      'tickets:create', 'tickets:view_own',
    ],
  },
];

const SYSTEM_ROLE_IDS = new Set(['superadmin', 'admin']);

function legacyDefaultRoles() {
  return Object.entries(rolePermissions)
    .filter(([id]) => !SYSTEM_ROLE_IDS.has(id))
    .map(([id, permissions]) => ({
      id,
      name: roleInfo[id]?.name || id,
      description: roleInfo[id]?.description || '',
      tip: 'default',
      permissions: [...permissions],
    }));
}

/**
 * Populează settings.customRoles cu rolurile default dacă nu există.
 * Apelată la fiecare GET /roles — scrie în DB doar dacă s-a adăugat ceva.
 */
function ensureDefaultCustomRoles(settings) {
  if (!Array.isArray(settings.customRoles)) settings.customRoles = [];
  let changed = false;
  [...legacyDefaultRoles(), ...DEFAULT_CUSTOM_ROLES].forEach(def => {
    const existing = settings.customRoles.find(r => r.id === def.id);
    if (!existing) {
      settings.customRoles.push({ ...def, permissions: [...def.permissions] });
      changed = true;
    } else if (existing.tip === 'default' && Array.isArray(existing.permissions)) {
      def.permissions.forEach(permission => {
        if (!existing.permissions.includes(permission)) {
          existing.permissions.push(permission);
          changed = true;
        }
      });
    }
  });
  return changed;
}

// ─────────────────────────────────────────────────────────────────────────────

const legacyPermissionAliases = {
  read: [
    "dashboard:view",
    "daily_report:view",
    "period_report:view",
    "department_requests:view",
    "consumptions:view",
    "recipes:view",
    "materials:view",
    "stock_operations:view",
    "deliveries:view",
    "procurement_orders:view",
    "referate:view",
    "mechanization:view",
    "technical:view",
    "cost_accounting:view",
    "ledger:view",
    "planning:view"
  ],
  write: [
    "consumptions:create",
    "recipes:manage",
    "materials:edit",
    "department_requests:create",
    "department_requests:manage",
    "department_requests:plan",
    "stock_operations:create",
    "deliveries:create",
    "procurement_orders:create",
    "procurement_orders:receive",
    "referate:create",
    "referate:achizitii",
    "referate:gestionar",
    "referate:secretariat",
    "referate:cfp",
    "referate:contabil_sef",
    "referate:dir_adjunct",
    "referate:dir_general",
    "referate:receptie",
    "mechanization:request",
    "technical:worklog",
    "technical:sales",
    "cost_accounting:manage",
    "cost_accounting:import",
    "planning:manage"
  ],
  cancel: [
    "consumptions:cancel",
    "stock_operations:cancel",
    "deliveries:cancel",
    "procurement_orders:close",
    "mechanization:approve"
  ],
  audit: ["audit:view"],
  manage_users: ["users:manage"],
  manage_settings: ["settings:manage"]
};

const licenseAdminPermissions = new Set([
  "dashboard:view",
  "settings:manage",
  "audit:view",
  "audit:manage",
  "system:view",
  "system:update",
  "system:admin"
]);

const licenseModulePermissions = {
  core: [
    "dashboard:view",
    "daily_report:view",
    "period_report:view",
    "recipes:view",
    "materials:view",
    "consumptions:view",
    "consumptions:create"
  ],
  production: [
    "consumptions:view",
    "consumptions:create",
    "consumptions:cancel",
    "consumptions:export",
    "recipes:view",
    "recipes:manage"
  ],
  reports: [
    "daily_report:view",
    "daily_report:print",
    "daily_report:export",
    "period_report:view",
    "period_report:print",
    "period_report:export",
    "accounting_report:view",
    "accounting_report:print",
    "accounting_report:export",
    "consumptions:export",
    "stock_operations:export",
    "ledger:export"
  ],
  stock: [
    "materials:view",
    "materials:edit",
    "stock_operations:view",
    "stock_operations:create",
    "stock_operations:cancel",
    "stock_operations:export",
    "deliveries:view",
    "deliveries:create",
    "deliveries:cancel",
    "ledger:view",
    "ledger:export"
  ],
  planning: [
    "planning:view",
    "planning:manage",
    "department_requests:view",
    "department_requests:create",
    "department_requests:manage",
    "department_requests:plan"
  ],
  procurement: [
    "dashboard:view",
    "materials:view",
    "deliveries:view",
    "deliveries:create",
    "deliveries:cancel",
    "procurement_orders:view",
    "procurement_orders:create",
    "procurement_orders:receive",
    "procurement_orders:close",
    "ledger:view",
    "ledger:export",
    "planning:view",
    "department_requests:view",
    ...permissionGroups.referate
  ],
  mechanization: [
    "dashboard:view",
    "mechanization:view",
    "mechanization:manage",
    "mechanization:request",
    "mechanization:approve",
    ...permissionGroups.fleet,
    "technical:worklog",
    "department_requests:view"
  ],
  technical: [
    "dashboard:view",
    "technical:view",
    "technical:worklog",
    "technical:sales",
    "technical:export",
    "mechanization:view",
    "consumptions:view",
    "consumptions:export",
    "recipes:view",
    "materials:view",
    "planning:view",
    "department_requests:view"
  ],
  cost_accounting: [
    "dashboard:view",
    "cost_accounting:view",
    "cost_accounting:manage",
    "cost_accounting:import",
    "cost_accounting:export",
    "technical:view",
    "technical:export",
    "mechanization:view",
    "accounting_report:view",
    "accounting_report:print",
    "accounting_report:export",
    "consumptions:view",
    "stock_operations:view",
    "ledger:view",
    "ledger:export"
  ]
};

function requirePermission(auth, res, permission) {
  if (!authHasPermission(auth, permission)) {
    sendJson(res, 403, { error: "Nu ai permisiune pentru aceasta actiune." });
    return false;
  }
  return true;
}

function requireSuperadmin(auth, res) {
  if (!userHasRole(auth.user, "superadmin")) {
    sendJson(res, 403, { error: "Doar Superadminul poate face aceasta actiune." });
    return false;
  }
  return true;
}

function requireAnyPermission(auth, res, permissions) {
  if (!permissions.some((permission) => authHasPermission(auth, permission))) {
    sendJson(res, 403, { error: "Nu ai permisiune pentru aceasta actiune." });
    return false;
  }
  return true;
}

function authHasPermission(auth, permission) {
  if (userHasRole(auth.user, "superadmin")) return true;
  const rolePermissions = effectivePermissionsForUser(auth.user, auth.db);
  if (!rolePermissions.includes(permission)) return false;
  if (["hr:view_own", "hr:leave_own", "hr:timesheet", "hr:timesheet_dept"].includes(permission)) return true;
  if (auth.user.departmentId) {
    const dept = (auth.db.departments || []).find(d => d.id === auth.user.departmentId);
    if (dept && Array.isArray(dept.permissions)) {
      return dept.permissions.includes(permission);
    }
  }
  return true;
}

function permissionsFor(role, settings = {}) {
  const overrides = normalizeRolePermissionOverrides(settings.rolePermissionOverrides || {});
  const customRoles = Array.isArray(settings.customRoles) ? settings.customRoles : [];
  const customRole = SYSTEM_ROLE_IDS.has(role) ? null : customRoles.find(r => r.id === role);

  const permissions = customRole
    ? (Array.isArray(customRole.permissions) ? customRole.permissions : [])
    : (overrides[role] || rolePermissions[role] || rolePermissions.viewer);

  const expanded = new Set(permissions);
  Object.entries(legacyPermissionAliases).forEach(([legacy, granular]) => {
    if (granular.some((permission) => expanded.has(permission))) {
      expanded.add(legacy);
    }
  });
  return Array.from(expanded);
}

function effectivePermissionsFor(role, settings) {
  return permissionsFor(role, settings).filter((permission) => permissionAllowedByLicense(permission, settings?.license));
}

function effectivePermissionsForUser(user, db) {
  const roles = normalizedUserRoles(user);
  const permissions = Array.from(new Set(roles.flatMap((role) => effectivePermissionsFor(role, db.settings))));
  if (roles.includes("superadmin") || !user.departmentId) return permissions;
  const department = (db.departments || []).find((item) => item.id === user.departmentId);
  if (!department || !Array.isArray(department.permissions)) return permissions;
  const selfService = new Set(["hr:view_own", "hr:leave_own", "hr:timesheet", "hr:timesheet_dept"]);
  return permissions.filter((permission) => department.permissions.includes(permission) || selfService.has(permission));
}

function normalizedUserRoles(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return Array.from(new Set([...roles, user?.role || "viewer"].map((role) => String(role || "").trim()).filter(Boolean)));
}

function userHasRole(user, role) {
  return normalizedUserRoles(user).includes(role);
}

function permissionAllowedByLicense(permission, licenseInput) {
  const license = normalizeLicense(licenseInput || {});
  if (license.status === "internal") return true;
  if (license.status === "expired") return licenseAdminPermissions.has(permission);
  if (licenseAdminPermissions.has(permission) || permission === "users:manage") return true;
  const modules = normalizedLicenseModules(license);
  if (!modules.length || modules.includes("all") || modules.includes("full")) return true;
  const granular = legacyPermissionAliases[permission] || [permission];
  const allowed = new Set();
  modules.forEach((module) => {
    (licenseModulePermissions[module] || []).forEach((item) => allowed.add(item));
  });
  return granular.some((item) => allowed.has(item));
}

function normalizedLicenseModules(license) {
  return Array.isArray(license.modules)
    ? license.modules.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    : [];
}

function normalizeRolePermissionOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowed = new Set(allPermissions);
  return Object.fromEntries(Object.entries(input)
    .filter(([role]) => rolePermissions[role] && role !== "superadmin")
    .map(([role, permissions]) => [
      role,
      Array.from(new Set(Array.isArray(permissions) ? permissions.filter((permission) => allowed.has(permission)) : []))
    ]));
}

function rolePermissionCatalog() {
  return Object.entries(permissionGroups).map(([id, permissions]) => ({
    id,
    label: permissionGroupLabels[id] || id,
    permissions: permissions.map((permission) => ({
      id: permission,
      label: permissionLabels[permission] || permission
    }))
  }));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    roles: normalizedUserRoles(user),
    departmentId: user.departmentId || ""
  };
}

function adminUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email || "",
    role: user.role,
    roles: normalizedUserRoles(user),
    departmentId: user.departmentId || "",
    department: user.department || "",
    active: user.active !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function adminDepartment(dept) {
  return {
    id: dept.id,
    name: dept.name,
    tip: dept.tip || dept.type || "departament",
    icon: dept.icon || "👥",
    culoare: dept.culoare || dept.color || "#3B82F6",
    moduleKey: dept.moduleKey || moduleKeyForDepartmentName(dept.name),
    color: dept.color || "",
    permissions: dept.permissions || []
  };
}

function rolesList(settings) {
  const customRoles = Array.isArray(settings?.customRoles) ? settings.customRoles : [];

  const systemRoles = ['superadmin', 'admin'].map((id) => {
    const permissions = rolePermissions[id] || [];
    const effective = effectivePermissionsFor(id, settings);
    return {
      id,
      name: roleInfo[id]?.name || id,
      description: roleInfo[id]?.description || "",
      tip: 'sistem',
      modules: roleModules(id, settings),
      permissions: effective,
      basePermissions: permissions,
      customized: false
    };
  });

  const custom = customRoles.map(cr => {
    const effective = effectivePermissionsFor(cr.id, settings);
    return {
      id: cr.id,
      name: cr.name || cr.id,
      description: cr.description || "",
      tip: cr.tip || 'custom',
      modules: roleModules(cr.id, settings),
      permissions: effective,
      basePermissions: Array.isArray(cr.permissions) ? cr.permissions : [],
      customized: false,
    };
  });

  return [...systemRoles, ...custom];
}

function roleModules(role, settings) {
  const permissions = effectivePermissionsFor(role, settings);
  const modules = [];
  if (permissions.includes("settings:manage")) modules.push("licenta/setari");
  if (permissions.includes("system:view")) modules.push("sistem/diagnostic");
  if (permissions.includes("users:manage")) modules.push("utilizatori");
  if (permissions.includes("planning:manage")) modules.push("planificare");
  if (permissions.includes("department_requests:manage")) modules.push("solicitari");
  if (permissions.includes("materials:edit") || permissions.includes("stock_operations:create")) modules.push("gestiune stoc");
  if (permissions.includes("deliveries:create")) modules.push("aprovizionari");
  if (permissions.includes("procurement_orders:create") || permissions.includes("procurement_orders:receive")) modules.push("comenzi aprovizionare");
  if (permissions.includes("mechanization:manage") || permissions.includes("mechanization:request")) modules.push("mecanizare");
  if (permissions.includes("technical:worklog") && !permissions.includes("technical:sales")) modules.push("pontaj utilaj/lucrare");
  if (permissions.includes("technical:sales") || permissions.includes("technical:view")) modules.push("departament tehnic");
  if (permissions.includes("cost_accounting:manage") || permissions.includes("cost_accounting:import")) modules.push("contabilitate costuri");
  if (permissions.includes("consumptions:create")) modules.push("consum asfalt");
  if (permissions.includes("recipes:manage")) modules.push("retete");
  if (permissions.includes("audit:view")) modules.push("audit");
  if (permissions.includes("fleet:trip_log_view")) modules.push("foi de parcurs");
  if (permissions.includes("hr:leave_own") || permissions.includes("hr:view_own")) modules.push("kiosk angajat");
  if (permissions.includes("gestiune:view")) modules.push("gestiune/depozit");
  if (permissions.includes("asternere:view")) modules.push("asternere asfalt");
  if (permissions.includes("anaf:view")) modules.push("ANAF / e-Factura");
  if (permissions.includes("referate:view")) modules.push("referate");
  if (!modules.length) modules.push("citire");
  return modules;
}

function updateRolePermissions(db, user, roleId, body) {
  const role = String(roleId || "").trim();
  if (SYSTEM_ROLE_IDS.has(role)) throwHttp(400, "Permisiunile rolurilor de sistem nu se modifica.");
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  ensureDefaultCustomRoles(db.settings);
  const customRole = db.settings.customRoles.find((item) => item.id === role);
  if (customRole) {
    if (body.reset === true) {
      const defaultRole = [...legacyDefaultRoles(), ...DEFAULT_CUSTOM_ROLES].find((item) => item.id === role);
      if (defaultRole) customRole.permissions = [...defaultRole.permissions];
    } else {
      customRole.permissions = sanitizeRolePermissions(body.permissions);
    }
    return rolesList(db.settings).find((item) => item.id === role);
  }
  if (!rolePermissions[role]) throwHttp(404, "Rol inexistent.");
  db.settings.rolePermissionOverrides = normalizeRolePermissionOverrides(db.settings.rolePermissionOverrides || {});
  if (body.reset === true) {
    delete db.settings.rolePermissionOverrides[role];
  } else {
    db.settings.rolePermissionOverrides[role] = sanitizeRolePermissions(body.permissions);
  }
  db.settings.rolePermissionOverridesUpdatedAt = new Date().toISOString();
  db.settings.rolePermissionOverridesUpdatedBy = user.id;
  db.settings.rolePermissionOverridesUpdatedByName = user.name;
  return rolesList(db.settings).find((item) => item.id === role);
}

function sanitizeRolePermissions(permissions) {
  const allowed = new Set(allPermissions);
  return Array.from(new Set((Array.isArray(permissions) ? permissions : [])
    .map((permission) => String(permission || "").trim())
    .filter((permission) => allowed.has(permission))));
}

function moduleKeyForDepartmentName(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("tehnic")) return "tehnic";
  if (value.includes("mecanizare") || value.includes("parc")) return "mecanizare";
  if (value.includes("gestiune")) return "gestiune";
  if (value.includes("conta")) return "contabilitate";
  if (value.includes("betoane")) return "betoane";
  if (value.includes("asternere")) return "asternere";
  if (value.includes("canalizare")) return "canalizare";
  if (value.includes("achiz")) return "achizitii";
  if (value.includes("siguranta")) return "siguranta";
  if (value.includes("product") || value.includes("asfalt") || value.includes("statie")) return "production";
  return "custom";
}

function normalizeLicense(license, strict = false) {
  const plan = String(license.plan || "internal-preview").trim();
  const expiresAt = license.expiresAt ? String(license.expiresAt) : null;
  if (strict && !["trial", "internal", "full"].includes(plan)) throwHttp(400, "Tip licenta invalid.");
  if (expiresAt && !validDateValue(expiresAt)) throwHttp(400, "Data expirare licenta invalida.");
  const trialStartedAt = license.trialStartedAt && validDateValue(license.trialStartedAt) ? String(license.trialStartedAt) : null;
  const trialDays = Math.max(1, Number(license.trialDays || 30));
  const trialExpiresAt = plan === "trial"
    ? (expiresAt || addDays(trialStartedAt || localDate(new Date()), trialDays - 1))
    : null;
  const normalized = {
    plan,
    licenseId: String(license.licenseId || license.id || "").trim(),
    clientName: String(license.clientName || license.companyName || "").trim(),
    clientCode: String(license.clientCode || "").trim(),
    companyTaxId: String(license.companyTaxId || "").trim(),
    maxUsers: Math.max(1, Number(license.maxUsers || 1)),
    maxDevices: Math.max(1, Number(license.maxDevices || 1)),
    expiresAt,
    trialDays,
    trialStartedAt,
    trialExpiresAt,
    modules: Array.isArray(license.modules) ? license.modules.map((item) => String(item).trim()).filter(Boolean) : [],
    issuedAt: license.issuedAt || null,
    importedAt: license.importedAt || null,
    source: license.source || "manual",
    signature: license.signature || "",
    payload: license.payload || ""
  };
  normalized.status = licenseStatus(normalized);
  return normalized;
}

function licenseStatus(license) {
  if (license.expiresAt && license.expiresAt < localDate(new Date())) return "expired";
  if (license.source === "signed-file") return "active";
  if (license.plan === "trial") {
    if (license.trialExpiresAt && license.trialExpiresAt < localDate(new Date())) return "expired";
    return "active";
  }
  return "internal";
}

function validDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return localDate(date);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

module.exports = {
  permissionGroups,
  permissionGroupLabels,
  permissionLabels,
  allPermissions,
  roleInfo,
  DEFAULT_CUSTOM_ROLES,
  ensureDefaultCustomRoles,
  requirePermission,
  requireSuperadmin,
  requireAnyPermission,
  authHasPermission,
  effectivePermissionsForUser,
  normalizedUserRoles,
  userHasRole,
  effectivePermissionsFor,
  permissionsFor,
  permissionAllowedByLicense,
  normalizedLicenseModules,
  rolePermissionCatalog,
  rolesList,
  roleModules,
  updateRolePermissions,
  sanitizeRolePermissions,
  publicUser,
  adminUser,
  adminDepartment
};
