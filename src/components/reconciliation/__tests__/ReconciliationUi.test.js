import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ReconciliationPage from "views/reconciliation/ReconciliationPage";
import * as api from "services/reconciliationService";
import { rowResult } from "components/reconciliation/ReconSimpleView";

jest.mock("services/reconciliationService", () => ({
  getDashboard: jest.fn(), getCases: jest.fn(), getCase: jest.fn(), getSellers: jest.fn(), getBatches: jest.fn(), getExports: jest.fn(),
  getUnappliedReceipts: jest.fn(), getCommissions: jest.fn(), getMissingSellers: jest.fn(), closeBatch: jest.fn(), createBatch: jest.fn(), recordCaseReceiptsBulk: jest.fn(), replaceCaseReceipt: jest.fn(), updateShippingCommission: jest.fn(), settleCases: jest.fn(),
  downloadBatch: jest.fn(), voidBatch: jest.fn(), proposeAdjustment: jest.fn(), authorizeAdjustment: jest.fn(), rejectAdjustment: jest.fn(),
  reconcileCase: jest.fn(), bulkReconcile: jest.fn(), applyReceipt: jest.fn(), voidApplication: jest.fn(), reopenCase: jest.fn(),
  excludeCase: jest.fn(), includeCase: jest.fn(), observeCase: jest.fn(), refreshAmount: jest.fn(), revalidateCase: jest.fn(),
  revalidatePeriod: jest.fn(), autoApplyReceipts: jest.fn(), generateCases: jest.fn(), importReceipts: jest.fn(), createReceipt: jest.fn(),
  importGuides: jest.fn(), recordQuickReceipt: jest.fn(), recordCaseReceipt: jest.fn(), calculateCommissions: jest.fn(), closeCommissionMonth: jest.fn(), createSeller: jest.fn(),
}));

jest.mock("services/customerAccountService", () => ({ createClientRequestId: () => "req-1" }));
jest.mock("utils/notificationHelper", () => ({ showError: jest.fn(), showSuccess: jest.fn(), showWarning: jest.fn() }));
jest.mock("utils/dateTimeHelper", () => ({ getTodayYmdGuatemala: () => "2026-10-14" }));

let mockGranted = true;
jest.mock("contexts/AuthContext", () => ({ useAuth: () => ({ hasPermission: () => mockGranted }) }));
jest.mock("components/reconciliation/Reconciliation.css", () => ({}), { virtual: true });

const row = (over = {}) => ({
  id: 1, onlineSaleId: 10, saleDate: "2026-10-05", saleNumber: "1", shipmentNumber: "ENVL-01601", guideNumber: "58123456789", carrier: "FORZA_DELIVERY",
  paymentMethod: "CONTRA_ENTREGA", reference: "LIQ-FZ-312", expected: 105, received: 100, difference: -5, authorizedAdjustment: 0, pendingBalance: 5,
  commission: 1.5, seller: "Anthony Ixcajo", status: "CON_DIFERENCIAS", origin: "NORMAL", batchId: null, batchCode: null, criticalCount: 1,
  warningCount: 0, problemType: "MONTO_INCORRECTO", hasReceipts: true, ...over,
});

const dashboard = {
  byStatus: { PENDIENTE_REVISION: 1, CONCILIADO_AUTO: 3, CON_DIFERENCIAS: 1 }, pending: 1, reconciled: 3, withDifferences: 1, incomplete: 0, excluded: 0,
  expected: 1130, received: 580, pendingDifferences: 5, awaitingFunds: 545, commissionsToValidate: 3,
  byMethod: [{ key: "CONTRA_ENTREGA", cases: 5, reconciled: 3, pending: 1, withDifferences: 1, incomplete: 0, expected: 1130, received: 580 }],
  byCarrier: [{ key: "FORZA_DELIVERY", cases: 5, reconciled: 3, pending: 1, withDifferences: 1, incomplete: 0, expected: 1130, received: 580 }],
  byProblem: { MONTO_INCORRECTO: 1 }, unappliedReceipts: 2,
};

