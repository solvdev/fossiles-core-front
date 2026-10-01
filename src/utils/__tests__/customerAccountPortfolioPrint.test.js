import {
  buildMovementsAnnexHtml,
  buildRutasCxcPrintHtml,
  groupRutasCxcRowsByRoute,
  normalizeRutasCxcRows,
  sumRutasCxcTotals,
} from "utils/customerAccountReportPrintHtml";

const docRow = (overrides = {}) => ({
  customerId: 1,
  customerName: "Tienda Uno",
  legacyCode: "C1",
  routeLocationCode: "R01001",
  rowType: "DOCUMENT",
  chargeEntryId: 10,
  chargeEntryIds: [10],
  chargeCount: 1,
  duplicateCharges: false,
  invoiceNumber: "ENVP-1",
  chargeDate: "2026-06-16",
  chargedAmount: 1000,
  paymentsApplied: 500,
  creditsApplied: 100,
  balanceDue: 400,
  ...overrides,
});

describe("normalizeRutasCxcRows (cartera por documento)", () => {
  it("separa abonos (efectivo) de créditos y respeta saldo = cargos - abonos - créditos", () => {
    const [row] = normalizeRutasCxcRows([docRow()]);
    expect(row.cargos).toBe(1000);
    expect(row.abonos).toBe(500);
    expect(row.creditos).toBe(100);
    expect(row.saldos).toBe(400);
    expect(row.cargos - row.abonos - row.creditos).toBe(row.saldos);
  });

  it("mantiene documentos pagados (saldo 0) y una sola fila por documento", () => {
    const rows = normalizeRutasCxcRows([
      docRow({ chargeEntryId: 1, paymentsApplied: 900, creditsApplied: 100, balanceDue: 0 }),
      docRow({ chargeEntryId: 2, invoiceNumber: "ENVP-2" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.chargeEntryId === 1).saldos).toBe(0);
  });

  it("conserva filas de ajuste (abono a cargo anulado) con saldo negativo", () => {
    const rows = normalizeRutasCxcRows([
      docRow(),
      docRow({
        rowType: "ORPHAN_CREDIT",
        chargeEntryId: null,
        chargeEntryIds: [],
        chargedAmount: 0,
        paymentsApplied: 300,
        creditsApplied: 0,
        balanceDue: -300,
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.rowType === "ORPHAN_CREDIT").saldos).toBe(-300);
  });

  it("sigue entendiendo el formato legado (appliedCredits combinado, sin saldo negativo)", () => {
    const [row] = normalizeRutasCxcRows([
      { hasCharge: true, chargedAmount: 100, appliedCredits: 40, balanceDue: 60, invoiceNumber: "X" },
    ]);
    expect(row.abonos).toBe(40);
    expect(row.creditos).toBe(0);
    expect(row.saldos).toBe(60);
  });
});

describe("totales", () => {
  it("suma el saldo por cliente y no deja que un crédito a favor reste deuda de otro cliente", () => {
    const rows = normalizeRutasCxcRows([
      docRow({ customerId: 1, balanceDue: 400 }),
      docRow({
        customerId: 2,
        chargeEntryId: 20,
        chargedAmount: 200,
        paymentsApplied: 0,
        creditsApplied: 0,
        balanceDue: 200,
      }),
      docRow({
        customerId: 2,
        rowType: "ORPHAN_CREDIT",
        chargeEntryId: null,
        chargedAmount: 0,
        paymentsApplied: 300,
        creditsApplied: 0,
        balanceDue: -300,
      }),
    ]);
    const totals = sumRutasCxcTotals(rows);
    // cliente 2: 200 - 300 = -100 -> crédito a favor, no resta de la deuda del cliente 1
    expect(totals.saldos).toBe(400);
    expect(totals.cargos).toBe(1200);
    expect(totals.abonos).toBe(800);
  });

  it("agrupa por ruta sin duplicar filas y con totales por columna", () => {
    const groups = groupRutasCxcRowsByRoute([
      docRow({ chargeEntryId: 1 }),
      docRow({ chargeEntryId: 2, invoiceNumber: "ENVP-2" }),
      docRow({ customerId: 9, routeLocationCode: "R02001", chargeEntryId: 3, invoiceNumber: "ENVP-3" }),
    ]);
    expect(groups).toHaveLength(2);
    const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
    expect(total).toBe(3);
    expect(groups[0].totalCargos).toBe(2000);
    expect(groups[0].totalAbonos).toBe(1000);
    expect(groups[0].totalCreditos).toBe(200);
  });
});

describe("buildRutasCxcPrintHtml", () => {
  it("imprime columnas CARGOS / ABONOS / CREDITOS / SALDOS", () => {
    const html = buildRutasCxcPrintHtml({ rows: [docRow()], orderKind: "OPV" });
    ["CARGOS", "ABONOS", "CREDITOS", "SALDOS"].forEach((col) => expect(html).toContain(col));
    expect(html).toContain("1,000.00");
    expect(html).toContain("500.00");
    expect(html).toContain("100.00");
    expect(html).toContain("400.00");
    expect(html).not.toContain("ANEXO");
  });

  it("marca el documento con más de un cargo activo", () => {
    const html = buildRutasCxcPrintHtml({
      rows: [docRow({ duplicateCharges: true, chargeCount: 2 })],
      orderKind: "OPV",
    });
    expect(html).toContain("*(2 cargos)");
    expect(html).toContain("más de un cargo activo");
  });

  it("agrega el detalle de movimientos como anexo aparte, sin mezclarlo con la cartera", () => {
    const movements = [
      { entryDate: "2026-06-16", customerName: "Tienda Uno", entryType: "CHARGE", debit: 1000, credit: 0, status: "ACTIVE" },
      { entryDate: "2026-06-17", customerName: "Tienda Uno", entryType: "PAYMENT", debit: 0, credit: 0, status: "VOID", voidReason: "error" },
      { entryDate: "2026-06-18", customerName: "Tienda Uno", entryType: "PAYMENT", debit: 0, credit: 500, status: "ACTIVE" },
    ];
    const html = buildRutasCxcPrintHtml({ rows: [docRow()], orderKind: "OPV", movements });
    const annexStart = html.indexOf("ANEXO — DETALLE DE MOVIMIENTOS");
    expect(annexStart).toBeGreaterThan(html.indexOf("TOTAL"));
    expect(html.slice(annexStart)).toContain("ANULADO — error");
    expect(html.slice(0, annexStart)).not.toContain("ANULADO");
  });

  it("el anexo no suma movimientos anulados", () => {
    const html = buildMovementsAnnexHtml(
      [
        { entryDate: "2026-06-16", entryType: "CHARGE", debit: 100, credit: 0, status: "ACTIVE" },
        { entryDate: "2026-06-16", entryType: "CHARGE", debit: 999, credit: 0, status: "VOID" },
      ],
      { from: "2026-06-01", to: "2026-06-30" }
    );
    expect(html).toContain("TOTAL (sin anulados)");
    expect(html).toMatch(/<td class="num">100\.00<\/td><td class="num">0\.00<\/td>/);
  });

  it("cartera vacía no genera filas ni totales", () => {
    const html = buildRutasCxcPrintHtml({ rows: [], orderKind: "OPC" });
    expect(html).toContain("Sin documentos cargados");
    expect(html).toContain("GRUPO COMERCIAL FUTURA");
  });
});
