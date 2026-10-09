import React from "react";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomerAccountStatement from "views/customers/CustomerAccountStatement";
import CustomerAccountsList from "views/customers/CustomerAccountsList";
import CustomersForm from "views/customers/CustomersForm";
import CustomersList from "views/customers/CustomersList";
import OpvShipmentsPage from "views/sales/OpvShipmentsPage";
import { showError } from "utils/notificationHelper";
import { formatAccountMoney } from "services/customerAccountService";
import {
  createCustomerAccountEntry,
  getCustomerAccountStatement,
  getCustomerAccountSummary,
  getLfSalesDocuments,
  getOrderChargeQuote,
  getReceivableDocuments,
  searchReceivableDocuments,
  voidCustomerAccountEntry,
} from "services/customerAccountService";
import { createCustomer, getCustomerById, getCustomers, updateCustomer } from "services/customerService";
import { getOpvShipments } from "services/salesDashboardService";

const actualAccountService = jest.requireActual("services/customerAccountService");

jest.mock("services/customerAccountService", () => {
  const actual = jest.requireActual("services/customerAccountService");
  return {
    ...actual,
    getCustomerAccountStatement: jest.fn(),
    getLfSalesDocuments: jest.fn(),
    getOrderChargeQuote: jest.fn(),
    getReceivableDocuments: jest.fn(),
    getCustomerAccountSummary: jest.fn(),
    searchReceivableDocuments: jest.fn(),
    getCustomerAccountPortfolioReport: jest.fn(),
    createCustomerAccountEntry: jest.fn(),
    createCustomerAccountDocumentSettlement: jest.fn(),
    voidCustomerAccountEntry: jest.fn(),
  };
});

jest.mock("services/customerService", () => {
  const actual = jest.requireActual("services/customerService");
  return {
    ...actual,
    getCustomerById: jest.fn(),
    createCustomer: jest.fn(),
    updateCustomer: jest.fn(),
    getCustomers: jest.fn(),
    getCustomersByNit: jest.fn(),
    deleteCustomer: jest.fn(),
  };
});

jest.mock("services/kioskPosService", () => ({
  lookupTaxpayerByNit: jest.fn(),
}));

jest.mock("services/salesDashboardService", () => ({
  getOpvShipments: jest.fn(),
}));

jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));

jest.mock("utils/dateTimeHelper", () => ({
  ...jest.requireActual("utils/dateTimeHelper"),
  getTodayYmdGuatemala: () => "2026-10-09",
}));

jest.mock("utils/customerPaymentReceiptPrintHtml", () => ({
  buildCustomerPaymentReceiptPrintHtml: jest.fn(() => "<p>recibo</p>"),
  buildCustomerSettlementPrintHtml: jest.fn(() => ""),
  openAccountPrintWindow: jest.fn(),
}));

jest.mock("utils/customerAccountReportPrintHtml", () => {
  const actual = jest.requireActual("utils/customerAccountReportPrintHtml");
  return {
    ...actual,
    buildSingleCustomerReportPrintHtml: () => "",
    openCustomerAccountReportPrintWindow: () => false,
    openBlankPrintWindow: () => null,
    writeHtmlToPrintWindow: () => {},
  };
});

const CUSTOMER_ID = 223;
const MOVED_TOTAL = 383.45;
const BALANCE_CAP = 60;
const QUOTE_AMOUNT = 1783;
const SERVER_VOID_400 = "El monto movido supera el saldo del cargo destino.";
const SERVER_ENTRY_400 = "El abono supera el saldo abierto del cargo.";

const APPLIED_MOVEMENTS = [
  ["pago", "4", "PAYMENT", true],
  ["nota de crédito", "2", "CREDIT_NOTE", false],
  ["devolución", "RETURN", "RETURN", false],
];

const charge = (overrides = {}) => ({
  id: 1,
  entryType: "CHARGE",
  status: "ACTIVE",
  entryDate: "2026-10-01",
  debit: 1783,
  credit: 0,
  invoiceNumber: "ENVP-ORIGEN",
  documentNumber: "OP-10",
  productionOrderCode: "OP-10",
  orderKind: "OPV",
  productionOrderId: 10,
  movementConceptCode: "1",
  ...overrides,
});

const statementOf = (lines, extra = {}) => ({
  customerName: "Cliente TEST",
  legacyCode: "CA223",
  openingBalance: 0,
  closingBalance: 100,
  closingBalanceDue: 100,
  closingCreditBalance: 0,
  closingBalanceDueOpv: 100,
  closingBalanceDueOpc: 0,
  totalCreditNotes: 0,
  lines,
  ...extra,
});

const creditChild = (overrides) => ({
  id: 2,
  entryType: "PAYMENT",
  status: "ACTIVE",
  entryDate: "2026-10-02",
  debit: 0,
  credit: 40,
  appliedToEntryId: 1,
  productionOrderId: 10,
  orderKind: "OPV",
  ...overrides,
});

const receivable = (overrides = {}) => ({
  chargeEntryId: 5,
  customerId: CUSTOMER_ID,
  productionOrderId: 11,
  orderKind: "OPC",
  orderCode: "OPC-11",
  invoiceNumber: "ENVP-DESTINO",
  balanceDue: 2046,
  chargeStatus: "CHARGED",
  ...overrides,
});

const roundMoney = (value) => Math.round(value * 100) / 100;

function parseDisplayedMoney(text) {
  const cleaned = String(text).replace(/\u00a0/g, " ").replace(/Q/gi, "").trim();
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const normalized =
    lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`No se pudo leer el monto "${text}"`);
  }
  return value;
}

function readSummary(label) {
  const caption = screen.getAllByText(label).find((node) => node.tagName === "SMALL");
  if (!caption) throw new Error(`Sin resumen "${label}"`);
  const valueNode = caption.nextElementSibling;
  if (!valueNode) throw new Error(`Sin monto junto a ${label}`);
  return parseDisplayedMoney(valueNode.textContent);
}

function partialReleaseRow() {
  const nested = document.querySelector("table.bg-light");
  if (!nested) throw new Error("Los parciales no están abiertos");
  return within(nested).getByRole("row", { name: /Parcial planificado/ });
}

function controlByLabel(labelText, root = document.body) {
  const labels = within(root).getAllByText(labelText);
  const label = labels.find((node) => node.closest(".form-group")?.querySelector("select, input, textarea"));
  if (!label) throw new Error(`Sin control para "${labelText}"`);
  return label.closest(".form-group").querySelector("select, input, textarea");
}

function dialogByHeading(name) {
  const heading = screen.getByRole("heading", { name });
  const dialog = heading.closest('[role="dialog"]');
  if (!dialog) throw new Error(`No hay diálogo para "${name}"`);
  return dialog;
}

function entryDialog() {
  return dialogByHeading("Altas de cuentas por cobrar");
}

function voidDialog() {
  return dialogByHeading("Anular movimiento");
}

function replaceInputValue(input, value) {
  userEvent.clear(input);
  if (value !== "") userEvent.type(input, String(value));
}

function optionValues(select) {
  return [...select.options].map((option) => option.value).filter((value) => value !== "");
}

function optionLabels(select) {
  return [...select.options].map((option) => option.textContent);
}

