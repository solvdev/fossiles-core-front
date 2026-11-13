import { computeInternalEnviUnitPrice } from "./standaloneInternalShipmentHelper";

const planilla = { requestType: "PLANILLA", discountPercent: 50 };

test("una compra de planilla sin descuento propio paga la mitad", () => {
  expect(computeInternalEnviUnitPrice(200, planilla)).toBe(100);
  expect(computeInternalEnviUnitPrice(200, planilla, null)).toBe(100);
  expect(computeInternalEnviUnitPrice(200, planilla, "")).toBe(100);
});

test("el descuento propio del producto manda sobre el 50 % general", () => {
  expect(computeInternalEnviUnitPrice(200, planilla, 30)).toBe(140);
  expect(computeInternalEnviUnitPrice(200, planilla, 100)).toBe(0);
  expect(computeInternalEnviUnitPrice(200, planilla, 0)).toBe(200);
  expect(computeInternalEnviUnitPrice(200, { applyHalfPrice: true }, 25)).toBe(150);
});

test("defectos y OPI no usan el descuento de colaborador del producto", () => {
  expect(computeInternalEnviUnitPrice(200, { requestType: "DEFECTOS", discountPercent: 40 }, 30)).toBe(80);
  expect(computeInternalEnviUnitPrice(200, { requestType: "DEFECTOS", discountAmount: 55 }, 30)).toBe(55);
  expect(computeInternalEnviUnitPrice(200, { requestType: "OPI", applyHalfPrice: false }, 30)).toBe(200);
});

test("un descuento fuera de rango se ignora y sin precio no hay cobro", () => {
  expect(computeInternalEnviUnitPrice(200, planilla, 150)).toBe(100);
  expect(computeInternalEnviUnitPrice(200, planilla, -5)).toBe(100);
  expect(computeInternalEnviUnitPrice(0, planilla, 30)).toBeNull();
});
