import { filterItems } from "../StepSelectOrders";

describe("filtro de productos en «Elegir qué va hoy»", () => {
  const items = [
    { productionOrderItemId: 1, productCode: "BIL-01", productName: "Billetera clásica", colorName: "Negro" },
    { productionOrderItemId: 2, productCode: "BIL-01", productName: "Billetera clásica", colorName: "Café" },
    { productionOrderItemId: 3, productCode: "CAR-07", productName: "Cartera Navidad", colorName: "Rojo" },
  ];

  it("cada palabra debe estar en código, nombre o color, sin importar tildes", () => {
    expect(filterItems(items, "bil negro", false, {}).map((i) => i.productionOrderItemId)).toEqual([1]);
    expect(filterItems(items, "cafe", false, {}).map((i) => i.productionOrderItemId)).toEqual([2]);
    expect(filterItems(items, "clasica", false, {})).toHaveLength(2);
  });

  it("solo con cantidad de hoy deja las que tienen unidades escritas (aunque sean 0)", () => {
    expect(filterItems(items, "", true, { 3: 0 }).map((i) => i.productionOrderItemId)).toEqual([3]);
  });
});