function expectNoRetiredChargeStatuses() {
  expect(document.body.textContent).not.toMatch(/\bCOVERED\b/);
  expect(document.body.textContent).not.toMatch(/\bOPEN\b/);
}

function cellByHeader(row, table, header) {
  const headers = within(table).getAllByRole("columnheader");
  const index = headers.findIndex((node) => node.textContent.trim() === header);
  if (index < 0) throw new Error(`Sin columna "${header}"`);
  return within(row).getAllByRole("cell")[index];
}

async function doubleClick(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function useRealVoid(fetchImpl) {
  global.fetch = jest.fn(fetchImpl);
  voidCustomerAccountEntry.mockImplementation((entryId, reason, options) =>
    actualAccountService.voidCustomerAccountEntry(entryId, reason, options)
  );
}

function jsonResponse({ ok = true, status = 200, body = { id: 1 } } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

async function renderStatement(statement, documents = []) {
  getCustomerAccountStatement.mockResolvedValue(statement);
  getLfSalesDocuments.mockResolvedValue(documents);
  render(
    <MemoryRouter initialEntries={[`/admin/customer-accounts/${CUSTOMER_ID}`]}>
      <Routes>
        <Route path="/admin/customer-accounts/:customerId" element={<CustomerAccountStatement />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByRole("heading", { name: statement.customerName });
}

async function openVoidFor(invoiceNumber) {
  const row = screen.getByRole("row", { name: new RegExp(invoiceNumber) });
  userEvent.click(within(row).getByRole("button", { name: "Anular" }));
  await screen.findByRole("heading", { name: "Anular movimiento" });
  return voidDialog();
}

function chargeWithCredits(children = []) {
  return statementOf([
    charge({
      invoiceNumber: "ENVP-ORIGEN",
      debit: 1783,
      chargeBalanceDue: 1449.55,
    }),
    ...children,
  ]);
}

const mixedReceivables = [
  receivable({
    chargeEntryId: 1,
    productionOrderId: 10,
    orderKind: "OPV",
    orderCode: "OP-10",
    invoiceNumber: "ENVP-ORIGEN",
    balanceDue: 1449.55,
    chargeStatus: "PARTIAL",
  }),
  receivable({
    chargeEntryId: 5,
    productionOrderId: 11,
    orderKind: "OPC",
    orderCode: "OPC-11",
    invoiceNumber: "ENVP-DESTINO",
    balanceDue: 2046,
    chargeStatus: "CHARGED",
  }),
  receivable({
    chargeEntryId: 6,
    productionOrderId: 12,
    orderKind: "OPV",
    orderCode: "OP-12",
    invoiceNumber: "ENVP-OTRA",
    balanceDue: 80,
    chargeStatus: "PARTIAL",
  }),
  receivable({
    chargeEntryId: 7,
    productionOrderId: 13,
    orderKind: "OPV",
    orderCode: "OP-13",
    invoiceNumber: "ENVP-ANULADO",
    balanceDue: 90,
    chargeStatus: "CHARGED",
    status: "VOID",
  }),
  receivable({
    chargeEntryId: 8,
    productionOrderId: 14,
    orderKind: "OPC",
    orderCode: "OPC-14",
    invoiceNumber: "ENVP-CERO",
    balanceDue: 0,
    chargeStatus: "PAID",
  }),
  receivable({
    chargeEntryId: 9,
    customerId: 999,
    productionOrderId: 15,
    orderKind: "OPV",
    orderCode: "OP-15",
    invoiceNumber: "ENVP-AJENO",
    balanceDue: 500,
    chargeStatus: "CHARGED",
  }),
];

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.reject(new Error("Las pruebas no deben llamar HTTP")));
  getCustomerAccountStatement.mockResolvedValue(statementOf([]));
  getLfSalesDocuments.mockResolvedValue([]);
  getReceivableDocuments.mockResolvedValue([]);
  getCustomerAccountSummary.mockResolvedValue([]);
  searchReceivableDocuments.mockResolvedValue([]);
  getOrderChargeQuote.mockResolvedValue(null);
  createCustomerAccountEntry.mockResolvedValue({ id: 1 });
  voidCustomerAccountEntry.mockResolvedValue({ id: 1 });
  createCustomer.mockResolvedValue({ id: 1 });
  updateCustomer.mockResolvedValue({ id: 8 });
  getCustomerById.mockResolvedValue(null);
  getCustomers.mockResolvedValue([]);
  getOpvShipments.mockResolvedValue([]);
});

afterEach(() => {
  delete global.fetch;
});

describe("anular un cargo con pagos, notas o devoluciones", () => {
  const credits = () => [
    creditChild({ id: 2, entryType: "PAYMENT", credit: 40 }),
    creditChild({ id: 3, entryType: "CREDIT_NOTE", credit: 333.45 }),
    creditChild({ id: 4, entryType: "RETURN", credit: 10 }),
    creditChild({ id: 99, entryType: "PAYMENT", status: "VOID", credit: 999 }),
  ];

  const voidedChargeOnStatement = charge({
    id: 80,
    status: "VOID",
    invoiceNumber: "ENVP-YA-ANULADO",
    debit: 5000,
    productionOrderId: 80,
  });

  test("pide destino, muestra el total a mover y manda solo el cargo y el motivo", async () => {
    const calls = [];
    useRealVoid(async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse();
    });
    getReceivableDocuments.mockResolvedValue([
      receivable({
        chargeEntryId: 1,
        productionOrderId: 10,
        orderKind: "OPV",
        orderCode: "OP-10",
        invoiceNumber: "ENVP-ORIGEN",
        balanceDue: 1449.55,
        chargeStatus: "PARTIAL",
      }),
      receivable({
        chargeEntryId: 5,
        productionOrderId: 11,
        orderKind: "OPC",
        orderCode: "OPC-11",
        invoiceNumber: "ENVP-DESTINO",
        balanceDue: 2046,
        chargeStatus: "CHARGED",
      }),
      receivable({
        chargeEntryId: 6,
        productionOrderId: 12,
        orderKind: "OPV",
        orderCode: "OP-12",
        invoiceNumber: "ENVP-OTRA",
        balanceDue: 80,
        chargeStatus: "PARTIAL",
      }),
    ]);
    await renderStatement(
      statementOf([charge({ invoiceNumber: "ENVP-ORIGEN", debit: 1783 }), ...credits(), voidedChargeOnStatement])
    );

    const dialog = await openVoidFor("ENVP-ORIGEN");
    expect(dialog).toHaveTextContent("Mover pagos/abonos a");
    expect(dialog).toHaveTextContent("Total a mover");
    expect(dialog).toHaveTextContent(formatAccountMoney(MOVED_TOTAL));
    expect(getReceivableDocuments).toHaveBeenCalledWith(String(CUSTOMER_ID));

    const select = await within(dialog).findByRole("combobox");
    const labels = optionLabels(select).join(" ");
    expect(optionValues(select).sort()).toEqual(["5", "6"]);
    expect(labels).toContain("ENVP-DESTINO");
    expect(labels).toContain("ENVP-OTRA");
    expect(labels).not.toContain("ENVP-ORIGEN");
    expect(labels).not.toContain("ENVP-YA-ANULADO");

    const confirm = within(dialog).getByRole("button", { name: "Confirmar anulación" });
    expect(confirm).toBeDisabled();
    userEvent.click(confirm);
    expect(calls).toHaveLength(0);

    userEvent.selectOptions(select, "6");
    expect(confirm).toBeEnabled();
    replaceInputValue(controlByLabel("Motivo", dialog), "error de captura");
    userEvent.click(confirm);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toMatch(/\/customer-accounts\/entries\/1\/void$/);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].init.headers["X-Request-Id"]).toEqual(expect.any(String));
    expect(JSON.parse(calls[0].init.body)).toEqual({
      voidReason: "error de captura",
      reassignToChargeId: 6,
    });
  });

  test("BUG: el selector incluye un cargo anulado, uno sin saldo y uno de otro cliente", async () => {
    getReceivableDocuments.mockResolvedValue(mixedReceivables);
    await renderStatement(
      statementOf([charge({ invoiceNumber: "ENVP-ORIGEN", debit: 1783 }), ...credits(), voidedChargeOnStatement])
    );

    const dialog = await openVoidFor("ENVP-ORIGEN");
    const select = await within(dialog).findByRole("combobox");
    const labels = optionLabels(select).join(" ");
    expect(optionValues(select).sort()).toEqual(["5", "6"]);
    expect(labels).not.toContain("ENVP-ORIGEN");
    expect(labels).not.toContain("ENVP-ANULADO");
    expect(labels).not.toContain("ENVP-CERO");
    expect(labels).not.toContain("ENVP-AJENO");
  });

  test.each(APPLIED_MOVEMENTS)(
    "un cargo que solo tiene %s no se confirma sin cargo destino",
    async (_label, _concept, entryType) => {
      getReceivableDocuments.mockResolvedValue([
        receivable({ chargeEntryId: 5, invoiceNumber: "ENVP-DESTINO" }),
      ]);
      await renderStatement(
        chargeWithCredits([
          creditChild({
            id: 2,
            entryType,
            credit: entryType === "PAYMENT" ? 40 : 333.45,
          }),
        ])
      );

      const dialog = await openVoidFor("ENVP-ORIGEN");
      expect(dialog).toHaveTextContent("Mover pagos/abonos a");
      expect(within(dialog).getByRole("button", { name: "Confirmar anulación" })).toBeDisabled();
      expect(voidCustomerAccountEntry).not.toHaveBeenCalled();
    }
  );
});

