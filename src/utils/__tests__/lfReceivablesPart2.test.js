import fs from "fs";
import path from "path";
import {
  ADJUSTMENT_DIFFERENT_ORDER_MESSAGE,
  CHARGE_STATUS_LABELS,
  adjustmentsBlockTarget,
  amountExceedsOpenBalance,
  buildChargeAdjustmentPayload,
  canGenerateOrderCharge,
  chargeRequiresReassignment,
  filterReassignChargeTargets,
  formatEstimatedAmount,
  formatReassignedFromNote,
  shippingLinesPendingAdjustment,
} from "services/customerAccountService";
import { parseCreditDays } from "services/customerService";

const receivablesFiles = [
  "src/services/customerAccountService.js",
  "src/views/customers/CustomerAccountsList.js",
  "src/views/customers/CustomerAccountStatement.js",
  "src/views/sales/OpvShipmentsPage.js",
  "src/components/customers/CustomerAccountEntryModal.js",
  "src/components/customers/CustomerAccountChargeDetailModal.js",
];

describe("estados de cobro", () => {
  test("solo quedan Sin cargo, Cargado, Parcial y Pagado", () => {
    expect(CHARGE_STATUS_LABELS).toEqual({
      NONE: "Sin cargo",
      CHARGED: "Cargado",
      PARTIAL: "Parcial",
      PAID: "Pagado",
    });
    expect(CHARGE_STATUS_LABELS.OPEN).toBeUndefined();
    expect(CHARGE_STATUS_LABELS.COVERED).toBeUndefined();
  });

  test("las pantallas de cartera ya no usan COVERED ni el bloqueo de anular con pagos", () => {
    receivablesFiles.forEach((relativePath) => {
      const source = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
      expect(source).not.toMatch(/COVERED/);
      expect(source).not.toMatch(/No se puede anular el cargo porque tiene pagos/);
    });
  });
});

describe("generar cargo y estimado nulo", () => {
  const order = {
    customerId: 1,
    productionOrderId: 10,
    hasCharge: false,
    chargeStatus: "NONE",
    documentLevel: "ORDER",
  };

  test("oculta el cargo si la orden ya tiene cargo o la fila es un parcial", () => {
    expect(canGenerateOrderCharge(order)).toBe(true);
    expect(canGenerateOrderCharge({ ...order, hasCharge: true, chargeStatus: "CHARGED" })).toBe(false);
    expect(canGenerateOrderCharge({ ...order, partialReleaseId: 4, documentLevel: "SHIPMENT" })).toBe(false);
    expect(canGenerateOrderCharge({ ...order, chargeStatus: "PAID" })).toBe(false);
  });

  test("un parcial planificado sin estimado no muestra monto", () => {
    expect(formatEstimatedAmount(null)).toBe("Sin envío");
    expect(formatEstimatedAmount(undefined)).toBe("Sin envío");
    expect(formatEstimatedAmount(null)).not.toMatch(/Q/);
    expect(formatEstimatedAmount(75)).toBe("Q 75.00");
  });
});

describe("ajustes de envío y anulación con destino", () => {
  const quoteLines = [
    { productShipmentId: 1, shipmentNumber: "ENV-1", shippingCost: 40 },
    { productShipmentId: 2, shipmentNumber: "ENV-2", shippingCost: 75 },
  ];
  const charge = {
    id: 9,
    entryType: "CHARGE",
    productionOrderId: 10,
    childEntries: [
      { id: 3, entryType: "PAYMENT", status: "ACTIVE", credit: 25 },
      { id: 4, entryType: "CHARGE_ADJUSTMENT", status: "ACTIVE", productShipmentId: 1, debit: 40 },
      { id: 5, entryType: "PAYMENT", status: "VOID", credit: 99 },
    ],
  };

  test("Agregar envío solo queda para el envío sin ajuste activo", () => {
    expect(shippingLinesPendingAdjustment(quoteLines, charge.childEntries).map((line) => line.productShipmentId)).toEqual([2]);
  });

  test("el ajuste manda el envío y el monto de la línea", () => {
    expect(
      buildChargeAdjustmentPayload({
        shippingLine: quoteLines[1],
        entryDate: "2026-10-09",
        productionOrderId: 10,
      })
    ).toEqual({
      entryType: "CHARGE_ADJUSTMENT",
      entryDate: "2026-10-09",
      amount: 75,
      productShipmentId: 2,
      productionOrderId: 10,
      description: "Envío ENV-2",
    });
  });

  test("pide destino si hay abonos y avisa si el ajuste es de otra orden", () => {
    expect(chargeRequiresReassignment(charge)).toBe(true);
    expect(chargeRequiresReassignment({ entryType: "CHARGE", childEntries: [] })).toBe(false);
    expect(adjustmentsBlockTarget(charge, { productionOrderId: 99 })).toBe(true);
    expect(adjustmentsBlockTarget(charge, { productionOrderId: 10 })).toBe(false);
    expect(ADJUSTMENT_DIFFERENT_ORDER_MESSAGE).toMatch(/Anúlelos primero/);
  });

  test("el tope del abono compara contra el saldo del cargo", () => {
    expect(amountExceedsOpenBalance(60, 60)).toBe(false);
    expect(amountExceedsOpenBalance(60.01, 60)).toBe(true);
  });
});

