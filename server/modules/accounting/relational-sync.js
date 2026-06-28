const { DB_MODE, runMssqlScalar, prepareMssqlRelationalSchema, getMssqlRelationalStatus } = require("../../core/db");
const engine = require("./accounting-engine");

function syncAccountingToMssql(db, user = {}) {
  if (!["mssql", "sqlserver"].includes(DB_MODE)) {
    const error = new Error("Migrarea relationala este disponibila doar cand DB_MODE=mssql.");
    error.status = 400;
    throw error;
  }

  const accounting = engine.ensureAccounting(db);
  const preparedSchema = prepareMssqlRelationalSchema();
  const schemaStatus = preparedSchema.status || getMssqlRelationalStatus();
  if ((schemaStatus.missingCoreTables || []).length) {
    const error = new Error(`Nu pot migra contabilitatea. Lipsesc tabele SQL: ${schemaStatus.missingCoreTables.join(", ")}.`);
    error.status = 409;
    error.details = { missingCoreTables: schemaStatus.missingCoreTables };
    throw error;
  }
  const prepared = preparePayload(accounting);
  const counts = {
    chart: syncTable("accounting_chart", prepared.chart, sqlChart()),
    thirdParties: syncTable("accounting_third_parties", prepared.thirdParties, sqlThirdParties()),
    periods: syncTable("accounting_periods", prepared.periods, sqlPeriods()),
    journals: syncTable("accounting_journals", prepared.journals, sqlJournals()),
    journalLines: syncTable("accounting_journal_lines", prepared.journalLines, sqlJournalLines()),
    invoicesIn: syncTable("accounting_invoices_in", prepared.invoicesIn, sqlInvoicesIn()),
    invoiceInLines: syncTable("accounting_invoice_in_lines", prepared.invoiceInLines, sqlInvoiceLines("accounting_invoice_in_lines")),
    invoicesOut: syncTable("accounting_invoices_out", prepared.invoicesOut, sqlInvoicesOut()),
    invoiceOutLines: syncTable("accounting_invoice_out_lines", prepared.invoiceOutLines, sqlInvoiceLines("accounting_invoice_out_lines")),
    treasury: syncTable("accounting_treasury", prepared.treasury, sqlTreasury()),
    creditNotes: syncTable("accounting_credit_notes", prepared.creditNotes, sqlCreditNotes()),
    settlements: syncTable("accounting_settlements", prepared.settlements, sqlSettlements()),
    lawAlerts: syncTable("accounting_law_alerts", prepared.lawAlerts, sqlLawAlerts()),
    periodSnapshots: syncTable("accounting_period_snapshots", prepared.periodSnapshots, sqlPeriodSnapshots()),
    periodEvents: syncTable("accounting_period_events", prepared.periodEvents, sqlPeriodEvents()),
    bankImports: syncTable("accounting_bank_imports", prepared.bankImports, sqlBankImports()),
    stockPostings: syncTable("accounting_stock_postings", prepared.stockPostings, sqlStockPostings()),
    fixedAssets: syncTable("accounting_fixed_assets", prepared.fixedAssets, sqlFixedAssets()),
    fixedAssetEvents: syncTable("accounting_fixed_asset_events", prepared.fixedAssetEvents, sqlFixedAssetEvents()),
    fixedAssetCategories: syncTable("accounting_fixed_asset_categories", prepared.fixedAssetCategories, sqlFixedAssetCategories()),
    fixedAssetInventories: syncTable("accounting_fixed_asset_inventories", prepared.fixedAssetInventories, sqlFixedAssetInventories()),
    depreciationRuns: syncTable("accounting_depreciation_runs", prepared.depreciationRuns, sqlDepreciationRuns()),
    annualClosings: syncTable("accounting_annual_closings", prepared.annualClosings, sqlAnnualClosings()),
    declarationRuns: syncTable("accounting_declaration_runs", prepared.declarationRuns, sqlDeclarationRuns()),
    anafSchemas: syncTable("accounting_anaf_schemas", prepared.anafSchemas, sqlAnafSchemas()),
    carryforwardRuns: syncTable("accounting_carryforward_runs", prepared.carryforwardRuns, sqlCarryforwardRuns())
  };

  writeSyncLog(counts, user);
  const tableCounts = readAccountingTableCounts();
  return {
    ok: true,
    message: "Datele contabile din app_state au fost copiate in tabelele relationale.",
    preparedSchema: {
      repairFiles: preparedSchema.repairFiles || [],
      migrations: preparedSchema.migrations || [],
      warning: preparedSchema.migrationWarning || ""
    },
    counts,
    tableCounts,
    status: getMssqlRelationalStatus()
  };
}