describe("total movido mayor que el saldo del destino", () => {
  test("avisa, deja enviar y el 400 del servidor no quita el cargo", async () => {
    const calls = [];
    useRealVoid(async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: false, status: 400, body: { message: SERVER_VOID_400 } });
    });
    getReceivableDocuments.mockResolvedValue([
      receivable({
        chargeEntryId: 5,
        invoiceNumber: "ENVP-CORTO",
        balanceDue: 100,
        productionOrderId: 11,
      }),
    ]);
    await renderStatement(
      chargeWithCredits([
        creditChild({ id: 2, entryType: "PAYMENT", credit: 40 }),
        creditChild({ id: 3, entryType: "CREDIT_NOTE", credit: 333.45 }),
        creditChild({ id: 4, entryType: "RETURN", credit: 10 }),
      ])
    );
    const statementCalls = getCustomerAccountStatement.mock.calls.length;

    const dialog = await openVoidFor("ENVP-ORIGEN");
    const select = await within(dialog).findByRole("combobox");
    userEvent.selectOptions(select, "5");

    expect(dialog).toHaveTextContent(formatAccountMoney(MOVED_TOTAL));
    expect(dialog).toHaveTextContent(/supera el saldo del cargo destino/);
    expect(dialog).toHaveTextContent(formatAccountMoney(100));
    const confirm = within(dialog).getByRole("button", { name: "Confirmar anulación" });
    expect(confirm).toBeEnabled();

    replaceInputValue(controlByLabel("Motivo", dialog), "saldo corto");
    userEvent.click(confirm);

    await waitFor(() => expect(showError).toHaveBeenCalledWith(SERVER_VOID_400));
    expect(showError).not.toHaveBeenCalledWith("No se pudo anular");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].init.body)).toEqual({
      voidReason: "saldo corto",
      reassignToChargeId: 5,
    });
    expect(screen.getByText("ENVP-ORIGEN")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anular movimiento" })).toBeInTheDocument();
    expect(screen.queryByText("Anulado")).not.toBeInTheDocument();
    expect(getCustomerAccountStatement.mock.calls.length).toBe(statementCalls);
  });
});

describe("ajustes de envío y cargo destino de otra orden", () => {
  const withAdjustment = () =>
    chargeWithCredits([
      creditChild({ id: 2, entryType: "PAYMENT", credit: 40 }),
      creditChild({
        id: 4,
        entryType: "CHARGE_ADJUSTMENT",
        debit: 75,
        credit: 0,
        productShipmentId: 2,
      }),
    ]);

  test("bloquea el destino de otra orden y pide anular los ajustes primero", async () => {
    getReceivableDocuments.mockResolvedValue([
      receivable({
        chargeEntryId: 5,
        productionOrderId: 10,
        orderKind: "OPV",
        orderCode: "OP-10",
        invoiceNumber: "ENVP-MISMA",
        balanceDue: 500,
      }),
      receivable({
        chargeEntryId: 6,
        productionOrderId: 99,
        orderKind: "OPC",
        orderCode: "OPC-99",
        invoiceNumber: "ENVP-OTRA-ORDEN",
        balanceDue: 500,
      }),
    ]);
    await renderStatement(withAdjustment());
    const dialog = await openVoidFor("ENVP-ORIGEN");
    const select = await within(dialog).findByRole("combobox");
    const confirm = within(dialog).getByRole("button", { name: "Confirmar anulación" });

    userEvent.selectOptions(select, "6");
    expect(dialog).toHaveTextContent("Anúlelos primero");
    expect(confirm).toBeDisabled();
    userEvent.click(confirm);
    expect(voidCustomerAccountEntry).not.toHaveBeenCalled();

    userEvent.selectOptions(select, "5");
    expect(dialog).not.toHaveTextContent("Anúlelos primero");
    expect(confirm).toBeEnabled();
    replaceInputValue(controlByLabel("Motivo", dialog), "misma orden");
    userEvent.click(confirm);

    await waitFor(() => expect(voidCustomerAccountEntry).toHaveBeenCalledTimes(1));
    expect(voidCustomerAccountEntry).toHaveBeenCalledWith(1, "misma orden", {
      requestId: expect.any(String),
      reassignToChargeId: "5",
    });
  });
});