describe("reassignedFromEntryId", () => {
  const lines = [{ id: 8, invoiceNumber: "FAC-ORIG", entryType: "CHARGE", status: "VOID" }];

  test("si falta el campo no hay nota", () => {
    expect(formatReassignedFromNote({ id: 3 })).toBeNull();
    expect(formatReassignedFromNote({ id: 3, reassignedFromEntryId: null })).toBeNull();
    expect(formatReassignedFromNote(null)).toBeNull();
  });

  test("muestra el cargo de origen y su referencia cuando está cargada", () => {
    expect(formatReassignedFromNote({ id: 3, reassignedFromEntryId: 8 }, lines)).toBe(
      "Movido desde cargo #8 (FAC-ORIG)"
    );
    expect(formatReassignedFromNote({ id: 3, reassignedFromEntryId: 99 }, lines)).toBe(
      "Movido desde cargo #99"
    );
  });
});

describe("días de crédito", () => {
  test("acepta 0 y 60 y rechaza lo que queda fuera", () => {
    expect(parseCreditDays("0")).toEqual({ ok: true, value: 0 });
    expect(parseCreditDays(60)).toEqual({ ok: true, value: 60 });
    expect(parseCreditDays("-1").ok).toBe(false);
    expect(parseCreditDays("61").ok).toBe(false);
    expect(parseCreditDays("1.5").ok).toBe(false);
    expect(parseCreditDays("").ok).toBe(false);
  });
});

describe("filterReassignChargeTargets", () => {
  const receivable = (overrides = {}) => ({
    chargeEntryId: 5,
    customerId: 223,
    orderKind: "OPC",
    invoiceNumber: "ENVP-DESTINO",
    balanceDue: 2046,
    ...overrides,
  });
  const idsOf = (docs) => docs.map((doc) => String(doc.chargeEntryId));

  test("deja solo cargos activos del mismo cliente con saldo, sin el que se anula", () => {
    const docs = [
      receivable({ chargeEntryId: 1, invoiceNumber: "ENVP-ORIGEN", balanceDue: 1449.55 }),
      receivable({ chargeEntryId: 5, invoiceNumber: "ENVP-DESTINO", balanceDue: 2046 }),
      receivable({ chargeEntryId: 6, invoiceNumber: "ENVP-OTRA", balanceDue: 80 }),
      receivable({ chargeEntryId: 7, invoiceNumber: "ENVP-ANULADO", balanceDue: 90, status: "VOID" }),
      receivable({ chargeEntryId: 8, invoiceNumber: "ENVP-CERO", balanceDue: 0 }),
      receivable({ chargeEntryId: 9, customerId: 999, invoiceNumber: "ENVP-AJENO", balanceDue: 500 }),
      receivable({ chargeEntryId: 10, entryType: "PAYMENT", balanceDue: 70 }),
    ];
    expect(
      idsOf(filterReassignChargeTargets(docs, { voidedCharge: { id: 1 }, customerId: 223 }))
    ).toEqual(["5", "6"]);
  });

  test("sin cliente en la opción la conserva; un cliente conocido distinto no", () => {
    const docs = [
      receivable({ chargeEntryId: 5, customerId: undefined }),
      receivable({ chargeEntryId: 9, customerId: undefined, customer: { id: 999 } }),
    ];
    expect(
      idsOf(filterReassignChargeTargets(docs, { voidedCharge: { id: 1, customerId: 223 } }))
    ).toEqual(["5"]);
  });

  test("sin tipo ni estado los trata como cargo activo", () => {
    const docs = [receivable({ chargeEntryId: 5, entryType: undefined, status: undefined })];
    expect(idsOf(filterReassignChargeTargets(docs, { voidedCharge: { id: 1 }, customerId: "223" }))).toEqual(["5"]);
    expect(filterReassignChargeTargets(null, { voidedCharge: { id: 1 } })).toEqual([]);
  });
});