function preparePayload(accounting) {
  const invoiceInLines = [];
  const invoiceOutLines = [];
  const withIds = (items) => normalizeRowsWithNumericIds(items || []);
  const invoicesIn = withIds(accounting.invoicesIn);
  const invoicesOut = withIds(accounting.invoicesOut);

  invoicesIn.forEach((invoice) => collectInvoiceLines(invoiceInLines, invoice));
  invoicesOut.forEach((invoice) => collectInvoiceLines(invoiceOutLines, invoice));

  return {
    chart: withIds(accounting.chart),
    thirdParties: withIds(accounting.thirdParties),
    periods: withIds(accounting.periods),
    journals: withIds(accounting.journals),
    journalLines: withIds(accounting.journalLines),
    invoicesIn,
    invoiceInLines,
    invoicesOut,
    invoiceOutLines,
    treasury: withIds(accounting.treasury),
    creditNotes: withIds(accounting.creditNotes),
    settlements: withIds(accounting.settlements),
    lawAlerts: withIds(accounting.lawAlerts),
    periodSnapshots: withIds(accounting.periodSnapshots),
    periodEvents: withIds(accounting.periodEvents),
    bankImports: withIds(accounting.bankImports),
    stockPostings: withIds(accounting.stockPostings),
    fixedAssets: withIds(accounting.fixedAssets),
    fixedAssetEvents: withIds(accounting.fixedAssetEvents),
    fixedAssetCategories: withIds(accounting.fixedAssetCategories),
    fixedAssetInventories: withIds(accounting.fixedAssetInventories),
    depreciationRuns: withIds(accounting.depreciationRuns),
    annualClosings: withIds(accounting.annualClosings),
    declarationRuns: withIds(accounting.declarationRuns),
    anafSchemas: withIds(accounting.anafSchemas),
    carryforwardRuns: withIds(accounting.carryforwardRuns)
  };
}

function normalizeRowsWithNumericIds(items) {
  const used = new Set();
  return items.map((item, index) => {
    const id = nextNumericId(item?.id, index + 1, used);
    return { ...item, id };
  });
}

function nextNumericId(value, fallback, used) {
  let candidate = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(candidate) || candidate <= 0 || used.has(candidate)) {
    candidate = Math.max(1, Number.parseInt(String(fallback || 1), 10) || 1);
    while (used.has(candidate)) candidate += 1;
  }
  used.add(candidate);
  return candidate;
}

function collectInvoiceLines(target, invoice) {
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  lines.forEach((line, index) => {
    target.push({
      id: target.length + 1,
      invoice_id: Number(invoice.id),
      linie_nr: Number(line.nr_crt || index + 1),
      denumire: line.denumire || line.descriere || "",
      um: line.um || "buc",
      cantitate: Number(line.cantitate || 1),
      pret_unitar: Number(line.pret_unitar || 0),
      valoare: Number(line.valoare || 0),
      tva_procent: Number(line.tva_procent || line.tvaProcent || 21),
      tva: Number(line.tva || 0),
      total: Number(line.total || Number(line.valoare || 0) + Number(line.tva || 0)),
      cont_simbol: line.cont || line.cont_simbol || "",
      cost_center_id: line.cost_center_id || null,
      subcentru_id: line.subcentru_id || null
    });
  });
}