describe("anular un cargo sin abonos", () => {
  test("no pide destino, el doble clic manda una sola petición y conserva X-Request-Id", async () => {
    let release;
    const calls = [];
    useRealVoid(
      () =>
        new Promise((resolve) => {
          release = () => resolve(jsonResponse({ body: { id: 7 } }));
        })
    );
    const fetchMock = global.fetch;
    fetchMock.mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Promise((resolve) => {
        release = () => resolve(jsonResponse({ body: { id: 7 } }));
      });
    });

    await renderStatement(
      statementOf([
        charge({
          id: 7,
          invoiceNumber: "FAC-LIBRE",
          debit: 100,
          chargeBalanceDue: 100,
        }),
      ])
    );
    const dialog = await openVoidFor("FAC-LIBRE");
    expect(dialog).not.toHaveTextContent("Mover pagos/abonos a");
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(getReceivableDocuments).not.toHaveBeenCalled();

    replaceInputValue(controlByLabel("Motivo", dialog), "cargo de más");
    const confirm = within(dialog).getByRole("button", { name: "Confirmar anulación" });
    await doubleClick(confirm);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/customer-accounts\/entries\/7\/void$/);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].init.headers["X-Request-Id"]).toEqual(expect.stringMatching(/\S/));
    expect(JSON.parse(calls[0].init.body)).toEqual({ voidReason: "cargo de más" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent("Anulando...");

    await act(async () => {
      release();
    });
  });
});

describe("abono movido desde otro cargo", () => {
  test("muestra el cargo de origen y su referencia aunque esté anulado; null o ausente no muestra nada", async () => {
    await renderStatement(
      statementOf([
        charge({
          id: 8,
          status: "VOID",
          invoiceNumber: "FAC-ORIG",
          documentNumber: "OP-ORIG",
          debit: 500,
          productionOrderId: 80,
        }),
        charge({
          id: 5,
          invoiceNumber: "ENVP-DESTINO",
          documentNumber: "OP-11",
          productionOrderId: 11,
          debit: 2046,
          chargeBalanceDue: 1996,
        }),
        creditChild({
          id: 3,
          appliedToEntryId: 5,
          credit: 40,
          reassignedFromEntryId: 8,
          entryDate: "2026-10-03",
        }),
        creditChild({
          id: 6,
          appliedToEntryId: 5,
          credit: 10,
          reassignedFromEntryId: null,
          entryDate: "2026-10-04",
        }),
        creditChild({
          id: 7,
          entryType: "CREDIT_NOTE",
          appliedToEntryId: 5,
          credit: 333.45,
          entryDate: "2026-10-05",
        }),
        creditChild({
          id: 9,
          entryType: "RETURN",
          appliedToEntryId: 5,
          credit: 10,
          reassignedFromEntryId: 99,
          entryDate: "2026-10-06",
        }),
        creditChild({
          id: 4,
          entryType: "CHARGE_ADJUSTMENT",
          appliedToEntryId: 5,
          debit: 75,
          credit: 0,
          productShipmentId: 2,
          invoiceNumber: "ENV-2",
          reassignedFromEntryId: 8,
          entryDate: "2026-10-02",
        }),
      ])
    );

    expect(screen.queryByText("Anulado")).not.toBeInTheDocument();
    expect(screen.getByText("Movido desde cargo #8 (FAC-ORIG)")).toBeInTheDocument();
    expect(screen.queryByText("Movido desde cargo #99")).not.toBeInTheDocument();

    userEvent.click(within(screen.getByRole("row", { name: /ENVP-DESTINO/ })).getByRole("button", { name: "Ver detalle" }));
    const detail = dialogByHeading(/Detalle del cargo — ENVP-DESTINO/);
    expect(await within(detail).findByText("Movido desde cargo #99")).toBeInTheDocument();
    expect(within(detail).getAllByText("Movido desde cargo #8 (FAC-ORIG)")).toHaveLength(2);
    expect(within(detail).getAllByText(/Movido desde cargo #/)).toHaveLength(3);
    expect(within(detail).getByText("Movido desde cargo #99").textContent).toBe("Movido desde cargo #99");
  });
});

describe("Generar cargo y Crear cargo", () => {
  const catalogRows = [
    {
      productionOrderId: 1,
      productionOrderCode: "OP-CON-CARGO",
      customerId: 1,
      customerName: "Cliente TEST",
      hasCharge: true,
      chargeStatus: "CHARGED",
      documentLevel: "ORDER",
      estimatedTotal: 1783,
      itemsSubtotal: 1783,
    },
    {
      productionOrderId: 2,
      productionOrderCode: "OP-SIN-CARGO",
      customerId: 1,
      customerName: "Cliente TEST",
      hasCharge: false,
      chargeStatus: "NONE",
      documentLevel: "ORDER",
      estimatedTotal: null,
      itemsSubtotal: null,
      packingSubtotal: null,
      shippingCost: null,
    },
    {
      productionOrderId: 3,
      productionOrderCode: "OP-PARCIAL",
      partialReleaseLabel: "Parcial planificado",
      customerId: 1,
      customerName: "Cliente TEST",
      hasCharge: false,
      chargeStatus: "NONE",
      documentLevel: "SHIPMENT",
      partialReleaseId: 9,
      estimatedTotal: null,
      itemsSubtotal: null,
      packingSubtotal: null,
      shippingCost: null,
    },
    {
      productionOrderId: 4,
      productionOrderCode: "OP-ABONO",
      customerId: 1,
      customerName: "Cliente TEST",
      hasCharge: true,
      chargeStatus: "PARTIAL",
      documentLevel: "ORDER",
      estimatedTotal: 333.45,
    },
    {
      productionOrderId: 5,
      productionOrderCode: "OP-PAGADA",
      customerId: 1,
      customerName: "Cliente TEST",
      hasCharge: true,
      chargeStatus: "PAID",
      documentLevel: "ORDER",
      estimatedTotal: 1449.55,
    },
  ];

  test("en el catálogo OPV el botón sale solo si la orden no tiene cargo, nunca en el parcial", async () => {
    getOpvShipments.mockResolvedValue(catalogRows);
    render(
      <MemoryRouter>
        <OpvShipmentsPage />
      </MemoryRouter>
    );

    await screen.findByText("OP-SIN-CARGO");
    expect(screen.getAllByRole("button", { name: "Generar cargo" })).toHaveLength(1);
    const free = screen.getByRole("row", { name: /OP-SIN-CARGO/ });
    expect(within(free).getByRole("button", { name: "Generar cargo" })).toBeInTheDocument();
    expect(within(free).getByText("Sin cargo")).toBeInTheDocument();
    expect(within(free).getByText("Sin envío")).toBeInTheDocument();

    const partial = screen.getByRole("row", { name: /Parcial planificado/ });
    expect(within(partial).queryByRole("button", { name: "Generar cargo" })).not.toBeInTheDocument();
    expect(within(partial).getByText("Sin envío")).toBeInTheDocument();
    expect(within(partial).queryByText(/Q\s*0[.,]00/)).not.toBeInTheDocument();

    expect(within(screen.getByRole("row", { name: /OP-CON-CARGO/ })).getByText("Cargado")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-CON-CARGO/ })).queryByRole("button", { name: "Generar cargo" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-ABONO/ })).getByText("Parcial")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-PAGADA/ })).getByText("Pagado")).toBeInTheDocument();
    expectNoRetiredChargeStatuses();
  });

  test("en cartera, Generar cargo sigue la misma regla y los estados no incluyen COVERED ni OPEN", async () => {
    searchReceivableDocuments.mockResolvedValue([
      {
        customerId: 1,
        customerName: "Cliente TEST",
        productionOrderId: 2,
        orderCode: "OP-SIN-CARGO",
        orderKind: "OPV",
        hasCharge: false,
        chargeStatus: "NONE",
        documentLevel: "ORDER",
        estimatedTotal: null,
      },
      {
        customerId: 1,
        customerName: "Cliente TEST",
        productionOrderId: 1,
        orderCode: "OP-CON-CARGO",
        orderKind: "OPV",
        hasCharge: true,
        chargeStatus: "CHARGED",
        documentLevel: "ORDER",
        estimatedTotal: 1783,
        chargedAmount: 1783,
        balanceDue: 1783,
      },
      {
        customerId: 1,
        customerName: "Cliente TEST",
        productionOrderId: 3,
        orderCode: "OP-PARCIAL",
        partialReleaseLabel: "Parcial planificado",
        partialReleaseId: 9,
        orderKind: "OPV",
        hasCharge: false,
        chargeStatus: "NONE",
        documentLevel: "SHIPMENT",
        estimatedTotal: null,
      },
      {
        customerId: 1,
        customerName: "Cliente TEST",
        productionOrderId: 4,
        orderCode: "OP-ABONO",
        orderKind: "OPV",
        hasCharge: true,
        chargeStatus: "PARTIAL",
        documentLevel: "ORDER",
        estimatedTotal: 333.45,
        chargedAmount: 333.45,
        balanceDue: 100,
      },
      {
        customerId: 1,
        customerName: "Cliente TEST",
        productionOrderId: 5,
        orderCode: "OP-PAGADA",
        orderKind: "OPV",
        hasCharge: true,
        chargeStatus: "PAID",
        documentLevel: "ORDER",
        estimatedTotal: 1449.55,
        chargedAmount: 1449.55,
        balanceDue: 0,
      },
    ]);

    render(
      <MemoryRouter>
        <CustomerAccountsList />
      </MemoryRouter>
    );

    await screen.findByText("OP-SIN-CARGO");
    expect(screen.getAllByRole("button", { name: "Generar cargo" })).toHaveLength(1);
    expect(within(screen.getByRole("row", { name: /OP-SIN-CARGO/ })).getByText("Sin cargo")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-SIN-CARGO/ })).getByText("Sin envío")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Parcial planificado/ })).queryByRole("button", { name: "Generar cargo" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-CON-CARGO/ })).getByText("Cargado")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-ABONO/ })).getByText("Parcial")).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /OP-PAGADA/ })).not.toBeInTheDocument();

    userEvent.selectOptions(controlByLabel("Estado de cobro"), "PAID");
    expect(await screen.findByRole("row", { name: /OP-PAGADA/ })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-PAGADA/ })).getByText("Pagado")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-PAGADA/ })).queryByRole("button", { name: "Generar cargo" })).not.toBeInTheDocument();
    expectNoRetiredChargeStatuses();
  });

  test("en el estado de cuenta, Crear cargo no sale por parcial ni si la orden ya tiene cargo", async () => {
    await renderStatement(statementOf([]), [
      {
        productionOrderId: 2,
        orderCode: "OP-SIN-CARGO",
        orderKind: "OPV",
        customerId: CUSTOMER_ID,
        hasCharge: false,
        chargeStatus: "NONE",
        documentLevel: "ORDER",
        estimatedTotal: null,
        vendorShipmentNumber: "ENVP-SIN",
        partialReleases: [
          {
            partialReleaseId: 9,
            label: "Parcial planificado",
            chargeStatus: "NONE",
            estimatedTotal: null,
            chargedAmount: 0,
            balanceDue: 0,
            shipments: [],
          },
        ],
      },
      {
        productionOrderId: 1,
        orderCode: "OP-CON-CARGO",
        orderKind: "OPV",
        customerId: CUSTOMER_ID,
        hasCharge: true,
        chargeStatus: "CHARGED",
        estimatedTotal: 1783,
        partialReleases: [],
      },
      {
        productionOrderId: 4,
        orderCode: "OP-ABONO",
        orderKind: "OPC",
        customerId: CUSTOMER_ID,
        hasCharge: true,
        chargeStatus: "PARTIAL",
        estimatedTotal: 333.45,
        partialReleases: [],
      },
      {
        productionOrderId: 5,
        orderCode: "OP-PAGADA",
        orderKind: "OPV",
        customerId: CUSTOMER_ID,
        hasCharge: true,
        chargeStatus: "PAID",
        estimatedTotal: 1449.55,
        partialReleases: [],
      },
    ]);

    userEvent.click(screen.getByText("Documentos OPV / OPC"));
    expect(await screen.findByText("OP-SIN-CARGO")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Crear cargo" })).toHaveLength(1);
    expect(within(screen.getByRole("row", { name: /OP-SIN-CARGO/ })).getByText("Sin cargo")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-CON-CARGO/ })).getByText("Cargado")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-ABONO/ })).getByText("Parcial")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /OP-PAGADA/ })).getByText("Pagado")).toBeInTheDocument();

    userEvent.click(screen.getByRole("button", { name: /Parciales/ }));
    const partialRow = await waitFor(() => partialReleaseRow());
    expect(screen.getAllByRole("button", { name: "Crear cargo" })).toHaveLength(1);
    expect(within(partialRow).queryByRole("button", { name: "Crear cargo" })).not.toBeInTheDocument();
    expect(within(partialRow).getByText("Sin envío")).toBeInTheDocument();
    expect(within(partialRow).getByText("Sin cargo")).toBeInTheDocument();
    expectNoRetiredChargeStatuses();
  });
});

