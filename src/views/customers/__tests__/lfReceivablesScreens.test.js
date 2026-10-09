import React from "react";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomerAccountStatement from "views/customers/CustomerAccountStatement";
import CustomerAccountsList from "views/customers/CustomerAccountsList";
import { showError } from "utils/notificationHelper";
import { formatAccountMoney } from "services/customerAccountService";
import {
  createCustomerAccountEntry,
  getCustomerAccountStatement,
  getCustomerAccountSummary,
  getLfSalesDocuments,
  getReceivableDocuments,
  searchReceivableDocuments,
  voidCustomerAccountEntry,
} from "services/customerAccountService";

jest.mock("services/customerAccountService", () => {
  const actual = jest.requireActual("services/customerAccountService");
  return {
    ...actual,
    getCustomerAccountStatement: jest.fn(),
    getLfSalesDocuments: jest.fn(),
    getReceivableDocuments: jest.fn(),
    getCustomerAccountSummary: jest.fn(),
    searchReceivableDocuments: jest.fn(),
    getCustomerAccountPortfolioReport: jest.fn(),
    createCustomerAccountEntry: jest.fn(),
    createCustomerAccountDocumentSettlement: jest.fn(),
    voidCustomerAccountEntry: jest.fn(),
  };
});

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

const MOVEMENTS = [
  ["pago", "4", "PAYMENT", true],
  ["nota de crédito", "2", "CREDIT_NOTE", false],
  ["devolución", "RETURN", "RETURN", false],
];

const charge = (overrides = {}) => ({
  id: 1,
  entryType: "CHARGE",
  status: "ACTIVE",
  entryDate: "2026-10-01",
  debit: 100,
  credit: 0,
  invoiceNumber: "ENVP-100",
  documentNumber: "OP-100",
  productionOrderCode: "OP-100",
  orderKind: "OPV",
  productionOrderId: 10,
  movementConceptCode: "1",
  ...overrides,
});

const statementOf = (lines, extra = {}) => ({
  customerName: "Cliente CA223",
  legacyCode: "CA223",
  openingBalance: 0,
  closingBalanceDue: 100,
  closingCreditBalance: 0,
  closingBalanceDueOpv: 100,
  closingBalanceDueOpc: 0,
  totalCreditNotes: 0,
  lines,
  ...extra,
});

const opcOrderOnScreen = {
  productionOrderId: 77,
  orderCode: "OPC-77",
  orderKind: "OPC",
  vendorShipmentNumber: "ENVP-PANTALLA",
  chargeStatus: "NONE",
  estimatedTotal: 80,
  deliveryDate: "2026-10-01",
  chargedAmount: 0,
  balanceDue: 80,
  partialReleases: [],
};

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
  const caption = screen.getByText(label);
  const valueNode = caption.nextElementSibling;
  if (!valueNode) throw new Error(`Sin monto junto a ${label}`);
  return parseDisplayedMoney(valueNode.textContent);
}

function controlByLabel(labelText, root = document.body) {
  const labels = within(root).getAllByText(labelText);
  const label = labels.find((node) => node.closest(".form-group")?.querySelector("select, input, textarea"));
  if (!label) throw new Error(`Sin control para "${labelText}"`);
  return label.closest(".form-group").querySelector("select, input, textarea");
}

function entryDialog() {
  const heading = screen.getByRole("heading", { name: "Altas de cuentas por cobrar" });
  const dialog = heading.closest('[role="dialog"]');
  if (!dialog) throw new Error("El alta no está en un diálogo");
  return dialog;
}

function replaceInputValue(input, value) {
  userEvent.clear(input);
  if (value !== "") userEvent.type(input, value);
}

