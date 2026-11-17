import {
  buildKioskStockRows,
  buildKioskStockWorkbook,
  buildMaterialRows,
  buildMaterialStockWorkbook,
  classifyMaterial,
  explainMaterial,
  filterKioskStock,
  filterMaterials,
  materialLevel,
  sortMaterials,
  summarizeKiosks,
  summarizeMaterials,
} from "../inventoryStockReports";

const REPORT = {
  materials: [
    { materialId: 1, sku: "M-1", name: "Hilo negro", currentStock: 0, minStock: 10, maxStock: 50, unitCost: 2, totalValue: 0, isCritical: true, status: "Activo" },
    { materialId: 2, sku: "M-2", name: "Hebilla", currentStock: 4, minStock: 10, maxStock: 50, unitCost: 5, totalValue: 20, isCritical: true, status: "Activo" },
    { materialId: 3, sku: "M-3", name: "Remache", currentStock: 30, minStock: 10, maxStock: 50, unitCost: 1, totalValue: 30, isCritical: false, status: "Activo" },
    { materialId: 4, sku: "M-4", name: "Cuero café", currentStock: 80, minStock: 10, maxStock: 50, unitCost: 100, totalValue: 8000, isCritical: false, status: "Activo" },
    { materialId: 5, sku: "M-5", name: "Viejo", currentStock: 5, minStock: 0, maxStock: 0, unitCost: 1, totalValue: 5, isCritical: false, status: "Inactivo" },
  ],
};

describe("materiales", () => {
  const rows = buildMaterialRows(REPORT);

  it("clasifica por mínimo y máximo", () => {
    expect(rows.map((r) => r.status)).toEqual(["AGOTADO", "BAJO", "OK", "SOBRE", "OK"]);
    expect(classifyMaterial({ stock: 20, min: 0, max: 0, isCritical: true })).toBe("BAJO");
  });

  it("calcula el nivel contra el máximo y deja sin barra lo que no tiene máximo", () => {
    expect(materialLevel(rows[1])).toEqual({ pct: 8, minPct: 20 });
    expect(materialLevel(rows[3]).pct).toBe(100);
    expect(materialLevel(rows[4])).toBeNull();
  });

  it("explica en palabras simples", () => {
    expect(explainMaterial(rows[1])).toContain("faltan 6 para llegar al mínimo");
    expect(explainMaterial(rows[3])).toContain("sobran 30");
    expect(explainMaterial(rows[2])).toContain("dentro del rango de 10 a 50");
  });

  it("resume por estado y valor", () => {
    const sum = summarizeMaterials(rows);
    expect(sum.count).toBe(5);
    expect(sum.byStatus.SOBRE).toEqual({ lines: 1, value: 8000 });
    expect(sum.value).toBe(8055);
  });

  it("filtra por estado y texto, y ordena lo urgente primero", () => {
    expect(filterMaterials(rows, { status: "BAJO" }).map((r) => r.sku)).toEqual(["M-2"]);
    expect(filterMaterials(rows, { search: "cuero" }).map((r) => r.sku)).toEqual(["M-4"]);
    expect(sortMaterials(rows, "status", "asc").map((r) => r.sku).slice(0, 2)).toEqual(["M-1", "M-2"]);
  });

  it("el Excel trae Resumen y Detalle con estados en color", () => {
    const wb = buildMaterialStockWorkbook({ rows, filtersLabel: "Estado: Bajo" });
    expect(wb.SheetNames).toEqual(["Resumen", "Detalle"]);
    const ws = wb.Sheets.Detalle;
    expect(ws["A4"].v).toBe("SKU");
    const headers = Object.keys(ws).filter((k) => /^[A-Z]+4$/.test(k)).map((k) => ws[k].v);
    const col = String.fromCharCode(65 + headers.indexOf("Estado"));
    expect(ws[`${col}5`].v).toBe("Agotado");
    expect(ws[`${col}5`].s.fill.fgColor.rgb).toBe("FEE2E2");
    expect(ws[`A${4 + rows.length + 1}`].v).toBe("TOTAL");
    expect(wb.Sheets.Resumen["A7"].v).toBe("Agotado");
  });
});

const API_ROWS = [
  { locationId: 1, productCode: "B-7", productName: "Cincho B-7", colorName: "Café", sizes: { "32": 2, "30": 1 }, hardwareCondition: "NUEVO", currentStock: 3, minimumStock: 2, lowStock: false, lastUpdatedAt: "2026-11-10T10:00:00" },
  { locationId: 1, productCode: "T-4", productName: "Cincho T-4", colorName: "Negro", sizes: {}, hardwareCondition: "VIEJO", currentStock: 1, minimumStock: 3, lowStock: true, lastUpdatedAt: "2026-11-12T10:00:00" },
  { locationId: 2, productCode: "B-7", productName: "Cincho B-7", colorName: "Café", sizes: {}, hardwareCondition: "NUEVO", currentStock: 0, minimumStock: 2, lowStock: true, lastUpdatedAt: "2026-11-01T10:00:00" },
];
const LOCS = [
  { id: 1, name: "Kiosco Andaria", code: "ANDARIA" },
  { id: 2, name: "Kiosco Celajes", code: "CELAJES" },
];

describe("existencias por kiosco", () => {
  const rows = buildKioskStockRows(API_ROWS, LOCS);

  it("trae el nombre del kiosco y ordena las tallas", () => {
    expect(rows[0].kioskName).toBe("Kiosco Andaria");
    expect(rows[0].sizes).toBe("30: 1 · 32: 2");
  });

  it("resume por kiosco con las líneas de stock bajo", () => {
    const sum = summarizeKiosks(rows);
    expect(sum.map((k) => [k.name, k.lines, k.units, k.lowLines])).toEqual([
      ["Kiosco Andaria", 2, 4, 1],
      ["Kiosco Celajes", 1, 0, 1],
    ]);
    expect(sum[0].last).toBe("2026-11-12T10:00:00");
  });

  it("filtra por kiosco, por stock bajo y por texto", () => {
    expect(filterKioskStock(rows, { locationId: 2 }).length).toBe(1);
    expect(filterKioskStock(rows, { onlyLow: true }).length).toBe(2);
    expect(filterKioskStock(rows, { search: "negro" }).length).toBe(1);
  });

  it("el Excel trae resumen por kiosco y detalle con filtros", () => {
    const wb = buildKioskStockWorkbook({ rows, filtersLabel: "Kioscos: todos" });
    expect(wb.SheetNames).toEqual(["Resumen", "Detalle"]);
    expect(wb.Sheets.Resumen["A7"].v).toBe("Kiosco Andaria");
    expect(wb.Sheets.Detalle["!autofilter"].ref).toMatch(/^A4:/);
    expect(wb.Sheets.Detalle["!freeze"]).toEqual({ xSplit: 2, ySplit: 4 });
  });
});