describe("cotización del cargo", () => {
  test("el desglose es de solo lectura, el monto enviado es el de la cotización y el parcial sin envío dice Sin envío", async () => {
    getOrderChargeQuote.mockResolvedValue({
      amount: QUOTE_AMOUNT,
      productsTotal: QUOTE_AMOUNT,
      shippingTotal: 75,
      orderTotal: 1858,
      shippingLines: [{ productShipmentId: 2, shipmentNumber: "ENV-2", shippingCost: 75 }],
    });
    await renderStatement(statementOf([]), [
      {
        productionOrderId: 2,
        orderCode: "OP-SIN-CARGO",
        orderKind: "OPV",
        customerId: CUSTOMER_ID,
        hasCharge: false,
        chargeStatus: "NONE",
        estimatedTotal: null,
        vendorShipmentNumber: "ENVP-SIN",
        partialReleases: [
          {
            partialReleaseId: 9,
            label: "Parcial planificado",
            chargeStatus: "NONE",
            estimatedTotal: null,
            shipments: [],
          },
        ],
      },
    ]);

    userEvent.click(screen.getByText("Documentos OPV / OPC"));
    userEvent.click(await screen.findByRole("button", { name: /Parciales/ }));
    const partialRow = await waitFor(() => partialReleaseRow());
    expect(within(partialRow).getByText("Sin envío")).toBeInTheDocument();

    userEvent.click(screen.getByRole("button", { name: "Crear cargo" }));
    const dialog = entryDialog();
    expect(await within(dialog).findByText("Productos")).toBeInTheDocument();
    const quote = within(dialog).getByText("Cotización del cargo").parentElement;
    expect(quote.querySelector("input, textarea, select")).toBeNull();
    expect(quote).toHaveTextContent(formatAccountMoney(QUOTE_AMOUNT));
    expect(quote).toHaveTextContent("Envío ENV-2");
    expect(quote).toHaveTextContent(formatAccountMoney(75));
    expect(quote).toHaveTextContent(formatAccountMoney(1858));

    const amount = controlByLabel("Monto (Q) *", dialog);
    expect(amount).toHaveAttribute("readonly");
    expect(amount).toHaveValue(QUOTE_AMOUNT);
    userEvent.type(amount, "9");
    expect(amount).toHaveValue(QUOTE_AMOUNT);

    userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1));
    const [customerId, payload] = createCustomerAccountEntry.mock.calls[0];
    expect(customerId).toBe(CUSTOMER_ID);
    expect(payload.entryType).toBe("CHARGE");
    expect(payload.amount).toBe(QUOTE_AMOUNT);
    expect(payload.amount).not.toBe(1858);
    expect(payload.partialReleaseId).toBeUndefined();
    expect(payload.productShipmentId).toBeUndefined();
  });

  test("una cotización sin envíos muestra Sin envío y no un monto de flete", async () => {
    getOrderChargeQuote.mockResolvedValue({
      amount: QUOTE_AMOUNT,
      productsTotal: QUOTE_AMOUNT,
      shippingTotal: 0,
      orderTotal: QUOTE_AMOUNT,
      shippingLines: [],
    });
    await renderStatement(statementOf([]), [
      {
        productionOrderId: 2,
        orderCode: "OP-SIN-CARGO",
        orderKind: "OPV",
        customerId: CUSTOMER_ID,
        hasCharge: false,
        chargeStatus: "NONE",
        estimatedTotal: null,
        partialReleases: [],
      },
    ]);

    userEvent.click(screen.getByText("Documentos OPV / OPC"));
    userEvent.click(await screen.findByRole("button", { name: "Crear cargo" }));
    const dialog = entryDialog();
    const quote = (await within(dialog).findByText("Cotización del cargo")).parentElement;
    expect(within(quote).getByText("Sin envío")).toBeInTheDocument();
    expect(quote.querySelector("input, textarea, select")).toBeNull();
    expect(controlByLabel("Monto (Q) *", dialog)).toHaveValue(QUOTE_AMOUNT);
  });
});

