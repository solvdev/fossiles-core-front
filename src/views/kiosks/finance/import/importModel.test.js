import {
  aggregateColumns,
  buildCommitPayload,
  countIssues,
  createNameConflicts,
  duplicateMonths,
  filesToCommit,
  initialSiteMap,
  mappingProblems,
  pendingMappingCount,
  summarizeImport,
  totalsDiff,
  validateSelection,
  parseResolutionValue,
} from "./importModel";

const file = (name, size = 1000) => ({ name, size });

describe("validateSelection", () => {
  it("acepta .xlsx dentro de límites y rechaza el resto", () => {
    const { accepted, errors } = validateSelection(
      [],
      [file("VENTAS ENERO 2025.xlsx"), file("notas.txt"), file("grande.xlsx", 2 * 1024 * 1024), file("vacio.xlsx", 0)]
    );
    expect(accepted.map((f) => f.name)).toEqual(["VENTAS ENERO 2025.xlsx"]);
    expect(errors).toHaveLength(3);
  });

  it("rechaza repetidos y el archivo 13", () => {
    const existing = Array.from({ length: 12 }, (_, i) => file(`m${i}.xlsx`));
    const { accepted, errors } = validateSelection(existing, [file("m0.xlsx"), file("otro.xlsx")]);
    expect(accepted).toHaveLength(12);
    expect(errors).toHaveLength(2);
  });
});

const makeFile = (over = {}) => ({
  fileName: "VENTAS AGOSTO 2025.xlsx",
  sha256: "abc",
  year: 2025,
  month: 8,
  alreadyImported: null,
  columns: [
    { excelName: "PLAZA CEMACO", normalized: "PLAZA CEMACO", matchedSiteId: 19, matchedSiteName: "PLAZA CEMACO", matchStatus: "MATCHED" },
    { excelName: "NUEVO KIOSCO ", normalized: "NUEVO KIOSCO", matchedSiteId: null, matchStatus: "UNMATCHED" },
  ],
  issues: [
    { id: "i1", severity: "BLOCKING", code: "NON_NUMERIC_CELL", excelName: "PLAZA CEMACO", date: "2025-08-21", cell: "R29", rawValue: "1254..6", suggestion: 1254.6 },
    { id: "i2", severity: "BLOCKING", code: "UNMATCHED_COLUMN", excelName: "NUEVO KIOSCO " },
    { id: "i3", severity: "WARNING", code: "MISSING_GOAL", excelName: "PLAZA CEMACO" },
    { id: "i4", severity: "INFO", code: "OUTLIER", excelName: "PLAZA CEMACO" },
  ],
  data: {
    days: [],
    goals: { "PLAZA CEMACO": 100000, "NUEVO KIOSCO ": null },
    rates: { "PLAZA CEMACO": {}, "NUEVO KIOSCO ": {} },
    costs: { "PLAZA CEMACO": { ALQUILER: 7652.51, LUZ: null }, "NUEVO KIOSCO ": { ALQUILER: null } },
    blockedCells: [{ issueId: "i1", code: "NON_NUMERIC_CELL", excelName: "PLAZA CEMACO", date: "2025-08-21" }],
  },
  stats: { columns: 2, days: 31, salesCells: 100, salesTotal: 2000.0, sheetTotal: 2000.0 },
  ...over,
});

describe("aggregateColumns / mapping", () => {
  const files = [makeFile(), makeFile({ fileName: "VENTAS SEPTIEMBRE 2025.xlsx", month: 9 })];

  it("agrupa por nombre normalizado en todos los archivos", () => {
    const agg = aggregateColumns(files);
    expect(agg).toHaveLength(2);
    // los pendientes van primero
    expect(agg[0].key).toBe("NUEVO KIOSCO");
    expect(agg[0].appearances).toHaveLength(2);
    expect(agg[1].matchedSiteId).toBe(19);
  });

  it("mapa inicial sólo con coincidencias y cuenta pendientes", () => {
    const agg = aggregateColumns(files);
    const map = initialSiteMap(agg);
    expect(map).toEqual({ "PLAZA CEMACO": { siteId: 19 } });
    expect(pendingMappingCount(agg, map)).toBe(1);
    const resolved = { ...map, "NUEVO KIOSCO": { create: { name: "NUEVO KIOSCO" } } };
    expect(pendingMappingCount(agg, resolved)).toBe(0);
    expect(pendingMappingCount(agg, { ...map, "NUEVO KIOSCO": { create: { name: "  " } } })).toBe(1);
  });

  it("detecta dos columnas al mismo sitio y nombres nuevos ya existentes", () => {
    const map = { "PLAZA CEMACO": { siteId: 19 }, "NUEVO KIOSCO": { siteId: 19 } };
    expect(mappingProblems([makeFile()], map)).toHaveLength(1);
    expect(createNameConflicts({ a: { create: { name: "Eskala" } } }, ["ESKALA"])).toEqual(["Eskala"]);
    expect(createNameConflicts({ a: { create: { name: "Nuevo" } } }, ["ESKALA"])).toEqual([]);
  });
});