async function renderStatement(statement, documents = []) {
  getCustomerAccountStatement.mockResolvedValue(statement);
  getLfSalesDocuments.mockResolvedValue(documents);
  render(
    <MemoryRouter initialEntries={["/admin/customer-accounts/223"]}>
      <Routes>
        <Route path="/admin/customer-accounts/:customerId" element={<CustomerAccountStatement />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByRole("heading", { name: statement.customerName });
}

async function openNewMovement() {
  userEvent.click(screen.getByRole("button", { name: "Nuevo movimiento" }));
  await screen.findByRole("heading", { name: "Altas de cuentas por cobrar" });
  return entryDialog();
}

async function openChargeFromPickedOrder() {
  userEvent.click(screen.getByText("Documentos OPV / OPC"));
  const create = await screen.findByRole("button", { name: "Crear cargo" });
  userEvent.click(create);
  await screen.findByRole("heading", { name: "Altas de cuentas por cobrar" });
  return entryDialog();
}

async function chooseMovement(conceptCode, { needsReceipt }) {
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
  const amount = controlByLabel("Monto (Q) *", entryDialog());
  if (!amount.value) replaceInputValue(amount, "25.50");
  return chargeSelect;
}

function optionLabels(select) {
  return [...select.options].map((option) => option.textContent);
}

async function doubleClick(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

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
  createCustomerAccountEntry.mockResolvedValue({ id: 1 });
  voidCustomerAccountEntry.mockResolvedValue({ id: 1 });
});

afterEach(() => {
  delete global.fetch;
});

describe("alta de pago, nota de crédito y devolución", () => {
  test.each(MOVEMENTS)(
    "%s: con un cargo anulado y uno activo de la misma orden, el alta va al cargo activo",
    async (_label, conceptCode, entryType, needsReceipt) => {
      await renderStatement(
        statementOf([
          charge({
            id: 11,
            invoiceNumber: "ENVP-ACTIVA",
            documentNumber: "OP-10",
            productionOrderCode: "OP-10",
            productionOrderId: 10,
            orderKind: "OPV",
            debit: 100,
          }),
          charge({
            id: 99,
            status: "VOID",
            invoiceNumber: "ENVP-ANULADA",
            documentNumber: "OP-10",
            productionOrderCode: "OP-10",
            productionOrderId: 10,
            orderKind: "OPV",
            debit: 999,
          }),
        ])
      );

      await openNewMovement();
      const chargeSelect = await chooseMovement(conceptCode, { needsReceipt });

      expect(chargeSelect).toHaveValue("");
      expect(optionLabels(chargeSelect).join(" ")).toContain("ENVP-ACTIVA");
      expect(optionLabels(chargeSelect).join(" ")).not.toContain("ENVP-ANULADA");

      userEvent.selectOptions(chargeSelect, "11");
      expect(controlByLabel("Tipo de orden", entryDialog())).toHaveValue("OPV");
      expect(controlByLabel("Orden", entryDialog())).toHaveValue("10");

      userEvent.click(within(entryDialog()).getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1));
      const [customerId, payload] = createCustomerAccountEntry.mock.calls[0];
      expect(customerId).toBe(223);
      expect(payload.entryType).toBe(entryType);
      expect(payload.appliedToEntryId).toBe(11);
      expect(payload.appliedToEntryId).not.toBe(99);
      expect(payload.productionOrderId).toBe(10);
      expect(payload.orderKind).toBe("OPV");
    }
  );

  test.each(MOVEMENTS)(
    "%s: si solo hay un cargo anulado, no se adivina el vínculo y guardar queda bloqueado",
    async (_label, conceptCode, _entryType, needsReceipt) => {
      await renderStatement(
        statementOf([
          charge({
            id: 99,
            status: "VOID",
            invoiceNumber: "ENVP-ANULADA",
            documentNumber: "OP-77",
            productionOrderCode: "OP-77",
            productionOrderId: 77,
            orderKind: "OPC",
            debit: 999,
          }),
        ])
      );

      await openNewMovement();
      const chargeSelect = await chooseMovement(conceptCode, { needsReceipt });

      expect(await screen.findByText("No hay cargos activos para este cliente.")).toBeInTheDocument();
      expect(chargeSelect).toHaveValue("");
      expect(optionLabels(chargeSelect).join(" ")).not.toContain("ENVP-ANULADA");

      userEvent.click(within(entryDialog()).getByRole("button", { name: "Guardar" }));

      expect(await screen.findByText("Seleccione el cargo al que se aplica el movimiento.")).toBeInTheDocument();
      expect(createCustomerAccountEntry).not.toHaveBeenCalled();
      expect(controlByLabel("Concepto", entryDialog())).toHaveValue(conceptCode);
    }
  );

  test.each(MOVEMENTS)(
    "%s: de varios cargos de la misma orden se envía el cargo elegido",
    async (_label, conceptCode, entryType, needsReceipt) => {
      await renderStatement(
        statementOf([
          charge({
            id: 21,
            invoiceNumber: "ENVP-100-A",
            documentNumber: "OP-100",
            productionOrderCode: "OP-100",
            productionOrderId: 10,
            debit: 40,
          }),
          charge({
            id: 22,
            invoiceNumber: "ENVP-100-B",
            documentNumber: "OP-100",
            productionOrderCode: "OP-100",
            productionOrderId: 10,
            debit: 60,
          }),
        ])
      );

      await openNewMovement();
      const chargeSelect = await chooseMovement(conceptCode, { needsReceipt });
      expect(optionLabels(chargeSelect).join(" ")).toContain("ENVP-100-A");
      expect(optionLabels(chargeSelect).join(" ")).toContain("ENVP-100-B");

      userEvent.selectOptions(chargeSelect, "22");
      userEvent.click(within(entryDialog()).getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1));
      const [, payload] = createCustomerAccountEntry.mock.calls[0];
      expect(payload.entryType).toBe(entryType);
      expect(payload.appliedToEntryId).toBe(22);
      expect(payload.appliedToEntryId).not.toBe(21);
      expect(payload.productionOrderId).toBe(10);
      expect(payload.orderKind).toBe("OPV");
    }
  );

  test.each(MOVEMENTS)(
    "%s: copia la orden y el tipo OPV/OPC del cargo, no de la OPC elegida en el otro desplegable",
    async (_label, conceptCode, entryType, needsReceipt) => {
      await renderStatement(
        statementOf([
          charge({
            id: 50,
            invoiceNumber: "ENVP-100",
            documentNumber: "OP-100",
            productionOrderCode: "OP-100",
            productionOrderId: 10,
            orderKind: "OPV",
            debit: 120,
          }),
          charge({
            id: 51,
            status: "VOID",
            invoiceNumber: "ENVP-VOID",
            documentNumber: "OPC-77",
            productionOrderCode: "OPC-77",
            productionOrderId: 77,
            orderKind: "OPC",
            debit: 999,
          }),
        ]),
        [opcOrderOnScreen]
      );

      const dialog = await openChargeFromPickedOrder();
      const orderSelect = controlByLabel("Vincular OP", dialog);
      expect(orderSelect).toHaveValue("77");
      userEvent.selectOptions(orderSelect, "77");

      const chargeSelect = await chooseMovement(conceptCode, { needsReceipt });
      expect(optionLabels(chargeSelect).join(" ")).not.toContain("ENVP-VOID");
      userEvent.selectOptions(chargeSelect, "50");

      expect(controlByLabel("Tipo de orden", entryDialog())).toHaveValue("OPV");
      expect(controlByLabel("Orden", entryDialog())).toHaveValue("10");
      expect(controlByLabel("Orden", entryDialog())).not.toHaveValue("77");

      userEvent.click(within(entryDialog()).getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1));
      const [customerId, payload] = createCustomerAccountEntry.mock.calls[0];
      expect(customerId).toBe(223);
      expect(payload.entryType).toBe(entryType);
      expect(payload.appliedToEntryId).toBe(50);
      expect(payload.productionOrderId).toBe(10);
      expect(payload.orderKind).toBe("OPV");
      expect(payload.productionOrderId).not.toBe(77);
      expect(payload.orderKind).not.toBe("OPC");
    }
  );
});