describe("Agregar envío", () => {
  const quote = {
    amount: QUOTE_AMOUNT,
    productsTotal: QUOTE_AMOUNT,
    shippingTotal: 115,
    orderTotal: 1898,
    shippingLines: [
      { productShipmentId: 1, shipmentNumber: "ENV-1", shippingCost: 40 },
      { productShipmentId: 2, shipmentNumber: "ENV-2", shippingCost: 75 },
    ],
  };

  const adjustment = (id, shipmentId, invoiceNumber) =>
    creditChild({
      id,
      entryType: "CHARGE_ADJUSTMENT",
      status: "ACTIVE",
      debit: shipmentId === 1 ? 40 : 75,
      credit: 0,
      productShipmentId: shipmentId,
      invoiceNumber,
      appliedToEntryId: 1,
      entryDate: "2026-10-02",
    });

  test("publica el ajuste con el envío, desaparece si ya hay uno activo y el ajuste queda bajo el cargo", async () => {
    const before = statementOf([charge({ invoiceNumber: "FAC-1", debit: QUOTE_AMOUNT }), adjustment(4, 1, "ENV-1")]);
    const after = statementOf([
      charge({ invoiceNumber: "FAC-1", debit: QUOTE_AMOUNT }),
      adjustment(4, 1, "ENV-1"),
      adjustment(20, 2, "ENV-2"),
    ]);
    const statements = [before, after];
    let reads = 0;
    getCustomerAccountStatement.mockImplementation(async () => statements[Math.min(reads++, statements.length - 1)]);
    getLfSalesDocuments.mockResolvedValue([]);
    getOrderChargeQuote.mockResolvedValue(quote);

    render(
      <MemoryRouter initialEntries={[`/admin/customer-accounts/${CUSTOMER_ID}`]}>
        <Routes>
          <Route path="/admin/customer-accounts/:customerId" element={<CustomerAccountStatement />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole("heading", { name: "Cliente TEST" });

    const chargeRow = screen.getByRole("row", { name: /FAC-1/ });
    expect(chargeRow.nextElementSibling).toHaveTextContent("Ajuste de envío");
    expect(chargeRow.nextElementSibling).toHaveTextContent("ENV-1");

    userEvent.click(within(chargeRow).getByRole("button", { name: "Ver detalle" }));
    const detail = dialogByHeading(/Detalle del cargo — FAC-1/);
    expect(await within(detail).findByText(/ENV-2/)).toBeInTheDocument();
    expect(within(detail).getAllByRole("button", { name: "Agregar envío" })).toHaveLength(1);
    expect(within(detail).queryByRole("button", { name: "Agregar envío" }).closest("div")).toHaveTextContent("ENV-2");

    userEvent.click(within(detail).getByRole("button", { name: "Agregar envío" }));

    await waitFor(() => expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1));
    const [customerId, payload, options] = createCustomerAccountEntry.mock.calls[0];
    expect(customerId).toBe(CUSTOMER_ID);
    expect(payload).toEqual({
      entryType: "CHARGE_ADJUSTMENT",
      entryDate: "2026-10-09",
      amount: 75,
      productShipmentId: 2,
      productionOrderId: 10,
      description: "Envío ENV-2",
    });
    expect(options.requestId).toEqual(expect.any(String));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Agregar envío" })).not.toBeInTheDocument());
    expect(screen.getByText("Sin envío pendiente de agregar.")).toBeInTheDocument();
    const updatedCharge = screen.getByRole("row", { name: /FAC-1/ });
    expect(updatedCharge.nextElementSibling).toHaveTextContent("Ajuste de envío");
    expect(updatedCharge.nextElementSibling.nextElementSibling).toHaveTextContent("Ajuste de envío");
    expect(updatedCharge.nextElementSibling.nextElementSibling).toHaveTextContent("ENV-2");
  });
});

describe("pago, nota de crédito y devolución contra el saldo del cargo", () => {
  test.each(APPLIED_MOVEMENTS)(
    "%s no pasa de chargeBalanceDue y el 400 del servidor se muestra tal cual",
    async (_label, conceptCode, entryType, needsReceipt) => {
      createCustomerAccountEntry.mockRejectedValue(new Error(SERVER_ENTRY_400));
      await renderStatement(
        statementOf([
          charge({
            id: 11,
            invoiceNumber: "ENVP-SALDO",
            debit: 100,
            chargeBalanceDue: BALANCE_CAP,
          }),
        ])
      );

      userEvent.click(screen.getByRole("button", { name: "Nuevo movimiento" }));
      const dialog = entryDialog();
      userEvent.selectOptions(controlByLabel("Concepto", dialog), conceptCode);
      const chargeSelect = await waitFor(() => {
        const select = controlByLabel("Cargo al que se aplica *", entryDialog());
        if (select.disabled) throw new Error("el listado de cargos sigue cargando");
        return select;
      });
      if (needsReceipt) {
        replaceInputValue(controlByLabel("No. recibo de caja *", entryDialog()), "RC-1");
      }
      userEvent.selectOptions(chargeSelect, "11");

      const amount = await waitFor(() => {
        const input = controlByLabel("Monto (Q) *", entryDialog());
        if (input.value !== BALANCE_CAP.toFixed(2)) throw new Error("el saldo todavía no está en el monto");
        return input;
      });
      expect(entryDialog()).toHaveTextContent(`Saldo pendiente del cargo: ${formatAccountMoney(BALANCE_CAP)}`);

      replaceInputValue(amount, "60.01");
      userEvent.click(within(entryDialog()).getByRole("button", { name: "Guardar" }));
      expect(
        await screen.findByText(
          `El monto no puede ser mayor al saldo pendiente (${formatAccountMoney(BALANCE_CAP)}).`
        )
      ).toBeInTheDocument();
      expect(createCustomerAccountEntry).not.toHaveBeenCalled();

      replaceInputValue(controlByLabel("Monto (Q) *", entryDialog()), BALANCE_CAP.toFixed(2));
      userEvent.click(within(entryDialog()).getByRole("button", { name: "Guardar" }));

      expect(await screen.findByText(SERVER_ENTRY_400)).toBeInTheDocument();
      expect(screen.queryByText(/no se pudo guardar/i)).not.toBeInTheDocument();
      await waitFor(() => expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1));
      const [, payload] = createCustomerAccountEntry.mock.calls[0];
      expect(payload.entryType).toBe(entryType);
      expect(payload.amount).toBe(BALANCE_CAP);
      expect(payload.appliedToEntryId).toBe(11);
    }
  );
});