function syncTable(label, rows, sql) {
  try {
    const result = runMssqlScalar(sql, {
      jsonInput: JSON.stringify(rows || []),
      timeoutMs: 300000,
      commandTimeoutSeconds: 300
    });
    return Number(result || 0);
  } catch (error) {
    const wrapped = new Error(`Migrarea contabilitatii a esuat la tabelul ${label}: ${cleanError(error)}`);
    wrapped.status = 500;
    wrapped.code = "ACCOUNTING_SYNC_TABLE_FAILED";
    wrapped.table = label;
    wrapped.cause = error;
    throw wrapped;
  }
}

function writeSyncLog(counts, user) {
  runMssqlScalar(`
    insert into dbo.accounting_relational_sync (
      synced_by, chart_count, third_parties_count, invoices_in_count, invoices_out_count,
      treasury_count, journals_count, journal_lines_count, message
    )
    values (
      try_convert(int, @json),
      ${Number(counts.chart || 0)},
      ${Number(counts.thirdParties || 0)},
      ${Number(counts.invoicesIn || 0)},
      ${Number(counts.invoicesOut || 0)},
      ${Number(counts.treasury || 0)},
      ${Number(counts.journals || 0)},
      ${Number(counts.journalLines || 0)},
      N'Sincronizare manuala din app_state'
    );
    select scope_identity();
  `, { jsonInput: String(user?.id || ""), timeoutMs: 300000, commandTimeoutSeconds: 300 });
}

function readAccountingTableCounts() {
  const text = runMssqlScalar(`
    select concat(
      (select count(1) from dbo.accounting_chart), N'|',
      (select count(1) from dbo.accounting_third_parties), N'|',
      (select count(1) from dbo.accounting_periods), N'|',
      (select count(1) from dbo.accounting_journals), N'|',
      (select count(1) from dbo.accounting_journal_lines), N'|',
      (select count(1) from dbo.accounting_invoices_in), N'|',
      (select count(1) from dbo.accounting_invoice_in_lines), N'|',
      (select count(1) from dbo.accounting_invoices_out), N'|',
      (select count(1) from dbo.accounting_invoice_out_lines), N'|',
      (select count(1) from dbo.accounting_treasury), N'|',
      (select count(1) from dbo.accounting_credit_notes), N'|',
      (select count(1) from dbo.accounting_settlements), N'|',
      (select count(1) from dbo.accounting_law_alerts), N'|',
      (select count(1) from dbo.accounting_period_snapshots), N'|',
      (select count(1) from dbo.accounting_period_events), N'|',
      (select count(1) from dbo.accounting_bank_imports), N'|',
      (select count(1) from dbo.accounting_stock_postings), N'|',
      (select count(1) from dbo.accounting_fixed_assets), N'|',
      (select count(1) from dbo.accounting_fixed_asset_events), N'|',
      (select count(1) from dbo.accounting_depreciation_runs), N'|',
      (select count(1) from dbo.accounting_annual_closings), N'|',
      (select count(1) from dbo.accounting_declaration_runs), N'|',
      (select count(1) from dbo.accounting_carryforward_runs)
    );
  `, { timeoutMs: 30000, commandTimeoutSeconds: 30 });
  const [
    chart,
    thirdParties,
    periods,
    journals,
    journalLines,
    invoicesIn,
    invoiceInLines,
    invoicesOut,
    invoiceOutLines,
    treasury,
    creditNotes,
    settlements,
    lawAlerts,
    periodSnapshots,
    periodEvents,
    bankImports,
    stockPostings,
    fixedAssets,
    fixedAssetEvents,
    depreciationRuns,
    annualClosings,
    declarationRuns,
    carryforwardRuns
  ] = String(text || "").split("|").map((value) => Number(value || 0));
  return {
    chart,
    thirdParties,
    periods,
    journals,
    journalLines,
    invoicesIn,
    invoiceInLines,
    invoicesOut,
    invoiceOutLines,
    treasury,
    creditNotes,
    settlements,
    lawAlerts,
    periodSnapshots,
    periodEvents,
    bankImports,
    stockPostings,
    fixedAssets,
    fixedAssetEvents,
    depreciationRuns,
    annualClosings,
    declarationRuns,
    carryforwardRuns
  };
}

