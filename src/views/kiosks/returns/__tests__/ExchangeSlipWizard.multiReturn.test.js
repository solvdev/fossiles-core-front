import React from "react";
import { createRoot } from "react-dom/client";
import { act, Simulate } from "react-dom/test-utils";

import ExchangeSlipWizard from "../ExchangeSlipWizard";
import { lookupKioskSale, previewKioskExchange } from "services/kioskExchangeService";
import { getKioskPosContext } from "services/kioskPosService";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";

// react-dom/test-utils + createRoot necesitan declarar el entorno de act.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("services/kioskExchangeService", () => ({
  lookupKioskSale: jest.fn(),
  previewKioskExchange: jest.fn(),
  completeKioskExchange: jest.fn(),
}));
jest.mock("services/kioskPosService", () => ({
  getKioskPosContext: jest.fn(),
  getKioskSaleById: jest.fn(),
  updateKioskSaleInvoiceContact: jest.fn(),
}));
jest.mock("services/productService", () => ({ getProducts: jest.fn() }));
jest.mock("services/colorService", () => ({ getColors: jest.fn() }));
jest.mock("services/taxInvoiceService", () => ({ issueTaxInvoiceFromKioskSale: jest.fn() }));

const INVENTORY = [
  {
    productId: 90,
    colorId: 1,
    productCode: "NEW-1",
    productName: "Cartera Nueva",
    colorName: "Negro",
    hardwareCondition: null,
    quantity: 8,
  },
];

const SALE = {
  id: 55,
  internalNumber: "A45-241",
  saleDate: "2026-09-30",
  totalAmount: 415,
  items: [
    { id: 501, productId: 1, productCode: "CIN-1", productName: "Cincho Uno", quantity: 2, unitPrice: 100 },
    { id: 502, productId: 2, productCode: "CAR-2", productName: "Cartera Dos", quantity: 1, unitPrice: 200 },
    { id: 503, productId: 3, productCode: "SUM-1", productName: "Empaque", quantity: 1, unitPrice: 15, lineTotal: 15 },
  ],
};

const PREVIEW = {
  originalSaleId: 55,
  returned: { saleItemId: 501, productCode: "CIN-1", productName: "Cincho Uno", quantity: 2, unitPrice: 100, lineTotal: 200 },
  returnedItems: [
    { saleItemId: 501, productCode: "CIN-1", productName: "Cincho Uno", quantity: 2, unitPrice: 100, lineTotal: 200 },
    { saleItemId: 502, productCode: "CAR-2", productName: "Cartera Dos", quantity: 1, unitPrice: 200, lineTotal: 200 },
  ],
  givenItems: [
    { productId: 90, productCode: "NEW-1", productName: "Cartera Nueva", quantity: 3, unitPrice: 133.33, lineTotal: 400 },
  ],
  returnedAmount: 400,
  givenAmount: 400,
  differenceAmount: 0,
};

const flush = (ms = 0) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const $ = (selector) => document.body.querySelector(selector);
const $$ = (selector) => Array.from(document.body.querySelectorAll(selector));
const buttonByText = (text) => $$("button").find((b) => b.textContent.trim() === text);

