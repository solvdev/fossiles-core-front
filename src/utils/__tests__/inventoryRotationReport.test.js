import {
  SCOPES,
  buildRotationWorkbook,
  countByStatus,
  coverageText,
  explainRow,
  filterRows,
  sortRows,
} from "../inventoryRotationReport";

const row = (over) => ({
  key: "1|1|NUEVO",
  code: "B-7",
  name: "Cincho B-7",
  variant: "Café",
  hardware: "NUEVO",
  stock: 12,
  moved: 45,
  dailyRate: 1.5,
  coverageDays: 8,
  status: "NORMAL",
  unitValue: 150,
  stockValue: 1800,
  lastMovementDate: "2026-11-10",
  locationsWithStock: 3,
  ...over,
});

const ROWS = [
  row({ key: "a", name: "Cincho T-4", variant: "Negro", stock: 4, moved: 60, dailyRate: 2, coverageDays: 2, status: "SE_AGOTA" }),
  row({ key: "b", name: "Billetera reversible", code: "BR-1", stock: 90, moved: 3, dailyRate: 0.1, coverageDays: 900, status: "LENTO", stockValue: 9000 }),
  row({ key: "c", name: "Faja Dama", code: "FD-2", stock: 20, moved: 0, dailyRate: 0, coverageDays: null, status: "SIN_MOVIMIENTO", lastMovementDate: null, stockValue: 3000 }),
  row({ key: "d", name: "Cincho B-7", stock: 0, moved: 10, dailyRate: 0.33, coverageDays: 0, status: "SIN_STOCK", stockValue: 0 }),
  row({ key: "e" }),
];

const DATA = { scope: "PRODUCTS", windowDays: 30, since: "2026-10-18", shortDays: 5, slowDays: 45, rows: ROWS };

describe("coverageText", () => {
  it("dice los días en palabras simples", () => {
    expect(coverageText({ coverageDays: 8 })).toBe("8 días");
    expect(coverageText({ coverageDays: 1 })).toBe("1 día");
    expect(coverageText({ coverageDays: 0.4 })).toBe("menos de 1 día");
    expect(coverageText({ coverageDays: 900 })).toBe("más de 1 año");
    expect(coverageText({ coverageDays: null })).toBe("—");
  });
});

describe("explainRow", () => {
  it("explica cada estado sin leer columnas", () => {
    expect(explainRow(ROWS[4], SCOPES.PRODUCTS, 30)).toContain("alcanza para 8 días");
    expect(explainRow(ROWS[2], SCOPES.PRODUCTS, 30)).toContain("no se vendió ninguna en 30 días");
    expect(explainRow(ROWS[3], SCOPES.PRODUCTS, 30)).toContain("hoy no hay existencia");
  });
});

describe("filtros y orden", () => {
  it("cuenta por estado", () => {
    expect(countByStatus(ROWS)).toEqual({ SIN_STOCK: 1, SE_AGOTA: 1, NORMAL: 1, LENTO: 1, SIN_MOVIMIENTO: 1 });
  });

  it("filtra por estado y por texto sin importar acentos ni mayúsculas", () => {
    expect(filterRows(ROWS, { status: "LENTO" }).map((r) => r.key)).toEqual(["b"]);
    // Todas son «Café» menos el T-4 negro.
    expect(filterRows(ROWS, { search: "CAFE" }).length).toBe(4);
    expect(filterRows(ROWS, { search: "faja" }).map((r) => r.key)).toEqual(["c"]);
  });

  it("ordena por cobertura con los que no tienen ritmo al final", () => {
    const sorted = sortRows(ROWS, "coverage", "asc").map((r) => r.key);
    expect(sorted[0]).toBe("d");
    expect(sorted[sorted.length - 1]).toBe("c");
  });

  it("por estado conserva el orden que manda el servidor", () => {
    expect(sortRows(ROWS, "status", "asc")).toBe(ROWS);
  });
});

describe("buildRotationWorkbook", () => {
  const wb = buildRotationWorkbook({ scope: SCOPES.PRODUCTS, data: DATA, rows: ROWS, filtersLabel: "Kioscos: todos" });

  it("trae Resumen y Detalle", () => {
    expect(wb.SheetNames).toEqual(["Resumen", "Detalle"]);
  });

  it("el detalle tiene encabezado con filtros, filas congeladas y totales", () => {
    const ws = wb.Sheets.Detalle;
    expect(ws["A4"].v).toBe("Código");
    expect(ws["!autofilter"].ref).toMatch(/^A4:/);
    expect(ws["!freeze"]).toEqual({ xSplit: 2, ySplit: 4 });
    const totalRow = 4 + ROWS.length + 1; // encabezado en la fila 4, total justo después de las filas
    expect(ws[`A${totalRow}`].v).toBe("TOTAL");
  });

  it("pinta el estado con su color y deja la frase «Qué significa»", () => {
    const ws = wb.Sheets.Detalle;
    const header = Object.keys(ws).filter((k) => /^[A-Z]+4$/.test(k)).map((k) => ws[k].v);
    const statusCol = String.fromCharCode(65 + header.indexOf("Estado"));
    const meaningCol = String.fromCharCode(65 + header.indexOf("Qué significa"));
    expect(ws[`${statusCol}5`].v).toBe("Se agota");
    expect(ws[`${statusCol}5`].s.fill.fgColor.rgb).toBe("FFEDD5");
    expect(ws[`${meaningCol}5`].v.length).toBeGreaterThan(20);
  });

  it("el resumen cuenta una fila por estado más el total", () => {
    const ws = wb.Sheets.Resumen;
    expect(ws["A6"].v).toBe("Estado");
    expect(ws["A7"].v).toBe("Agotado");
    expect(ws["A12"].v).toBe("TOTAL");
    expect(ws["C12"].v).toBe(5);
  });
});