function cleanError(error) {
  return String(error?.message || error || "")
    .replace(/#< CLIXML[\s\S]*/i, "SQL Server a returnat o eroare. Verifica logul serverului pentru detalii.")
    .replace(/\s+/g, " ")
    .trim();
}

function identityMirrorSql(table, columns, selectColumns) {
  return `
    delete from dbo.${table};
    if isjson(@json) = 1 and exists (select 1 from openjson(@json))
    begin
      set identity_insert dbo.${table} on;
      insert into dbo.${table} (${columns.join(", ")})
      select ${selectColumns.join(", ")}
      from openjson(@json);
      set identity_insert dbo.${table} off;
      declare @maxId int = (select isnull(max(id), 0) from dbo.${table});
      dbcc checkident ('dbo.${table}', reseed, @maxId) with no_infomsgs;
    end;
    select count(1) from dbo.${table};
  `;
}

function sqlValue(path, type = "nvarchar(max)", fallback = "null") {
  const expr = `json_value(value, '$.${path}')`;
  if (type === "bit") return `case when ${expr} is null then ${fallback} when ${expr} in ('true', '1') then 1 else 0 end`;
  if (type === "date") return `try_convert(date, ${expr})`;
  if (type === "int") return `isnull(try_convert(int, ${expr}), ${fallback})`;
  if (type === "decimal") return `isnull(try_convert(decimal(18,2), ${expr}), ${fallback})`;
  if (type === "decimal3") return `isnull(try_convert(decimal(18,3), ${expr}), ${fallback})`;
  return `nullif(${expr}, '')`;
}

function sqlChart() {
  return identityMirrorSql("accounting_chart",
    ["id", "simbol", "denumire", "clasa", "tip", "nivel", "parinte_simbol", "tip_cont", "tva_deductibil", "tva_colectat", "activ", "sistem"],
    [sqlValue("id", "int", "1"), sqlValue("simbol"), sqlValue("denumire"), sqlValue("clasa", "int", "0"), `left(isnull(${sqlValue("tip")}, 'B'), 1)`, sqlValue("nivel", "int", "1"), sqlValue("parinte_simbol"), sqlValue("tip_cont"), sqlValue("tva_deductibil", "bit", "0"), sqlValue("tva_colectat", "bit", "0"), sqlValue("activ", "bit", "1"), sqlValue("sistem", "bit", "1")]
  );
}

function sqlThirdParties() {
  return identityMirrorSql("accounting_third_parties",
    ["id", "cod", "tip", "denumire", "cui", "nr_reg_com", "tara", "judet", "localitate", "adresa", "iban", "banca", "telefon", "email", "tva_platitor", "zile_scadenta", "cont_analitic_furnizor", "cont_analitic_client", "blocat", "activ"],
    [sqlValue("id", "int", "1"), sqlValue("cod"), sqlValue("tip"), sqlValue("denumire"), sqlValue("cui"), sqlValue("nr_reg_com"), `left(isnull(${sqlValue("tara")}, 'RO'), 2)`, sqlValue("judet"), sqlValue("localitate"), sqlValue("adresa"), sqlValue("iban"), sqlValue("banca"), sqlValue("telefon"), sqlValue("email"), sqlValue("tva_platitor", "bit", "0"), sqlValue("zile_scadenta", "int", "30"), sqlValue("cont_analitic_furnizor"), sqlValue("cont_analitic_client"), sqlValue("blocat", "bit", "0"), sqlValue("activ", "bit", "1")]
  );
}

function sqlPeriods() {
  return identityMirrorSql("accounting_periods",
    ["id", "an", "luna", "status", "inchisa_de", "inchisa_la"],
    [sqlValue("id", "int", "1"), sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), `isnull(${sqlValue("status")}, 'deschisa')`, sqlValue("inchisa_de", "int"), `try_convert(datetime2, ${sqlValue("inchisa_la")})`]
  );
}