describe("doble clic en guardar y anular", () => {
  const oneCharge = () =>
    statementOf([
      charge({
        id: 11,
        invoiceNumber: "ENVP-ACTIVA",
        debit: 100,
      }),
    ]);

  async function readyToSave() {
    await renderStatement(oneCharge());
    await openNewMovement();
    const chargeSelect = await chooseMovement("4", { needsReceipt: true });
    userEvent.selectOptions(chargeSelect, "11");
    return within(entryDialog()).getByRole("button", { name: "Guardar" });
  }

  test("un doble clic en guardar manda una sola petición y deshabilita el botón", async () => {
    let release;
    createCustomerAccountEntry.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const save = await readyToSave();

    await doubleClick(save);

    expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Guardando...");

    await act(async () => {
      release({ id: 90 });
    });
  });

  test("si guardar falla, el botón vuelve a habilitarse", async () => {
    createCustomerAccountEntry.mockRejectedValueOnce(new Error("no se pudo guardar"));
    const save = await readyToSave();

    userEvent.click(save);

    expect(await screen.findByText("no se pudo guardar")).toBeInTheDocument();
    await waitFor(() => expect(within(entryDialog()).getByRole("button", { name: "Guardar" })).toBeEnabled());
    expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1);

    createCustomerAccountEntry.mockResolvedValueOnce({ id: 2 });
    userEvent.click(within(entryDialog()).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(createCustomerAccountEntry).toHaveBeenCalledTimes(2));
  });

  async function openVoidConfirm() {
    await renderStatement(oneCharge());
    userEvent.click(screen.getByRole("button", { name: "Anular" }));
    await screen.findByRole("heading", { name: "Anular movimiento" });
    const dialog = screen.getByRole("heading", { name: "Anular movimiento" }).closest('[role="dialog"]');
    replaceInputValue(controlByLabel("Motivo", dialog), "duplicado");
    return within(dialog).getByRole("button", { name: "Confirmar anulación" });
  }

  test("un doble clic en anular manda una sola petición y deshabilita el botón", async () => {
    let release;
    voidCustomerAccountEntry.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const confirm = await openVoidConfirm();

    await doubleClick(confirm);

    expect(voidCustomerAccountEntry).toHaveBeenCalledTimes(1);
    expect(voidCustomerAccountEntry.mock.calls[0][0]).toBe(11);
    expect(voidCustomerAccountEntry.mock.calls[0][1]).toBe("duplicado");
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent("Anulando...");

    await act(async () => {
      release({ id: 11 });
    });
  });

  test("si anular falla, el botón vuelve a habilitarse", async () => {
    voidCustomerAccountEntry.mockRejectedValueOnce(new Error("no se pudo anular"));
    const confirm = await openVoidConfirm();

    userEvent.click(confirm);

    expect(await screen.findByRole("button", { name: "Confirmar anulación" })).toBeEnabled();
    expect(showError).toHaveBeenCalledWith("no se pudo anular");
    expect(voidCustomerAccountEntry).toHaveBeenCalledTimes(1);

    voidCustomerAccountEntry.mockResolvedValueOnce({ id: 11 });
    userEvent.click(screen.getByRole("button", { name: "Confirmar anulación" }));
    await waitFor(() => expect(voidCustomerAccountEntry).toHaveBeenCalledTimes(2));
  });
});

