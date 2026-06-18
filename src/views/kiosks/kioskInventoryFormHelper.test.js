import {
  canSell,
  isSaleBelowMinimum,
  sortMovementsDesc,
  validateAnulacionForm,
  validateCommonStockForm,
  validateTransferForm,
} from "./kioskInventoryFormHelper";

describe("kioskInventoryFormHelper", () => {
  describe("Formulario de entrada", () => {
    it("envia correctamente con datos validos", () => {
      expect(
        validateCommonStockForm({
          locationId: 1,
          productId: 10,
          quantity: 5,
        })
      ).toBe("");
    });

    it("muestra error si cantidad es 0 o negativa", () => {
      expect(
        validateCommonStockForm({
          locationId: 1,
          productId: 10,
          quantity: 0,
        })
      ).toContain("cantidad");
      expect(
        validateCommonStockForm({
          locationId: 1,
          productId: 10,
          quantity: -3,
        })
      ).toContain("cantidad");
    });

    it("muestra error si locationId no esta seleccionado", () => {
      expect(
        validateCommonStockForm({
          locationId: "",
          productId: 10,
          quantity: 1,
        })
      ).toContain("kiosko");
    });
  });

  describe("Formulario de venta", () => {
    const row = { currentStock: 12, minimumStock: 4 };

    it("muestra alerta visual cuando el stock queda en minimo", () => {
      expect(isSaleBelowMinimum(row, 8)).toBe(true);
    });

    it("deshabilita envio si cantidad supera el stock disponible", () => {
      expect(canSell(row, 13)).toBe(false);
      expect(canSell(row, 4)).toBe(true);
    });
  });

  describe("Formulario de traslado", () => {
    it("requiere origen y destino distintos", () => {
      expect(
        validateTransferForm({
          locationOriginId: 1,
          locationDestinationId: 2,
          productId: 10,
          quantity: 2,
        })
      ).toBe("");
      expect(
        validateTransferForm({
          locationOriginId: 1,
          locationDestinationId: 1,
          productId: 10,
          quantity: 2,
        })
      ).toContain("distintos");
    });
  });

  describe("Formulario de anulacion", () => {
    it("requiere motivo y comportamiento de campo salida de producto", () => {
      expect(
        validateAnulacionForm({
          locationId: 1,
          productId: 10,
          quantity: 1,
          reason: "Error de cobro",
          productLeftKiosk: true,
        })
      ).toBe("");

      expect(
        validateAnulacionForm({
          locationId: 1,
          productId: 10,
          quantity: 1,
          reason: "",
          productLeftKiosk: true,
        })
      ).toContain("motivo");
    });
  });

  describe("Vista stock y movimientos", () => {
    it("resalta en rojo cuando stock <= stock_minimo", () => {
      expect(isSaleBelowMinimum({ currentStock: 5, minimumStock: 5 }, 1)).toBe(true);
    });

    it("ordena movimientos en cronologico descendente", () => {
      const movements = sortMovementsDesc([
        { id: 1, createdAt: "2026-01-01T10:00:00Z" },
        { id: 2, createdAt: "2026-01-01T12:00:00Z" },
      ]);
      expect(movements[0].id).toBe(2);
      expect(movements[1].id).toBe(1);
    });
  });
});