function sqlJournals() {
  return identityMirrorSql("accounting_journals",
    ["id", "uuid", "an", "luna", "data", "nr_document", "tip_document", "document_ref_id", "document_ref_tip", "cost_center_id", "subcentru_id", "explicatie", "total_debit", "total_credit", "status", "stornat_de_id", "storneaza_id", "created_by"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("data", "date"), sqlValue("nr_document"), sqlValue("tip_document"), sqlValue("document_ref_id", "int"), sqlValue("document_ref_tip"), sqlValue("cost_center_id", "int"), sqlValue("subcentru_id", "int"), sqlValue("explicatie"), sqlValue("total_debit", "decimal"), sqlValue("total_credit", "decimal"), `isnull(${sqlValue("status")}, 'activ')`, sqlValue("stornat_de_id", "int"), sqlValue("storneaza_id", "int"), sqlValue("created_by", "int")]
  );
}

function sqlJournalLines() {
  return identityMirrorSql("accounting_journal_lines",
    ["id", "journal_id", "linie_nr", "cont_simbol", "denumire_cont", "debit", "credit", "tert_id", "tert_tip", "cost_center_id", "subcentru_id", "explicatie"],
    [sqlValue("id", "int", "1"), sqlValue("journal_id", "int", "0"), sqlValue("linie_nr", "int", "1"), sqlValue("cont_simbol"), sqlValue("denumire_cont"), sqlValue("debit", "decimal"), sqlValue("credit", "decimal"), sqlValue("tert_id", "int"), sqlValue("tert_tip"), sqlValue("cost_center_id", "int"), sqlValue("subcentru_id", "int"), sqlValue("explicatie")]
  );
}

function sqlInvoicesIn() {
  return identityMirrorSql("accounting_invoices_in",
    ["id", "uuid", "an", "luna", "nr_intern", "nr_document", "furnizor_id", "data", "data_scadenta", "valoare", "tva_procent", "tva", "total", "achitat", "cont_cheltuiala", "cost_center_id", "subcentru_id", "santier_id", "explicatie", "journal_id", "status", "created_by"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("nr_intern", "int"), sqlValue("nr_document"), sqlValue("furnizor_id", "int", "0"), sqlValue("data", "date"), sqlValue("data_scadenta", "date"), sqlValue("valoare", "decimal"), sqlValue("tva_procent", "decimal"), sqlValue("tva", "decimal"), sqlValue("total", "decimal"), sqlValue("achitat", "decimal"), sqlValue("cont_cheltuiala"), sqlValue("cost_center_id", "int"), sqlValue("subcentru_id", "int"), sqlValue("santier_id", "int"), sqlValue("explicatie"), sqlValue("journal_id", "int"), `isnull(${sqlValue("status")}, 'draft')`, sqlValue("created_by", "int")]
  );
}

function sqlInvoicesOut() {
  return identityMirrorSql("accounting_invoices_out",
    ["id", "uuid", "an", "luna", "serie", "numar", "client_id", "data", "data_scadenta", "valoare", "tva_procent", "tva", "total", "incasat", "cont_venit", "cost_center_id", "subcentru_id", "santier_id", "explicatie", "journal_id", "status", "created_by"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("serie"), sqlValue("numar", "int"), sqlValue("client_id", "int", "0"), sqlValue("data", "date"), sqlValue("data_scadenta", "date"), sqlValue("valoare", "decimal"), sqlValue("tva_procent", "decimal"), sqlValue("tva", "decimal"), sqlValue("total", "decimal"), sqlValue("incasat", "decimal"), sqlValue("cont_venit"), sqlValue("cost_center_id", "int"), sqlValue("subcentru_id", "int"), sqlValue("santier_id", "int"), sqlValue("explicatie"), sqlValue("journal_id", "int"), `isnull(${sqlValue("status")}, 'draft')`, sqlValue("created_by", "int")]
  );
}