describe("estado de cuenta y listado", () => {
  const opening = 0;
  const opcCharge = 1783;
  const opvCharge = 2046;
  const currentCharge = 100;
  const adjustment = 40;
  const payment = 1449.55;
  const creditNotes = 333.45;
  const discount = 12.5;
  const returns = 10;
  const voidedCharge = 5000;
  const closingBalance = roundMoney(
    opening + opcCharge + opvCharge + currentCharge + adjustment - payment - creditNotes - discount - returns
  );

  const agingStatement = () =>
    statementOf(
      [
        charge({
          id: 1,
          invoiceNumber: "ENVP-OPC",
          documentNumber: "OPC-1783",
          productionOrderCode: "OPC-1783",
          orderKind: "OPC",
          productionOrderId: 301,
          debit: opcCharge,
          dueDate: "2026-09-01",
          allocatedCredit: opcCharge,
          lineOpenBalance: 0,
          entryDate: "2026-08-01",
        }),
        creditChild({
          id: 2,
          appliedToEntryId: 1,
          credit: payment,
          paymentDiscountAmount: discount,
          entryDate: "2026-08-02",
        }),
        creditChild({
          id: 3,
          entryType: "CREDIT_NOTE",
          appliedToEntryId: 1,
          credit: creditNotes,
          entryDate: "2026-08-03",
        }),
        charge({
          id: 4,
          invoiceNumber: "ENVP-OPV",
          documentNumber: "OPV-2046",
          productionOrderCode: "OPV-2046",
          orderKind: "OPV",
          productionOrderId: 302,
          debit: opvCharge,
          dueDate: "2026-09-15",
          allocatedCredit: 0,
          lineOpenBalance: opvCharge,
          entryDate: "2026-08-04",
        }),
        creditChild({
          id: 5,
          entryType: "CHARGE_ADJUSTMENT",
          appliedToEntryId: 4,
          debit: adjustment,
          credit: 0,
          productShipmentId: 1,
          invoiceNumber: "ENV-1",
          dueDate: "2026-10-01",
          allocatedCredit: 0,
          lineOpenBalance: adjustment,
          entryDate: "2026-08-05",
        }),
        creditChild({
          id: 6,
          entryType: "RETURN",
          appliedToEntryId: 4,
          credit: returns,
          entryDate: "2026-08-06",
        }),
        charge({
          id: 7,
          invoiceNumber: "ENVP-CORRIENTE",
          documentNumber: "OP-303",
          productionOrderId: 303,
          debit: currentCharge,
          dueDate: null,
          allocatedCredit: 25,
          lineOpenBalance: currentCharge,
          entryDate: "2026-10-01",
        }),
        charge({
          id: 8,
          status: "VOID",
          invoiceNumber: "ENVP-ANULADO",
          debit: voidedCharge,
          productionOrderId: 399,
        }),
        creditChild({
          id: 10,
          entryType: "CREDIT_NOTE",
          status: "VOID",
          appliedToEntryId: null,
          credit: 9000,
        }),
      ],
      {
        customerName: "Xiomara",
        legacyCode: "CA223",
        openingBalance: opening,
        totalCreditNotes: creditNotes,
        closingBalance,
        closingBalanceDue: 1,
        closingBalanceDueOpv: opvCharge,
        closingBalanceDueOpc: 0,
      }
    );

  test("muestra vencimiento, crédito aplicado y saldo; el resumen cuadra y un cargo anulado no suma", async () => {
    await renderStatement(agingStatement());

    const corriente = screen.getByRole("row", { name: /ENVP-CORRIENTE/ });
    expect(corriente).toHaveTextContent("Corriente");
    expect(corriente).not.toHaveClass("table-danger");
    expect(corriente).toHaveTextContent(formatAccountMoney(25));
    expect(corriente).toHaveTextContent(formatAccountMoney(currentCharge));

    const opc = screen.getByRole("row", { name: /ENVP-OPC/ });
    expect(opc).toHaveTextContent("2026-09-01");
    expect(opc).not.toHaveClass("table-danger");
    expect(opc).toHaveTextContent(formatAccountMoney(opcCharge));

    const opv = screen.getByRole("row", { name: /ENVP-OPV/ });
    expect(opv).toHaveClass("table-danger");
    expect(opv).toHaveTextContent(formatAccountMoney(opvCharge));

    const shipping = screen.getByRole("row", { name: /ENV-1/ });
    expect(shipping).toHaveClass("table-danger");
    expect(shipping).toHaveTextContent("Ajuste de envío");
    expect(shipping).toHaveTextContent(formatAccountMoney(adjustment));

    expect(screen.queryByText("ENVP-ANULADO")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Crédito aplicado" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Saldo de línea" })).toBeInTheDocument();

    expect(readSummary("Saldo inicial")).toBe(opening);
    expect(readSummary("Cargos")).toBe(opcCharge + opvCharge + currentCharge);
    expect(readSummary("Cargos")).not.toBe(opcCharge + opvCharge + currentCharge + voidedCharge);
    expect(readSummary("Ajustes (envío)")).toBe(adjustment);
    expect(readSummary("Pagos")).toBe(payment);
    expect(readSummary("Notas de crédito")).toBe(creditNotes);
    expect(readSummary("Descuentos")).toBe(discount);
    expect(readSummary("Devoluciones")).toBe(returns);
    expect(readSummary("Saldo")).toBe(closingBalance);
    expect(readSummary("Saldo")).not.toBe(1);
    expect(
      roundMoney(
        readSummary("Saldo inicial") +
          readSummary("Cargos") +
          readSummary("Ajustes (envío)") -
          readSummary("Pagos") -
          readSummary("Notas de crédito") -
          readSummary("Descuentos") -
          readSummary("Devoluciones")
      )
    ).toBe(readSummary("Saldo"));
  });

  test("si no viene closingBalance, el saldo usa closingBalanceDue", async () => {
    const statement = agingStatement();
    delete statement.closingBalance;
    statement.closingBalanceDue = 2046;
    await renderStatement(statement);
    expect(readSummary("Saldo")).toBe(2046);
    expect(readSummary("Cargos")).toBe(opcCharge + opvCharge + currentCharge);
  });

  test("un total que el listado no trae se muestra como raya, no como cero", async () => {
    getCustomerAccountSummary.mockResolvedValue([
      {
        customerId: 223,
        legacyCode: "CA223",
        customerName: "Xiomara",
        balanceDueOpv: 2046,
        balanceDueOpc: 0,
        creditBalance: 0,
        totalCreditNotes: 333.45,
        lfOrderCount: 1,
      },
      {
        customerId: 224,
        legacyCode: "CA224",
        customerName: "Pedro",
        balanceDueOpv: 10,
        balanceDueOpc: 0,
        creditBalance: 0,
        totalCreditNotes: 0,
        totalCharges: 0,
        totalAdjustments: 0,
        totalPayments: 0,
        totalDiscounts: 0,
        totalReturns: 0,
        lfOrderCount: 1,
      },
    ]);

    render(
      <MemoryRouter>
        <CustomerAccountsList />
      </MemoryRouter>
    );

    await screen.findByRole("cell", { name: "Xiomara" });
    const table = screen.getAllByRole("table").find((node) => within(node).queryByRole("columnheader", { name: "Cargos" }));
    if (!table) throw new Error("No está la tabla de cartera");
    const xiomara = within(table).getByRole("row", { name: /Xiomara/ });
    const pedro = within(table).getByRole("row", { name: /Pedro/ });
    ["Cargos", "Ajustes (envío)", "Pagos", "Descuentos", "Devoluciones"].forEach((header) => {
      expect(cellByHeader(xiomara, table, header)).toHaveTextContent("—");
      expect(cellByHeader(xiomara, table, header).textContent.trim()).not.toMatch(/0/);
      expect(cellByHeader(pedro, table, header)).toHaveTextContent(formatAccountMoney(0));
    });
  });
});

