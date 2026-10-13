import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomerAccountStatement from "views/customers/CustomerAccountStatement";
import {
  getCustomerAccountStatement,
  getLfSalesDocuments,
  voidCustomerAccountEntry,
} from "services/customerAccountService";

jest.mock("services/customerAccountService", () => {
  const actual = jest.requireActual("services/customerAccountService");
  return {
    ...actual,
    getCustomerAccountStatement: jest.fn(),
    getLfSalesDocuments: jest.fn(),
    voidCustomerAccountEntry: jest.fn(),
    createCustomerAccountEntry: jest.fn(),
  };
});

jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));

jest.mock("utils/customerAccountReportPrintHtml", () => ({
  buildSingleCustomerReportPrintHtml: jest.fn(() => ""),
  openCustomerAccountReportPrintWindow: jest.fn(),
}));

const statement = {
  customerName: "Cliente CA223",
  legacyCode: "CA223",
  openingBalance: 0,
  closingBalanceDue: 100,
  closingCreditBalance: 0,
  closingBalanceDueOpv: 100,
  closingBalanceDueOpc: 0,
  totalCharges: 1099,
  totalPayments: 0,
  totalReturns: 40,
  totalCreditNotes: 12.5,
  lines: [
    {
      id: 1,
      entryType: "CHARGE",
      status: "ACTIVE",
      entryDate: "2026-10-01",
      debit: 100,
      credit: 0,
      invoiceNumber: "FAC-OK",
      documentNumber: "OP-100",
      orderKind: "OPV",
      productionOrderId: 10,
    },
    {
      id: 9,
      entryType: "CHARGE",
      status: "VOID",
      entryDate: "2026-09-01",
      debit: 999,
      credit: 0,
      invoiceNumber: "FAC-VOID",
      documentNumber: "OP-VOID",
      orderKind: "OPC",
      productionOrderId: 77,
    },
    {
      id: 4,
      entryType: "RETURN",
      status: "VOID",
      entryDate: "2026-09-02",
      debit: 0,
      credit: 40,
      invoiceNumber: "DEV-VOID",
      appliedToEntryId: null,
    },
  ],
};

let container;
let root;

const renderStatement = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/admin/customer-accounts/223"]}>
        <Routes>
          <Route path="/admin/customer-accounts/:customerId" element={<CustomerAccountStatement />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

const textOf = (label) => {
  const caption = [...document.body.querySelectorAll("small")].find((node) => node.textContent.trim() === label);
  return caption?.nextElementSibling?.textContent || "";
};

const click = (element) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  getCustomerAccountStatement.mockResolvedValue(statement);
  getLfSalesDocuments.mockResolvedValue([]);
  voidCustomerAccountEntry.mockResolvedValue({ id: 1 });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount();
    });
  }
  container?.remove();
  document.body.innerHTML = "";
  root = undefined;
  container = undefined;
});

describe("CustomerAccountStatement", () => {
  test("oculta anulados y no los suma, aunque se muestren", async () => {
    await renderStatement();
    expect(document.body.textContent).toContain("FAC-OK");
    expect(document.body.textContent).not.toContain("FAC-VOID");
    expect(document.body.textContent).not.toContain("DEV-VOID");
    expect(textOf("Cargos")).toBe("Q 100.00");
    expect(textOf("Devoluciones")).toBe("Q 0.00");
    expect(textOf("Notas de crédito")).toBe("Q 12.50");

    const toggle = document.body.querySelector('input[type="checkbox"]');
    await act(async () => {
      click(toggle);
    });

    expect(document.body.textContent).toContain("FAC-VOID");
    expect(document.body.textContent).toContain("DEV-VOID");
    expect(textOf("Cargos")).toBe("Q 100.00");
    expect(textOf("Devoluciones")).toBe("Q 0.00");
    expect(textOf("Notas de crédito")).toBe("Q 12.50");
  });

  test("un segundo clic en anular no dispara otra petición", async () => {
    let release;
    voidCustomerAccountEntry.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    await renderStatement();

    const anular = [...document.body.querySelectorAll("button")].find((button) => button.textContent.trim() === "Anular");
    await act(async () => {
      click(anular);
    });

    const reason = document.body.querySelector("textarea");
    const proto = HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(reason, "duplicado");
    await act(async () => {
      reason.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const confirm = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Confirmar anulación"
    );
    await act(async () => {
      click(confirm);
      click(confirm);
    });

    expect(voidCustomerAccountEntry).toHaveBeenCalledTimes(1);
    expect(voidCustomerAccountEntry.mock.calls[0][0]).toBe(1);
    expect(voidCustomerAccountEntry.mock.calls[0][1]).toBe("duplicado");
    expect(voidCustomerAccountEntry.mock.calls[0][2].requestId).toEqual(expect.any(String));
    expect(confirm.disabled).toBe(true);

    await act(async () => {
      release({ id: 1 });
    });
  });
});
