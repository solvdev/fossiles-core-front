import * as XLSX from "xlsx-js-style";
import { buildLeatherView, exportLeatherDemandExcel } from "../leatherDemandReport";

jest.mock("xlsx-js-style", () => {
  const actual = jest.requireActual("xlsx-js-style");
  return { ...actual, writeFile: jest.fn() };
});

const line = (over) => ({
  itemId: Math.random(), productCode: "B-7", productName: "Billetera", colorName: "NEGRO", materialId: 50,
  materialName: "CUERO NEGRO LISO", units: 10, deliveredUnits: 0, pendingUnits: 10, ft2PerUnit: 0.5,
  totalFt2: 5, pendingFt2: 5, missingRecipe: false, ...over,
});

const data = {
  byMaterial: [
    { materialId: 50, sku: "M-NL", name: "CUERO NEGRO LISO", availableFt2: 3 },
    { materialId: 60, sku: "M-WL", name: "CUERO WHISKY LISO", availableFt2: 100 },
  ],
  orders: [
    {
      orderId: 1, code: "OPK-1", orderType: "CLIENTE_KIOSKO", status: "IN_PROGRESS", deliveryDate: "2026-11-01",
      lines: [
        line({ itemId: 1 }),
        line({ itemId: 2, colorName: "WHISKY", materialId: 60, materialName: "CUERO WHISKY LISO", deliveredUnits: 10, pendingUnits: 0, pendingFt2: 0 }),
      ],
    },
    {
      orderId: 2, code: "OPV-9", orderType: "VENTA_EN_LINEA", status: "PENDING", deliveryDate: "2026-11-03",
      lines: [
        line({ itemId: 3, units: 4, pendingUnits: 4, totalFt2: 2, pendingFt2: 2 }),
        line({ itemId: 4, productCode: "LL-1", materialId: null, materialName: null, missingRecipe: true, units: 3, pendingUnits: 3, totalFt2: 0, pendingFt2: 0, ft2PerUnit: null }),
      ],
    },
  ],
};

describe("buildLeatherView", () => {
  it("totales incluyen lo ya entregado aunque la lista muestre solo lo que falta", () => {
    const v = buildLeatherView(data);
    expect(v.totals.totalFt2).toBe(12);
    expect(v.totals.pendingFt2).toBe(7);
    expect(v.totals.deliveredFt2).toBe(5);
    expect(v.totals.missingRecipeUnits).toBe(3);
    // OPK-1 solo muestra la línea NEGRO (la WHISKY ya se entregó).
    expect(v.orders.find((o) => o.code === "OPK-1").lines).toHaveLength(1);
    // WHISKY no tiene nada pendiente: no aparece como color.
    expect(v.colors.map((c) => c.key)).toEqual(["NEGRO"]);
  });

  it("por color suma OP, stock y faltante a comprar", () => {
    const negro = buildLeatherView(data).colors[0];
    expect(negro.orders).toBe(2);
    expect(negro.pendingFt2).toBe(7);
    expect(negro.availableFt2).toBe(3);
    expect(negro.shortageFt2).toBe(4);
    expect(negro.materials).toEqual(["CUERO NEGRO LISO"]);
  });

  it("filtra por color, tipo y búsqueda", () => {
    expect(buildLeatherView(data, { colorKey: "WHISKY", onlyPending: false }).orders.map((o) => o.code)).toEqual(["OPK-1"]);
    expect(buildLeatherView(data, { orderType: "VENTA_EN_LINEA" }).totals.pendingFt2).toBe(2);
    expect(buildLeatherView(data, { search: "ll-1" }).orders.map((o) => o.code)).toEqual(["OPV-9"]);
  });

  it("lista los productos sin receta", () => {
    expect(buildLeatherView(data).missingRecipes).toEqual([
      expect.objectContaining({ productCode: "LL-1", colorName: "NEGRO", units: 3 }),
    ]);
  });
});

describe("exportLeatherDemandExcel", () => {
  it("arma las hojas del reporte", () => {
    exportLeatherDemandExcel(buildLeatherView(data), "prueba");
    const [wb, name] = XLSX.writeFile.mock.calls[0];
    expect(name).toMatch(/^cuero_por_color_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(wb.SheetNames).toEqual(["Por color", "Orden x color", "Detalle", "Por cuero", "Sin receta"]);
  });
});