describe("incidencias", () => {
  const files = [makeFile()];
  const map = { "PLAZA CEMACO": { siteId: 19 } };

  it("cuenta BLOCKING sin resolver; el mapeo resuelve UNMATCHED_COLUMN", () => {
    expect(countIssues(files, {}, map)).toMatchObject({ BLOCKING: 2, WARNING: 1, INFO: 1 });
    const withMapping = { ...map, "NUEVO KIOSCO": { create: { name: "NUEVO" } } };
    expect(countIssues(files, {}, withMapping).BLOCKING).toBe(1);
    expect(countIssues(files, { 0: { i1: 1254.6 } }, withMapping)).toMatchObject({ BLOCKING: 0, resolved: 2 });
    expect(countIssues(files, { 0: { i1: "IGNORE" } }, withMapping).BLOCKING).toBe(0);
  });

  it("valida resoluciones numéricas 0..999,999.99", () => {
    expect(parseResolutionValue("1,254.60")).toEqual({ valid: true, value: 1254.6 });
    expect(parseResolutionValue("1000000").valid).toBe(false);
    expect(parseResolutionValue("").valid).toBe(false);
    expect(parseResolutionValue("-3").valid).toBe(false);
  });
});

describe("commit", () => {
  const base = makeFile();
  const siteMap = { "PLAZA CEMACO": { siteId: 19 }, "NUEVO KIOSCO": { create: { name: "NUEVO KIOSCO" } } };

  it("envía data intacta, sólo resoluciones de celdas bloqueadas y mapeo diferencial", () => {
    const payload = buildCommitPayload({
      files: [base],
      siteMap,
      resolutionsByFile: { 0: { i1: 1254.6, zzz: 5 } },
      replaceByFile: {},
      replaceExisting: true,
    });
    expect(payload.replaceExisting).toBe(true);
    const f = payload.files[0];
    expect(f.data).toBe(base.data);
    expect(f.resolutions).toEqual({ i1: 1254.6 });
    // PLAZA CEMACO ya coincidía: sin entrada; el nuevo se crea con el nombre elegido
    expect(f.siteMapping).toEqual({ "NUEVO KIOSCO ": { create: { name: "NUEVO KIOSCO" } } });
    expect(f).toMatchObject({ fileName: base.fileName, sha256: "abc", year: 2025, month: 8 });
  });

  it("omite archivos ya importados sin reemplazo y los ilegibles", () => {
    const imported = makeFile({ fileName: "b.xlsx", alreadyImported: { batchId: 3, sameFile: true } });
    const broken = makeFile({ fileName: "~$c.xlsx", issues: [{ id: "i1", severity: "BLOCKING", code: "FILE_ERROR", message: "x" }] });
    const files = [base, imported, broken];
    expect(filesToCommit(files, {}).map((x) => x.file.fileName)).toEqual([base.fileName]);
    expect(filesToCommit(files, { 1: true }).map((x) => x.file.fileName)).toEqual([base.fileName, "b.xlsx"]);
  });

  it("detecta dos archivos del mismo mes", () => {
    const dup = makeFile({ fileName: "copia.xlsx" });
    const groups = duplicateMonths([base, dup], {});
    expect(groups).toHaveLength(1);
    expect(groups[0].names).toHaveLength(2);
    expect(duplicateMonths([base, makeFile({ month: 9 })], {})).toEqual([]);
  });

  it("resume filas a escribir y celdas corregidas", () => {
    const summary = summarizeImport({
      files: [base],
      siteMap,
      resolutionsByFile: { 0: { i1: 1254.6 } },
      replaceByFile: {},
    });
    expect(summary).toMatchObject({
      files: 1,
      salesRows: 100,
      configRows: 2,
      costRows: 1,
      replaced: 0,
      fixedCells: 1,
      ignoredCells: 0,
      createdSites: 1,
    });
    expect(summary.months).toEqual(["2025-08"]);
  });

  it("diferencia de totales", () => {
    expect(totalsDiff({ salesTotal: 100.5, sheetTotal: 100 })).toBe(0.5);
    expect(totalsDiff({ salesTotal: 100, sheetTotal: null })).toBeNull();
  });
});