describe("ExchangeSlipWizard · devolución de varias líneas de la factura", () => {
  let container;
  let root;

  beforeEach(() => {
    // CRA corre jest con resetMocks: las implementaciones se definen en cada test.
    getKioskPosContext.mockResolvedValue({ inventory: INVENTORY });
    getProducts.mockResolvedValue([
      { id: 1, code: "CIN-1", name: "Cincho Uno", salePrice: 100 },
      { id: 2, code: "CAR-2", name: "Cartera Dos", salePrice: 200 },
    ]);
    getColors.mockResolvedValue([]);
    lookupKioskSale.mockResolvedValue(SALE);
    previewKioskExchange.mockResolvedValue(PREVIEW);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const openAndSearch = async () => {
    await act(async () => {
      root.render(
        <ExchangeSlipWizard isOpen onClose={() => {}} kioskLocationId={7} kioskCode="K1" kioskName="Kiosko" />
      );
    });
    await flush();
    const input = $("input[placeholder='Ej: A45-241']");
    await act(async () => {
      Simulate.change(input, { target: { value: "A45-241" } });
    });
    await act(async () => {
      Simulate.click(buttonByText("Buscar"));
    });
    await flush();
  };

  it("permite marcar varias líneas, ajustar cantidades y envía todas al preview", async () => {
    await openAndSearch();

    // Dos productos cambiables + 1 empaque SUM de referencia (sin casilla).
    const checkboxes = $$("input.kiosk-exchange-line-input");
    expect(checkboxes).toHaveLength(2);
    expect($$(".kiosk-exchange-line.is-reference")).toHaveLength(1);
    expect($(".kiosk-exchange-selected").textContent).toContain("Aún no marcaste");

    // Sin selección no se puede avanzar.
    await act(async () => { Simulate.click(buttonByText("Siguiente")); });
    expect($(".alert-danger").textContent).toContain("Marca al menos un producto");

    // Marcar ambas: por defecto devuelve todo lo vendido.
    await act(async () => { Simulate.change(checkboxes[0]); });
    await act(async () => { Simulate.change(checkboxes[1]); });
    expect($(".kiosk-exchange-selected").textContent).toContain("Devuelve 2 productos · 3 unidades");

    // Bajar el cincho de 2 a 1 con el botón "−".
    await act(async () => { Simulate.click($("button[aria-label='Menos Cincho Uno']")); });
    expect($(".kiosk-exchange-selected").textContent).toContain("Devuelve 2 productos · 2 unidades");
    expect($("button[aria-label='Menos Cincho Uno']").disabled).toBe(true);

    await act(async () => { Simulate.click(buttonByText("Siguiente")); });
    await flush();

    await flush(350); // debounce de 300 ms del catálogo del kiosko
    // Paso 3: recordatorio de lo que ingresa y balance de unidades.
    expect(document.body.textContent).toContain("Ingresan:");
    expect(document.body.textContent).toContain("1 × CIN-1");
    expect(document.body.textContent).toContain("1 × CAR-2");

    const search = $("input[placeholder='Buscar por código, nombre o color…']");
    await act(async () => { Simulate.focus(search); });
    await flush();
    const option = $$("div[data-anchored-dropdown-menu='true'] div").find((d) => d.textContent.includes("NEW-1"));
    await act(async () => { Simulate.mouseDown(option); });
    // Sugerida 1 al ser varias líneas devueltas; se entregan 2.
    expect($("input[type='number']").value).toBe("1");
    await act(async () => { Simulate.change($("input[type='number']"), { target: { value: "2" } }); });
    await act(async () => { Simulate.click(buttonByText("Agregar a la entrega")); });
    expect($(".kiosk-exchange-balance").textContent).toContain("Ingresan 2 · Entregas 2");

    await act(async () => { Simulate.click(buttonByText("Ver resumen")); });
    await flush();

    expect(previewKioskExchange).toHaveBeenCalledTimes(1);
    const payload = previewKioskExchange.mock.calls[0][0];
    expect(payload.originalSaleId).toBe(55);
    expect(payload.returnedItems).toEqual([
      { originalSaleItemId: 501, quantity: 1 },
      { originalSaleItemId: 502, quantity: 1 },
    ]);
    expect(payload.givenItems).toHaveLength(1);

    // Resumen: una fila por cada producto que ingresa.
    expect(document.body.textContent).toContain("Ingreso (2)");
    expect(document.body.textContent).toContain("CIN-1 · Cincho Uno");
    expect(document.body.textContent).toContain("CAR-2 · Cartera Dos");
  });

  it("deja marcado de entrada el único producto cambiable de la factura", async () => {
    lookupKioskSale.mockResolvedValue({ ...SALE, items: [SALE.items[1], SALE.items[2]] });
    await openAndSearch();

    expect($$("input.kiosk-exchange-line-input")).toHaveLength(1);
    expect($("input.kiosk-exchange-line-input").checked).toBe(true);
    expect($(".kiosk-exchange-selected").textContent).toContain("Devuelve 1 producto · 1 unidad");
    // Con una sola línea no hace falta "Marcar todos".
    expect(buttonByText("Marcar todos")).toBeUndefined();
  });

  it("valida que la cantidad devuelta no supere lo vendido", async () => {
    await openAndSearch();
    const checkboxes = $$("input.kiosk-exchange-line-input");
    await act(async () => { Simulate.change(checkboxes[0]); });
    await act(async () => {
      Simulate.change($("input[aria-label='Cantidad devuelta de Cincho Uno']"), { target: { value: "5" } });
    });
    await act(async () => { Simulate.click(buttonByText("Siguiente")); });
    expect($(".alert-danger").textContent).toContain("no superar lo vendido (2)");
  });
});