function sqlInvoiceLines(table) {
  return identityMirrorSql(table,
    ["id", "invoice_id", "linie_nr", "denumire", "um", "cantitate", "pret_unitar", "valoare", "tva_procent", "tva", "total", "cont_simbol", "cost_center_id", "subcentru_id"],
    [sqlValue("id", "int", "1"), sqlValue("invoice_id", "int", "0"), sqlValue("linie_nr", "int", "1"), sqlValue("denumire"), sqlValue("um"), sqlValue("cantitate", "decimal3", "1"), sqlValue("pret_unitar", "decimal"), sqlValue("valoare", "decimal"), sqlValue("tva_procent", "decimal"), sqlValue("tva", "decimal"), sqlValue("total", "decimal"), sqlValue("cont_simbol"), sqlValue("cost_center_id", "int"), sqlValue("subcentru_id", "int")]
  );
}

function sqlTreasury() {
  return identityMirrorSql("accounting_treasury",
    ["id", "uuid", "an", "luna", "tip", "cont_trezorerie", "data", "nr_document", "tip_operatie", "suma", "cont_corespondent", "tert_id", "explicatie", "journal_id", "status", "created_by"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("tip"), sqlValue("cont_trezorerie"), sqlValue("data", "date"), sqlValue("nr_document"), sqlValue("tip_operatie"), sqlValue("suma", "decimal"), sqlValue("cont_corespondent"), sqlValue("tert_id", "int"), sqlValue("explicatie"), sqlValue("journal_id", "int"), `isnull(${sqlValue("status")}, 'draft')`, sqlValue("created_by", "int")]
  );
}

function sqlCreditNotes() {
  return identityMirrorSql("accounting_credit_notes",
    ["id", "uuid", "invoice_id", "return_id", "furnizor_id", "an", "luna", "data", "nr_document", "valoare", "tva", "total", "journal_id", "status", "created_by", "created_at", "note_json"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, sqlValue("invoice_id", "int", "0"), sqlValue("return_id"), sqlValue("furnizor_id", "int", "0"), sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("data", "date"), sqlValue("nr_document"), sqlValue("valoare", "decimal"), sqlValue("tva", "decimal"), sqlValue("total", "decimal"), sqlValue("journal_id", "int"), `isnull(${sqlValue("status")}, 'draft')`, sqlValue("created_by", "int"), `try_convert(datetime2, ${sqlValue("created_at")})`, "value"]
  );
}

function sqlSettlements() {
  return identityMirrorSql("accounting_settlements",
    ["id", "uuid", "group_uuid", "treasury_id", "invoice_in_id", "invoice_out_id", "tert_id", "an", "luna", "data", "suma", "source_type", "journal_id", "status", "created_by", "created_at", "cancelled_by", "cancelled_at", "cancelled_reason", "settlement_json"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, `left(isnull(${sqlValue("group_uuid")}, newid()), 36)`, sqlValue("treasury_id", "int", "0"), sqlValue("invoice_in_id", "int"), sqlValue("invoice_out_id", "int"), sqlValue("tert_id", "int", "0"), sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("data", "date"), sqlValue("suma", "decimal"), sqlValue("source_type"), sqlValue("journal_id", "int"), `isnull(${sqlValue("status")}, 'activ')`, sqlValue("created_by", "int"), `try_convert(datetime2, ${sqlValue("created_at")})`, sqlValue("cancelled_by", "int"), `try_convert(datetime2, ${sqlValue("cancelled_at")})`, sqlValue("cancelled_reason"), "value"]
  );
}

