import {
  countByDirection,
  filterKardexRows,
  movementLabel,
  normalizeKardexRow,
  signedQty,
  sortKardexRows,
  splitFifoNote,
  summarizeKardex,
  typesPresent,
} from "../kardexModel";
import { buildKardexWorkbook } from "../kardexExport";

const MAT = [
  { id: 1, materialId: 7, materialSku: "M-7", materialName: "Hilo", movementType: "ENTRY", referenceType: "PURCHASE_ORDER", referenceNumber: "OC-1", quantity: 100, quantityBefore: 0, quantityAfter: 100, cantidadEntrada: 100, costoUnitarioEntrada: 2, totalEntrada: 200, movementDate: "2026-11-01T09:00:00", description: "Compra inicial" },
  { id: 2, materialId: 7, materialSku: "M-7", materialName: "Hilo", movementType: "EXIT", referenceType: "PRODUCTION_ORDER", referenceNumber: "OP-5", quantity: -30, quantityBefore: 100, quantityAfter: 70, cantidadSalida: 30, costoUnitarioSalida: 2, totalSalida: 60, movementDate: "2026-11-03T10:00:00", description: "Consumo [FIFO: 30 @ Q2.00]", lotesFifo: [{ fechaEntrada: "2026-11-01T09:00:00", cantidad: 70, costoUnitario: 2, total: 140 }] },
  { id: 3, materialId: 7, materialSku: "M-7", materialName: "Hilo", movementType: "ADJUSTMENT", quantity: -5, quantityBefore: 70, quantityAfter: 65, movementDate: "2026-11-04T08:00:00", description: "Merma" },
];

const PROD = [
  { id: 10, productId: 1, productCode: "B-7", productName: "Cincho B-7", colorName: "Café", locationId: 1, locationName: "Bodega PT", movementType: "PRODUCTION_ENTRY", quantity: 20, quantityBefore: 0, quantityAfter: 20, movementDate: "2026-11-02T08:00:00" },
  { id: 11, productId: 1, productCode: "B-7", productName: "Cincho B-7", colorName: "Café", locationId: 1, locationName: "Bodega PT", movementType: "ONLINE_SALE_PREPARE", quantity: 2, quantityBefore: 20, quantityAfter: 18, movementDate: "2026-11-03T08:00:00" },
  { id: 12, productId: 1, productCode: "B-7", productName: "Cincho B-7", colorName: "Café", locationId: 1, locationName: "Bodega PT", movementType: "TRANSFER_OUT", referenceType: "TRANSFER", referenceId: 9, quantity: -8, quantityBefore: 18, quantityAfter: 10, movementDate: "2026-11-04T08:00:00" },
  { id: 13, productId: 1, productCode: "B-7", productName: "Cincho B-7", colorName: "Café", locationId: 1, movementType: "ALGO_NUEVO", quantity: -1, quantityBefore: 10, quantityAfter: 9, movementDate: "2026-11-05T08:00:00" },
];

describe("normalización", () => {
  it("materiales: entra, sale y ajuste con su saldo", () => {
    const [a, b, c] = MAT.map((r, i) => normalizeKardexRow(r, i));
    expect([a.direction, a.qtyIn, a.qtyOut, a.after]).toEqual(["IN", 100, 0, 100]);
    expect([b.direction, b.qtyIn, b.qtyOut, b.after]).toEqual(["OUT", 0, 30, 70]);
    expect([c.direction, c.change]).toEqual(["ADJUST", -5]);
    expect(a.typeLabel).toBe("Entrada por compra");
    expect(b.typeLabel).toBe("Salida a producción");
    expect(b.fifo).toBe("30 @ Q2.00");
    expect(b.description).toBe("Consumo");
    expect(b.lots).toHaveLength(1);
  });

  it("producto: la cantidad con signo del servidor manda la columna, aunque venga positiva en una salida", () => {
    const rows = PROD.map((r, i) => normalizeKardexRow(r, i));
    expect(rows[1].direction).toBe("OUT");
    expect(rows[1].qtyOut).toBe(2); // ONLINE_SALE_PREPARE llegó con +2 y es una salida
    expect(rows[2].qtyOut).toBe(8);
    expect(rows[0].qtyIn).toBe(20);
  });

  it("un tipo desconocido se nombra en español claro y toma la dirección del signo", () => {
    const r = normalizeKardexRow(PROD[3], 3);
    expect(r.typeLabel).toBe("Algo nuevo");
    expect(r.direction).toBe("OUT");
  });

  it("nombres de movimiento consistentes", () => {
    expect(movementLabel("SHIPMENT")).toBe("Envío");
    expect(movementLabel("ENTRY")).toBe("Entrada");
    expect(movementLabel("TRANSFER_IN")).toBe("Transferencia: entra");
    expect(movementLabel("RESERVE_RELEASE")).toBe("Entrega desde la reserva");
    expect(normalizeKardexRow({ movementType: "RESERVE_RELEASE", quantity: 1 }).direction).toBe("OUT");
    expect(signedQty(-3)).toBe("−3");
    expect(signedQty(12)).toBe("+12");
  });

  it("separa la nota FIFO de la descripción", () => {
    expect(splitFifoNote("Salida [FIFO: 3 @ Q1.00] listo")).toEqual({ text: "Salida  listo".replace("  ", " ").trim(), fifo: "3 @ Q1.00" });
    expect(splitFifoNote("Sin nota")).toEqual({ text: "Sin nota", fifo: "" });
  });
});