describe("anulados en el estado de cuenta", () => {
  test("los anulados se ocultan y no se ofrecen como cargo a ligar", async () => {
    await renderStatement(
      statementOf(
        [
          charge({ id: 11, invoiceNumber: "ENVP-ACTIVA", debit: 100 }),
          charge({
            id: 99,
            status: "VOID",
            invoiceNumber: "ENVP-ANULADA",
            debit: 999,
            productionOrderId: 77,
            orderKind: "OPC",
          }),
          {
            id: 4,
            entryType: "RETURN",
            status: "VOID",
            entryDate: "2026-09-02",
            debit: 0,
            credit: 40,
            invoiceNumber: "DEV-ANULADA",
            appliedToEntryId: null,
          },
        ],
        { totalCreditNotes: 12.5, totalCharges: 100, totalPayments: 0, totalReturns: 0 }
      )
    );

    expect(screen.getByText("ENVP-ACTIVA")).toBeInTheDocument();
    expect(screen.queryByText("ENVP-ANULADA")).not.toBeInTheDocument();
    expect(screen.queryByText("DEV-ANULADA")).not.toBeInTheDocument();
    expect(readSummary("Cargos")).toBe(100);
    expect(readSummary("Devoluciones")).toBe(0);

    userEvent.click(screen.getByRole("checkbox", { name: /Mostrar anulados/ }));
    expect(await screen.findByText("ENVP-ANULADA")).toBeInTheDocument();
    expect(screen.getByText("DEV-ANULADA")).toBeInTheDocument();
    expect(screen.getAllByText("Anulado")).toHaveLength(2);
    expect(readSummary("Cargos")).toBe(100);
    expect(readSummary("Devoluciones")).toBe(0);
    expect(readSummary("Notas de crédito")).toBe(12.5);

    await openNewMovement();
    const chargeSelect = await chooseMovement("2", { needsReceipt: false });
    expect(optionLabels(chargeSelect).join(" ")).toContain("ENVP-ACTIVA");
    expect(optionLabels(chargeSelect).join(" ")).not.toContain("ENVP-ANULADA");
    expect(optionLabels(chargeSelect).join(" ")).not.toContain("DEV-ANULADA");
  });
});