function sqlLawAlerts() {
  return identityMirrorSql("accounting_law_alerts",
    ["id", "titlu", "descriere", "sursa_url", "data_publicare", "tip", "afecteaza_modul", "status", "citit_de", "citit_la"],
    [sqlValue("id", "int", "1"), sqlValue("titlu"), sqlValue("descriere"), sqlValue("sursa_url"), sqlValue("data_publicare", "date"), sqlValue("tip"), sqlValue("afecteaza_modul"), `isnull(${sqlValue("status")}, 'nou')`, sqlValue("citit_de", "int"), `try_convert(datetime2, ${sqlValue("citit_la")})`]
  );
}

function sqlPeriodSnapshots() {
  return identityMirrorSql("accounting_period_snapshots",
    ["id", "an", "luna", "versiune", "checksum", "created_by", "created_by_name", "created_at", "snapshot_json"],
    [sqlValue("id", "int", "1"), sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("versiune", "int", "1"), sqlValue("checksum"), sqlValue("created_by", "int"), sqlValue("created_by_name"), `try_convert(datetime2, ${sqlValue("created_at")})`, "value"]
  );
}

function sqlPeriodEvents() {
  return identityMirrorSql("accounting_period_events",
    ["id", "an", "luna", "tip", "user_id", "user_name", "created_at", "event_json"],
    [sqlValue("id", "int", "1"), sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("type"), sqlValue("user_id", "int"), sqlValue("user_name"), `try_convert(datetime2, ${sqlValue("created_at")})`, "value"]
  );
}

function sqlBankImports() {
  return identityMirrorSql("accounting_bank_imports",
    ["id", "file_name", "imported_at", "imported_by", "result_json"],
    [sqlValue("id", "int", "1"), sqlValue("file_name"), `try_convert(datetime2, ${sqlValue("imported_at")})`, sqlValue("imported_by", "int"), "value"]
  );
}

function sqlStockPostings() {
  return identityMirrorSql("accounting_stock_postings",
    ["id", "movement_id", "journal_id", "an", "luna", "created_at"],
    [sqlValue("id", "int", "1"), sqlValue("movement_id"), sqlValue("journal_id", "int", "0"), sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), `try_convert(datetime2, ${sqlValue("created_at")})`]
  );
}

function sqlFixedAssets() {
  return identityMirrorSql("accounting_fixed_assets",
    ["id", "uuid", "inventory_no", "name", "acquisition_date", "depreciation_start", "acquisition_value", "residual_value", "useful_life_months", "accumulated_depreciation", "net_value", "account_asset", "account_depreciation", "account_expense", "category_code", "depreciation_method", "fiscal_life_months", "location", "custodian", "status", "created_at"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, sqlValue("inventory_no"), sqlValue("name"), sqlValue("acquisition_date", "date"), sqlValue("depreciation_start", "date"), sqlValue("acquisition_value", "decimal"), sqlValue("residual_value", "decimal"), sqlValue("useful_life_months", "int", "1"), sqlValue("accumulated_depreciation", "decimal"), sqlValue("net_value", "decimal"), sqlValue("account_asset"), sqlValue("account_depreciation"), sqlValue("account_expense"), sqlValue("category_code"), sqlValue("depreciation_method"), sqlValue("fiscal_life_months", "int", "1"), sqlValue("location"), sqlValue("custodian"), `isnull(${sqlValue("status")}, 'activ')`, `try_convert(datetime2, ${sqlValue("created_at")})`]
  );
}

function sqlFixedAssetCategories() {
  return identityMirrorSql("accounting_fixed_asset_categories",
    ["id", "code", "name", "default_life_months", "active", "category_json"],
    [sqlValue("id", "int", "1"), sqlValue("code"), sqlValue("name"), sqlValue("default_life_months", "int", "1"), sqlValue("active", "bit", "1"), "value"]
  );
}