const detail = {
  row: row(), sale: { saleNumber: "1", shipmentNumber: "ENVL-01601", saleDate: "2026-10-05", customerName: "Cliente", total: 105, net: 75, shipping: 30, paymentAuthorization: null, invoiceId: null, dispatchedAt: null },
  checks: [
    { code: "R06", name: "Cobrado = recibido (exacto)", severity: "CRITICAL", outcome: "FAIL", expected: "Q105.00", found: "Q100.00", message: "Diferencia de -Q5.00 (falta dinero).", action: "Solicitar un ajuste autorizado" },
    { code: "R02", name: "ENVL presente", severity: "CRITICAL", outcome: "PASS", expected: "Un ENVL", found: "ENVL-01601", message: "", action: "" },
  ],
  applications: [{ id: 5, receiptId: 3, amountApplied: 100, matchMethod: "GUIDE", status: "ACTIVE", source: "CARRIER", reference: "LIQ-FZ-312", receivedDate: "2026-10-12" }],
  differences: [], events: [{ id: 1, type: "CASO_CREADO", from: null, to: "PENDIENTE_REVISION", payload: null, actorId: 7, at: "2026-10-05T08:00:00" }],
  ledger: [{ id: 1, type: "CARGO", amount: 105, note: null, at: "2026-10-05T08:00:00" }],
  commission: { month: "2026-10", base: 75, rate: 0.02, expected: 1.5, registered: null, status: "SIN_REGISTRAR" }, sourceChanged: false,
  actions: ["OBSERVE", "REVALIDATE", "APPLY_RECEIPT", "VOID_APPLICATION", "PROPOSE_ADJUSTMENT", "EXCLUDE"],
};

let container;
let root;

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ReconciliationPage />); });
};
const flush = () => act(async () => { await Promise.resolve(); });
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const typeInto = async (el, value) => {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const byText = (selector, text) => Array.from(document.querySelectorAll(selector)).find((e) => e.textContent.includes(text));

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mockGranted = true;
  window.localStorage.setItem("recon.view", "full");
  Object.values(api).forEach((fn) => fn.mockReset && fn.mockReset());
  api.getDashboard.mockResolvedValue(dashboard);
  api.getSellers.mockResolvedValue([{ id: 1, name: "Anthony Ixcajo", active: true }]);
  api.getBatches.mockResolvedValue([]);
  api.getExports.mockResolvedValue([]);
  api.getUnappliedReceipts.mockResolvedValue([]);
  api.getCases.mockResolvedValue({ rows: [row(), row({ id: 2, shipmentNumber: "ENVL-01602", status: "CONCILIADO_AUTO", difference: 0, received: 480, expected: 480, problemType: null })], total: 2, page: 0, size: 50 });
  api.getCase.mockResolvedValue(detail);
  api.getMissingSellers.mockResolvedValue([]);
  api.generateCases.mockResolvedValue({ created: 0, alreadyExisted: 2, excluded: 0, total: 2 });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  document.body.className = "";
});

