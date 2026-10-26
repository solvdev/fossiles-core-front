import {
  formatKioscoMovementReference,
  getKioscoMovementTypeLabel,
  KIOSCO_MOVEMENT_TYPE_LABELS,
} from "../kioskMovementHelper";

describe("movimiento SALIDA (venta sin factura)", () => {
  const exit = {
    movementType: "SALIDA",
    reason: "Venta sin factura POS-20261014-0007",
    referenceNumber: "POS-20261014-0007",
    referenceId: 55,
    stockBefore: 5,
    stockAfter: 4,
  };

  it("se muestra como Salida y no como devolucion a cliente", () => {
    expect(getKioscoMovementTypeLabel("SALIDA", exit)).toBe("Salida");
    expect(KIOSCO_MOVEMENT_TYPE_LABELS.SALIDA).toBe("Salida");
    expect(formatKioscoMovementReference(exit)).toBe("POS-20261014-0007");
  });

  it("las devoluciones a cliente y las ventas conservan su etiqueta", () => {
    expect(getKioscoMovementTypeLabel("DEVOLUCION_A_CLIENTE", { reason: "Entregado al cliente" }))
      .toBe("Dev. a cliente");
    expect(getKioscoMovementTypeLabel("VENTA", { reason: "Venta sin factura POS-1" })).toBe("Venta");
  });
});
