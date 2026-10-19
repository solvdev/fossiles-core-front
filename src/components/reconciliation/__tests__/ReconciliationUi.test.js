import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ReconciliationPage from "views/reconciliation/ReconciliationPage";
import * as api from "services/reconciliationService";

jest.mock("services/reconciliationService", () => ({
  getDashboard: jest.fn(), getCases: jest.fn(), getCase: jest.fn(), getSellers: jest.fn(), getBatches: jest.fn(), getExports: jest.fn(),
  getUnappliedReceipts: jest.fn(), getCommissions: jest.fn(), getMissingSellers: jest.fn(), closeBatch: jest.fn(), createBatch: jest.fn(),
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
  Object.values(api).forEach((fn) => fn.mockReset && fn.mockReset());
  api.getDashboard.mockResolvedValue(dashboard);
  api.getSellers.mockResolvedValue([{ id: 1, name: "Anthony Ixcajo", active: true }]);
  api.getBatches.mockResolvedValue([]);
  api.getExports.mockResolvedValue([]);
  api.getUnappliedReceipts.mockResolvedValue([]);
  api.getCases.mockResolvedValue({ rows: [row(), row({ id: 2, shipmentNumber: "ENVL-01602", status: "CONCILIADO_AUTO", difference: 0, received: 480, expected: 480, problemType: null })], total: 2, page: 0, size: 50 });
  api.getCase.mockResolvedValue(detail);
  api.getMissingSellers.mockResolvedValue([]);
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
});