function sqlFixedAssetInventories() {
  return identityMirrorSql("accounting_fixed_asset_inventories",
    ["id", "uuid", "inventory_date", "commission", "status", "created_by", "created_at", "inventory_json"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, sqlValue("date", "date"), sqlValue("commission"), sqlValue("status"), sqlValue("created_by", "int"), `try_convert(datetime2, ${sqlValue("created_at")})`, "value"]
  );
}

function sqlDepreciationRuns() {
  return identityMirrorSql("accounting_depreciation_runs",
    ["id", "an", "luna", "status", "total", "created_by", "created_at", "run_json"],
    [sqlValue("id", "int", "1"), sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("status"), sqlValue("total", "decimal"), sqlValue("created_by", "int"), `try_convert(datetime2, ${sqlValue("created_at")})`, "value"]
  );
}

function sqlFixedAssetEvents() {
  return identityMirrorSql("accounting_fixed_asset_events",
    ["id", "asset_id", "action", "data", "details", "journal_id", "created_by", "created_at"],
    [sqlValue("id", "int", "1"), sqlValue("asset_id", "int", "0"), sqlValue("action"), sqlValue("data", "date"), sqlValue("details"), sqlValue("journal_id", "int"), sqlValue("created_by", "int"), `try_convert(datetime2, ${sqlValue("created_at")})`]
  );
}

function sqlAnnualClosings() {
  return identityMirrorSql("accounting_annual_closings",
    ["id", "an", "journal_id", "result", "status", "created_by", "created_at"],
    [sqlValue("id", "int", "1"), sqlValue("an", "int", "year(getdate())"), sqlValue("journal_id", "int", "0"), sqlValue("result", "decimal"), sqlValue("status"), sqlValue("created_by", "int"), `try_convert(datetime2, ${sqlValue("created_at")})`]
  );
}

function sqlDeclarationRuns() {
  return identityMirrorSql("accounting_declaration_runs",
    ["id", "code", "an", "luna", "status", "checksum", "recipisa", "validated_by", "validated_at", "submitted_by", "submitted_at", "run_json"],
    [sqlValue("id", "int", "1"), sqlValue("code"), sqlValue("an", "int", "year(getdate())"), sqlValue("luna", "int", "month(getdate())"), sqlValue("status"), sqlValue("checksum"), sqlValue("recipisa"), sqlValue("validated_by", "int"), `try_convert(datetime2, ${sqlValue("validated_at")})`, sqlValue("submitted_by", "int"), `try_convert(datetime2, ${sqlValue("submitted_at")})`, "value"]
  );
}

function sqlAnafSchemas() {
  return identityMirrorSql("accounting_anaf_schemas",
    ["id", "uuid", "code", "original_name", "file_path", "sha256", "active", "uploaded_by", "uploaded_at", "schema_json"],
    [sqlValue("id", "int", "1"), `left(isnull(${sqlValue("uuid")}, newid()), 36)`, sqlValue("code"), sqlValue("original_name"), sqlValue("file_path"), sqlValue("sha256"), sqlValue("active", "bit", "1"), sqlValue("uploaded_by", "int"), `try_convert(datetime2, ${sqlValue("uploaded_at")})`, "value"]
  );
}

function sqlCarryforwardRuns() {
  return identityMirrorSql("accounting_carryforward_runs",
    ["id", "an", "next_year", "entries", "checksum", "status", "created_by", "created_at"],
    [sqlValue("id", "int", "1"), sqlValue("an", "int", "year(getdate())"), sqlValue("next_year", "int", "year(getdate()) + 1"), sqlValue("entries", "int", "0"), sqlValue("checksum"), sqlValue("status"), sqlValue("created_by", "int"), `try_convert(datetime2, ${sqlValue("created_at")})`]
  );
}

module.exports = {
  syncAccountingToMssql
};