describe("Conciliación de ventas en línea (interfaz)", () => {
  it("el dashboard muestra los indicadores reales del filtro y los llena con montos en quetzales", async () => {
    await mount();
    await flush();
    const text = container.textContent;
    expect(text).toContain("Pendientes de revisión");
    expect(text).toContain("Q1,130.00");
    expect(text).toContain("Q580.00");
    expect(text).toContain("Monto incorrecto");
    expect(api.getDashboard).toHaveBeenCalledWith(expect.objectContaining({ from: "2026-10-01", to: "2026-10-14" }));
  });

  it("la bandeja marca la diferencia con signo y texto, y abre el detalle sin perder la tabla", async () => {
    await mount();
    await click(byText("a.nav-link, .nav-link", "Bandeja"));
    await flush();
    expect(container.textContent).toContain("ENVL-01601");
    expect(container.textContent).toContain("▼ -Q5.00");
    expect(container.textContent).toContain("= Q0.00");
    await click(byText("tr", "ENVL-01601"));
    await flush();
    const drawer = document.querySelector(".recon-drawer");
    expect(drawer).not.toBeNull();
    expect(drawer.textContent).toContain("Cobrado = recibido (exacto)");
    expect(drawer.textContent).toContain("Diferencia de -Q5.00");
    expect(drawer.textContent).toContain("El estado no hace desaparecer la diferencia");
    expect(container.textContent).toContain("ENVL-01602");   // la tabla sigue visible
    expect(document.body.classList.contains("recon-drawer-open")).toBe(true);
  });

  it("solicitar un ajuste exige un motivo de al menos 15 caracteres", async () => {
    api.proposeAdjustment.mockResolvedValue({});
    await mount();
    await click(byText(".nav-link", "Bandeja"));
    await flush();
    await click(byText("tr", "ENVL-01601"));
    await click(byText("button", "Solicitar ajuste autorizado"));
    const textarea = document.querySelector("#recon-form-text");
    expect(textarea).not.toBeNull();
    const confirm = byText(".recon-drawer button", "Confirmar");
    await click(confirm);
    expect(api.proposeAdjustment).not.toHaveBeenCalled();
    const { showError } = require("utils/notificationHelper");
    expect(showError).toHaveBeenCalledWith(expect.stringContaining("al menos 15"));
  });

  it("sin permisos las acciones quedan deshabilitadas", async () => {
    mockGranted = false;
    await mount();
    await click(byText(".nav-link", "Bandeja"));
    await flush();
    await click(byText("tr", "ENVL-01601"));
    expect(byText("button", "Solicitar ajuste autorizado").disabled).toBe(true);
    expect(byText("button", "Aplicar un fondo").disabled).toBe(true);
  });

  it("cerrar un lote pide confirmación y envía una clave de idempotencia", async () => {
    api.getBatches.mockResolvedValue([{ id: 9, code: "LC-202610-001", status: "OPEN", periodFrom: "2026-10-01", periodTo: "2026-10-14", cases: 3, expected: 850, received: 845, adjusted: 5, pending: 0 }]);
    api.getCases.mockResolvedValue({ rows: [], total: 3, page: 0, size: 1 });
    api.closeBatch.mockResolvedValue({ alreadyClosed: false, batch: { code: "LC-202610-001" }, exportedCases: 3, closedCases: 3, contentSha256: "abcdef0123456789" });
    await mount();
    await click(byText(".nav-link", "Lotes y descargas"));
    await flush();
    await click(byText("button", "Revisar y cerrar"));
    expect(container.textContent).toContain("Es irreversible para estos casos");
    expect(api.closeBatch).not.toHaveBeenCalled();
    await click(byText("button", "Confirmar descarga y cerrar lote"));
    expect(api.closeBatch).toHaveBeenCalledWith(9, expect.stringContaining("cierre-9-"));
    expect(container.textContent).toContain("Casos exportados: 3 = casos cerrados: 3");
  });

  it("sin casos explica cómo empezar", async () => {
    api.getDashboard.mockResolvedValue({ ...dashboard, byStatus: {}, byProblem: {}, byMethod: [], byCarrier: [] });
    await mount();
    await flush();
    expect(container.textContent).toContain("Todavía no hay casos en este filtro");
    expect(container.textContent).toContain("generando los casos del período");
  });

  describe("registrar pagos escritos", () => {
    const openQuick = async () => {
      await mount();
      await click(byText("button", "Registrar pagos"));
      await flush();
    };

    it("guarda cada fila con su ENVL, monto y referencia, y avisa si cuadra al centavo", async () => {
      api.recordQuickReceipt.mockResolvedValue({ difference: 0, message: "Cuadra: Q105.00 = Q105.00" });
      await openQuick();
      await typeInto(document.querySelector('[aria-label="ENVL o guía, fila 1"]'), "ENVL-01601");
      await typeInto(document.querySelector('[aria-label="Monto, fila 1"]'), "105");
      await typeInto(document.querySelector('[aria-label="Referencia, fila 1"]'), "LIQ-1");
      await click(byText(".modal button", "Guardar 1 pago"));
      expect(api.recordQuickReceipt).toHaveBeenCalledTimes(1);
      expect(api.recordQuickReceipt).toHaveBeenCalledWith({ identifier: "ENVL-01601", amount: 105, reference: "LIQ-1", receivedDate: null, sourceType: null });
      expect(document.querySelector(".modal").textContent).toContain("todos cuadran al centavo");
    });

    it("marca con «!» el pago con diferencia y no lo corrige solo", async () => {
      api.recordQuickReceipt.mockResolvedValue({ difference: -5, message: "Faltan Q5.00" });
      await openQuick();
      await typeInto(document.querySelector('[aria-label="ENVL o guía, fila 1"]'), "ENVL-01601");
      await typeInto(document.querySelector('[aria-label="Monto, fila 1"]'), "100");
      await click(byText(".modal button", "Guardar 1 pago"));
      const text = document.querySelector(".modal").textContent;
      expect(text).toContain("! Faltan Q5.00");
      expect(text).toContain("1 con diferencia");
      expect(api.recordQuickReceipt).toHaveBeenCalledTimes(1);
    });

    it("una fila con error no frena a las demás y no se reenvía la guardada", async () => {
      api.recordQuickReceipt
        .mockRejectedValueOnce(new Error("No existe una venta con ese ENVL"))
        .mockResolvedValueOnce({ difference: 0, message: "Cuadra" });
      await openQuick();
      await typeInto(document.querySelector('[aria-label="ENVL o guía, fila 1"]'), "ENVL-9999");
      await typeInto(document.querySelector('[aria-label="Monto, fila 1"]'), "10");
      await typeInto(document.querySelector('[aria-label="ENVL o guía, fila 2"]'), "ENVL-01601");
      await typeInto(document.querySelector('[aria-label="Monto, fila 2"]'), "105");
      await click(byText(".modal button", "Guardar 2 pagos"));
      expect(document.querySelector(".modal").textContent).toContain("✕ No existe una venta con ese ENVL");
      expect(byText(".modal button", "Guardar 1 pago")).toBeDefined();
      api.recordQuickReceipt.mockClear();
      api.recordQuickReceipt.mockResolvedValue({ difference: 0, message: "Cuadra" });
      await click(byText(".modal button", "Guardar 1 pago"));
      expect(api.recordQuickReceipt).toHaveBeenCalledTimes(1);
      expect(api.recordQuickReceipt.mock.calls[0][0].identifier).toBe("ENVL-9999");
    });

    it("sin permiso de importar el botón queda deshabilitado", async () => {
      mockGranted = false;
      await mount();
      expect(byText("button", "Registrar pagos").disabled).toBe(true);
    });

    it("dentro del caso se registra el pago con el monto escrito", async () => {
      api.recordCaseReceipt.mockResolvedValue({});
      await mount();
      await click(byText(".nav-link", "Bandeja"));
      await flush();
      await click(byText("tr", "ENVL-01601"));
      await click(byText(".recon-drawer button", "Registrar pago recibido"));
      await click(byText(".recon-drawer button", "Guardar pago"));
      expect(api.recordCaseReceipt).not.toHaveBeenCalled();   // sin monto no se envía
      await typeInto(document.querySelector("#pay-amount"), "5");
      await typeInto(document.querySelector("#pay-ref"), "BOL-7");
      await click(byText(".recon-drawer button", "Guardar pago"));
      expect(api.recordCaseReceipt).toHaveBeenCalledWith(1, { amount: 5, reference: "BOL-7", receivedDate: null });
    });
  });

  describe("liquidación en tres momentos", () => {
    const pendingRow = row({ id: 3, shipmentNumber: "ENVL-01603", hasReceipts: false, received: 0, difference: -105, pendingBalance: 105, status: "INFORMACION_INCOMPLETA" });
    const okRow = row({ id: 4, shipmentNumber: "ENVL-01604", expected: 480, received: 480, difference: 0, pendingBalance: 0, status: "CONCILIADO_AUTO", problemType: null });
    const warnRow = row({ id: 5, shipmentNumber: "ENVL-01605", expected: 265, received: 265, difference: 0, pendingBalance: 0, status: "PENDIENTE_REVISION", warningCount: 1, problemType: null });
    const withSale = {
      ...detail,
      row: pendingRow,
      sale: { ...detail.sale, customerName: "María López", items: [{ code: "C-1", name: "Cincho clásico", color: "Café", size: "34", quantity: 1, unitPrice: 75, subtotal: 75 }] },
      checks: [{ code: "R03", name: "Guía presente", severity: "WARNING", outcome: "FAIL", expected: "Guía", found: "Sin guía", message: "La venta no tiene guía capturada.", action: "" }],
    };
    beforeEach(() => {
      window.localStorage.removeItem("recon.view");
      api.getCases.mockImplementation(async (filters, opts) => (opts && opts.size === 200
        ? { rows: [okRow, warnRow], total: 2, page: 0, size: 200 }
        : { rows: [pendingRow, row(), okRow, warnRow], total: 4, page: 0, size: 50 }));
      api.getCase.mockResolvedValue(withSale);
    });

    it("es la pantalla de entrada: trae las ventas del sistema, muestra los 3 momentos y los totales", async () => {
      await mount();
      await flush();
      expect(api.generateCases).toHaveBeenCalledWith("2026-10-01", "2026-10-14");
      const text = container.textContent;
      expect(text).toContain("Revisar");
      expect(text).toContain("Montos");
      expect(text).toContain("Liquidar");
      expect(text).toContain("Cobrado según el sistema");
      expect(text).toContain("Q1,130.00");
      expect(text).toContain("Falta registrar el pago");
      expect(text).toContain("! Faltan Q5.00");
      expect(text).toContain("✓ Cuadra, con avisos");
      expect(byText(".nav-link", "Bandeja")).toBeUndefined();   // sin pestañas
      await click(byText("button", "Vista completa"));
      expect(byText(".nav-link", "Bandeja")).toBeDefined();
    });

    it("la venta se ve a detalle dentro de la misma fila y la ficha completa se abre sin perder la lista", async () => {
      await mount();
      await flush();
      await click(byText("tr.recon-row", "ENVL-01603"));
      await flush();
      expect(api.getCase).toHaveBeenCalledWith(3);
      const text = container.textContent;
      expect(text).toContain("María López");
      expect(text).toContain("Cincho clásico");
      expect(text).toContain("Total cobrado");
      expect(text).toContain("La venta no tiene guía capturada.");
      expect(container.textContent).toContain("ENVL-01604");   // la lista sigue ahí
      await click(byText("button", "Ficha completa"));
      await flush();
      expect(document.querySelector(".recon-drawer")).not.toBeNull();
    });

    it("escribir un monto muestra al instante si cuadra y se guardan juntos con «Guardar montos»", async () => {
      api.recordCaseReceiptsBulk.mockResolvedValue({ saved: 1, failed: 0, rows: [{ caseId: 3, ok: true, difference: 0 }] });
      await mount();
      await flush();
      const input = document.querySelector('[aria-label="Monto recibido ENVL-01603"]');
      await typeInto(input, "100");
      expect(byText("tr", "ENVL-01603").textContent).toContain("! Faltan Q5.00 · sin guardar");
      await typeInto(input, "105");
      expect(byText("tr", "ENVL-01603").textContent).toContain("✓ Cuadra · sin guardar");
      await typeInto(document.querySelector('[aria-label="No. Autorización/Referencia ENVL-01603"]'), "LIQ-9");
      expect(api.recordCaseReceiptsBulk).not.toHaveBeenCalled();   // nada se guarda solo
      await click(byText("button", "Guardar montos (1)"));
      expect(api.recordCaseReceiptsBulk).toHaveBeenCalledWith([{ caseId: 3, amount: 105, matchExpected: false, reference: "LIQ-9" }]);
    });

    it("«=» registra lo cobrado sin teclearlo y avisa que todos cuadran", async () => {
      api.recordCaseReceiptsBulk.mockResolvedValue({ saved: 1, failed: 0, rows: [{ caseId: 3, ok: true, difference: 0 }] });
      await mount();
      await flush();
      await click(document.querySelector('[aria-label="Recibido igual a cobrado ENVL-01603"]'));
      expect(document.querySelector('[aria-label="Monto recibido ENVL-01603"]').value).toBe("105");
      await click(byText("button", "Guardar montos (1)"));
      expect(api.recordCaseReceiptsBulk).toHaveBeenCalledWith([{ caseId: 3, amount: null, matchExpected: true, reference: null }]);
      const { showSuccess } = require("utils/notificationHelper");
      expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining("cuadra al centavo"));
    });

    it("cada fila se guarda sola con su botón o con Enter, sin tocar las demás", async () => {
      api.recordCaseReceiptsBulk.mockResolvedValue({ saved: 1, failed: 0, rows: [{ caseId: 3, ok: true, difference: 0 }] });
      await mount();
      await flush();
      expect(document.querySelector('[aria-label="Guardar ENVL-01603"]')).toBeNull();   // sin nada escrito no hay botón
      await typeInto(document.querySelector('[aria-label="Monto recibido ENVL-01603"]'), "105");
      await click(document.querySelector('[aria-label="Guardar ENVL-01603"]'));
      expect(api.recordCaseReceiptsBulk).toHaveBeenCalledTimes(1);
      expect(api.recordCaseReceiptsBulk).toHaveBeenCalledWith([{ caseId: 3, amount: 105, matchExpected: false, reference: null }]);
      const { showSuccess } = require("utils/notificationHelper");
      expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining("1 monto guardado"));
    });

    it("Editar abre el pago guardado y al guardar lo reemplaza sin crear uno nuevo", async () => {
      api.replaceCaseReceipt.mockResolvedValue({ caseId: 1, ok: true, difference: 0 });
      await mount();
      await flush();
      await click(document.querySelector('[aria-label="Editar el pago de ENVL-01601"]'));
      const amount = document.querySelector('[aria-label="Monto recibido ENVL-01601"]');
      expect(amount.value).toBe("100");
      expect(document.querySelector('[aria-label="No. Autorización/Referencia ENVL-01601"]').value).toBe("LIQ-FZ-312");
      await typeInto(amount, "105");
      expect(byText("tr", "ENVL-01601").textContent).toContain("✓ Cuadra · sin guardar");
      await click(document.querySelector('[aria-label="Guardar ENVL-01601"]'));
      expect(api.replaceCaseReceipt).toHaveBeenCalledWith(1, { amount: 105, matchExpected: false, reference: "LIQ-FZ-312" });
      expect(api.recordCaseReceiptsBulk).not.toHaveBeenCalled();
    });

    it("Cancelar una edición deja el pago como estaba y un error de la corrección se queda en su fila", async () => {
      api.replaceCaseReceipt.mockRejectedValue(new Error("Este pago viene de un archivo importado."));
      await mount();
      await flush();
      await click(document.querySelector('[aria-label="Editar el pago de ENVL-01601"]'));
      await click(byText("tr", "ENVL-01601").querySelector("button.btn-link"));   // Cancelar
      expect(document.querySelector('[aria-label="Monto recibido ENVL-01601"]')).toBeNull();
      await click(document.querySelector('[aria-label="Editar el pago de ENVL-01601"]'));
      await typeInto(document.querySelector('[aria-label="Monto recibido ENVL-01601"]'), "110");
      await click(document.querySelector('[aria-label="Guardar ENVL-01601"]'));
      expect(byText("tr", "ENVL-01601").textContent).toContain("Este pago viene de un archivo importado.");
      expect(document.querySelector('[aria-label="Monto recibido ENVL-01601"]').value).toBe("110");   // el borrador no se pierde
    });

    it("las columnas Fecha, ENVL, Cliente y Guía ordenan la lista y repetir el clic invierte el orden", async () => {
      await mount();
      await flush();
      const lastSort = () => api.getCases.mock.calls.filter(([, o]) => o && o.size === 50).pop()[1];
      expect(lastSort()).toMatchObject({ sort: "saleDate", dir: "asc" });
      await click(byText("th button", "Cliente"));
      expect(lastSort()).toMatchObject({ sort: "customerName", dir: "asc", page: 0 });
      await click(byText("th button", "Cliente"));
      expect(lastSort()).toMatchObject({ sort: "customerName", dir: "desc" });
      await click(byText("th button", "Guía"));
      expect(lastSort()).toMatchObject({ sort: "guideNumber", dir: "asc" });
      await click(byText("th button", "ENVL"));
      expect(lastSort()).toMatchObject({ sort: "shipmentNumber", dir: "asc" });
      await click(byText("th button", "Fecha"));
      expect(lastSort()).toMatchObject({ sort: "saleDate", dir: "asc" });
    });

    it("el detalle de la fila muestra la dirección de envío", async () => {
      api.getCase.mockResolvedValue({ ...withSale, sale: { ...withSale.sale, address: "5a avenida 10-20 zona 1, Guatemala" } });
      await mount();
      await flush();
      await click(byText("tr.recon-row", "ENVL-01603"));
      expect(container.textContent).toContain("Dirección de envío");
      expect(container.textContent).toContain("5a avenida 10-20 zona 1, Guatemala");
    });

    it("Esc cierra la ficha completa y, ya sin ella, el detalle de la fila", async () => {
      await mount();
      await flush();
      await click(byText("tr.recon-row", "ENVL-01603"));
      expect(document.querySelector(".recon-inline")).not.toBeNull();
      await click(byText("button", "Ficha completa"));
      expect(document.querySelector(".recon-drawer")).not.toBeNull();
      const esc = async () => { await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await flush(); };
      await esc();
      expect(document.querySelector(".recon-drawer")).toBeNull();        // primero la ficha
      expect(document.querySelector(".recon-inline")).not.toBeNull();    // el detalle de la fila sigue
      await esc();
      expect(document.querySelector(".recon-inline")).toBeNull();        // luego el detalle
    });

    it("el porcentaje de comisión se elige con botones y Forza y Guatex llevan 3.5% fijo", async () => {
      const forza = row({ id: 3, shipmentNumber: "ENVL-01603", carrier: "FORZA_DELIVERY", hasReceipts: false, received: 0, difference: -105, pendingBalance: 105, status: "INFORMACION_INCOMPLETA",
        chargedShipping: 30, realShipping: null, carrierCommissionFixed: true, carrierCommissionRate: 0.035, carrierCommission: 3.68 });
      const moto = row({ id: 6, shipmentNumber: "ENVL-01606", carrier: "MOTORISTA", hasReceipts: false, received: 0, difference: -230, pendingBalance: 230, status: "INFORMACION_INCOMPLETA",
        expected: 230, chargedShipping: 30, realShipping: null, carrierCommissionFixed: false, carrierCommissionRate: null, carrierCommission: null });
      api.getCases.mockImplementation(async (filters, opts) => (opts && opts.size === 200 ? { rows: [], total: 0, page: 0, size: 200 } : { rows: [forza, moto], total: 2, page: 0, size: 50 }));
      api.updateShippingCommission.mockResolvedValue({ ...moto, carrierCommissionRate: 0.04, carrierCommission: 9.2 });
      await mount();
      await flush();
      expect(byText("tr", "ENVL-01603").textContent).toContain("3.5%");
      expect(byText("tr", "ENVL-01603").textContent).toContain("fijo");
      expect(document.querySelector('[aria-label="Comisión 4% ENVL-01603"]')).toBeNull();     // en Forza no se elige
      expect(byText("tr", "ENVL-01606").textContent).toContain("Elija el porcentaje");
      await click(document.querySelector('[aria-label="Comisión 4% ENVL-01606"]'));
      expect(api.updateShippingCommission).toHaveBeenCalledWith(6, { realShipping: null, commissionRate: 0.04 });
      expect(byText("tr", "ENVL-01606").textContent).toContain("Q9.20");
    });

    it("el envío real se escribe, se guarda y se compara con el envío cobrado", async () => {
      const moto = row({ id: 6, shipmentNumber: "ENVL-01606", carrier: "MOTORISTA", hasReceipts: false, received: 0, difference: -230, pendingBalance: 230, status: "INFORMACION_INCOMPLETA",
        expected: 230, chargedShipping: 30, realShipping: null, carrierCommissionFixed: false, carrierCommissionRate: 0.03, carrierCommission: 6.9 });
      api.getCases.mockImplementation(async (filters, opts) => (opts && opts.size === 200 ? { rows: [], total: 0, page: 0, size: 200 } : { rows: [moto], total: 1, page: 0, size: 50 }));
      api.updateShippingCommission.mockResolvedValue({ ...moto, realShipping: 25 });
      await mount();
      await flush();
      expect(document.querySelector('[aria-label="Guardar envío real ENVL-01606"]')).toBeNull();
      await typeInto(document.querySelector('[aria-label="Envío real ENVL-01606"]'), "25");
      await click(document.querySelector('[aria-label="Guardar envío real ENVL-01606"]'));
      expect(api.updateShippingCommission).toHaveBeenCalledWith(6, { realShipping: 25, commissionRate: 0.03 });
      expect(byText("tr", "ENVL-01606").textContent).toContain("Cobrado Q30.00");
      expect(byText("tr", "ENVL-01606").textContent).toContain("+Q5.00 a favor");
    });

    it("las ventas anuladas aparecen en la lista con su motivo y se pueden reincorporar", async () => {
      const anulada = row({ id: 8, shipmentNumber: "ENVL-01608", status: "EXCLUIDO", hasReceipts: false, received: 0, excludedReason: "Venta en estado ANULADA" });
      api.getCases.mockImplementation(async (filters, opts) => (opts && opts.size === 200 ? { rows: [], total: 0, page: 0, size: 200 } : { rows: [anulada], total: 1, page: 0, size: 50 }));
      api.includeCase.mockResolvedValue({});
      await mount();
      await flush();
      const listed = api.getCases.mock.calls.find(([, o]) => o && o.size === 50)[0];
      expect(listed.status).toContain("EXCLUIDO");                       // la pestaña principal ya no la esconde
      const tr = byText("tr", "ENVL-01608");
      expect(tr.textContent).toContain("Anulada");
      expect(tr.textContent).toContain("Venta en estado ANULADA");
      expect(tr.querySelector('input[type="checkbox"]')).toBeNull();      // no se liquida
      expect(document.querySelector('[aria-label="Anular ENVL-01608"]')).toBeNull();
      await click(document.querySelector('[aria-label="Reincorporar ENVL-01608"]'));
      expect(api.includeCase).toHaveBeenCalledWith(8);
    });

    it("Anular pide el motivo y saca la venta de la conciliación", async () => {
      api.excludeCase.mockResolvedValue({});
      await mount();
      await flush();
      await click(document.querySelector('[aria-label="Anular ENVL-01603"]'));
      const confirmBtn = document.querySelector('[aria-label="Confirmar anulación ENVL-01603"]');
      expect(confirmBtn.disabled).toBe(true);                             // sin motivo no se puede
      await typeInto(document.querySelector('[aria-label="Motivo de la anulación ENVL-01603"]'), "corto");
      expect(document.querySelector('[aria-label="Confirmar anulación ENVL-01603"]').disabled).toBe(true);
      await typeInto(document.querySelector('[aria-label="Motivo de la anulación ENVL-01603"]'), "El paquete regresó sin entregar");
      await click(document.querySelector('[aria-label="Confirmar anulación ENVL-01603"]'));
      expect(api.excludeCase).toHaveBeenCalledWith(3, "El paquete regresó sin entregar");
      const { showSuccess } = require("utils/notificationHelper");
      expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining("quedó anulada"));
    });

    it("si no se puede anular (tiene pagos), el motivo del servidor se queda en la fila", async () => {
      api.excludeCase.mockRejectedValue(new Error("El caso tiene fondos aplicados. Anule primero esas aplicaciones."));
      await mount();
      await flush();
      await click(document.querySelector('[aria-label="Anular ENVL-01603"]'));
      await typeInto(document.querySelector('[aria-label="Motivo de la anulación ENVL-01603"]'), "El paquete regresó sin entregar");
      await click(document.querySelector('[aria-label="Confirmar anulación ENVL-01603"]'));
      expect(byText("tr", "ENVL-01603").textContent).toContain("Anule primero esas aplicaciones");
    });

    it("Ctrl+B y Ctrl+F llevan al buscador sin abrir el del navegador", async () => {
      await mount();
      await flush();
      const search = document.querySelector("#rs-q");
      for (const key of ["b", "f"]) {
        search.blur();
        let prevented = false;
        await act(async () => {
          const ev = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
          document.dispatchEvent(ev);
          prevented = ev.defaultPrevented;
        });
        expect(document.activeElement).toBe(search);
        expect(prevented).toBe(true);
      }
    });

    it("una devolución muestra su número de devolución junto al ENVL", async () => {
      api.getCases.mockImplementation(async (filters, opts) => (opts && opts.size === 200
        ? { rows: [], total: 0, page: 0, size: 200 }
        : { rows: [row({ id: 9, shipmentNumber: "ENVL-01609", status: "EXCLUIDO", hasReceipts: false, received: 0, returnNumber: "88", customerName: "Ana Pérez" }), pendingRow], total: 2, page: 0, size: 50 }));
      await mount();
      await flush();
      expect(byText("tr", "ENVL-01609").textContent).toContain("Devolución No. 88");
      expect(byText("tr", "ENVL-01609").textContent).toContain("Ana Pérez");
      expect(byText("tr", "ENVL-01603").textContent).not.toContain("Devolución");
    });

    it("un monto que falla se queda en su fila con el motivo y el borrador no se pierde", async () => {
      api.recordCaseReceiptsBulk.mockResolvedValue({ saved: 0, failed: 1, rows: [{ caseId: 3, ok: false, message: "Ya tiene un pago registrado." }] });
      await mount();
      await flush();
      await typeInto(document.querySelector('[aria-label="Monto recibido ENVL-01603"]'), "105");
      await click(byText("button", "Guardar montos (1)"));
      expect(byText("tr", "ENVL-01603").textContent).toContain("Ya tiene un pago registrado.");
      expect(byText("button", "Guardar montos (1)")).toBeDefined();
    });

    it("liquidar pide confirmación, cierra solo lo marcado con una clave de idempotencia y descarga el Excel", async () => {
      api.settleCases.mockResolvedValue({ close: { alreadyClosed: false, batch: { id: 9, code: "LC-1" }, closedCases: 1 }, acceptedWithWarnings: 0, skipped: [] });
      api.downloadBatch.mockResolvedValue({ filename: "c.xlsx" });
      await mount();
      await flush();
      expect(byText("button", "Liquidar 2 · Q745.00 y descargar Excel")).toBeDefined();
      await click(document.querySelector('[aria-label="Liquidar ENVL-01605"]'));   // se desmarca la que lleva avisos
      await click(byText("button", "Liquidar 1 · Q480.00 y descargar Excel"));
      expect(api.settleCases).not.toHaveBeenCalled();
      await click(byText("button", "Sí, liquidar y descargar"));
      await flush();
      expect(api.settleCases).toHaveBeenCalledWith([4], "liquidar-req-1");
      expect(api.downloadBatch).toHaveBeenCalledWith(9);
      expect(container.textContent).toContain("Liquidación LC-1 lista: 1 ventas");
    });

    it("las ventas con avisos entran solas a la liquidación y se avisa cuántas son", async () => {
      await mount();
      await flush();
      await click(byText("button", "Liquidar 2 · Q745.00 y descargar Excel"));
      expect(container.textContent).toContain("1 llevan avisos que se aceptan");
    });

    it("con montos sin guardar no se puede liquidar", async () => {
      await mount();
      await flush();
      await typeInto(document.querySelector('[aria-label="Monto recibido ENVL-01603"]'), "105");
      expect(byText("button", "Liquidar 2 · Q745.00 y descargar Excel").disabled).toBe(true);
      expect(container.textContent).toContain("Guarde los montos escritos antes de liquidar");
    });

    it("sin permisos no se puede escribir, marcar ni liquidar", async () => {
      mockGranted = false;
      await mount();
      await flush();
      expect(api.generateCases).not.toHaveBeenCalled();
      expect(document.querySelector('[aria-label="Monto recibido ENVL-01603"]').disabled).toBe(true);
      expect(document.querySelector('[aria-label="Liquidar ENVL-01604"]').disabled).toBe(true);
      expect(byText("button", "Liquidar 2 · Q745.00 y descargar Excel").disabled).toBe(true);
    });

    it("el resultado de cada fila se dice en palabras, sin tolerancias", () => {
      expect(rowResult(row({ status: "CONCILIADO_AUTO", difference: 0 })).text).toBe("✓ Cuadra");
      expect(rowResult(row({ difference: -0.01 })).text).toBe("! Faltan Q0.01");
      expect(rowResult(row({ difference: 2 })).text).toBe("! Sobran Q2.00");
      expect(rowResult(row({ hasReceipts: false })).text).toBe("Falta registrar el pago");
      expect(rowResult(row({ status: "PENDIENTE_REVISION", difference: 0 })).text).toContain("con avisos");
      expect(rowResult(row({ batchCode: "LC-1", status: "CONCILIADO_AUTO" })).text).toContain("Liquidada");
    });
  });
});