describe("días de crédito del cliente", () => {
  function renderNewCustomer() {
    render(<CustomersForm isOpen toggle={jest.fn()} onSuccess={jest.fn()} />);
    return dialogByHeading("Nuevo Cliente");
  }

  async function fillIdentity(dialog) {
    replaceInputValue(controlByLabel("Nombre del cliente *", dialog), "Cliente TEST");
    replaceInputValue(controlByLabel("NIT de facturación *", dialog), "CF");
  }

  function submit(dialog, name) {
    userEvent.click(within(dialog).getByRole("button", { name }));
  }

  test("el valor inicial es 0 y así se guarda", async () => {
    const dialog = renderNewCustomer();
    expect(controlByLabel("Días de crédito", dialog).value).toBe("0");
    await fillIdentity(dialog);
    submit(dialog, "Crear");
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ creditDays: 0, name: "Cliente TEST" }));
  });

  test("60 se guarda", async () => {
    const dialog = renderNewCustomer();
    await fillIdentity(dialog);
    replaceInputValue(controlByLabel("Días de crédito", dialog), "60");
    submit(dialog, "Crear");
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ creditDays: 60 }));
  });

  test("61 no se guarda", async () => {
    const dialog = renderNewCustomer();
    await fillIdentity(dialog);
    replaceInputValue(controlByLabel("Días de crédito", dialog), "61");
    submit(dialog, "Crear");
    expect(await screen.findByText(/entre 0 y 60/)).toBeInTheDocument();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  test("-1 no se guarda", async () => {
    const dialog = renderNewCustomer();
    await fillIdentity(dialog);
    replaceInputValue(controlByLabel("Días de crédito", dialog), "-1");
    submit(dialog, "Crear");
    expect(await screen.findByText(/entre 0 y 60/)).toBeInTheDocument();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  test("en edición, 0 se guarda sobre el valor que ya tenía el cliente", async () => {
    getCustomerById.mockResolvedValue({
      id: 8,
      name: "Cliente TEST",
      nit: "CF",
      status: "active",
      creditDays: 60,
    });
    render(<CustomersForm customerId={8} isOpen toggle={jest.fn()} onSuccess={jest.fn()} />);
    const dialog = await screen.findByRole("heading", { name: /Editar cliente/ });
    const form = dialog.closest('[role="dialog"]');
    await waitFor(() => expect(controlByLabel("Días de crédito", form).value).toBe("60"));
    replaceInputValue(controlByLabel("Días de crédito", form), "0");
    submit(form, "Actualizar");
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    expect(updateCustomer).toHaveBeenCalledWith(8, expect.objectContaining({ creditDays: 0, name: "Cliente TEST" }));
    expect(createCustomer).not.toHaveBeenCalled();
  });

  test("el listado muestra los días y usa 0 cuando el campo no viene", async () => {
    getCustomers.mockResolvedValue([
      { id: 1, name: "Cliente TEST", nit: "CF", phone: "", email: "", status: "active", creditDays: 60 },
      { id: 2, name: "Xiomara", nit: "CF", phone: "", email: "", status: "active" },
    ]);
    render(
      <MemoryRouter>
        <CustomersList />
      </MemoryRouter>
    );
    await screen.findByRole("cell", { name: "Cliente TEST" });
    const table = screen.getByRole("table");
    const withDays = within(table).getByRole("row", { name: /Cliente TEST/ });
    const missing = within(table).getByRole("row", { name: /Xiomara/ });
    expect(cellByHeader(withDays, table, "Días de crédito")).toHaveTextContent("60");
    expect(cellByHeader(missing, table, "Días de crédito")).toHaveTextContent("0");
  });
});

describe("reassignedFromEntryId, dueDate y lineOpenBalance nulos o ausentes", () => {
  test("no hay nota de movido, el vencimiento dice Corriente y el saldo de línea no es NaN", async () => {
    await renderStatement(
      statementOf([
        charge({
          id: 31,
          invoiceNumber: "ENVP-AUSENTE",
          debit: 100,
          chargeBalanceDue: 100,
        }),
        charge({
          id: 32,
          invoiceNumber: "ENVP-NULO",
          debit: 80,
          chargeBalanceDue: 80,
          reassignedFromEntryId: null,
          dueDate: null,
          lineOpenBalance: null,
        }),
      ])
    );

    const table = screen.getAllByRole("table").find((node) =>
      within(node).queryByRole("columnheader", { name: "Saldo de línea" })
    );
    if (!table) throw new Error("No está la tabla de movimientos");

    expect(screen.queryByText(/Movido desde/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);

    ["ENVP-AUSENTE", "ENVP-NULO"].forEach((invoice) => {
      const row = within(table).getByRole("row", { name: new RegExp(invoice) });
      expect(cellByHeader(row, table, "Vencimiento")).toHaveTextContent("Corriente");
      const lineBalance = cellByHeader(row, table, "Saldo de línea");
      expect(lineBalance).toHaveTextContent("—");
      expect(lineBalance).not.toHaveTextContent(/NaN/);
      expect(row).not.toHaveTextContent(/Movido desde/);
    });
  });
});
