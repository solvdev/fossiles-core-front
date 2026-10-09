import {
  filterStatementDisplayLines,
  findParentChargeId,
  formatOpenChargeLabel,
  groupStatementLines,
  listOpenCharges,
  sumStatementTotals,
} from "services/customerAccountService";

const charge = (overrides = {}) => ({
  id: 1,
  entryType: "CHARGE",
  status: "ACTIVE",
  debit: 100,
  credit: 0,
  orderKind: "OPV",
  productionOrderId: 10,
  productionOrderCode: "OP-100",
  invoiceNumber: "ENVP-100",
  productShipmentId: 7,
  partialReleaseId: 3,
  entryDate: "2026-10-01",
  ...overrides,
});

const credit = (overrides = {}) => ({
  id: 2,
  entryType: "PAYMENT",
  status: "ACTIVE",
  debit: 0,
  credit: 40,
  invoiceNumber: "ENVP-100",
  productShipmentId: 7,
  productionOrderId: 10,
  partialReleaseId: 3,
  orderKind: "OPC",
  entryDate: "2026-10-02",
  ...overrides,
});

const idsOf = (lines) => lines.map((line) => line.id);

describe("findParentChargeId", () => {
  const charges = [
    charge({ id: 1, invoiceNumber: "ENVP-100", productShipmentId: 7, productionOrderId: 10 }),
    charge({ id: 9, status: "VOID", invoiceNumber: "ENVP-100", productShipmentId: 7, productionOrderId: 10 }),
  ];

  test("anida solo cuando appliedToEntryId apunta a un cargo vigente", () => {
    expect(findParentChargeId(credit({ appliedToEntryId: 1 }), charges)).toBe(1);
    expect(findParentChargeId(credit({ entryType: "CREDIT_NOTE", appliedToEntryId: "1" }), charges)).toBe(1);
    expect(findParentChargeId(credit({ entryType: "RETURN", appliedToEntryId: 1 }), charges)).toBe(1);
  });

  test("no adivina por envío, factura ni orden", () => {
    const line = credit({
      appliedToEntryId: null,
      invoiceNumber: "ENVP-100",
      productShipmentId: 7,
      productionOrderId: 10,
      partialReleaseId: 3,
    });
    expect(findParentChargeId(line, charges)).toBeNull();
  });

  test("un cargo anulado nunca es padre", () => {
    expect(findParentChargeId(credit({ appliedToEntryId: 9 }), charges)).toBeNull();
  });

  test("ignora el vínculo si no es un abono, nota o devolución", () => {
    expect(findParentChargeId(charge({ appliedToEntryId: 1 }), charges)).toBeNull();
    expect(findParentChargeId(null, charges)).toBeNull();
  });
});

describe("groupStatementLines", () => {
  test("el abono sin appliedToEntryId queda suelto aunque comparta factura y envío", () => {
    const lines = [
      charge(),
      credit({ id: 2, appliedToEntryId: null, invoiceNumber: "ENVP-100", productShipmentId: 7 }),
    ];
    const { displayLines } = groupStatementLines(lines, 0);
    expect(idsOf(displayLines)).toEqual([1, 2]);
    expect(displayLines[0].childEntries).toEqual([]);
    expect(displayLines[0].chargeBalanceDue).toBe(100);
    expect(displayLines[0].runningBalance).toBe(100);
    expect(displayLines[1].runningBalance).toBe(60);
  });

  test("el abono vinculado se anida y baja el saldo del cargo", () => {
    const lines = [charge(), credit({ id: 2, appliedToEntryId: 1, credit: 40 })];
    const { displayLines } = groupStatementLines(lines, 0);
    expect(idsOf(displayLines)).toEqual([1]);
    expect(displayLines[0].childEntries.map((line) => line.id)).toEqual([2]);
    expect(displayLines[0].credit).toBe(40);
    expect(displayLines[0].chargeBalanceDue).toBe(60);
    expect(displayLines[0].runningBalance).toBe(60);
  });

  test("un crédito apuntando a un cargo anulado queda como fila suelta", () => {
    const lines = [
      charge({ id: 9, status: "VOID", debit: 500 }),
      credit({ id: 2, appliedToEntryId: 9, credit: 20, invoiceNumber: "ENVP-100" }),
    ];
    const { displayLines } = groupStatementLines(lines, 0);
    expect(idsOf(displayLines)).toEqual([9, 2]);
    expect(displayLines[0].childEntries).toEqual([]);
    expect(displayLines[0].runningBalance).toBeNull();
    expect(displayLines[1].runningBalance).toBe(-20);
  });

  test("un abono anulado no reduce el saldo del cargo", () => {
    const lines = [
      charge({ debit: 100 }),
      credit({ id: 2, appliedToEntryId: 1, credit: 40, status: "VOID" }),
      credit({ id: 3, appliedToEntryId: 1, credit: 25, status: "ACTIVE" }),
    ];
    const { displayLines } = groupStatementLines(lines, 0);
    expect(displayLines[0].childCount).toBe(1);
    expect(displayLines[0].chargeBalanceDue).toBe(75);
    expect(displayLines[0].runningBalance).toBe(75);
  });
});

describe("totales sin filas VOID", () => {
  const lines = [
    charge({ id: 1, debit: 100, orderKind: "OPV" }),
    charge({ id: 9, status: "VOID", debit: 999, orderKind: "OPC" }),
    credit({ id: 2, appliedToEntryId: 1, credit: 30, status: "ACTIVE" }),
    credit({ id: 4, entryType: "RETURN", appliedToEntryId: null, credit: 10, status: "VOID" }),
    credit({ id: 5, entryType: "CREDIT_NOTE", appliedToEntryId: 1, credit: 5, status: "ACTIVE" }),
  ];

  test("sumStatementTotals ignora anulados aunque el filtro de la tabla los muestre", () => {
    const totals = sumStatementTotals(lines);
    expect(totals).toEqual({
      totalCharges: 100,
      totalPayments: 30,
      totalCreditNotes: 5,
      totalReturns: 0,
      netMovement: 65,
    });

    const { displayLines } = groupStatementLines(lines, 0);
    const hidden = filterStatementDisplayLines(displayLines);
    const shown = filterStatementDisplayLines(displayLines, { showVoided: true });
    expect(hidden.some((line) => line.status === "VOID")).toBe(false);
    expect(shown.some((line) => line.status === "VOID")).toBe(true);
    expect(sumStatementTotals(lines)).toEqual(totals);
  });

  test("el saldo corrido del estado no suma el cargo anulado", () => {
    const { displayLines } = groupStatementLines(
      [charge({ debit: 100 }), charge({ id: 9, status: "VOID", debit: 999 })],
      0
    );
    const active = displayLines.find((line) => line.id === 1);
    expect(active.runningBalance).toBe(100);
  });
});

describe("listOpenCharges", () => {
  test("lista solo cargos no anulados con orden, ENVP y saldo", () => {
    const lines = [
      charge({ id: 1, debit: 80 }),
      charge({ id: 9, status: "VOID", debit: 999, invoiceNumber: "ENVP-VOID", orderKind: "OPC" }),
      credit({ id: 2, appliedToEntryId: 1, credit: 30 }),
    ];
    const open = listOpenCharges(lines);
    expect(open.map((line) => line.id)).toEqual([1]);
    expect(open[0].chargeBalanceDue).toBe(50);
    expect(formatOpenChargeLabel(open[0])).toBe("OPV · OP-100 · ENVP ENVP-100 · Saldo Q 50.00");
  });
});
