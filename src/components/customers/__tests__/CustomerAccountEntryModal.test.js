import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import CustomerAccountEntryModal from "components/customers/CustomerAccountEntryModal";
import { createCustomerAccountEntry, getCustomerAccountStatement } from "services/customerAccountService";

jest.mock("services/customerAccountService", () => {
  const actual = jest.requireActual("services/customerAccountService");
  return {
    ...actual,
    createCustomerAccountEntry: jest.fn(),
    getCustomerAccountStatement: jest.fn(),
  };
});

jest.mock("utils/dateTimeHelper", () => ({
  getTodayYmdGuatemala: () => "2026-10-09",
}));

jest.mock("utils/customerPaymentReceiptPrintHtml", () => ({
  buildCustomerPaymentReceiptPrintHtml: jest.fn(() => "<p>recibo</p>"),
  openAccountPrintWindow: jest.fn(),
}));

const statementLines = [
  {
    id: 50,
    entryType: "CHARGE",
    status: "ACTIVE",
    debit: 120,
    credit: 0,
    orderKind: "OPV",
    productionOrderId: 10,
    productionOrderCode: "OP-100",
    invoiceNumber: "ENVP-100",
    entryDate: "2026-10-01",
  },
  {
    id: 51,
    entryType: "CHARGE",
    status: "VOID",
    debit: 999,
    credit: 0,
    orderKind: "OPC",
    productionOrderId: 77,
    productionOrderCode: "OP-77",
    invoiceNumber: "ENVP-VOID",
    entryDate: "2026-09-01",
  },
];

const setValue = (element, value) => {
  const proto =
    element.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : element.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const click = (element) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

const buttonByText = (root, label) =>
  [...root.querySelectorAll("button")].find((button) => button.textContent.trim() === label);

let container;
let root;

const renderModal = async (props = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const toggle = jest.fn();
  await act(async () => {
    root.render(
      <CustomerAccountEntryModal
        isOpen
        toggle={toggle}
        customerId={223}
        customerInfo={{ legacyCode: "CA223", customerName: "Cliente 223" }}
        defaultConceptCode="1"
        initialDoc={{
          productionOrderId: 77,
          orderCode: "OP-77",
          orderKind: "OPC",
          vendorShipmentNumber: "ENVP-PANTALLA",
          estimatedTotal: 80,
        }}
        {...props}
      />
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { toggle };
};

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  getCustomerAccountStatement.mockResolvedValue({ lines: statementLines });
  createCustomerAccountEntry.mockResolvedValue({ id: 1 });
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

const chooseCreditAndCharge = async () => {
  const concept = document.body.querySelector("select");
  await act(async () => {
    setValue(concept, "2");
  });
  const chargeSelect = [...document.body.querySelectorAll("select")].find((select) =>
    [...select.options].some((option) => option.textContent.includes("ENVP-100"))
  );
  expect(chargeSelect).toBeTruthy();
  expect([...chargeSelect.options].some((option) => option.textContent.includes("ENVP-VOID"))).toBe(false);
  await act(async () => {
    setValue(chargeSelect, "50");
  });
  const amount = document.body.querySelector('input[type="number"]');
  await act(async () => {
    setValue(amount, "25.50");
  });
};

describe("CustomerAccountEntryModal", () => {
  test("el crédito sale con la orden del cargo elegido y un segundo clic no repite el alta", async () => {
    let release;
    createCustomerAccountEntry.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    await renderModal();
    await chooseCreditAndCharge();

    const readOnlyValues = [...document.body.querySelectorAll("input[readOnly]")].map((input) => input.value);
    expect(readOnlyValues).toEqual(["OPV", "10"]);
    expect(readOnlyValues).not.toContain("OPC");
    expect(readOnlyValues).not.toContain("77");

    const save = buttonByText(document.body, "Guardar");
    await act(async () => {
      click(save);
      click(save);
    });

    expect(createCustomerAccountEntry).toHaveBeenCalledTimes(1);
    const [customerId, payload, options] = createCustomerAccountEntry.mock.calls[0];
    expect(customerId).toBe(223);
    expect(payload.entryType).toBe("CREDIT_NOTE");
    expect(payload.appliedToEntryId).toBe(50);
    expect(payload.productionOrderId).toBe(10);
    expect(payload.orderKind).toBe("OPV");
    expect(payload).not.toHaveProperty("vendorShipmentNumber");
    expect(options.requestId).toEqual(expect.any(String));
    expect(save.disabled).toBe(true);

    await act(async () => {
      release({ id: 90 });
    });
  });

  test("si el alta falla, el botón vuelve a quedar habilitado", async () => {
    createCustomerAccountEntry.mockRejectedValueOnce(new Error("no se pudo"));
    await renderModal();
    await chooseCreditAndCharge();

    const save = buttonByText(document.body, "Guardar");
    await act(async () => {
      click(save);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(document.body.textContent).toContain("no se pudo");
    expect(buttonByText(document.body, "Guardar").disabled).toBe(false);

    createCustomerAccountEntry.mockResolvedValueOnce({ id: 2 });
    await act(async () => {
      click(buttonByText(document.body, "Guardar"));
    });
    expect(createCustomerAccountEntry).toHaveBeenCalledTimes(2);
  });
});