describe("filtros, orden y totales", () => {
  const rows = MAT.map((r, i) => normalizeKardexRow(r, i));

  it("ordena lo más reciente primero y se puede invertir", () => {
    expect(sortKardexRows(rows, "desc").map((r) => r.id)).toEqual([3, 2, 1]);
    expect(sortKardexRows(rows, "asc").map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("filtra por dirección, tipo, fechas y texto", () => {
    expect(filterKardexRows(rows, { direction: "OUT" }).map((r) => r.id)).toEqual([2]);
    expect(filterKardexRows(rows, { type: "ADJUSTMENT" }).map((r) => r.id)).toEqual([3]);
    expect(filterKardexRows(rows, { from: "2026-11-02", to: "2026-11-03" }).map((r) => r.id)).toEqual([2]);
    expect(filterKardexRows(rows, { search: "oc-1" }).map((r) => r.id)).toEqual([1]);
  });

  it("cuenta por dirección y lista solo los tipos que existen", () => {
    expect(countByDirection(rows)).toEqual({ IN: 1, OUT: 1, ADJUST: 1 });
    expect(typesPresent(rows).map((t) => t.key).sort()).toEqual(["ADJUSTMENT", "ENTRY", "EXIT"]);
  });

  it("un solo ítem tiene saldo inicial y final; varios solo el neto", () => {
    const one = summarizeKardex(rows);
    expect(one.single).toBe(true);
    expect([one.totalIn, one.totalOut, one.net]).toEqual([100, 30 + 5, 65]);
    expect([one.opening, one.closing]).toEqual([0, 65]);
    expect(one.valueIn).toBe(200);
    expect(one.valueOut).toBe(60);

    const mixed = summarizeKardex([...rows, normalizeKardexRow({ ...MAT[0], id: 9, materialId: 8 }, 9)]);
    expect(mixed.single).toBe(false);
    expect(mixed.closing).toBeNull();
  });
});

describe("Excel del kardex", () => {
  const rows = sortKardexRows(MAT.map((r, i) => normalizeKardexRow(r, i)), "asc");
  const wb = buildKardexWorkbook({ title: "Kardex de materiales", rows, filtersLabel: "Hilo", showItem: false, showValue: true });

  it("trae Resumen y Movimientos con encabezado, filtros y filas congeladas", () => {
    expect(wb.SheetNames).toEqual(["Resumen", "Movimientos"]);
    const ws = wb.Sheets.Movimientos;
    expect(ws["A4"].v).toBe("Fecha");
    expect(ws["!autofilter"].ref).toMatch(/^A4:/);
    expect(ws["!freeze"]).toEqual({ xSplit: 2, ySplit: 4 });
  });

  it("separa entra, sale y saldo y colorea el movimiento", () => {
    const ws = wb.Sheets.Movimientos;
    const headers = Object.keys(ws).filter((k) => /^[A-Z]+4$/.test(k)).map((k) => ws[k].v);
    const col = (name) => String.fromCharCode(65 + headers.indexOf(name));
    expect(ws[`${col("Entra")}5`].v).toBe(100);
    expect(ws[`${col("Sale")}6`].v).toBe(30);
    expect(ws[`${col("Saldo después")}6`].v).toBe(70);
    expect(ws[`${col("Movimiento")}6`].s.fill.fgColor.rgb).toBe("FEE2E2");
    expect(ws[`${col("Detalle")}6`].v).toContain("FIFO: 30 @ Q2.00");
  });
});