describe("notas de crédito y saldo", () => {
  test("Xiomara: notas de crédito del API y el saldo cuadra en pantalla", async () => {
    const opening = 0;
    const opcCharge = 1783;
    const opcPayment = 1449.55;
    const creditNotes = 333.45;
    const opvCharge = 2046;
    const returns = 0;

    await renderStatement(
      statementOf(
        [
          charge({
            id: 1,
            invoiceNumber: "ENVP-OPC-XIO",
            documentNumber: "OPC-1783",
            productionOrderCode: "OPC-1783",
            orderKind: "OPC",
            productionOrderId: 301,
            debit: opcCharge,
            entryDate: "2026-08-01",
          }),
          {
            id: 2,
            entryType: "PAYMENT",
            status: "ACTIVE",
            entryDate: "2026-08-02",
            debit: 0,
            credit: opcPayment,
            appliedToEntryId: 1,
            movementConceptCode: "4",
            invoiceNumber: "ENVP-OPC-XIO",
            orderKind: "OPC",
            productionOrderId: 301,
          },
          {
            id: 3,
            entryType: "CREDIT_NOTE",
            status: "ACTIVE",
            entryDate: "2026-08-03",
            debit: 0,
            credit: creditNotes,
            appliedToEntryId: 1,
            movementConceptCode: "2",
            invoiceNumber: "ENVP-OPC-XIO",
            orderKind: "OPC",
            productionOrderId: 301,
          },
          charge({
            id: 4,
            invoiceNumber: "ENVP-OPV-XIO",
            documentNumber: "OPV-2046",
            productionOrderCode: "OPV-2046",
            orderKind: "OPV",
            productionOrderId: 302,
            debit: opvCharge,
            entryDate: "2026-08-04",
          }),
          charge({
            id: 9,
            status: "VOID",
            invoiceNumber: "ENVP-ANULADO-XIO",
            debit: 5000,
            orderKind: "OPC",
            productionOrderId: 399,
          }),
        ],
        {
          customerName: "Xiomara",
          legacyCode: "CA223",
          openingBalance: opening,
          totalCreditNotes: creditNotes,
          closingBalanceDue: opvCharge,
          closingBalanceDueOpv: opvCharge,
          closingBalanceDueOpc: 0,
          closingCreditBalance: 0,
        }
      )
    );

    expect(screen.queryByText("ENVP-ANULADO-XIO")).not.toBeInTheDocument();
    expect(readSummary("Saldo inicial")).toBe(opening);
    expect(readSummary("Cargos")).toBe(opcCharge + opvCharge);
    expect(readSummary("Pagos")).toBe(opcPayment);
    expect(readSummary("Notas de crédito")).toBe(creditNotes);
    expect(readSummary("Devoluciones")).toBe(returns);
    expect(readSummary("Por cobrar OPV")).toBe(opvCharge);
    expect(readSummary("Por cobrar OPC")).toBe(0);

    const balance = readSummary("Saldo por cobrar");
    expect(balance).toBe(opvCharge);
    expect(roundMoney(opening + (opcCharge + opvCharge) - opcPayment - creditNotes - returns)).toBe(balance);

    const opcRow = screen.getByRole("row", { name: /ENVP-OPC-XIO/ });
    expect(opcRow).not.toHaveTextContent("Pend.");
    const opvRow = screen.getByRole("row", { name: /ENVP-OPV-XIO/ });
    expect(opvRow).toHaveTextContent(`Pend. ${formatAccountMoney(opvCharge)}`);

    userEvent.click(within(opcRow).getByRole("button", { name: "Ver detalle" }));
    const detailHeading = await screen.findByRole("heading", { name: /Detalle del cargo — ENVP-OPC-XIO/ });
    const detail = detailHeading.closest('[role="dialog"]');
    expect(within(detail).getByText("Saldo pendiente").nextElementSibling).toHaveTextContent(formatAccountMoney(0));
    expect(within(detail).getByText(formatAccountMoney(opcPayment))).toBeInTheDocument();
    expect(within(detail).getByText(formatAccountMoney(creditNotes))).toBeInTheDocument();
  });

  test("la lista muestra la columna Notas de crédito con totalCreditNotes del API", async () => {
    getCustomerAccountSummary.mockResolvedValue([
      {
        customerId: 223,
        legacyCode: "CA223",
        customerName: "Xiomara",
        balanceDueOpv: 2046,
        balanceDueOpc: 0,
        creditBalance: 0,
        totalCreditNotes: 333.45,
        lfOrderCount: 2,
      },
      {
        customerId: 224,
        legacyCode: "CA224",
        customerName: "Pedro",
        balanceDueOpv: 10,
        balanceDueOpc: 0,
        creditBalance: 0,
        lfOrderCount: 1,
      },
    ]);

    render(
      <MemoryRouter>
        <CustomerAccountsList />
      </MemoryRouter>
    );

    await screen.findByRole("cell", { name: "Xiomara" });
    const customerTable = screen.getAllByRole("table").find((node) =>
      within(node).queryByRole("columnheader", { name: "Notas de crédito" })
    );
    if (!customerTable) throw new Error("No está la tabla de clientes");

    const headers = within(customerTable).getAllByRole("columnheader");
    const notesIndex = headers.findIndex((header) => header.textContent.trim() === "Notas de crédito");
    expect(notesIndex).toBeGreaterThan(-1);

    const xiomara = within(customerTable).getByRole("row", { name: /Xiomara/ });
    const pedro = within(customerTable).getByRole("row", { name: /Pedro/ });
    expect(within(xiomara).getAllByRole("cell")[notesIndex]).toHaveTextContent(formatAccountMoney(333.45));
    expect(within(pedro).getAllByRole("cell")[notesIndex]).toHaveTextContent(formatAccountMoney(0));

    const summaryCaption = screen
      .getAllByText("Notas de crédito")
      .find((node) => node.nextElementSibling?.tagName === "STRONG");
    expect(summaryCaption.nextElementSibling).toHaveTextContent(formatAccountMoney(333.45));
  });
});
